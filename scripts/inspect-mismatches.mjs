#!/usr/bin/env node
// Re-download each PDF that the earlier verify pass flagged as
// cas_mismatch, extract EVERY CAS-shaped string from the text, and print
// a triage report so the human can quickly decide: accept (the PDF is the
// right product, our stored CAS was just for the wrong ingredient) or
// reject (the link points at a different product entirely).
//
// Input:  scripts/sds-link-verdicts.json  (from verify-sds-links.mjs)
// Output: scripts/sds-mismatch-report.json + console table

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

const TIMEOUT_MS = 25_000;
const PAGES_TO_SCAN = 5;
const MAX_BYTES = 15_000_000;

// CAS format: 2-7 digits, dash, 2 digits, dash, 1 digit (e.g. 7704-34-9).
// The final digit is a checksum but we don't verify it — we just want to
// find every CAS-shaped token in the PDF text and show them all.
const CAS_RE = /\b(\d{2,7}-\d{2}-\d)\b/g;

const verdicts = JSON.parse(readFileSync('scripts/sds-link-verdicts.json', 'utf8'));
const targets = verdicts.filter((v) => v.verdict === 'cas_mismatch');
console.log(`Inspecting ${targets.length} cas_mismatch verdicts...\n`);

async function fetchWithTimeout(url, opts = {}) {
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

async function extractText(buf) {
  const data = new Uint8Array(buf);
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  const pages = Math.min(doc.numPages, PAGES_TO_SCAN);
  let text = '';
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map((i) => i.str ?? '').join(' ') + '\n';
  }
  return text;
}

function nameTokens(s) {
  return new Set(
    (s ?? '').toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/[\s-]+/)
      .filter(Boolean)
  );
}

const report = [];
let idx = 0;
for (const v of targets) {
  idx += 1;
  const tag = `[${String(idx).padStart(2, ' ')}/${targets.length}]`;
  process.stdout.write(`${tag} ${(v.db_name ?? '').padEnd(45).slice(0, 45)}  `);

  const entry = {
    db_id: v.db_id,
    db_name: v.db_name,
    db_cas_expected: v.db_cas,
    excel_name: v.excel_name,
    link: v.link,
    pdf_first_chars: null,
    pdf_cas_list: [],
    pdf_name_hits: [],
    verdict: null,  // 'looks_correct' | 'looks_wrong' | 'inconclusive'
  };

  try {
    const res = await fetchWithTimeout(v.link, { method: 'GET', redirect: 'follow' });
    if (!res.ok) {
      entry.verdict = 'inconclusive';
      entry.error = `HTTP ${res.status}`;
      console.log(`http ${res.status}`);
      report.push(entry);
      continue;
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      entry.verdict = 'inconclusive';
      entry.error = 'too large';
      console.log('too large');
      report.push(entry);
      continue;
    }
    const text = await extractText(buf);
    entry.pdf_first_chars = text.slice(0, 200);

    const cases = [...text.matchAll(CAS_RE)].map((m) => m[1]);
    // De-dupe in order.
    entry.pdf_cas_list = [...new Set(cases)];

    // Compare the DB product name's tokens to the PDF text. Strong overlap
    // (≥3 distinctive name tokens appearing in the PDF) is a separate
    // signal that the PDF really is for this product — even if our CAS
    // doesn't match because it was for the wrong ingredient.
    const dbToks = nameTokens(v.db_name);
    const pdfLower = text.toLowerCase();
    entry.pdf_name_hits = [...dbToks].filter((t) => t.length >= 4 && pdfLower.includes(t));

    const strongName = entry.pdf_name_hits.length >= 3;
    if (strongName) entry.verdict = 'looks_correct';
    else            entry.verdict = 'looks_wrong';

    console.log(`${entry.verdict} (name hits: ${entry.pdf_name_hits.length}, CAS count: ${entry.pdf_cas_list.length})`);
  } catch (e) {
    entry.verdict = 'inconclusive';
    entry.error = e.message ?? String(e);
    console.log(`error: ${entry.error}`);
  }

  report.push(entry);
  await new Promise((r) => setTimeout(r, 400));
}

writeFileSync('scripts/sds-mismatch-report.json', JSON.stringify(report, null, 2));
console.log('\n=== Summary ===');
const counts = report.reduce((a, e) => ({ ...a, [e.verdict]: (a[e.verdict] ?? 0) + 1 }), {});
for (const [k, n] of Object.entries(counts)) console.log(`  ${k}  ${n}`);
console.log('\nWrote scripts/sds-mismatch-report.json');
