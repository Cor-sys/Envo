# Cost tracking, 3-vendor price comparison, spend/savings reports

Implementation plan for the cost-tracking feature. Owner: Charles. Drafted
2026-05-22. Three coupled capabilities ship across three phased PRs;
each PR leaves the app working.

1. Per-item cost + vendor price quotes (up to 5 per item).
2. A "best price" concept that powers the Order button and reorder math.
3. Spend and savings rollups on the Reports page, driven by per-transaction
   snapshots.

The hard architectural constraint: **historical reports must remain stable
when prices change**. Snapshots on `transactions` are the only sturdy way to
honor that — every other decision in this plan flows from it.

---

## Decisions locked in

| Decision | Choice |
|---|---|
| "Saved" headline math | Procurement savings: `(max quote at the time − chosen quote) × qty` |
| Pricing edit role | Admin-only writes, all-staff reads |
| Vendor slots | Soft cap 5 in UI, no DB cap |
| Currency | USD only in v1 |
| Snapshot timing | At scan time (not sync), client-side, passed to RPC |
| Snapshot location | Three new nullable columns on `transactions` |
| Best-price storage | Computed at read time via a view, not stored as a flag |
| Reports at launch | Spent / Saved / Drift tiles **plus** category split + per-vendor leaderboard |
| Tax + shipping | Excluded — Reports footer documents this |
| Legacy `metadata.purchase_url` | Preserved on existing rows as a fallback; stripped from new saves once a price row exists |

---

## 1. Data model

### 1.1 `item_prices` table

Real table rather than JSONB on `items.metadata`. Reasoning: SQL aggregates
("min price across items", "vendor leaderboard"), proper case-insensitive
uniqueness on `(item_id, vendor)`, consistency with other relational tables
(`building_items`, `item_photos`, `documents`).

```sql
create table if not exists item_prices (
  id          uuid          primary key default gen_random_uuid(),
  item_id     uuid          not null references items(id) on delete cascade,
  vendor      text          not null,
  price       numeric(10,2) check (price is null or price >= 0),
  url         text,
  currency    text          not null default 'USD',
  note        text,
  position    smallint      not null default 0,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);

create unique index if not exists item_prices_item_vendor_uniq
  on item_prices (item_id, lower(vendor));
create index if not exists item_prices_item_idx
  on item_prices (item_id);
create index if not exists item_prices_item_price_idx
  on item_prices (item_id, price) where price is not null;

create trigger item_prices_set_updated_at
  before update on item_prices
  for each row execute function set_updated_at();
```

Semantics:

- `price = NULL` means "URL on file, price unknown" — included in the vendor
  comparison list, excluded from best-price computation.
- `url = NULL` is allowed (phone-ordered placeholder) but disqualifies the
  quote from being "best" — we won't pick a vendor we can't act on.
- `position` drives UI ordering on EditItem and ItemDetail; ties broken by
  `vendor` alphabetically.

### 1.2 Transaction snapshot columns

```sql
alter table transactions
  add column if not exists unit_cost_snapshot numeric(10,2),
  add column if not exists max_price_snapshot numeric(10,2),
  add column if not exists vendor_snapshot    text;

create index if not exists transactions_cost_period_idx
  on transactions (occurred_at desc)
  where unit_cost_snapshot is not null;
```

All three nullable. Historical rows stay NULL forever and are excluded from
rollups rather than break them. The existing `transactions_no_update`
trigger (`db/schema.sql:275`) means snapshots can never be retroactively
edited — corrections only happen via a follow-up transaction.

### 1.3 `items_with_best_price` view

Layered on top of `items_with_status` so status + needs_label semantics stay
in one place:

```sql
create or replace view items_with_best_price with (security_invoker = true) as
  select s.*,
         ip.best_price, ip.best_vendor, ip.best_url,
         ip.max_price,  ip.quote_count
    from items_with_status s
    left join lateral (
      select
        min(price) filter (where price is not null and url is not null) as best_price,
        max(price) filter (where price is not null)                     as max_price,
        count(*)                                                         as quote_count,
        (array_agg(vendor order by price asc nulls last)
           filter (where price is not null and url is not null))[1]      as best_vendor,
        (array_agg(url    order by price asc nulls last)
           filter (where price is not null and url is not null))[1]      as best_url
        from item_prices
       where item_id = s.id
    ) ip on true;
```

The UI reads from this view; no separate "best price" flag to keep in sync.

### 1.4 `record_movement` RPC overload

Drop the 5-arg form (added in `202_record_movement_idempotency.sql`) and
replace with an 8-arg form. All new params default NULL so existing call
sites work unchanged. Body is the existing body plus the three snapshot
columns on the INSERT.

```sql
create or replace function record_movement(
  p_item_id            uuid,
  p_direction          text,
  p_qty                integer,
  p_note               text default null,
  p_idempotency_key    uuid default null,
  p_unit_cost_snapshot numeric(10,2) default null,
  p_max_price_snapshot numeric(10,2) default null,
  p_vendor_snapshot    text          default null
) returns transactions language plpgsql security definer
...
```

### 1.5 RLS

Matches the buildings pattern (`207_buildings.sql:62`): staff `select`,
admin-only `for all`:

```sql
alter table item_prices enable row level security;

create policy item_prices_staff_select on item_prices
  for select to authenticated using (true);

create policy item_prices_admin_write on item_prices
  for all to authenticated
  using      (exists (select 1 from staff_profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from staff_profiles p where p.id = auth.uid() and p.role = 'admin'));
```

**Behavior change to flag in the PR description:** prices are admin-only to
edit. Today's `items` table allows staff edits. Locking this down means
Ryder (frontend collaborator) can't change prices — matches the BRIEF
direction.

### 1.6 Backfill

```sql
insert into item_prices (item_id, vendor, url, position)
select
  i.id,
  initcap(regexp_replace(
    split_part(split_part(i.metadata->>'purchase_url', '://', 2), '/', 1),
    '^www\.', ''
  )),
  i.metadata->>'purchase_url',
  0
  from items i
 where i.deleted_at is null
   and i.metadata ? 'purchase_url'
   and coalesce(trim(i.metadata->>'purchase_url'), '') <> ''
   and not exists (select 1 from item_prices p where p.item_id = i.id)
on conflict do nothing;
```

We don't delete `metadata.purchase_url` — OrderButton's fallback chain reads
it as a last resort, and any in-flight rollback of a later PR leaves the
legacy reorder flow intact.

---

## 2. Backend / lib layer

### 2.1 `src/lib/prices.js` (new)

```js
export const MAX_QUOTES = 5;

export async function listPricesForItem(itemId)      // select … order by position, vendor
export async function upsertPrice({ ... })           // insert or update by id
export async function deletePrice(id)                // RLS gates admin
export async function getBestPrice(itemId)           // one-shot view read
export function   deriveBestPrice(prices)            // sync helper for already-loaded data
```

### 2.2 `src/lib/items.js` — `recordMovement` signature

Add `unitCostSnapshot`, `maxPriceSnapshot`, `vendorSnapshot` (all default
null). Plumbed through to the RPC's three new params. Existing call sites
that don't pass them keep working — snapshots just land NULL.

`getItem`, `listItems`, `listItemsNeedingLabel`, `lookupItemByCode` all
switch their `.from()` to `items_with_best_price`. Negligible payload bloat
(5 new fields per row).

### 2.3 `src/lib/offlineQueue.js` — queue entry shape

Three new fields on the IndexedDB record (forward-compatible — no
DB_VERSION bump). Drain passes them to the RPC. Legacy queue entries that
predate this code are treated as `null` everywhere, not errors.

### 2.4 Snapshot capture sites

- **`src/pages/Scan.jsx`** (the critical one): after `lookupItemByCode`
  returns the item from `items_with_best_price`, read `best_price`,
  `max_price`, `best_vendor` and pass them to `recordMovement`. Done at
  scan time, even if offline — so a price edit between scan and drain
  cannot corrupt history.
- **`src/pages/ItemDetail.jsx`**: the manual ± buttons read the same
  fields off the already-loaded item.

### 2.5 `src/lib/reports.js` — `getSpendReport({from, to})`

Returns:
```
{
  spent, saved, avgDrift, missingPricingCount,
  byCategory:    [{ category, spent, saved }],
  topVendors:    [{ vendor, count, spent }],
}
```

One range-filtered select on `transactions` plus a batched lookup of
referenced items from `items_with_best_price`. Math done client-side,
consistent with the rest of the lib.

---

## 3. UI changes

### 3.1 `src/pages/EditItem.jsx`

New "Pricing" section between the Reorder URL field (which goes away) and
the per-type metadata fieldset. Up to `MAX_QUOTES` (5) rows of
`(vendor, price, url, optional note)`. Inline preview: "Best price: $X.XX
from Vendor".

Save semantics: diff against original by `id`. Empty-vendor rows are
treated as abandoned slots — ignored on save. Duplicate vendor surfaces the
unique-index error inline.

The legacy `metadata.purchase_url` is stripped from the saved metadata
**only if** at least one price row has a URL. Items without quotes keep
their legacy URL so OrderButton's fallback chain still works.

For non-admin staffers (the role that can't write): show the Pricing
fieldset disabled with an "Admin only" pill rather than letting the save
silently fail at RLS.

### 3.2 `src/pages/NewItem.jsx`

Same Pricing section. After `createItem`, sequential `upsertPrice` calls
for each non-empty row. A failed price insert doesn't roll back the item
(matches the existing photo-upload soft-fail pattern).

### 3.3 `src/components/OrderButton.jsx` — new fallback chain

```
1. item.best_url present     → open it (title: "Order from {vendor} — ${price}")
2. metadata.purchase_url set → open it (title: "Legacy reorder URL")
3. otherwise                 → Google search (today's behavior)
```

Prop API doesn't change; the new fields ride on the item shape from
`items_with_best_price`.

### 3.4 `src/pages/ItemDetail.jsx` — Pricing block

New section between Details and "Used in buildings". Renders only when
`item.quote_count > 0`. Each row: vendor · price · URL link. Green BEST
badge (`text-emerald-300`) on the cheapest row.

Also remove the "Reorder" entry from the Details `<dl>` — pricing now has
its own section.

### 3.5 `src/pages/Reports.jsx`

New section above the existing summary grid:

- Date-range picker with presets: This month (default), Last 30 days, Last
  quarter, YTD, All time.
- Three primary tiles: **Spent (period)**, **Saved (period)**, **Avg drift**.
- Subtitle on the Spent tile: "N transactions had no pricing on file —
  excluded".
- Strip below the tiles (locked-in scope): **Spend by category** —
  horizontal bar with each top-level category and its share.
- **Top vendors** card: vendor name, order count in period, total spent.
  Sorted descending by spent.

Existing Summary cards, combined Inventory table, and Recent activity feed
all stay below, untouched.

Reports footer: "Spend reflects entered unit prices. Tax and shipping are
not tracked."

---

## 4. Report math (explicit)

For the period `[from, to)`:

### Spent
```
let spent = 0
for t in transactions where unit_cost_snapshot is not null:
  if t.direction === 'out': spent += t.qty * t.unit_cost_snapshot
  if t.direction === 'in':  spent -= t.qty * t.unit_cost_snapshot
return max(spent, 0)
```

Floor at zero so a period dominated by previous-period returns doesn't
confuse readers with negative spend.

### Saved (procurement savings — the headline)
```
let saved = 0
for t in transactions where direction='out'
                      and unit_cost_snapshot is not null
                      and max_price_snapshot is not null:
  saved += t.qty * (t.max_price_snapshot - t.unit_cost_snapshot)
return saved
```

Per-row, both snapshots stored alongside the transaction — no history table
needed.

### Avg drift (secondary)
```
let driftSum = 0; let n = 0
for item in items where quote_count >= 2:
  let lastSnap = most recent transactions.unit_cost_snapshot for this item
  if lastSnap is null: continue
  driftSum += (item.best_price - lastSnap) / lastSnap
  n += 1
return n > 0 ? driftSum / n : null
```

Sign: positive = prices rose since last buy (red); negative = prices fell
(green). Returns `null` when nothing eligible — tile shows "—".

### Spend by category
```
group transactions by items.category, applying the same Spent formula per group
```

### Top vendors
```
for t where direction='out' and vendor_snapshot is not null:
  vendors[vendor_snapshot].count += 1
  vendors[vendor_snapshot].spent += t.qty * t.unit_cost_snapshot
sort desc by spent, take top 5
```

---

## 5. Edge cases & sturdiness

| Scenario | Behavior |
|---|---|
| Item soft-deleted mid-period | Transactions row stays (FK is `on delete restrict`). Snapshots already on the row — no item lookup needed for spend math. |
| Price row deleted | Past snapshots unaffected. Current best recomputes from remaining rows. |
| Price edited mid-period | Past transactions unchanged. Next movement captures new value. |
| Vendor with `price=NULL`, URL set | Listed in vendor comparison; excluded from best/max. |
| Vendor with `price=NULL` and `url=NULL` | Allowed (placeholder); excluded from comparison. |
| All prices null/url-less | OrderButton falls back to `metadata.purchase_url` → Google. Movement lands with NULL snapshots — counted in "missing pricing" subtitle. |
| Negative or comma in price input | Client validates `>= 0` after `Number(input.replace(/,/g,''))`. DB check constraint backstops. |
| Concurrent price edits | Last write wins per row (rows independent). Unique index prevents duplicate vendor races. |
| Offline scan → price changes → drain | Snapshot captured at scan time persists through the queue. Drained transaction reflects scan-time price, not current price. **Load-bearing offline correctness property.** |
| Legacy queued movements without snapshot fields | Drain treats absent fields as NULL. No data loss, no migration needed. |
| Empty date range | Tiles show $0.00 / $0.00 / —. Dash on drift distinguishes "computed 0" from "nothing to compute". |
| Year-long range | Indexed query stays cheap. Client rolls up O(n). |
| Non-admin calls `record_movement` | Already allowed — the RPC is security definer. Only price ROWS are admin-only. |
| Currency drift (someone hand-edits to EUR) | Math silently mixes. Documented v1 limitation; no detection. |
| Transaction immutability trigger | Prevents UPDATE to snapshot columns. Corrections only via follow-up transactions. |
| Hard-delete an item | Cascade fires on `item_prices`. Transactions block hard delete (`on delete restrict`) — only reachable via admin SQL, same blast radius as today. |
| Soft-delete an item | Prices stay attached (we don't cascade soft deletes); recoverable. |

---

## 6. PR breakdown

### PR A — schema, RPC overload, view, backfill (DB only)

- `db/migrations/208_item_prices_and_cost_snapshots.sql` — new (~180 LOC)
- `db/schema.sql` — additive (~60 LOC)

**Smoke test:** apply via MCP; verify the view returns new columns; verify
backfill counts match `metadata.purchase_url` count; verify non-admin can
select but not insert; verify both old (5-arg) and new (8-arg)
`record_movement` signatures work.

**Rollback:** `drop view items_with_best_price; alter table transactions
drop column …; drop table item_prices; drop function record_movement(…
8-arg); recreate the 5-arg function from migration 202`. Documented in PR
description; no down-migration file (project doesn't use them).

**App after PR A:** still calls 5-arg RPC, OrderButton still reads legacy
`metadata.purchase_url`. Nothing visible changes.

### PR B — frontend price management + Order button rewire

- `src/lib/prices.js` — new (~120 LOC)
- `src/lib/items.js` — switch lookups to the new view (~15 LOC)
- `src/components/OrderButton.jsx` — 3-step fallback (~20 LOC)
- `src/pages/EditItem.jsx` — Pricing section + save diff (~+120 / −15 LOC)
- `src/pages/NewItem.jsx` — Pricing section (~+80 LOC)
- `src/pages/ItemDetail.jsx` — Pricing block (~+50 / −15 LOC)
- `src/lib/demoClient.js` — handle `item_prices` reads/writes in demo mode (~+80 LOC)

**Smoke test:** edit price → reload → persists; add second vendor → BEST
flips correctly when prices change; duplicate vendor → inline error;
non-admin sees disabled Pricing fieldset; OrderButton opens cheapest URL;
items with no prices still reorder via legacy URL; demo mode works.

**Rollback:** pure code revert. DB unaffected.

**App after PR B:** Reports tiles not present yet; existing Reports page
unchanged. OrderButton uses new view but falls back cleanly.

### PR C — snapshots + reports

- `src/lib/items.js` — new `recordMovement` params (~20 LOC)
- `src/lib/offlineQueue.js` — queue-entry fields (~10 LOC)
- `src/pages/Scan.jsx` — snapshot capture at scan (~15 LOC)
- `src/pages/ItemDetail.jsx` — pass snapshots on manual ± (~5 LOC)
- `src/lib/reports.js` — `getSpendReport({from,to})` (~100 LOC)
- `src/pages/Reports.jsx` — date picker, 3 tiles, category strip, top vendors (~150 LOC)
- `src/lib/demoClient.js` — transactions-with-date-filter handling (~30 LOC)

**Smoke test:** scan-out → snapshot lands; scan an unpriced item → NULL
snapshot, missing-pricing counter increments; offline scan → price edit →
drain → drained row reflects scan-time price; date-range presets work;
empty period → dashes, not zeros (for drift only); category strip and top
vendors render with non-empty data.

**Rollback:** revert frontend code. The 8-arg RPC and snapshot columns
stay; frontend reverts to 5-arg call. Already-snapshotted rows stay in DB
harmlessly.

**App after PR C:** full feature live. Existing flows unchanged unless
prices are added; new tiles communicate coverage gaps clearly.

---

## 7. Files and references

- New: `db/migrations/208_item_prices_and_cost_snapshots.sql`
- New: `src/lib/prices.js`
- Modified: `src/lib/items.js`, `src/lib/offlineQueue.js`, `src/lib/reports.js`,
  `src/components/OrderButton.jsx`, `src/lib/demoClient.js`
- Modified UI: `src/pages/EditItem.jsx`, `src/pages/NewItem.jsx`,
  `src/pages/ItemDetail.jsx`, `src/pages/Scan.jsx`, `src/pages/Reports.jsx`
- Schema sync: `db/schema.sql`

Reference migrations followed: `202_record_movement_idempotency.sql` (RPC
overload swap pattern), `207_buildings.sql` (admin-write RLS pattern).
