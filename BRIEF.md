# Stockroom — Inventory Management App: Project Brief

A starting brief for building the real app in Claude Code. A working UI skeleton
already exists (`inventory_app.jsx`) — treat it as the functional spec for screens,
data, and behavior. This document captures the decisions behind it plus the
real-app concerns the prototype didn't need to handle.

---

## 1. Goal

A simple, mobile-first inventory app for a single small business (a lighting/bulb
stockroom). Staff use phones and tablets to see what's on hand, get low-stock
alerts, and check stock in and out by scanning barcodes. The current physical
inventory is light bulbs and lamps (fluorescent tubes, CFLs, HID, incandescent/LED).

## 2. Hard constraints (non-negotiable)

- **Free for the people using it.** No per-seat or per-record SaaS fees.
- **Build on an open-source / self-hostable stack** so cost stays at $0 and we
  never get locked in or metered.
- **Self-hosting must remain a viable escape hatch** if any hosted free tier
  changes its terms.

## 3. Users

- One business, **one shared live inventory** (not per-location copies).
- **2–5 staff** log in. Roles can stay simple for v1 (everyone can edit); leave
  room to add an admin/staff distinction later.

## 4. Recommended stack

- **Frontend:** React, mobile-first (large tap targets, camera scanner front and
  center, layouts that stack to a single column on phones).
- **Database + Auth:** **Supabase** (managed PostgreSQL + built-in auth + storage).
  Free tier is ample for this size; the whole platform is self-hostable later.
- **Hosting:** **Render** free tier (or Netlify/Vercel) for the web app.
- **Escape hatch:** everything runs self-hosted (app + Postgres) on a cheap
  mini-PC if needed — keep the code portable and avoid provider lock-in.

## 5. v1 scope

Priority #1 is **quantity tracking + low-stock alerts.** The skeleton also already
demonstrates these, all of which are in scope for v1:

- Inventory **list view** (dense table) and an optional card view.
- **Quantity tracking** with quick +/- adjustments.
- **Low-stock alerts** driven by a per-item threshold.
- **Check in / check out** flow with a barcode/QR scanner and a running activity log.
- **SKUs** auto-assigned to every item; items lacking a factory UPC are flagged.
- **Printable labels** for items with no factory barcode.
- **Reports:** full inventory, reorder list, category summary — printable / save-as-PDF.

## 6. Data model

**Item**

| Field | Notes |
|---|---|
| `id` | internal primary key |
| `sku` | our own code, e.g. `STK0001`, auto-assigned, unique, stable |
| `category` | one of: Linear/U-bent fluorescent · Compact fluorescent (CFL) · HID (mercury/metal halide/HPS) · Incandescent / LED / misc |
| `brand` | e.g. Sylvania, Philips, GE |
| `watts` | text (some unknown — allow "?") |
| `name` / `description` | short human label |
| `base` / `fixture` | e.g. G13 medium bipin, GX24q-4, E39 mogul, E26 medium |
| `type` | e.g. T8 fluorescent, Triple-tube T/E, Metal halide, LED |
| `model` | manufacturer model / order code |
| `barcode` | factory UPC; **blank if the item has none** |
| `qty` | current quantity on hand |
| `threshold` | low-stock minimum |
| `location` | shelf/bin code, e.g. A1, B3, C2 |

**Transaction (activity log)** — see §8; make this an immutable row per check-in/out:
`id`, `timestamp`, `item_id`, `direction` (in/out), `qty`, `staff`.

## 7. Core logic

- **Status:** `qty <= 0` → **OUT**; `qty <= threshold` → **REORDER (low)**; else **OK**.
- **Reorder report:** include every item not OK; suggested order quantity brings it
  back to at least the threshold. (Confirm with owner whether they order in fixed
  case/box sizes — see open questions.)
- **SKU scheme:** running number `STK####`, auto-assigned on create, never reused.
  Items with no factory UPC are visibly flagged so staff know they need a label.
- **Scan lookup order:** exact factory UPC match → exact SKU match → fuzzy match on
  name/brand/model.

## 8. Real-app concerns the skeleton does NOT handle (build these properly)

1. **Concurrency / atomic stock changes.** With several staff scanning at once,
   quantity updates must be atomic on the server (DB-side increment/decrement or a
   transaction), never client read-modify-write — otherwise simultaneous scans
   clobber each other.
2. **Activity log as source of truth.** Record every check-in/out as an immutable
   transaction row; treat current quantity as derivable from / reconciled against
   that log. Makes auditing and "who pulled the last one" trivial.
3. **Offline tolerance.** Stockrooms have dead zones. Queue scans locally and sync
   when the connection returns; show clear pending/synced state.

## 9. Scanning

- **Camera-based**, using the device camera in the browser (native `BarcodeDetector`
  API where available, falling back to a JS library such as ZXing / html5-qrcode).
  Reads both 1D UPC barcodes and 2D QR codes. Works on phones and tablets, no app
  install.
- **Items with a factory UPC** scan immediately, no setup.
- **Items with no barcode** (a lot of the loose / paper-wrapped stock) get a
  self-printed **label**. Prefer **QR codes** for printed labels — more durable and
  easier for a phone camera than 1D barcodes. The label encodes the item's SKU.
- The check-out flow should support rapid repeat scanning (decrement per scan); make
  the default quantity behavior configurable (see open questions).

## 10. Reports

- Full inventory (grouped by category, with totals), reorder list, category summary.
- Output via the browser's print / Save-as-PDF for now.
- Later: CSV export and emailing a reorder list.

## 11. Out of scope for v1 (future)

- Full sales + automated reordering / purchase orders.
- Supplier and cost/price fields.
- Multiple locations / warehouses.
- Customer-facing browsing.
- Granular roles/permissions beyond basic staff login.

## 12. Reference

`inventory_app.jsx` is the working prototype and the canonical spec for layout,
fields, screens (Inventory · Scan In/Out · Labels · Reports), and interaction
behavior. The seed data in that file is the real catalog photographed from the
stockroom (27 item types) — useful as test/demo data, but quantities and shelf
locations in it are placeholders.

## 13. Suggested build order

1. Supabase project: schema (items + transactions), auth, row-level security.
2. App shell + auth (staff login), mobile-first layout.
3. Inventory list/detail + add/edit, quantity adjust (atomic).
4. Low-stock status + reorder filter.
5. Camera scan → check-in/out writing immutable transactions.
6. Reports (print/PDF).
7. SKU + label generation (QR).
8. Offline queue + sync.
9. Deploy to Render free tier; document the self-host path.

## 14. Open questions to resolve with the owner

- Do they order in **fixed case/box quantities** (e.g. always a box of 12), which
  would change the reorder-suggestion math?
- On check-out, default to **−1 per scan** (scan repeatedly to pull several) or
  always prompt for a quantity?
- Should the **SKU encode** anything (e.g. shelf zone `A1-007`) or stay a plain
  running number?
- Does check-out need to record **where a bulb went** (job / customer / building),
  or just that it left?
- Should staff be able to **browse and filter the full activity log**, or is a recent
  feed enough?
- Label sizing: target a specific **label sheet** (e.g. Avery) for alignment, or
  print-and-cut? (No printer yet — defer, but design the label layout to be
  sheet-friendly.)
