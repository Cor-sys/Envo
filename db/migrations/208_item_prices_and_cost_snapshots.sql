-- Cost tracking, 3-vendor price comparison, spend/savings reports — PR A.
--
-- This migration is additive only. After it lands the app continues to
-- function exactly as before: the legacy `metadata.purchase_url` is
-- preserved on every existing item, `record_movement` keeps working with
-- the old 5-arg signature (the new 8-arg signature is a default-arg
-- extension), and no frontend code reads from the new objects yet.
--
-- See COST-TRACKING-PLAN.md for the full design and the three-PR breakdown.
--
-- Rollback (manual, no down-migration file by project convention):
--   drop view if exists items_with_best_price;
--   alter table transactions
--     drop column if exists unit_cost_snapshot,
--     drop column if exists max_price_snapshot,
--     drop column if exists vendor_snapshot;
--   drop index if exists transactions_cost_period_idx;
--   drop table if exists item_prices;
--   drop function if exists record_movement(uuid, text, integer, text, uuid,
--                                            numeric, numeric, text);
--   -- then re-run the 5-arg create from 202_record_movement_idempotency.sql

-- ---------------------------------------------------------------------------
-- 1. item_prices — per-item vendor price quotes.
--    Up to N quotes per item (soft cap of 5 in the UI; no hard cap in SQL).
--    `price` is nullable so a URL-only placeholder is legal — we exclude
--    those from best-price computation but still show them in the
--    comparison list.
-- ---------------------------------------------------------------------------
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

-- Case-insensitive uniqueness on (item, vendor) so "Grainger" and "grainger"
-- collapse to one row. Without this the UI would silently allow duplicates.
create unique index if not exists item_prices_item_vendor_uniq
  on item_prices (item_id, lower(vendor));
create index if not exists item_prices_item_idx
  on item_prices (item_id);
-- Best-price min lookups skip NULL prices; partial index keeps the scan
-- tight when an item carries a URL-only placeholder among its quotes.
create index if not exists item_prices_item_price_idx
  on item_prices (item_id, price) where price is not null;

drop trigger if exists item_prices_set_updated_at on item_prices;
create trigger item_prices_set_updated_at
  before update on item_prices
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. RLS — staff read, admin write.
--    Matches the buildings + invites pattern. Reads are open so every
--    staff scan can pick up the snapshot; writes are admin-only because
--    pricing data drives the spend/savings dashboard and shouldn't be
--    casual to change.
-- ---------------------------------------------------------------------------
alter table item_prices enable row level security;

drop policy if exists item_prices_staff_select on item_prices;
create policy item_prices_staff_select on item_prices
  for select to authenticated using (true);

drop policy if exists item_prices_admin_write on item_prices;
create policy item_prices_admin_write on item_prices
  for all to authenticated
  using      (exists (select 1 from staff_profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from staff_profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------------------------------------------------------------------------
-- 3. Transaction snapshot columns. Captured at scan time by the client
--    (see plan §3.4) so historical spend stays stable when prices are
--    later edited. The existing transactions_no_update trigger means
--    snapshots can never be retroactively patched — corrections only
--    happen via a follow-up transaction.
-- ---------------------------------------------------------------------------
alter table transactions
  add column if not exists unit_cost_snapshot numeric(10,2),
  add column if not exists max_price_snapshot numeric(10,2),
  add column if not exists vendor_snapshot    text;

-- Partial index: only rows that actually carry a cost are interesting
-- for the spend/savings rollups.
create index if not exists transactions_cost_period_idx
  on transactions (occurred_at desc)
  where unit_cost_snapshot is not null;

-- ---------------------------------------------------------------------------
-- 4. items_with_best_price view. Layered on items_with_status so the
--    status/needs_label semantics stay in one place. Best price is
--    computed at read time (min of price where price + url are both
--    non-null) rather than stored as a flag.
-- ---------------------------------------------------------------------------
create or replace view items_with_best_price with (security_invoker = true) as
  select s.*,
         ip.best_price,
         ip.best_vendor,
         ip.best_url,
         ip.max_price,
         ip.quote_count
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

-- ---------------------------------------------------------------------------
-- 5. record_movement — widen signature with three snapshot params.
--    All new params default NULL so the existing frontend 5-arg call site
--    (`src/lib/items.js`) keeps working unchanged. Only when PR C ships
--    will the scan path start passing actual snapshot values.
-- ---------------------------------------------------------------------------
drop function if exists record_movement(uuid, text, integer, text, uuid);

create or replace function record_movement(
  p_item_id            uuid,
  p_direction          text,
  p_qty                integer,
  p_note               text          default null,
  p_idempotency_key    uuid          default null,
  p_unit_cost_snapshot numeric(10,2) default null,
  p_max_price_snapshot numeric(10,2) default null,
  p_vendor_snapshot    text          default null
) returns transactions
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_user_id  uuid := auth.uid();
  v_staff    text;
  v_new_qty  integer;
  v_txn      transactions;
begin
  if p_direction not in ('in', 'out') then
    raise exception 'direction must be ''in'' or ''out''';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'qty must be a positive integer';
  end if;

  if v_user_id is not null then
    select coalesce(raw_user_meta_data->>'full_name', email)
      into v_staff
      from auth.users
     where id = v_user_id;
  end if;

  begin
    insert into transactions
      (item_id, direction, qty, staff_id, staff_label, note, idempotency_key,
       unit_cost_snapshot, max_price_snapshot, vendor_snapshot)
    values
      (p_item_id, p_direction, p_qty, v_user_id, v_staff, p_note, p_idempotency_key,
       p_unit_cost_snapshot, p_max_price_snapshot, p_vendor_snapshot)
    returning * into v_txn;
  exception when unique_violation then
    select * into v_txn
      from transactions
     where idempotency_key = p_idempotency_key;
    return v_txn;
  end;

  update items
     set qty = case when p_direction = 'in' then qty + p_qty else qty - p_qty end
   where id = p_item_id
     and deleted_at is null
   returning qty into v_new_qty;

  if not found then
    raise exception 'item % not found (or deleted)', p_item_id;
  end if;
  if v_new_qty < 0 then
    raise exception 'check-out would drop qty below zero';
  end if;

  return v_txn;
end;
$$;

revoke all     on function record_movement(uuid, text, integer, text, uuid, numeric, numeric, text) from public;
revoke execute on function record_movement(uuid, text, integer, text, uuid, numeric, numeric, text) from anon;
grant  execute on function record_movement(uuid, text, integer, text, uuid, numeric, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Backfill — every item with a legacy `metadata.purchase_url` gets one
--    item_prices row so the new OrderButton fallback chain has somewhere
--    to point even before staff start entering proper quotes.
--
--    Vendor name parsed from the URL hostname (strip "www.", titlecase).
--    Price is NULL because we don't know it — flagged in the UI as
--    "URL on file, price unknown".
--
--    `metadata.purchase_url` is NOT deleted by this migration. The
--    OrderButton fallback chain (PR B) reads it as a last resort, and
--    any rollback of a later PR leaves the legacy reorder flow intact.
--    A future cleanup migration can scrub it once the new path soaks.
-- ---------------------------------------------------------------------------
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
   and not exists (
     select 1 from item_prices p where p.item_id = i.id
   )
on conflict do nothing;
