#!/usr/bin/env node
/* eslint-disable no-console */

// SDS link checker.
//
// For every item with metadata.sds_url (external link — not an uploaded PDF):
//   1. HEAD the URL, follow redirects, record final URL + HTTP status.
//   2. If the final response is a PDF AND we have metadata.cas, GET the PDF,
//      extract text from the first few pages, and check whether the expected
//      CAS number appears. This is the closest thing to "is this the right
//      product" verification — every SDS is legally required to list the CAS
//      of its primary ingredient(s).
//   3. Write the result back to the item's metadata so the SDS tab can show
//      it inline.
//
// The script writes these new keys onto metadata (alongside the existing
// sds_url / sds_path / sds_search_hint / cas):
//
//   sds_check_status        — 'cas_match' | 'cas_mismatch' | 'reachable'
//                             | 'redirected' | 'not_pdf' | 'broken'
//                             | 'pdf_unparseable'
//   sds_check_at            — ISO timestamp
//   sds_check_http_status   — number (200, 404, …)
//   sds_final_url           — the URL after following redirects
//
// Usage:
//   npm run check-sds                  # check everything
//   npm run check-sds -- --limit=20    # first 20 items only (dry-run-ish)
//   npm run check-sds -- --id=<uuid>   # check a single item
//
// Requires .env.local with:
//   VITE_SUPABASE_URL              (or SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY      (NOT the anon key — needs to write items)

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// pdfjs has an ESM legacy build that works in Node without DOM polyfills.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

// ---------- config -------------------------------------------------------

const REQUEST_TIMEOUT_MS = 15000;
const REQUEST_DELAY_MS   = 500;       // be polite — don't hammer a single host
const PDF_MAX_BYTES      = 10_000_000; // skip parsing huge PDFs
const PDF_PAGES_TO_SCAN  = 3;          // CAS appears on the first page(s)

// ---------- env load -----------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
function loadEnvLocal() {
  const path = resolve(__dirname, '..', '.env.local');
  let raw;
  try { raw = readFileSync(path, 'utf8'); }
  catch { return {}; }
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes if present.
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const env = { ...loadEnvLocal(), ...process.env };
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  console.error('The service role key is on the Supabase dashboard under Settings → API → service_role.');
  process.exit(1);
}

// ---------- args ---------------------------------------------------------

function parseArgs(argv) {
  const args = { limit: null, id: null };
  for (const raw of argv.slice(2)) {
    const m = raw.match(/^--([a-z-]+)(?:=(.+))?$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'limit') args.limit = Number(v);
    else if (k === 'id') args.id = v;
  }
  return args;
}
const args = parseArgs(process.argv);

// ---------- supabase -----------------------------------------------------

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ---------- helpers ------------------------------------------------------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      // Pretend to be a browser — some manufacturer sites 403 default UAs.
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; stockroom-sds-checker/1.0)',
        ...(opts.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(id);
  }
}

async function extractPdfText(arrayBuffer) {
  const data = new Uint8Array(arrayBuffer);
  // Silence pdfjs's verbose console output.
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  const pageLimit = Math.min(doc.numPages, PDF_PAGES_TO_SCAN);
  let text = '';
  for (let p = 1; p <= pageLimit; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map((i) => i.str ?? '').join(' ') + '\n';
  }
  return text;
}

function casFound(haystack, cas) {
  // CAS numbers are typically written `12345-67-8` but sometimes typeset
  // with non-breaking hyphens or stripped of dashes. Normalise both sides.
  const norm = (s) => s.replace(/[‐-―−-]/g, '').replace(/\s+/g, '');
  return norm(haystack).includes(norm(cas));
}

// ---------- the check ----------------------------------------------------

async function checkOne(item) {
  const url = item.metadata?.sds_url;
  if (!url) return { skip: 'no sds_url' };
  if (item.metadata?.sds_path) return { skip: 'has uploaded pdf' };

  const out = {
    sds_check_at: new Date().toISOString(),
    sds_check_status: null,
    sds_check_http_status: null,
    sds_final_url: null,
  };

  let res;
  try {
    // HEAD first; if the server doesn't allow it, fall back to GET.
    res = await fetchWithTimeout(url, { method: 'HEAD', redirect: 'follow' });
    if (res.status === 405 || res.status === 501) {
      res = await fetchWithTimeout(url, { method: 'GET', redirect: 'follow' });
    }
  } catch (e) {
    out.sds_check_status = 'broken';
    out.sds_check_http_status = 0;
    out.note = e.name === 'AbortError' ? 'timeout' : (e.message || String(e));
    return out;
  }

  out.sds_check_http_status = res.status;
  out.sds_final_url = res.url;

  if (res.status >= 400) {
    out.sds_check_status = 'broken';
    return out;
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const isPdf = contentType.includes('pdf')
    || res.url.toLowerCase().endsWith('.pdf'); // some CDNs lie about Content-Type
  if (!isPdf) {
    try {
      const origHost = new URL(url).host;
      const finalHost = new URL(res.url).host;
      out.sds_check_status = origHost !== finalHost ? 'redirected' : 'not_pdf';
    } catch {
      out.sds_check_status = 'not_pdf';
    }
    return out;
  }

  // It's a PDF. If we have a CAS number for this item, verify content.
  const cas = item.metadata?.cas;
  if (!cas) {
    out.sds_check_status = 'reachable';
    return out;
  }

  try {
    const getRes = await fetchWithTimeout(res.url, { method: 'GET' });
    if (!getRes.ok) {
      out.sds_check_status = 'broken';
      out.sds_check_http_status = getRes.status;
      return out;
    }
    const buf = await getRes.arrayBuffer();
    if (buf.byteLength > PDF_MAX_BYTES) {
      out.sds_check_status = 'reachable'; // too large to safely parse
      return out;
    }
    const text = await extractPdfText(buf);
    out.sds_check_status = casFound(text, cas) ? 'cas_match' : 'cas_mismatch';
    return out;
  } catch (e) {
    out.sds_check_status = 'pdf_unparseable';
    out.note = e.message || String(e);
    return out;
  }
}

// ---------- run ----------------------------------------------------------

async function fetchTargets() {
  let q = supabase
    .from('items')
    .select('id, name, brand, sku, metadata')
    .in('item_type', ['chemical', 'paint']);
  if (args.id) q = q.eq('id', args.id);
  const { data, error } = await q;
  if (error) throw error;
  // Only items with an external URL and no uploaded PDF.
  let rows = (data ?? []).filter((it) => it.metadata?.sds_url && !it.metadata?.sds_path);
  if (args.limit) rows = rows.slice(0, args.limit);
  return rows;
}

const STATUS_GLYPH = {
  cas_match:        '✅', // green check
  cas_mismatch:     '⚠️', // warning
  reachable:        'ℹ️', // info
  redirected:       '↪️', // arrow
  not_pdf:          '⚠️',
  broken:           '❌', // red x
  pdf_unparseable:  '❔', // question
};

async function main() {
  const targets = await fetchTargets();
  console.log(`Checking ${targets.length} item(s) with external SDS URLs.\n`);

  const counts = {};
  let idx = 0;
  for (const item of targets) {
    idx += 1;
    const tag = `[${String(idx).padStart(3, ' ')}/${targets.length}]`;
    const name = (item.name ?? '').padEnd(48).slice(0, 48);
    process.stdout.write(`${tag}  ${name}  `);

    const result = await checkOne(item);
    if (result.skip) {
      console.log(`(skipped: ${result.skip})`);
      continue;
    }

    const glyph = STATUS_GLYPH[result.sds_check_status] ?? '?';
    const httpTag = result.sds_check_http_status ? `[${result.sds_check_http_status}]` : '';
    console.log(`${glyph} ${result.sds_check_status} ${httpTag}${result.note ? '  ' + result.note : ''}`);

    counts[result.sds_check_status] = (counts[result.sds_check_status] ?? 0) + 1;

    // Persist (don't include the diagnostic `note` field — debug-only).
    const { note, skip, ...persist } = result;
    const nextMetadata = { ...(item.metadata ?? {}), ...persist };
    const { error: upErr } = await supabase
      .from('items')
      .update({ metadata: nextMetadata })
      .eq('id', item.id);
    if (upErr) console.error(`        update failed: ${upErr.message}`);

    await sleep(REQUEST_DELAY_MS);
  }

  console.log('\n=== Summary ===');
  const order = ['cas_match', 'reachable', 'cas_mismatch', 'redirected', 'not_pdf', 'pdf_unparseable', 'broken'];
  for (const k of order) {
    if (counts[k]) console.log(`  ${STATUS_GLYPH[k]} ${k.padEnd(20)} ${counts[k]}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
