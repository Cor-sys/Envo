import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  isSdsCheckProblem,
  listSdsItems,
  sdsCheckStatus,
  sdsStatus,
  sdsViewUrl,
  uploadSdsPdf,
} from '../lib/sds.js';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import SdsStatusBadge from '../components/SdsStatusBadge.jsx';
import PullToRefresh from '../components/PullToRefresh.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';

// Filter chips were dropped once every chemical/paint item had a verified
// SDS PDF on file — the SDS resolution pass covered the inventory 100%, so
// "missing / hint / linked / bad links" categories all hit zero matches.
// Search is the only meaningful narrowing now. If a new item is added
// without an SDS later, the per-row CheckBadge still surfaces problems.

// Inline indicator for the result of the most recent `npm run check-sds`.
// Sits next to the SDS status badge on linked rows. Quiet on success
// (small green check), loud on failure (amber/red triangle + short label).
function CheckBadge({ status }) {
  if (!status || status === 'reachable') return null;
  if (status === 'cas_match') {
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-wider text-emerald-400">
        <CheckCircle2 size={11} strokeWidth={2.4} />
        verified
      </span>
    );
  }
  const label = {
    cas_mismatch:    'wrong CAS',
    redirected:      'redirected',
    not_pdf:         'not a PDF',
    broken:          'broken',
    pdf_unparseable: 'unreadable',
  }[status] ?? status;
  return (
    <span className="inline-flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-wider text-amber-300">
      <AlertTriangle size={11} strokeWidth={2.4} />
      {label}
    </span>
  );
}

// Compliance manifest screen (OSHA HazCom 1910.1200).
//
// Lists every chemical + paint in the inventory with its SDS readiness.
// Tap a row to upload a PDF, paste a URL, or open the existing SDS.
// Group headers + alphabetical sort within each group mirror Inventory so
// staff can scan the same way across screens.
export default function Sds() {
  const [items, setItems]       = useState(null);
  const [search, setSearch]     = useState('');
  const [editing, setEditing]   = useState(null);   // item being edited
  const [error, setError]       = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await listSdsItems();
      setItems(data);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decorated = useMemo(() => {
    if (!items) return null;
    return items.map((it) => ({
      ...it,
      _sds:   sdsStatus(it),
      _check: sdsCheckStatus(it),
    }));
  }, [items]);

  const counts = useMemo(() => {
    if (!decorated) return null;
    const c = { all: decorated.length, missing: 0, hint: 0, linked: 0, uploaded: 0, problem: 0 };
    for (const it of decorated) {
      c[it._sds] = (c[it._sds] ?? 0) + 1;
      if (it._sds === 'linked' && isSdsCheckProblem(it._check)) c.problem += 1;
    }
    return c;
  }, [decorated]);

  const filtered = useMemo(() => {
    if (!decorated) return null;
    const s = search.trim().toLowerCase();
    if (!s) return decorated;
    return decorated.filter((it) =>
      (it.name ?? '').toLowerCase().includes(s) ||
      (it.brand ?? '').toLowerCase().includes(s) ||
      (it.metadata?.cas ?? '').toLowerCase().includes(s),
    );
  }, [decorated, search]);

  const grouped = useMemo(() => {
    if (!filtered) return null;
    const by = new Map();
    for (const it of filtered) {
      const k = it.category || 'Uncategorized';
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(it);
    }
    return [...by.entries()]
      .map(([category, arr]) => ({ category, items: arr }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [filtered]);

  return (
    <PullToRefresh onRefresh={load}>
      <div className="space-y-3 p-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">SDS manifest</h2>
          {counts && (
            <span className="text-xs text-slate-400">
              {counts.uploaded + counts.linked}/{counts.all} on file
            </span>
          )}
        </div>

        <input
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 placeholder-slate-500"
          placeholder="Search name / brand / CAS"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <ErrorBanner message={error} onDismiss={() => setError(null)} />
        {!decorated && !error && <p className="text-slate-400">Loading…</p>}

        {grouped && grouped.length === 0 && (
          <EmptyState
            title="Nothing matches."
            description="Clear the search to see every item."
          />
        )}

        {grouped && grouped.map((group) => (
          <section key={group.category} className="space-y-2">
            <div
              style={{ top: 'var(--header-h)' }}
              className="sticky z-10 -mx-3 px-3 py-1.5 bg-slate-950/85 backdrop-blur border-b border-slate-800/60"
            >
              <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-200">
                {group.category} <span className="text-slate-500 tabular-nums">{group.items.length}</span>
              </h3>
            </div>
            <ul className="space-y-2">
              {group.items.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => setEditing(it)}
                    className="block w-full text-left surface-interactive p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-100 truncate">{it.name}</div>
                        <div className="text-xs text-slate-400 truncate mt-0.5">
                          {it.brand ?? '—'}
                          {it.metadata?.cas && <> · CAS {it.metadata.cas}</>}
                          {it.metadata?.epa_reg_no && <> · EPA {it.metadata.epa_reg_no}</>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <SdsStatusBadge status={it._sds} />
                        {it._sds === 'linked' && <CheckBadge status={it._check} />}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {editing && (
        <SdsEditor
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}
    </PullToRefresh>
  );
}

// Bottom sheet for managing a single item's SDS. Now that every item has
// a verified PDF on file, the editor only exposes the two actions staff
// actually need:
//   - Open PDF   — view the cached SDS in a new tab
//   - Update PDF — replace it with a fresh copy from the manufacturer
// Removed: paste-URL flow (no items left without a PDF), explicit "Save
// locally" cache trigger (auto-cache runs on every upload), and the
// destructive "Remove SDS" link (rare action; do it from the item edit
// page if truly needed).
function SdsEditor({ item, onClose, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const status = sdsStatus(item);
  const viewUrl = sdsViewUrl(item);

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadSdsPdf(item.id, file, item.metadata ?? {});
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
      onClick={onClose}
    >
      <div
        className="surface w-full max-w-md p-4 space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-slate-500">SDS</div>
            <h3 className="text-lg font-semibold text-slate-100 truncate">{item.name}</h3>
            <div className="text-xs text-slate-400 truncate">
              {item.brand ?? '—'} · {item.category}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-100 p-1.5 -m-1.5 rounded-md hover:bg-slate-800/40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm">
            <SdsStatusBadge status={status} size="lg" />
            {item.metadata?.sds_updated_at && (
              <span className="text-xs text-slate-500">
                updated {new Date(item.metadata.sds_updated_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* Open PDF is the daily-use action — primary clay. Update PDF
            is rare (only when the manufacturer ships a revised sheet)
            so it sits underneath as secondary slate. */}
        {viewUrl ? (
          <a
            href={viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="tap-primary w-full"
          >
            Open PDF
          </a>
        ) : (
          <p className="text-xs text-slate-500 italic">
            No PDF on file yet — upload one below.
          </p>
        )}

        <label className="tap-secondary w-full cursor-pointer">
          {busy ? 'Working…' : (viewUrl ? 'Update PDF' : 'Upload PDF')}
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            disabled={busy}
            onChange={onFile}
          />
        </label>

        <div className="border-t border-slate-800 pt-3 text-xs text-slate-400">
          See full item page: <Link to={`/items/${item.id}`} className="text-sage-300 hover:text-sage-200 transition-colors">{item.sku}</Link>
        </div>

        <ErrorBanner message={error} onDismiss={() => setError(null)} />
      </div>
    </div>
  );
}
