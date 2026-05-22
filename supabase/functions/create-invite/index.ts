// Edge Function: create-invite
//
// Authenticated endpoint. The caller's JWT is verified by the Supabase
// platform (verify_jwt=true) and we additionally check that the caller's
// staff_profile.role is 'admin' before minting a code. Non-admins get 403.
//
// Body (all optional): { note?: string, expires_at?: ISO timestamp }
// Returns { ok: true, invite: { id, code, note, expires_at, created_at } }
//
// The code uses a 30-char Crockford-style alphabet (no 0/O, 1/I/L) so it's
// easy to read aloud or text. Format: XXXX-XXXX-XX.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;

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

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function newCode(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 10)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")   return json({ error: "Method not allowed" }, 405);

  // Identify caller via JWT (already verified by the Supabase platform).
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Not authenticated." }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: "Not authenticated." }, 401);

  // Service-role client to read role + write invites past RLS in one place.
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile, error: profErr } = await admin
    .from("staff_profiles")
    .select("role")
    .eq("id", userRes.user.id)
    .maybeSingle();
  if (profErr) return json({ error: profErr.message }, 500);
  if (!profile || profile.role !== "admin") {
    return json({ error: "Admin only." }, 403);
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const note = body?.note ? String(body.note).slice(0, 200) : null;
  const expiresAt = body?.expires_at ? new Date(body.expires_at).toISOString() : null;

  // Retry up to 3 times on the unique-code collision (probability is tiny
  // but the loop costs nothing).
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newCode();
    const { data, error } = await admin
      .from("invites")
      .insert({
        code,
        created_by: userRes.user.id,
        note,
        expires_at: expiresAt,
      })
      .select("id, code, note, expires_at, created_at")
      .single();
    if (!error) return json({ ok: true, invite: data });
    if (error.code === "23505") continue; // unique violation — try a fresh code
    return json({ error: error.message }, 500);
  }
  return json({ error: "Failed to generate a unique code, please retry." }, 503);
});
