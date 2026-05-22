import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listSdsItems,
  sdsStatus,
  sdsViewUrl,
  uploadSdsPdf,
  setSdsUrl,
  clearSds,
} from '../lib/sds.js';
import { X } from 'lucide-react';
import SdsStatusBadge from '../components/SdsStatusBadge.jsx';
import PullToRefresh from '../components/PullToRefresh.jsx';

const FILTERS = [
  { value: 'all',      label: 'All' },
  { value: 'missing',  label: 'Missing SDS' },
  { value: 'hint',     label: 'Needs verification' },
  { value: 'linked',   label: 'Linked' },
  { value: 'uploaded', label: 'On file' },
];

// Compliance manifest screen (OSHA HazCom 1910.1200).
//
// Lists every chemical + paint in the inventory with its SDS readiness.
// Tap a row to upload a PDF, paste a URL, or open the existing SDS.
// Group headers + alphabetical sort within each group mirror Inventory so
// staff can scan the same way across screens.
export default function Sds() {
  const [items, setItems]       = useState(null);
  const [filter, setFilter]     = useState('all');
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
    return items.map((it) => ({ ...it, _sds: sdsStatus(it) }));
  }, [items]);

  const counts = useMemo(() => {
    if (!decorated) return null;
    const c = { all: decorated.length, missing: 0, hint: 0, linked: 0, uploaded: 0 };
    for (const it of decorated) c[it._sds] = (c[it._sds] ?? 0) + 1;
    return c;
  }, [decorated]);

  const filtered = useMemo(() => {
    if (!decorated) return null;
    let list = decorated;
    if (filter !== 'all') list = list.filter((it) => it._sds === filter);
    const s = search.trim().toLowerCase();
    if (s) {
      list = list.filter((it) =>
        (it.name ?? '').toLowerCase().includes(s) ||
        (it.brand ?? '').toLowerCase().includes(s) ||
        (it.metadata?.cas ?? '').toLowerCase().includes(s),
      );
    }
    return list;
  }, [decorated, filter, search]);

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

        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3">
          {FILTERS.map((f) => {
            const active = filter === f.value;
            const count = counts?.[f.value];
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs transition-colors ${
                  active
                    ? 'bg-honey-600 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15)]'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {f.label}
                {typeof count === 'number' && (
                  <span className={`ml-1.5 tabular-nums ${active ? 'opacity-90' : 'opacity-60'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {!decorated && !error && <p className="text-slate-400">Loading…</p>}

        {grouped && grouped.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-slate-400">
            <p className="font-medium text-slate-200">Nothing here.</p>
            <p className="text-sm mt-1">Adjust the filter or clear the search.</p>
          </div>
        )}

        {grouped && grouped.map((group) => (
          <section key={group.category} className="space-y-2">
            <div className="sticky top-0 z-10 -mx-3 px-3 py-1.5 bg-slate-950/85 backdrop-blur border-b border-slate-800/60">
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
                      <SdsStatusBadge status={it._sds} />
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

// Bottom sheet for managing a single item's SDS. Three actions:
//   - Upload a PDF (or replace the existing one)
//   - Paste a manufacturer URL
//   - Clear what's on file
function SdsEditor({ item, onClose, onSaved }) {
  const [url, setUrl] = useState(item.metadata?.sds_url ?? '');
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

  async function saveUrl() {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await setSdsUrl(item.id, url, item.metadata ?? {});
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    if (!confirm('Remove the SDS from this item?')) return;
    setBusy(true);
    setError(null);
    try {
      await clearSds(item.id, item.metadata ?? {});
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
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

        <div className="flex items-center gap-2 text-sm">
          <SdsStatusBadge status={status} size="lg" />
          {item.metadata?.sds_updated_at && (
            <span className="text-xs text-slate-500">
              updated {new Date(item.metadata.sds_updated_at).toLocaleDateString()}
            </span>
          )}
        </div>

        {viewUrl && (
          <a
            href={viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="tap-secondary w-full"
          >
            {status === 'uploaded' ? 'Open uploaded PDF' :
             status === 'linked'   ? 'Open external SDS' :
                                     'Search for SDS (Google)'}
          </a>
        )}

        <div className="border-t border-slate-800 pt-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Upload PDF</div>
          <label className="tap-primary w-full cursor-pointer">
            {busy ? 'Working…' : 'Choose PDF'}
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={busy}
              onChange={onFile}
            />
          </label>
        </div>

        <div className="border-t border-slate-800 pt-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Or paste manufacturer URL</div>
          <div className="flex gap-2">
            <input
              type="url"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button
              type="button"
              disabled={busy || !url.trim()}
              onClick={saveUrl}
              className="tap-secondary"
            >
              Save
            </button>
          </div>
        </div>

        {(status === 'uploaded' || status === 'linked') && (
          <div className="border-t border-slate-800 pt-3">
            <button
              type="button"
              disabled={busy}
              onClick={onClear}
              className="text-xs text-red-300 hover:text-red-200"
            >
              Remove SDS from this item
            </button>
          </div>
        )}

        <div className="border-t border-slate-800 pt-3 text-xs text-slate-400">
          See full item page: <Link to={`/items/${item.id}`} className="text-honey-400 hover:text-honey-300">{item.sku}</Link>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>
    </div>
  );
}
