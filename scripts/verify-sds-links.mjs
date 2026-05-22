#!/usr/bin/env node
// For each proposed match (HIGH and MEDIUM confidence), download the PDF and
// check whether the DB item's CAS appears in it. Output the verdict per item
// so we only write URLs that PASS to the database — wrong-product matches
// (KILZ → PPG Speedhide, Rust-Oleum Metallic Spray → Rust-Oleum Plastic
// Spray Paint, etc.) self-eject via CAS mismatch.
//
// Inputs:
//   scripts/sds-link-matches.json   (from match-sds-links.mjs)
// Output:
//   scripts/sds-link-verdicts.json
//
// Each verdict is one of:
//   pass            — PDF loaded AND contains expected CAS
//   reachable       — PDF loaded but no CAS available to cross-check
//   cas_mismatch    — PDF loaded but CAS NOT in it
//   not_pdf         — content-type wasn't PDF (probably redirected to homepage)
//   broken          — HTTP error / network failure
//   pdf_unparseable — got bytes but couldn't extract text

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

const REQUEST_TIMEOUT_MS = 20000;
const REQUEST_DELAY_MS = 400;
const PDF_PAGES_TO_SCAN = 4;
const PDF_MAX_BYTES = 12_000_000;

const matches = JSON.parse(readFileSync('scripts/sds-link-matches.json', 'utf8'));

// Verify only direct PDF links, and only HIGH + MEDIUM confidence — low
// confidence matches are essentially guesses, not worth burning bandwidth.
const candidates = matches.direct.filter((m) =>
  m.confidence === 'high' || m.confidence === 'medium'
);
console.log(`Verifying ${candidates.length} candidate URLs...`);

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; stockroom-sds-checker/1.0)',
        ...(opts.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(id);
  }
}

async function extractText(buf) {
  const data = new Uint8Array(buf);
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  const pages = Math.min(doc.numPages, PDF_PAGES_TO_SCAN);
  let text = '';
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map((i) => i.str ?? '').join(' ') + '\n';
  }
  return text;
}

function casPresent(text, cas) {
  const norm = (s) => s.replace(/[‐-―−]/g, '-').replace(/\s+/g, '');
  return norm(text).includes(norm(cas));
}

const verdicts = [];
let idx = 0;
for (const m of candidates) {
  idx += 1;
  const tag = `[${String(idx).padStart(2, ' ')}/${candidates.length}]`;
  process.stdout.write(`${tag} ${(m.excel_name ?? '').padEnd(40).slice(0, 40)}  `);

  const v = {
    db_id: m.db_id,
    db_name: m.db_name,
    db_cas: m.db_cas,
    excel_name: m.excel_name,
    confidence: m.confidence,
    score: m.score,
    link: m.link,
    final_url: null,
    http_status: null,
    verdict: null,
    note: null,
  };

  try {
    const res = await fetchWithTimeout(m.link, { method: 'GET', redirect: 'follow' });
    v.http_status = res.status;
    v.final_url = res.url;
    if (!res.ok) {
      v.verdict = 'broken';
      console.log(`broken (${res.status})`);
      verdicts.push(v);
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
      continue;
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const looksLikePdf = ct.includes('pdf') || res.url.toLowerCase().endsWith('.pdf');
    if (!looksLikePdf) {
      v.verdict = 'not_pdf';
      console.log(`not_pdf (${ct.slice(0, 40)})`);
      verdicts.push(v);
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
      continue;
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > PDF_MAX_BYTES) {
      v.verdict = 'reachable';
      v.note = `pdf too large (${buf.byteLength} bytes)`;
      console.log('reachable (oversized)');
      verdicts.push(v);
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
      continue;
    }
    let text;
    try {
      text = await extractText(buf);
    } catch (e) {
      v.verdict = 'pdf_unparseable';
      v.note = e.message;
      console.log('pdf_unparseable');
      verdicts.push(v);
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
      continue;
    }
    if (!v.db_cas) {
      v.verdict = 'reachable';
      console.log('reachable (no DB CAS)');
    } else if (casPresent(text, v.db_cas)) {
      v.verdict = 'pass';
      console.log(`PASS  (CAS ${v.db_cas} found)`);
    } else {
      v.verdict = 'cas_mismatch';
      console.log(`cas_mismatch (CAS ${v.db_cas} NOT found)`);
    }
  } catch (e) {
    v.verdict = 'broken';
    v.note = e.name === 'AbortError' ? 'timeout' : (e.message || String(e));
    console.log(`broken (${v.note})`);
  }
  verdicts.push(v);
  await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
}

writeFileSync('scripts/sds-link-verdicts.json', JSON.stringify(verdicts, null, 2));

console.log('\n=== Summary ===');
const tally = verdicts.reduce((a, v) => ({ ...a, [v.verdict]: (a[v.verdict] ?? 0) + 1 }), {});
for (const [k, n] of Object.entries(tally)) console.log(`  ${k.padEnd(20)} ${n}`);
console.log('\nWrote scripts/sds-link-verdicts.json');
