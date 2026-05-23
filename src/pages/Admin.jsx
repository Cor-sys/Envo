import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createInvite, listStaff, setStaffRole, useStaffProfile } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';
import EmptyState from '../components/EmptyState.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import Skeleton, { SkeletonCard, SkeletonList } from '../components/Skeleton.jsx';
import { formatAbsolute, formatRelative } from '../lib/format.js';

// Admin-only console. Gated at the route level by isAdmin(profile) and at
// the API level by the create-invite Edge Function checking staff_profile
// role. Both layers — the UI lock keeps non-admins from seeing it, the
// server check keeps them from spoofing it.

export default function Admin() {
  const { profile, loading: profileLoading } = useStaffProfile();
  const [invites, setInvites] = useState(null);
  const [staff, setStaff] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [roleBusy, setRoleBusy] = useState(null);     // userId currently being toggled
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [inv, st] = await Promise.all([
        supabase
          .from('invites')
          .select('id, code, note, used_by, used_at, expires_at, created_at')
          .order('created_at', { ascending: false }),
        listStaff().catch(() => []),
      ]);
      if (inv.error) throw inv.error;
      setInvites(inv.data ?? []);
      setStaff(st);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleRole(user) {
    const next = user.role === 'admin' ? 'staff' : 'admin';
    const verb = next === 'admin' ? 'promote' : 'demote';
    if (!confirm(`${verb === 'promote' ? 'Promote' : 'Demote'} ${user.username || user.full_name || 'this user'} to ${next}?`)) return;
    setError(null);
    setRoleBusy(user.id);
    // Optimistic update so the toggle feels instant.
    const prev = staff;
    setStaff((cur) => cur?.map((u) => u.id === user.id ? { ...u, role: next } : u) ?? null);
    try {
      await setStaffRole(user.id, next);
    } catch (e) {
      setStaff(prev);
      setError(e.message);
    } finally {
      setRoleBusy(null);
    }
  }

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
    return (
      <div className="p-3 space-y-3">
        <Skeleton className="h-4 w-40" />
        <SkeletonCard />
        <SkeletonList rows={3} />
      </div>
    );
  }
  if (!profile || profile.role !== 'admin') {
    return (
      <div className="p-3 space-y-3">
        <ErrorBanner message="Admin access required." />
        <Link to="/" className="text-sm text-sage-300 hover:text-sage-200 transition-colors">← Back to inventory</Link>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4">
      <p className="text-xs text-slate-500">
        Signed in as <span className="text-slate-300 font-mono">{profile.username}</span> · role <span className="text-sage-300">admin</span>
      </p>

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

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-slate-200">
          Staff <span className="text-slate-500 tabular-nums">{staff?.length ?? ''}</span>
        </h3>
        {!staff && <SkeletonList rows={2} />}
        {staff && staff.length === 0 && (
          <EmptyState
            variant="inline"
            title="No staff yet."
            description="Generate an invite above to add the first user."
          />
        )}
        <ul className="space-y-2">
          {staff?.map((u) => {
            const isSelf = u.id === profile?.id;
            const isAdmin = u.role === 'admin';
            return (
              <li key={u.id} className="surface p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-100 truncate">{u.full_name || u.username || '—'}</span>
                    <span className={isAdmin ? 'pill-ok' : 'pill-muted'}>{u.role}</span>
                    {isSelf && (
                      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">you</span>
                    )}
                  </div>
                  {u.username && u.username !== u.full_name && (
                    <div className="text-xs text-slate-500 font-mono mt-0.5">{u.username}</div>
                  )}
                </div>
                {!isSelf && (
                  <button
                    type="button"
                    onClick={() => toggleRole(u)}
                    disabled={roleBusy === u.id}
                    className="tap-sm-secondary shrink-0"
                  >
                    {roleBusy === u.id ? '…' : isAdmin ? 'Demote to staff' : 'Make admin'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-slate-200">All invites</h3>
        {!invites && <SkeletonList rows={3} />}
        {invites && invites.length === 0 && (
          <EmptyState
            variant="inline"
            title="No invites yet."
            description="Generate one above."
          />
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
                  <span className={
                    status === 'used'    ? 'pill-muted' :
                    status === 'expired' ? 'pill-out' :
                                           'pill-ok'
                  }>
                    {status}
                  </span>
                </div>
                {inv.note && <div className="text-xs text-slate-400">{inv.note}</div>}
                <div className="text-[11px] text-slate-500">
                  Created <span title={formatAbsolute(inv.created_at)}>{formatRelative(inv.created_at)}</span>
                  {inv.used_at && (
                    <> · Used <span title={formatAbsolute(inv.used_at)}>{formatRelative(inv.used_at)}</span></>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {status === 'open' && (
                    <>
                      <button type="button" onClick={() => copy(inv.code)} className="tap-sm-secondary">
                        {copied === inv.code ? 'Copied!' : 'Copy code'}
                      </button>
                      <button type="button" onClick={() => copy(shareLink(inv.code))} className="tap-sm-secondary">
                        Copy link
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(inv)}
                    className="tap-sm-ghost-danger ml-auto"
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
