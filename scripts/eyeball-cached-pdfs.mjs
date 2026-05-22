#!/usr/bin/env node
// Second-pass eyeball check on the cached PDFs that were applied as
// 'reachable' (name match only, CAS didn't match). For each, fetch the
// PDF from our chemical-sds bucket (public read), extract first-page
// text, and report:
//   - which distinctive product-name tokens appear
//   - the first ~200 chars of text (so we can sanity-check the title page)
//
// Bucket URL pattern: https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
//
// Output: scripts/sds-cached-eyeball.json + console table

import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

const PROJECT = 'zwgpimzakzztzirkoheb';
const BUCKET  = 'chemical-sds';
const TIMEOUT_MS = 25_000;

// 13 reachable items, from the SQL query.
const targets = [
  { id: 'e7bb040f-90fa-4e23-8eda-b10103765f40', name: 'ACE Solvent-Based Marking Paint' },
  { id: 'b7dd5d05-3b74-496d-bbf2-d14f7b6cd92b', name: 'Ajax Ultra Dish Liquid' },
  { id: 'b822676f-8c53-450c-a9ac-15f3513a42a9', name: 'Behr Premium Concrete & Masonry Bonding Primer' },
  { id: '60bf1918-6080-4701-b293-88a67e084546', name: 'Behr Premium Plus Interior/Exterior Paint' },
  { id: 'c8fabb20-4087-4891-ada1-ece8aeb5a873', name: 'Beta Technology Pro-Volt Electrical Waterproofing Spray' },
  { id: '03523526-1c40-4fce-b1f2-508624111c8e', name: 'DAP Alex Plus Acrylic Latex Caulk' },
  { id: 'efe416b7-2fcd-4652-8895-4efe42b28fd0', name: 'DAP Weldwood Contact Cement' },
  { id: 'f2d449bc-6448-4f18-a41e-0ece62a91696', name: 'Glade Air Freshener Spray' },
  { id: '8d63f5e9-4201-4a55-9ba6-4c2be72d41f0', name: 'Green Gobbler Fruit Fly Killer' },
  { id: 'ffd14320-a7eb-4cf9-890e-7e68dc74b9f0', name: 'Minwax Wood Finish Stain' },
  { id: '5466448f-8b16-4f8f-a72b-816f417d1764', name: 'Roberts 6700 Indoor/Outdoor Carpet Adhesive' },
  { id: '72bdc8b2-0dea-4fd2-a874-b9ff6094657c', name: 'Sherwin-Williams Industrial Enamel' },
  { id: '65e4261c-d149-4e2f-b2a4-0cd4b7dfb031', name: 'Sprayway Glass Cleaner Professional' },
];

async function fetchT(url) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try { return await fetch(url, { signal: ctrl.signal }); }
  finally { clearTimeout(id); }
}

async function pdfFirstPage(buf) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const c = await page.getTextContent();
  return c.items.map((i) => i.str ?? '').join(' ');
}

function distinctiveTokens(s) {
  return [...new Set(
    (s ?? '').toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/[\s-]+/)
      .filter((t) => t.length >= 4)
  )];
}

const results = [];
for (let i = 0; i < targets.length; i++) {
  const t = targets[i];
  const url = `https://${PROJECT}.supabase.co/storage/v1/object/public/${BUCKET}/${t.id}/sds.pdf`;
  process.stdout.write(`[${String(i + 1).padStart(2, ' ')}/${targets.length}] ${t.name.padEnd(50).slice(0, 50)}  `);

  const r = { ...t, page1_preview: null, hits: [], misses: [], verdict: null, error: null };
  try {
    const res = await fetchT(url);
    if (!res.ok) { r.error = `HTTP ${res.status}`; r.verdict = 'fetch_error'; console.log(r.error); results.push(r); continue; }
    const buf = await res.arrayBuffer();
    const text = await pdfFirstPage(buf);
    r.page1_preview = text.slice(0, 220).replace(/\s+/g, ' ').trim();

    const tokens = distinctiveTokens(t.name);
    const lower = text.toLowerCase();
    for (const tok of tokens) (lower.includes(tok) ? r.hits : r.misses).push(tok);

    // Verdict thresholds: 3+ hits = confident, 2 = borderline, <2 = suspect
    r.verdict = r.hits.length >= 3 ? 'looks_correct' : r.hits.length >= 2 ? 'borderline' : 'suspect';
    console.log(`${r.verdict.padEnd(15)} hits: ${r.hits.length}/${tokens.length}  [${r.hits.slice(0, 5).join(', ')}]`);
  } catch (e) {
    r.error = e.message ?? String(e);
    r.verdict = 'parse_error';
    console.log(`error: ${r.error}`);
  }
  results.push(r);
  await new Promise((res) => setTimeout(res, 200));
}

writeFileSync('scripts/sds-cached-eyeball.json', JSON.stringify(results, null, 2));
console.log('\n=== Summary ===');
const counts = results.reduce((a, r) => ({ ...a, [r.verdict]: (a[r.verdict] ?? 0) + 1 }), {});
for (const [k, v] of Object.entries(counts)) console.log(`  ${k}  ${v}`);
console.log('\nWrote scripts/sds-cached-eyeball.json');
