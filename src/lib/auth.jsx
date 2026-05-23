import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';

export function useSession() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

// Look up the current user's staff_profile (role, username, full_name).
// Re-fires when the session changes so an admin who signs out and back in as
// a different account sees the right role chips immediately.
export function useStaffProfile() {
  const { session, loading: sessionLoading } = useSession();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!session?.user?.id) {
      setProfile(null);
      setLoading(sessionLoading);
      return;
    }
    setLoading(true);
    supabase
      .from('staff_profiles')
      .select('id, role, username, full_name, is_active')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // Surface for debugging but don't crash the app — a missing profile
          // just means role checks return false everywhere, which is the
          // safe default for an account in an unexpected state.
          console.warn('staff_profile lookup failed:', error.message);
          setProfile(null);
        } else {
          setProfile(data ?? null);
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [session?.user?.id, sessionLoading]);

  return { profile, loading };
}

export function isAdmin(profile) {
  return profile?.role === 'admin';
}

// Sign in with either a username or an email. If the input has no '@', we
// resolve it to the user's real email via the get_email_for_username RPC and
// then pass that to supabase's password sign-in. This keeps emails out of
// the UI for staff accounts created via invite while still working for the
// admin's pre-existing real-email account.
export async function signInWithUsername(input, password) {
  const cleaned = String(input ?? '').trim();
  if (!cleaned || !password) throw new Error('Username and password are required.');

  let email = cleaned;
  if (!cleaned.includes('@')) {
    const { data, error } = await supabase.rpc('get_email_for_username', {
      p_username: cleaned,
    });
    if (error) throw error;
    if (!data) throw new Error('No account with that username.');
    email = data;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Server-validated invite redemption. Calls the redeem-invite Edge Function,
// then signs the new user in with the synthetic email it returns.
export async function redeemInvite({ code, username, password }) {
  const { data, error } = await supabase.functions.invoke('redeem-invite', {
    body: { code, username, password },
  });
  if (error) {
    // supabase.functions.invoke surfaces non-2xx as a FunctionsHttpError;
    // unwrap it to surface the server's error message rather than a generic
    // "non-2xx" string.
    const detail = await unpackError(error);
    throw new Error(detail);
  }
  if (!data?.ok) throw new Error(data?.error || 'Failed to redeem invite.');

  // Sign in immediately with the synthetic email the server told us about.
  const signed = await supabase.auth.signInWithPassword({
    email: data.email,
    password,
  });
  if (signed.error) throw signed.error;
  return { ...data, session: signed.data.session };
}

export async function createInvite({ note = null, expires_at = null } = {}) {
  const { data, error } = await supabase.functions.invoke('create-invite', {
    body: { note, expires_at },
  });
  if (error) throw new Error(await unpackError(error));
  if (!data?.ok) throw new Error(data?.error || 'Failed to create invite.');
  return data.invite;
}

// List every staff_profile row. Open to all authenticated under current
// RLS but the UI gates display to admins only.
export async function listStaff() {
  const { data, error } = await supabase
    .from('staff_profiles')
    .select('id, username, full_name, role, is_active, created_at')
    .order('role', { ascending: true })  // admins first
    .order('username', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Promote / demote via the security-definer RPC from migration 209.
// The RPC double-checks the caller is admin and refuses self-demotion.
export async function setStaffRole(userId, role) {
  const { data, error } = await supabase.rpc('set_staff_role', {
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw error;
  return data;
}

async function unpackError(err) {
  // supabase-js >=2 wraps Edge errors with a `.context.response` we can
  // unpack to recover the JSON body the function returned.
  try {
    const ctx = err?.context;
    if (ctx?.response && typeof ctx.response.json === 'function') {
      const body = await ctx.response.json();
      if (body?.error) return body.error;
    }
  } catch { /* fall through */ }
  return err?.message || String(err);
}
