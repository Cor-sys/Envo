# Lighting inventory import log

Audit trail for the bulk light-bulb / supplies import landed on 2026-05-22.

## Source

`C:\Users\beebo\OneDrive\Desktop\Lighting_Inventory.xlsx` — single sheet,
31 numbered rows, columns:

| # | Category | Brand | Watts | Base / Fixture | Type | Model / Order Code | Color / Notes | Qty per Box |

## Mapping into `items`

| target field | source |
|---|---|
| `sku` | `LB001`–`LB031`, distinct from the existing `STK####` range |
| `item_type` | `light_bulb` for the 30 lamps, `supplies` for row 31 (LT 503 conduit fitting) |
| `name` | composite of Brand + Watts + lamp Type + leading clause of notes/model |
| `category` | copied from spreadsheet "Category" |
| `brand` | from "Brand" |
| `qty` | first leading digits parsed from "Qty per Box" — `"~16"` → 16, `"12"` → 12. `"?"`, `"—"`, `"Paper-wrapped, large qty"` all land as 0 (stocktake required) |
| `threshold` | 1 — anything below shows OUT |
| `metadata` | object with `watts`, `base_fixture`, `lamp_type`, `model_code`, `color_notes`, `qty_per_box` (raw string), `import_source: "lighting_xlsx"` |

## Numbers

- 30 lamp rows + 1 fitting = 31 rows inserted
- Total on-hand qty captured from the sheet: **113** units
- Rows landing with `qty = 0` (need stocktake): **17** (mostly HID lamps and CFL boxes labelled "Paper-wrapped" or "—")

Pre-import state: 3 light-bulb rows. Post-import: 33 light-bulb rows + the
supplies count went from 1 → 2.

## Where the script lives

`scripts/extract-lighting-import.mjs` — reads the Excel, emits the
`INSERT INTO items …` statement on stdout. Safe to re-run; the
`ON CONFLICT (sku) DO NOTHING` clause makes it idempotent against the
LB001–LB031 range.

## Known gaps to fix in the data-completion pass

Items still missing key spec data (parallel to the SDS resolution work):

### Wattage marked "?" (6 rows)
- LB006 Unknown linear fluorescent (X11293)
- LB017 Philips Mercury vapor (paper-wrapped)
- LB018 Sylvania Metalarc
- LB019 Sylvania Metalarc Pro-Tech MP
- LB020 Sylvania Lumalux (paper-wrapped HPS)
- LB029 Philips #34257-6

### Model code "—" / missing (several)
- LB005 Philips Alto 20W T12
- LB017 Philips Mercury vapor
- LB023 Appliance bulb (unbranded)
- LB024 Ecosmart 75W eq. LED
- LB025 Feit 60W eq. LED A19
- LB026 Hizashi LED filament
- LB027 Feit 50W eq. Enhance reflector
- LB030 GE DDK projector lamp

### Unknown brand
- LB006 — only box marking is "X11293"

### Strategy
Same as the SDS resolution: WebSearch by `brand + watts + lamp_type`,
verify against the manufacturer's cut sheet, fill `metadata.model_code`,
`metadata.lumens`, `metadata.lifespan_hours`, etc. via `UPDATE items`.

Items where the brand or model can't be resolved get rolled into a
follow-up deletion log (analogous to `SDS-DELETION-CANDIDATES.md`).
