#!/usr/bin/env node
// One-off: extract the hyperlinks that live in column 7 of File 2 and write
// them out as a JSON file matching {product_name, cas, link, link_kind}
// so they can be merged with the existing items via SQL. The Excel file
// stores them as hyperlink metadata on "Download PDF" cells, so XLSX's
// sheet_to_json drops them — we walk the cells by hand.

import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx'); // CJS — its ESM default export doesn't expose readFile.

const SRC = 'C:/Users/beebo/OneDrive/Desktop/sds files/SDS Master Chemical Inventory.backup_20260223_214439.xlsx';
const OUT = 'scripts/sds-links-from-file2.json';

const wb = XLSX.readFile(SRC);
const sh = wb.Sheets[wb.SheetNames[0]];
const range = XLSX.utils.decode_range(sh['!ref']);

// File 2 is actually TWO tables side-by-side, not one table with a links
// column. Left (cols 1-4): Sherwin-Williams paint catalog. Right (cols 5-7):
// a separate list of consumer/industrial chemicals with hyperlinked
// "Download PDF" cells. They share spreadsheet rows but describe different
// products — matching by row position confuses them.
//
// We want the RIGHT-side table since that's where the SDS links live.
//   5 = Product Name (right table)
//   6 = Brand        (right table)
//   7 = Download PDF (hyperlink lives on this cell)
const COL = { name: 5, brand: 6, link: 7 };

function cellValue(r, c) {
  const cell = sh[XLSX.utils.encode_cell({ r, c })];
  return cell ? cell.v : null;
}
function cellLink(r, c) {
  const cell = sh[XLSX.utils.encode_cell({ r, c })];
  return cell?.l?.Target ?? null;
}

// Classify the link. Google search URLs were used as fallbacks in the source
// spreadsheet when the maintainer didn't have a real PDF URL.
function classify(url) {
  if (!url) return 'none';
  const u = url.toLowerCase();
  if (u.startsWith('https://www.google.com/search') || u.startsWith('https://google.com/search')) {
    return 'google_search';
  }
  return 'direct';
}

const rows = [];
for (let r = range.s.r; r <= range.e.r; r++) {
  const name = cellValue(r, COL.name);
  const link = cellLink(r, COL.link);
  if (!name || typeof name !== 'string') continue;
  // Header rows + the title row don't have product names that match products.
  if (r < 2) continue;
  rows.push({
    excel_row: r + 1, // 1-indexed for human readability
    name,
    brand: cellValue(r, COL.brand),
    link,
    link_kind: classify(link),
  });
}

const direct = rows.filter((r) => r.link_kind === 'direct');
const search = rows.filter((r) => r.link_kind === 'google_search');
const none   = rows.filter((r) => r.link_kind === 'none');

console.log('Total rows:', rows.length);
console.log('  direct PDF links:', direct.length);
console.log('  google-search fallback links:', search.length);
console.log('  no link:', none.length);

writeFileSync(OUT, JSON.stringify(rows, null, 2));
console.log('\nWrote', OUT);
