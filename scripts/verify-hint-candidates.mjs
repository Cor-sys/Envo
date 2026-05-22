#!/usr/bin/env node
// Verify a batch of candidate SDS URLs collected via WebSearch for items
// that previously had only a search-hint. Same logic as verify-sds-links.mjs
// but works off scripts/sds-hint-candidates.json instead of the
// extract+match pipeline output.
//
// Output: scripts/sds-hint-verdicts.json + console table

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

const TIMEOUT_MS = 25_000;
const DELAY_MS = 400;
const PAGES = 4;
const MAX_BYTES = 15_000_000;

const candidates = JSON.parse(readFileSync('scripts/sds-hint-candidates.json', 'utf8'));

async function fetchT(url, opts = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; stockroom/1.0)', ...(opts.headers ?? {}) },
    });
  } finally { clearTimeout(id); }
}

async function pdfText(buf) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0 }).promise;
  const n = Math.min(doc.numPages, PAGES);
  let t = '';
  for (let p = 1; p <= n; p++) {
    const page = await doc.getPage(p);
    const c = await page.getTextContent();
    t += c.items.map((i) => i.str ?? '').join(' ') + '\n';
  }
  return t;
}

function casIn(text, cas) {
  const norm = (s) => s.replace(/[‐-―−]/g, '-').replace(/\s+/g, '');
  return norm(text).includes(norm(cas));
}

function nameTokens(s) {
  return [...new Set((s ?? '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter(Boolean))];
}

const results = [];
let idx = 0;
for (const c of candidates) {
  idx += 1;
  process.stdout.write(`[${String(idx).padStart(2, ' ')}/${candidates.length}] ${(c.db_name ?? '').padEnd(45).slice(0, 45)} `);
  const r = { ...c, verdict: null, http_status: null, final_url: null, name_hits: 0, has_cas: false, note: null };
  try {
    const res = await fetchT(c.candidate_url, { method: 'GET', redirect: 'follow' });
    r.http_status = res.status;
    r.final_url = res.url;
    if (!res.ok) { r.verdict = 'broken'; console.log(`broken ${res.status}`); results.push(r); continue; }
    const ct = (res.headers.get('content-type') ?? '').toLowerCase();
    const isPdf = ct.includes('pdf') || res.url.toLowerCase().endsWith('.pdf');
    if (!isPdf) { r.verdict = 'not_pdf'; console.log(`not_pdf ${ct.slice(0, 40)}`); results.push(r); continue; }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) { r.verdict = 'too_large'; console.log('too_large'); results.push(r); continue; }
    const text = await pdfText(buf);
    r.has_cas = c.db_cas ? casIn(text, c.db_cas) : false;
    // Count distinctive (4+ char) name tokens present in the PDF.
    const toks = nameTokens(c.db_name).filter((t) => t.length >= 4);
    const lower = text.toLowerCase();
    r.name_hits = toks.filter((t) => lower.includes(t)).length;
    if (r.has_cas) r.verdict = 'cas_match';
    else if (r.name_hits >= 3) r.verdict = 'name_match';
    else r.verdict = 'inconclusive';
    console.log(`${r.verdict} (name hits: ${r.name_hits}${c.db_cas ? `, cas ${r.has_cas ? 'found' : 'missing'}` : ''})`);
  } catch (e) {
    r.verdict = 'error';
    r.note = e.message || String(e);
    console.log(`error ${r.note}`);
  }
  results.push(r);
  await new Promise((r) => setTimeout(r, DELAY_MS));
}

writeFileSync('scripts/sds-hint-verdicts.json', JSON.stringify(results, null, 2));
console.log('\n=== Summary ===');
const counts = results.reduce((a, r) => ({ ...a, [r.verdict]: (a[r.verdict] ?? 0) + 1 }), {});
for (const [k, v] of Object.entries(counts)) console.log(`  ${k}  ${v}`);
console.log('Wrote scripts/sds-hint-verdicts.json');
