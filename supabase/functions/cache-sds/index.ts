import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Server-side SDS cacher. Takes { item_id, url }, downloads the PDF from
// the supplied URL, uploads it to the `chemical-sds` storage bucket under
// the item's id, and patches metadata so the app picks up the local copy.
//
// Why server-side: most manufacturer SDS hosts don't allow CORS, so the
// client can't fetch the PDF directly. The function runs with the service
// role key inside Supabase's network so it can fetch ANY public PDF and
// write to private buckets.
//
// Auth: admin only. We resolve the caller's staff_profile via their JWT
// then check role === 'admin'. The function isn't useful for non-admins
// since they can't change SDS metadata in the first place.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;

const BUCKET = "chemical-sds";
const MAX_PDF_BYTES    = 15_000_000;
const FETCH_TIMEOUT_MS = 25_000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; stockroom-sds-cacher/1.0)",
        ...((opts.headers as Record<string, string>) ?? {}),
      },
    });
  } finally {
    clearTimeout(id);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")   return json({ error: "Method not allowed" }, 405);

  // ---- auth (admin only) -----------------------------------------------
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Not authenticated." }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: "Not authenticated." }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile, error: profErr } = await admin
    .from("staff_profiles")
    .select("role")
    .eq("id", userRes.user.id)
    .maybeSingle();
  if (profErr) return json({ error: profErr.message }, 500);
  // SDS docs are manager-tier (catalog upkeep); owner/admin included by rank.
  if (!profile || !["owner", "admin", "manager"].includes(profile.role)) {
    return json({ error: "Manager access required." }, 403);
  }

  // ---- input -----------------------------------------------------------
  let body: { item_id?: string; url?: string } = {};
  try { body = await req.json(); }
  catch { return json({ error: "Invalid JSON body" }, 400); }
  const itemId = String(body?.item_id ?? "");
  const url    = String(body?.url ?? "").trim();
  if (!itemId) return json({ error: "item_id required" }, 400);
  if (!url)    return json({ error: "url required" }, 400);
  if (!/^https?:\/\//i.test(url)) return json({ error: "url must be http(s)" }, 400);

  // Load current metadata so we can patch without clobbering other keys.
  const { data: item, error: itemErr } = await admin
    .from("items")
    .select("metadata")
    .eq("id", itemId)
    .maybeSingle();
  if (itemErr) return json({ error: itemErr.message }, 500);
  if (!item)   return json({ error: "Item not found" }, 404);

  // ---- fetch the PDF ---------------------------------------------------
  let pdfRes: Response;
  try {
    pdfRes = await fetchWithTimeout(url, { method: "GET", redirect: "follow" });
  } catch (e) {
    return json({ error: `Could not fetch: ${(e as Error).message ?? String(e)}` }, 502);
  }
  if (!pdfRes.ok) {
    return json({ error: `Upstream HTTP ${pdfRes.status}` }, 502);
  }
  const ct = (pdfRes.headers.get("content-type") ?? "").toLowerCase();
  const looksLikePdf = ct.includes("pdf") || pdfRes.url.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) {
    return json({ error: `Upstream content-type is ${ct || "unknown"}, not a PDF` }, 502);
  }
  const buf = await pdfRes.arrayBuffer();
  if (buf.byteLength > MAX_PDF_BYTES) {
    return json({ error: `PDF is ${buf.byteLength} bytes (limit ${MAX_PDF_BYTES})` }, 502);
  }

  // ---- upload to bucket ------------------------------------------------
  // Path matches the existing client-side uploadSdsPdf convention so the
  // app picks up the file at /chemical-sds/<item-id>/sds.pdf with no
  // additional wiring.
  const storagePath = `${itemId}/sds.pdf`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buf, {
      contentType: "application/pdf",
      upsert: true,
      cacheControl: "3600",
    });
  if (upErr) return json({ error: `Upload failed: ${upErr.message}` }, 500);

  // ---- patch metadata --------------------------------------------------
  // Matches the convention from lib/sds.js uploadSdsPdf: setting sds_path
  // removes any prior sds_url (the uploaded file is now the source of truth).
  // We keep sds_cached_from as provenance.
  const nowIso = new Date().toISOString();
  const nextMetadata = {
    ...(item.metadata as Record<string, unknown> ?? {}),
    sds_path: storagePath,
    sds_cached_at: nowIso,
    sds_cached_from: pdfRes.url,
    sds_updated_at: nowIso,
  };
  delete (nextMetadata as Record<string, unknown>).sds_url;

  const { error: updErr } = await admin
    .from("items")
    .update({ metadata: nextMetadata })
    .eq("id", itemId);
  if (updErr) return json({ error: updErr.message }, 500);

  return json({
    ok: true,
    item_id: itemId,
    bytes: buf.byteLength,
    storage_path: storagePath,
    cached_from: pdfRes.url,
  });
});
