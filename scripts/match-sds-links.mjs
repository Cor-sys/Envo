#!/usr/bin/env node
// One-off matcher: pair each Excel-row link to its DB item by fuzzy name +
// brand similarity. Output is a JSON file mapping db_item_id → candidate_url,
// plus a printed report sorted by confidence so the human can eyeball the
// borderline matches before applying.
//
// Inputs:
//   scripts/sds-links-from-file2.json  (Excel rows, from extract-sds-links.mjs)
//   scripts/db-items.json              (DB items, exported via MCP query)
// Output:
//   scripts/sds-link-matches.json      (proposed updates)
//
// To regenerate scripts/db-items.json, run this SQL via MCP and dump the
// `db_items` array to disk:
//
//   SELECT json_agg(json_build_object(
//     'id', id, 'name', name, 'brand', brand, 'cas', metadata->>'cas'
//   )) AS db_items
//   FROM items
//   WHERE item_type IN ('chemical','paint')
//     AND metadata->>'import_source' IN ('file2','both')
//     AND NOT (metadata ? 'sds_path');

import { readFileSync, writeFileSync } from 'node:fs';

const excel = JSON.parse(readFileSync('scripts/sds-links-from-file2.json', 'utf8'));
const dbItems = JSON.parse(readFileSync('scripts/db-items.json', 'utf8'));

// Tokenise a name for fuzzy comparison. Strip ™/® junk, lowercase, drop
// generic words that appear in almost every product name and don't carry
// signal ("paint", "spray", "cleaner" alone aren't matches).
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'a', 'an',
  'inc', 'co', 'corp', 'corporation', 'company', 'ltd',
]);
function tokens(s) {
  if (!s) return new Set();
  return new Set(
    s.toLowerCase()
     .replace(/[®™©]/g, '')
     .replace(/[^a-z0-9\s-]/g, ' ')
     .split(/[\s-]+/)
     .filter((t) => t && !STOPWORDS.has(t)),
  );
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function score(excelRow, dbItem) {
  const eNameToks  = tokens(excelRow.name);
  const dbNameToks = tokens(dbItem.name);
  const eBrandToks = tokens(excelRow.brand);
  const dbBrandToks = tokens(dbItem.brand);

  // Name similarity is the main signal. Brand match is a tie-breaker /
  // confirmer — a strong name match with a wrong-brand mismatch is suspect.
  const nameJ  = jaccard(eNameToks, dbNameToks);
  const brandJ = jaccard(eBrandToks, dbBrandToks);

  // Weight: name 0.75, brand 0.25. Name token overlap matters most.
  return nameJ * 0.75 + brandJ * 0.25;
}

// For each Excel row, pick the single best DB item match (and the runner-up
// so we can flag close-call ambiguity).
const matches = [];
for (const row of excel) {
  let best = { item: null, score: 0 };
  let second = { item: null, score: 0 };
  for (const item of dbItems) {
    const s = score(row, item);
    if (s > best.score) {
      second = best;
      best = { item, score: s };
    } else if (s > second.score) {
      second = { item, score: s };
    }
  }
  matches.push({
    excel_name: row.name,
    excel_brand: row.brand,
    link: row.link,
    link_kind: row.link_kind,
    db_id: best.item?.id ?? null,
    db_name: best.item?.name ?? null,
    db_brand: best.item?.brand ?? null,
    db_cas: best.item?.cas ?? null,
    score: Number(best.score.toFixed(3)),
    runner_up_score: Number(second.score.toFixed(3)),
    confidence: best.score >= 0.55 ? 'high'
              : best.score >= 0.40 ? 'medium'
              : 'low',
  });
}

// Sort: low-confidence rows first (so they're at the top of the printout
// where the user needs to focus their attention).
matches.sort((a, b) => a.score - b.score);

const direct = matches.filter((m) => m.link_kind === 'direct');
const search = matches.filter((m) => m.link_kind === 'google_search');

console.log('=== DIRECT PDF LINKS ===');
console.log(`Total: ${direct.length}`);
for (const tier of ['low', 'medium', 'high']) {
  const subset = direct.filter((m) => m.confidence === tier);
  console.log(`  ${tier}: ${subset.length}`);
}
console.log('\n--- BORDERLINE (lowest 12 by score) — review these ---\n');
for (const m of direct.slice(0, 12)) {
  console.log(`  [${m.confidence}, ${m.score}]`);
  console.log(`    Excel: ${m.excel_name}  |  ${m.excel_brand}`);
  console.log(`    DB:    ${m.db_name}  |  ${m.db_brand}`);
  console.log(`    Link:  ${m.link}`);
  console.log('');
}

writeFileSync('scripts/sds-link-matches.json', JSON.stringify({ direct, search }, null, 2));
console.log('\nWrote scripts/sds-link-matches.json');
