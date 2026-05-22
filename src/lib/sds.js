import { supabase } from './supabase.js';

// Safety Data Sheet (SDS) helpers.
//
// SDS state lives entirely on items.metadata so this is a zero-migration
// feature (the items.metadata jsonb already accepts anything). Keys we touch:
//
//   metadata.sds_url           — uploaded PDF (storage path) OR external URL
//   metadata.sds_path          — set when the PDF was uploaded to our bucket
//   metadata.sds_search_hint   — fallback text for a web-search button
//   metadata.sds_updated_at    — ISO timestamp of last SDS change
//   metadata.cas               — primary CAS number
//   metadata.epa_reg_no        — real EPA registration number
//   metadata.epa_status        — placeholder text when no real number exists
//   metadata.dominant_ingredient
//
// Bucket for uploads: chemical-sds (public read, authenticated write —
// see db/migrations/205_chemical_sds_bucket.sql).

const BUCKET = 'chemical-sds';

// SDS readiness for one item. Used to color the row and feed filters.
//   'uploaded'  — we have a PDF in storage (metadata.sds_path is set)
//   'linked'    — an external URL is set but no uploaded PDF
//   'hint'      — only a search-hint string (no real link yet)
//   'missing'   — nothing on file
export function sdsStatus(item) {
  const md = item?.metadata ?? {};
  if (md.sds_path) return 'uploaded';
  if (md.sds_url) return 'linked';
  if (md.sds_search_hint) return 'hint';
  return 'missing';
}

// Health of the external SDS link, as reported by the last `npm run check-sds`
// pass. Only meaningful for items with sds_status === 'linked'. Returns null
// when the item hasn't been checked yet so callers can decide whether to
// surface a "never verified" state.
//
//   'cas_match'        — PDF loaded AND contains the expected CAS number ✓
//   'reachable'        — PDF loaded but item has no CAS to cross-check
//   'cas_mismatch'     — PDF loaded but expected CAS not found in it ✗
//   'redirected'       — URL redirected to a different host (usually homepage)
//   'not_pdf'          — URL responded but the content type wasn't a PDF
//   'pdf_unparseable'  — got a PDF but couldn't read its text
//   'broken'           — HTTP error or network failure
export function sdsCheckStatus(item) {
  const md = item?.metadata ?? {};
  return md.sds_check_status ?? null;
}

// True for any check result that means "this link probably isn't a valid SDS
// for this product right now." Used to surface a "needs attention" badge on
// linked rows without spelling out the whole switch every time.
export function isSdsCheckProblem(status) {
  return status === 'broken'
      || status === 'redirected'
      || status === 'not_pdf'
      || status === 'cas_mismatch';
}

export function sdsViewUrl(item) {
  const md = item?.metadata ?? {};
  if (md.sds_path) {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(md.sds_path);
    return data?.publicUrl ?? null;
  }
  if (md.sds_url) return md.sds_url;
  if (md.sds_search_hint) {
    return `https://www.google.com/search?q=${encodeURIComponent(md.sds_search_hint + ' filetype:pdf')}`;
  }
  return null;
}

// Pull every item subject to SDS tracking — chemicals + paints, soft-deletes
// excluded. We use items_with_status so the row also carries the OUT/LOW/OK
// label for use in the SDS row UI.
export async function listSdsItems() {
  const { data, error } = await supabase
    .from('items_with_status')
    .select('id, sku, item_type, category, name, brand, qty, status, image_path, metadata')
    .in('item_type', ['chemical', 'paint']);
  if (error) throw error;
  return (data ?? []).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
}

// Upload an SDS PDF to the chemical-sds bucket and patch the item's metadata
// so the SDS tab + ItemDetail pick it up. Replaces any prior uploaded PDF.
export async function uploadSdsPdf(itemId, file, existingMetadata = {}) {
  const path = `${itemId}/sds.pdf`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type || 'application/pdf',
      upsert: true,
      cacheControl: '3600',
    });
  if (upErr) throw upErr;

  const next = { ...existingMetadata, sds_path: path, sds_updated_at: new Date().toISOString() };
  delete next.sds_url; // uploaded file takes precedence over a stale URL
  await patchItemMetadata(itemId, next);
  return path;
}

// Save an external SDS URL on the item. Auto-attempts to cache the PDF
// locally via the cache-sds Edge Function — the function downloads the
// file server-side (most manufacturer hosts block CORS so this can't
// happen from the browser) and switches sds_url → sds_path on success.
// The cache call is best-effort: if it fails, the URL still gets saved
// and the user can retry with the "Cache PDF locally" button.
export async function setSdsUrl(itemId, url, existingMetadata = {}) {
  const next = { ...existingMetadata, sds_url: url.trim(), sds_updated_at: new Date().toISOString() };
  delete next.sds_path; // external link supersedes any prior uploaded PDF
  await patchItemMetadata(itemId, next);

  // Fire-and-forget cache attempt. The function will replace sds_url with
  // sds_path on success; on failure we just keep the URL.
  cacheSdsFromUrl(itemId, url.trim()).catch(() => { /* best effort */ });
}

// Server-side cache: invoke the cache-sds Edge Function for an item with
// an external sds_url. Returns the function's response so callers can
// show success/failure messaging when invoked manually.
export async function cacheSdsFromUrl(itemId, url) {
  const { data, error } = await supabase.functions.invoke('cache-sds', {
    body: { item_id: itemId, url },
  });
  if (error) {
    // Functions client surfaces a generic error message; the response body
    // usually has the specific reason we want to show.
    const msg = error.context?.body
      ? (await tryReadBody(error.context)).error ?? error.message
      : error.message;
    throw new Error(msg ?? 'Cache failed');
  }
  return data;
}

async function tryReadBody(ctx) {
  try { return await ctx.json(); } catch { return {}; }
}

export async function clearSds(itemId, existingMetadata = {}) {
  const next = { ...existingMetadata };
  delete next.sds_path;
  delete next.sds_url;
  next.sds_updated_at = new Date().toISOString();
  await patchItemMetadata(itemId, next);
}

async function patchItemMetadata(id, metadata) {
  const { error } = await supabase
    .from('items')
    .update({ metadata })
    .eq('id', id);
  if (error) throw error;
}
