# Backlog

Deferred work, in rough priority order. Owner: Charles. See `BRIEF.md` for
the original scope contract — items marked with §11 are explicitly out of
v1 scope but on the table once the basics earn their keep.

## Likely next round (when daily use surfaces a need)

- **Full purchase-order workflow** (BRIEF §11) — generate a PO from the
  reorder list with supplier contact info attached. CSV export (shipped
  now) covers the bottom 80% of this use case.
- **Email reorder list** (BRIEF §10 "later") — `mailto:` link with the
  reorder summary prefilled would unlock most of the value with zero
  backend work. A scheduled job that emails the list weekly is the next
  step up.
- **Per-job cost rollup** — extension of the building tag work (shipped
  now). Replace free-text job tagging with a `jobs` table when more than
  ~10 distinct jobs are in play and free-text typos start fragmenting
  the report.
- **Granular role split beyond admin/staff** (BRIEF §3, §11) — add a
  `viewer` role for office staff who shouldn't be able to scan items
  in/out, and a per-table edit gate (e.g. "staff can scan but not edit
  catalog metadata"). Today's RLS is binary: admin writes pricing /
  buildings / invites, everyone else can edit items.

## Out of scope for v1 (kept available in case scope expands)

- **Multi-location support** (BRIEF §11) — `items.location_id` already
  references the `locations` table, so the data model is half-ready.
  Would need: location picker in the header (or a multi-location
  Inventory view), location-aware reorder logic, transfer transactions.
- **Customer-facing browsing** (BRIEF §11) — public catalog page that
  isn't gated by `AuthGate`. Doesn't currently fit the "stockroom"
  framing but possible if the business takes on retail.
- **Light theme** — locked to dark today. Print mode already inverts
  via CSS overrides, which covers the only real need.

## Open questions from BRIEF §14 — answered as the app gets used

These don't need to be locked in now; they'll resolve themselves once a
few weeks of real data show the actual patterns.

- Do orders go in **fixed case/box quantities**? Affects reorder-math
  rounding. Today's `suggested_qty = threshold - qty (floored at 1)`
  works for non-case ordering.
- On scan check-out, default to **−1 per scan** vs. **prompt for qty**?
  Today: Scan does −1, ItemDetail ± offers presets [1, 5, 10, 25] + a
  free-form number.
- Should the **SKU encode** anything (zone, type prefix)? Today: plain
  running `STK####`. Adding a prefix later is non-destructive.
- Does check-out need to track **where the bulb went** (job, customer,
  building)? Building tag now optional on every movement (shipped now).
  Job/customer level deferred to the per-job rollup work above.
- Should staff be able to **browse and filter the full activity log**?
  Yes — `/activity` page with search + date filter shipped now.
- **Label sheet sizing** (Avery vs. print-and-cut)? Today: print-and-cut
  with a generated 2.6in min-width grid. Avery-aligned variant is a
  one-time print-CSS pass when an actual label printer arrives.

## Maintenance / content tasks (Charles)

These need physical access to the stockroom, not code changes.

- **11 unidentified light bulbs** still pending box-read — LB005, LB006,
  LB010, LB017–020, LB023, LB028–030. See `LIGHTING-IMPORT.md` for the
  variant lists to match against.
- **Vendor pricing data** — every item the business reorders should
  carry 2-3 quotes via the new Pricing section on EditItem so the Spend
  / Saved tiles fill with real numbers.
- **Building notes** — oil types, filter sizes, etc. per building in
  the Map tab.
