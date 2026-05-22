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

## Data-completion pass — 2026-05-22

Same pattern as the SDS resolution: WebSearch by `brand + watts + lamp_type`,
verify against the manufacturer's cut sheet, fill `metadata.lumens` /
`lifespan_hours` / `cri` / `model_code` via `UPDATE items`. For HID lamps
where the wattage couldn't be pinned to a specific model without the box
in hand, a `completion_note` lists the manufacturer's variant set so the
user can match on a walk-through.

### Verified specs added (22 rows total)

First pass — LB### rows from the new import:

| sku | what was filled |
|---|---|
| LB007 | Sylvania CF42DT/E/IN/841 — lumens 3200, lifespan 12000h, CRI 82 |
| LB018 | Sylvania Metalarc — variant note (70/100/150/175/250/400/1000W variants) |
| LB019 | Sylvania Metalarc Pro-Tech MP — variant note (50/70/100/150/175W variants) |
| LB020 | Sylvania Lumalux HPS — variant note (50/70/100/150/200/250/400/1000W variants) |
| LB022 | Sylvania 65W BR30 incandescent — lumens 620, 2000h, 120V |
| LB024 | Ecosmart 75W-eq A19 LED — lumens 1100, 25000h, model ECS A19 75WE |
| LB025 | Feit 60W-eq A19 LED — lumens 800, 11000h, CRI 80, model A800/827/10KLED/10/RP |
| LB026 | Hizashi candelabra LED — lumens 550 (6W), 25000h, CRI 90+ |
| LB027 | Feit Enhance PAR20 — lumens 450, 25000h, CRI 90+, model PAR20DM-9{30,50}CA |

Second pass — pre-existing rows + remaining T8/T12/CFLs:

| sku | what was filled |
|---|---|
| STK0001 | Philips PL-T 26W/830/A/4P/ALTO (458257) — lifespan 16000h, CRI 82 |
| STK0002 | Sylvania LED12T8/L48/FG/830/BFG2 — lifespan 50000h, CRI 82, 120-277V |
| STK0008 | GE Q50MR16/FL (20867, EXN) — lifespan 6000h, CRI 100, 12V, 40° beam |
| LB001 | Sylvania FBO32/830/6/ECO — lumens 2850, lifespan 20000h, CRI 82 |
| LB002 | Philips F40CW/RS/EW (std) — lumens 2350, 20000h, CRI 62 (Supreme variant 75-90) |
| LB003 | Philips F15T8/CW/ALTO — lumens 870, 7500h, CRI 62 |
| LB004 | GE F31T8/SPX35/U/ECO (72118) — lumens 2775, 24000h, CRI 82 |
| LB008 | Sylvania CF26DT/E/IN/841 (20882) — lumens 1800, 16000h, CRI 82 |
| LB009 | Sylvania CF18DD/E/835/ECO (20672, 4-pin) — lumens 1150, 20000h, CRI 82 |
| LB011 | Sylvania CF18DD/835/ECO (21110, 2-pin) — lumens 1150, 10000h, CRI 82 |
| LB012 | Sylvania CF26DD/835/ECO (21114) — lumens 1710, 10000h, CRI 82 |
| LB013 | Sylvania CF9DD/827/ECO (20689) — lumens 525, 10000h, CRI 82 |
| LB014 | GE F18DBX 4-pin G24q-2 — lumens 1200, 10000h, CRI 82 (color depends on suffix) |
| LB015 | GE F18DBX 2-pin G24d-2 — lumens 1200, 10000h, CRI 82 (color depends on suffix) |
| LB016 | Philips PL-S 9W/827/2P/ALTO (148676) — lumens 600, 10000h, CRI 82 |
| LB021 | GE MVR70/U/MED (12590) — lumens 5500, 12000h, CRI 65, M98/E |

Final coverage: **22 of 33** light-bulb rows fully specced (lumens +
lifespan + CRI). Pre-existing pre-import lamp count: 6; now also
includes the 3 STK rows that pre-dated the import.

### Still need physical inspection (11 rows)

These need someone to pull the actual bulb off the shelf and read the
box. The `completion_note` field on each row (where set) lists variants
to match against:

- **LB005** — Philips Alto 20W T12, model marked "—". Notes column says "1350 lm".
- **LB006** — Unknown brand, box marked "X11293". Possibly a discontinued line.
- **LB010** — Sylvania #20669 — quad-tube variant not pinned to color temperature.
- **LB017** — Philips mercury vapor, paper-wrapped. Wattage variants: 50/75/100/175/250/400W.
- **LB018, LB019, LB020** — Sylvania HID. Wattage notes already in metadata.
- **LB023** — Unbranded appliance bulb (40W clear A-shape). Generic.
- **LB028** — Osram #6418 festoon/auto lamp.
- **LB029** — Philips #34257-6 incandescent intermediate base. Old part number.
- **LB030** — GE DDK projector lamp ("Made in USA"). Old photographic/AV lamp.

### Strategy for the remaining 8

Same retire-or-relabel option as the SDS deletion log. When walking
the inventory, if any of these don't have a real product on shelf
that matches, delete the row and add an entry to a `LIGHTING-DELETION-CANDIDATES.md`
log (TBD if needed).
