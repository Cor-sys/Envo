import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createInvite, useStaffProfile } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

// Admin-only console. Gated at the route level by isAdmin(profile) and at
// the API level by the create-invite Edge Function checking staff_profile
// role. Both layers — the UI lock keeps non-admins from seeing it, the
// server check keeps them from spoofing it.

export default function Admin() {
  const { profile, loading: profileLoading } = useStaffProfile();
  const [invites, setInvites] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data, error } = await supabase
        .from('invites')
        .select('id, code, note, used_by, used_at, expires_at, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setInvites(data ?? []);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      await createInvite({ note: note.trim() || null });
      setNote('');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function copy(code) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError('Couldn’t copy to clipboard — long-press to copy manually.');
    }
  }

  // Delete an invite row. Used invites can be deleted too — that's an
  // audit-trail cleanup, not a revocation (the account they created still
  // exists). Open invites being deleted IS a revocation: the code stops
  // working immediately. Both cases hit the same RLS-gated DELETE.
  async function remove(inv) {
    const used = Boolean(inv.used_at);
    const msg = used
      ? `Delete this used invite record? The account it created will NOT be affected.`
      : `Revoke this invite? The code "${inv.code}" will stop working immediately.`;
    if (!confirm(msg)) return;
    setError(null);
    const prev = invites;
    setInvites((cur) => cur?.filter((i) => i.id !== inv.id) ?? null);
    try {
      const { error } = await supabase.from('invites').delete().eq('id', inv.id);
      if (error) throw error;
    } catch (e) {
      setInvites(prev);
      setError(e.message);
    }
  }

  function shareLink(code) {
    const url = `${window.location.origin}/invite/${encodeURIComponent(code)}`;
    return url;
  }

  if (profileLoading) {
    return <div className="p-3 text-slate-400">Loading…</div>;
  }
  if (!profile || profile.role !== 'admin') {
    return (
      <div className="p-3 space-y-2">
        <p className="text-red-700">Admin access required.</p>
        <Link to="/" className="text-honey-600">← Back to inventory</Link>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Admin</h2>
        <p className="text-xs text-slate-500 mt-1">
          Signed in as <span className="text-slate-300 font-mono">{profile.username}</span> · role <span className="text-honey-600">admin</span>
        </p>
      </div>

      <section className="surface p-3 space-y-3">
        <h3 className="text-sm font-medium text-slate-200">Generate an invite</h3>
        <div className="flex gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note (e.g. 'For Ryder')"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={busy}
            onClick={generate}
            className="tap-primary"
          >
            {busy ? '…' : 'New invite'}
          </button>
        </div>
        <p className="text-[11px] text-slate-500">
          Single-use code. Share it out-of-band (text / paper). The invitee will use it to pick a username + password.
        </p>
      </section>

      {error && <p className="text-red-700 text-sm">{error}</p>}

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-slate-200">All invites</h3>
        {!invites && <p className="text-slate-400">Loading…</p>}
        {invites && invites.length === 0 && (
          <p className="text-slate-500 text-sm">No invites yet. Generate one above.</p>
        )}
        <ul className="space-y-2">
          {invites?.map((inv) => {
            const used = Boolean(inv.used_at);
            const expired = inv.expires_at && new Date(inv.expires_at) < new Date();
            const status = used ? 'used' : expired ? 'expired' : 'open';
            return (
              <li key={inv.id} className="surface p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono text-base tracking-wider text-slate-100">{inv.code}</div>
                  <span className={`pill ${
                    status === 'used'    ? 'bg-slate-500/20 text-slate-300' :
                    status === 'expired' ? 'bg-red-500/15 text-red-700' :
                                           'bg-emerald-500/15 text-emerald-700'
                  }`}>
                    {status}
                  </span>
                </div>
                {inv.note && <div className="text-xs text-slate-400">{inv.note}</div>}
                <div className="text-[11px] text-slate-500">
                  Created {new Date(inv.created_at).toLocaleString()}
                  {inv.used_at && <> · Used {new Date(inv.used_at).toLocaleString()}</>}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {status === 'open' && (
                    <>
                      <button type="button" onClick={() => copy(inv.code)} className="tap-secondary text-xs px-2 py-1 min-h-0 min-w-0">
                        {copied === inv.code ? 'Copied!' : 'Copy code'}
                      </button>
                      <button type="button" onClick={() => copy(shareLink(inv.code))} className="tap-secondary text-xs px-2 py-1 min-h-0 min-w-0">
                        Copy link
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(inv)}
                    className="ml-auto text-xs px-2 py-1 text-red-700 hover:text-red-800 hover:bg-red-500/10 rounded transition-colors"
                  >
                    {status === 'open' ? 'Revoke' : 'Delete'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
