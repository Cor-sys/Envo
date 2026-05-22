#!/usr/bin/env node
/* eslint-disable no-console */

// One-off: for every chemical/paint item that has metadata.sds_url but no
// metadata.sds_path (= linked to an external URL, not yet cached locally),
// download the PDF and upload it to the chemical-sds storage bucket, then
// patch the item's metadata to point at the local copy.
//
// This is the same work the `cache-sds` Edge Function does for new URLs —
// the script is for backfilling the 13 items that got their sds_url from
// the import migration before the auto-cache existed.
//
// Usage:
//   npm run cache-sds-existing                  # cache everything pending
//   npm run cache-sds-existing -- --limit=5     # cap to N (smoke test)
//   npm run cache-sds-existing -- --id=<uuid>   # one item
//
// Requires .env.local with:
//   VITE_SUPABASE_URL              (or SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY      (NOT the anon key — bypasses RLS to
//                                   upload to chemical-sds + update items)

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BUCKET = 'chemical-sds';
const FETCH_TIMEOUT_MS = 25_000;
const MAX_PDF_BYTES = 15_000_000;
const REQUEST_DELAY_MS = 400;

// ---------- env load (same loader as check-sds.mjs) ----------------------

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
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  console.error('Find the service role key on the Supabase dashboard → Settings → API → service_role.');
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

// ---------- supabase + http helpers --------------------------------------

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; stockroom-sds-cacher/1.0)',
        ...(opts.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(id);
  }
}

// ---------- the work -----------------------------------------------------

async function cacheOne(item) {
  const url = item.metadata?.sds_url;
  if (!url) return { skip: 'no sds_url' };
  if (item.metadata?.sds_path) return { skip: 'already cached' };

  let res;
  try {
    res = await fetchWithTimeout(url, { method: 'GET', redirect: 'follow' });
  } catch (e) {
    return { error: `fetch failed: ${e.message ?? String(e)}` };
  }
  if (!res.ok) return { error: `upstream HTTP ${res.status}` };

  const ct = (res.headers.get('content-type') ?? '').toLowerCase();
  const looksLikePdf = ct.includes('pdf') || res.url.toLowerCase().endsWith('.pdf');
  if (!looksLikePdf) return { error: `not a PDF (${ct || 'no content-type'})` };

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_PDF_BYTES) return { error: `pdf too large (${buf.byteLength} bytes)` };

  const storagePath = `${item.id}/sds.pdf`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buf, {
      contentType: 'application/pdf',
      upsert: true,
      cacheControl: '3600',
    });
  if (upErr) return { error: `upload failed: ${upErr.message}` };

  // Match the cache-sds Edge Function exactly: drop sds_url, add sds_path
  // + sds_cached_at + sds_cached_from for provenance.
  const nowIso = new Date().toISOString();
  const nextMetadata = {
    ...(item.metadata ?? {}),
    sds_path: storagePath,
    sds_cached_at: nowIso,
    sds_cached_from: res.url,
    sds_updated_at: nowIso,
  };
  delete nextMetadata.sds_url;

  const { error: updErr } = await supabase
    .from('items')
    .update({ metadata: nextMetadata })
    .eq('id', item.id);
  if (updErr) return { error: `metadata update failed: ${updErr.message}` };

  return { ok: true, bytes: buf.byteLength, final_url: res.url };
}

async function fetchTargets() {
  let q = supabase
    .from('items')
    .select('id, name, metadata')
    .in('item_type', ['chemical', 'paint']);
  if (args.id) q = q.eq('id', args.id);
  const { data, error } = await q;
  if (error) throw error;
  let rows = (data ?? []).filter((it) => it.metadata?.sds_url && !it.metadata?.sds_path);
  if (args.limit) rows = rows.slice(0, args.limit);
  return rows;
}

async function main() {
  const targets = await fetchTargets();
  console.log(`Caching ${targets.length} item(s) with external SDS URLs.\n`);

  let cached = 0, errored = 0;
  let idx = 0;
  for (const item of targets) {
    idx += 1;
    const tag = `[${String(idx).padStart(2, ' ')}/${targets.length}]`;
    const name = (item.name ?? '').padEnd(48).slice(0, 48);
    process.stdout.write(`${tag}  ${name}  `);

    const result = await cacheOne(item);
    if (result.skip) {
      console.log(`(skipped: ${result.skip})`);
    } else if (result.error) {
      errored += 1;
      console.log(`❌ ${result.error}`);
    } else {
      cached += 1;
      console.log(`✅ ${result.bytes} bytes`);
    }
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  }

  console.log(`\n=== Done ===`);
  console.log(`  cached:   ${cached}`);
  console.log(`  errored:  ${errored}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
