// Edge Function: redeem-invite
//
// Public endpoint (no JWT required — the invitee doesn't have an account yet).
// Body: { code, username, password }
//
// Validates the invite code, ensures the username is available, creates an
// auth user with a synthetic `${username}@stockroom.local` email so the
// invitee never sees an email address, inserts their staff_profile, and
// marks the invite consumed.
//
// On success the client follows up with supabase.auth.signInWithPassword
// using the synthetic email to obtain a session.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

// Usernames are restricted to a friendly character set so the synthetic email
// (`${username}@stockroom.local`) is always a valid address part.
const USERNAME_RE = /^[a-zA-Z0-9._-]{2,40}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")   return json({ error: "Method not allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const code     = String(body?.code     ?? "").trim();
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");

  if (!code || !username || !password) {
    return json({ error: "code, username, and password are required" }, 400);
  }
  if (!USERNAME_RE.test(username)) {
    return json({ error: "Username must be 2–40 characters: letters, numbers, dot, dash, underscore." }, 400);
  }
  if (password.length < 8) {
    return json({ error: "Password must be at least 8 characters." }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Look up + validate the invite.
  const { data: invite, error: lookupErr } = await admin
    .from("invites")
    .select("id, code, used_at, expires_at")
    .eq("code", code)
    .maybeSingle();
  if (lookupErr) return json({ error: lookupErr.message }, 500);
  if (!invite)   return json({ error: "Invite code not found." }, 404);
  if (invite.used_at) return json({ error: "This invite has already been used." }, 410);
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return json({ error: "This invite has expired." }, 410);
  }

  // 2. Username availability check (lowercase comparison matches the
  //    unique index on staff_profiles).
  const { data: existingProfile, error: profileLookupErr } = await admin
    .from("staff_profiles")
    .select("id")
    .ilike("username", username)
    .maybeSingle();
  if (profileLookupErr) return json({ error: profileLookupErr.message }, 500);
  if (existingProfile)  return json({ error: "That username is already taken." }, 409);

  // 3. Create the auth user with a synthetic email. email_confirm:true skips
  //    the email-confirmation flow since the address isn't real.
  const syntheticEmail = `${username.toLowerCase()}@stockroom.local`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    password,
    email_confirm: true,
    user_metadata: { username, full_name: username },
  });
  if (createErr || !created?.user) {
    return json({ error: createErr?.message ?? "Failed to create user." }, 500);
  }
  const userId = created.user.id;

  // 4. Insert the staff_profile. If this fails, roll back the auth user so
  //    we don't end up with an orphan account.
  const { error: insertErr } = await admin.from("staff_profiles").insert({
    id: userId,
    username,
    full_name: username,
    role: "staff",
    is_active: true,
  });
  if (insertErr) {
    await admin.auth.admin.deleteUser(userId);
    return json({ error: insertErr.message }, 500);
  }

  // 5. Mark the invite consumed. Best-effort — if this fails the account
  //    still works; the admin will see the invite as "used by Xxx" once we
  //    next reconcile (or they can revoke it manually).
  const { error: useErr } = await admin
    .from("invites")
    .update({ used_by: userId, used_at: new Date().toISOString() })
    .eq("id", invite.id);
  if (useErr) console.error("redeem-invite: failed to mark invite used", useErr);

  return json({ ok: true, username, email: syntheticEmail });
});
