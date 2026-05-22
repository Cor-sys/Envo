# SDS deletion log

Items removed from the chemical / paint inventory because they didn't belong
in an OSHA HazCom-tracked set: empty containers, cosmetic products exempt
from HazCom, or transcription errors that didn't match any real product.

This file is the audit trail.

---

## 2026-05-22 — 6 deletions

User-authorized batch via chat. No transactions referenced any of these rows
(verified `txn_count = 0` before deletion), so no audit history was broken.

### 1. Empty containers (not chemicals)

These were refillable spray bottles, not chemical SKUs. The SDS would depend
entirely on what gets filled into them — there is no SDS for "an empty bottle".

| DB id | Name | Deleted |
|---|---|:-:|
| `6a3a9399-7be8-49d0-ad93-c3805a9002f3` | Zep Professional Spray Bottles (Various chemicals) | ✓ |
| `583d8fe6-08e6-445f-bfba-70ed5934150d` | Zep Professional Sprayer Bottles | ✓ |

### 2. Cosmetic products (OSHA-exempt)

OSHA HazCom doesn't require SDSs for consumer-use cosmetic products. The
import-hint for Tan-Tastic literally recorded "Not applicable - cosmetic
product".

| DB id | Name | Deleted |
|---|---|:-:|
| `2099b811-f17e-4154-8746-04a1892c714d` | Mr. Bubble Bubble Bath | ✓ |
| `136707e7-2bcf-4beb-bd43-e7cfc768fc55` | Tan-Tastic Sunless Tanning | ✓ |

### 3. Transcription error

Brand/name didn't match any real product in any public source. Likely an
OCR/transcription error from the source spreadsheet.

| DB id | Name | Deleted |
|---|---|:-:|
| `37d2923a-13f1-4aaf-a0ae-166eeb913ee2` | Doft All Purpose Enamel | ✓ |

### 4. User-added catalog row that wasn't actually inventory

| DB id | Name | Deleted |
|---|---|:-:|
| `6df51f2b-e1c1-4083-a175-bdd4b031eb1c` | Almond eggshell (Sherwin-Williams, qty=1) | ✓ |

### 5. No public SDS available — supplier-only or proprietary formula

These have real products on shelf but the manufacturer doesn't publish a
public SDS PDF (distributor-portal only, or treats the formula as proprietary).
User chose to delete rather than store a generic substitute that wouldn't be
defensible in an OSHA inspection. Re-add via the inventory page when you
receive a copy of the actual SDS from the supplier.

| DB id | Name | Why deleted |
|---|---|---|
| `05483af4-30b0-40e1-804a-cd8902906860` | Multi-Mist X-CON 322 (Momar) | Momar's X-CON 322 SDS is dealer/distributor-only; no public PDF. |
| `32d5b83c-09b8-4591-a4a8-3dcce8a72295` | AJAX Fab Spring Magic Ultra Liquid Detergent | Colgate-Palmolive treats consumer-product formulas as proprietary; SDS requires phone request to 1-800-468-6502. |
| `334ab7bc-8790-494e-8de2-8634c94b93b4` | Rubbermaid Sanitary Maintenance Products | Generic placeholder name — Rubbermaid sells dozens of jan-san products. Need the actual product SKU first before an SDS can be sourced. |

---

## Restore SQL

If any of these were deleted in error, the rows can be re-created via the
inventory page or by running an INSERT with these IDs. The names/brands are
preserved above so a re-import won't conflict.

---

## How to add future deletions

When a row needs to come out:

1. Confirm `transactions.item_id` count is 0 (no history would be broken).
2. Append a new dated section to this file with the DB id + name + reason.
3. Run the DELETE via MCP or SQL editor.
