#!/usr/bin/env node
// One-off: read the Lighting_Inventory.xlsx on the user's desktop and emit
// an INSERT statement for the items table. Output is plain SQL — apply via
// MCP after eyeballing the rows.
//
// Mappings:
//   item_type    light_bulb for rows 1-30, supplies for the LT 503 fitting
//   sku          LB001..LB031 (distinct from existing STK#### range)
//   name         combines Brand + Watts + Type + key bits of model/notes
//   category     copied from "Category" column
//   brand        from "Brand"
//   qty          parsed leading number from "Qty per Box"; falls back to 0
//                when value is "?" / paper-wrapped / unknown
//   threshold    1 (everything below 1 = needs reorder)
//   metadata     watts, base_fixture, lamp_type, model_code, color_notes,
//                qty_per_box (raw string), import_source ('lighting_xlsx')
//
// Single quotes in any string are doubled inside the SQL literal.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const SRC = 'C:/Users/beebo/OneDrive/Desktop/Lighting_Inventory.xlsx';
const wb = XLSX.readFile(SRC);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function jsonEsc(obj) {
  return "'" + JSON.stringify(obj).replace(/'/g, "''") + "'::jsonb";
}
function parseQty(raw) {
  if (!raw) return 0;
  const s = String(raw).trim();
  const m = s.match(/^\D*(\d+)/);  // skip leading "~" and pull first number
  return m ? Number(m[1]) : 0;
}
function makeName(r) {
  const parts = [];
  if (r.Brand) parts.push(String(r.Brand).trim());
  if (r.Watts) parts.push(String(r.Watts).trim());
  if (r.Type) parts.push(String(r.Type).trim());
  // The model/notes often holds the most identifying string — append a short
  // version so duplicate (Brand, Watts, Type) tuples disambiguate.
  const tail = r['Color / Notes'] || r['Model / Order Code'];
  if (tail && !String(tail).match(/^[—-]+$/)) {
    const short = String(tail).split(',')[0].trim().slice(0, 40);
    if (short && short !== '?') parts.push(short);
  }
  return parts.join(' ').slice(0, 200) || `Lighting item ${r['#']}`;
}

const inserts = [];
for (const r of rows) {
  const n   = r['#'];
  const cat = r['Category'];
  const isLamp = !/non-lamp/i.test(cat ?? '');
  const itemType = isLamp ? 'light_bulb' : 'supplies';
  const sku = 'LB' + String(n).padStart(3, '0');
  const name = makeName(r);
  const brand = r['Brand'] ?? null;
  const qty = parseQty(r['Qty per Box']);
  const meta = {
    watts:         r['Watts']            ?? null,
    base_fixture:  r['Base / Fixture']   ?? null,
    lamp_type:     r['Type']             ?? null,
    model_code:    r['Model / Order Code'] ?? null,
    color_notes:   r['Color / Notes']    ?? null,
    qty_per_box:   r['Qty per Box']      ?? null,
    import_source: 'lighting_xlsx',
  };
  inserts.push(
    `(${esc(sku)}, ${esc(itemType)}, ${esc(cat)}, ${esc(name)}, ${esc(brand)}, ${qty}, 1, ${jsonEsc(meta)})`
  );
}

console.log('INSERT INTO items (sku, item_type, category, name, brand, qty, threshold, metadata) VALUES');
console.log(inserts.join(',\n'));
console.log('ON CONFLICT (sku) DO NOTHING;');
