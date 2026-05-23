import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronLeft } from 'lucide-react';
import { getActivity, rangeForPreset, REPORT_PRESETS } from '../lib/reports.js';
import { formatAbsolute, formatRelative } from '../lib/format.js';
import EmptyState from '../components/EmptyState.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import { SkeletonList } from '../components/Skeleton.jsx';

// Full activity history with search + date-range filter. Linked from
// Reports' Recent activity header so staff can drill into the full log
// when the 25-row recent feed isn't enough.

export default function Activity() {
  const [preset, setPreset] = useState('last-30-days');
  const [search, setSearch] = useState('');
  const [rows, setRows]     = useState(null);
  const [error, setError]   = useState(null);

  // Refetch whenever the preset changes; search filters client-side.
  useEffect(() => {
    let cancelled = false;
    setRows(null);
    const { from, to } = rangeForPreset(preset);
    getActivity({ from, to, limit: 500 })
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [preset]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((t) =>
      (t.items?.name ?? '').toLowerCase().includes(s) ||
      (t.items?.sku ?? '').toLowerCase().includes(s) ||
      (t.staff_label ?? '').toLowerCase().includes(s) ||
      (t.note ?? '').toLowerCase().includes(s) ||
      (t.vendor_snapshot ?? '').toLowerCase().includes(s),
    );
  }, [rows, search]);

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <Link to="/reports" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors">
          <ChevronLeft size={16} strokeWidth={2} />
          Back to reports
        </Link>
        {rows && (
          <span className="text-xs text-slate-500 tabular-nums">
            {filtered?.length ?? 0} of {rows.length}
          </span>
        )}
      </div>

      <input
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 placeholder-slate-500"
        placeholder="Search name / SKU / staff / note"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="chip-row">
        {REPORT_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPreset(p.key)}
            className={preset === p.key ? 'chip-active' : 'chip-inactive'}
          >
            {p.label}
          </button>
        ))}
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {!rows && !error && <SkeletonList rows={6} />}

      {filtered && filtered.length === 0 && (
        <EmptyState
          title="No movements in this window."
          description="Widen the date range or clear the search."
        />
      )}

      {filtered && filtered.length > 0 && (
        <ul className="surface divide-y divide-slate-800">
          {filtered.map((t) => {
            const row = (
              <li className="px-3 py-2.5 text-sm flex items-center gap-3">
                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-semibold tabular-nums shrink-0 ${
                  t.direction === 'in'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-red-500/15 text-red-300'
                }`}>
                  {t.direction === 'in'
                    ? <ArrowUp size={12} strokeWidth={2.6} />
                    : <ArrowDown size={12} strokeWidth={2.6} />}
                  {t.qty}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-slate-100">
                    {t.items?.name ?? '(item removed)'}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {t.items?.sku} · {t.staff_label ?? 'unknown'}
                    {t.building && <> · <span className="text-sage-300">{t.building.number}. {t.building.name}</span></>}
                    {t.note ? ` · ${t.note}` : ''}
                  </div>
                </div>
                <span
                  className="text-xs text-slate-500 shrink-0"
                  title={formatAbsolute(t.occurred_at)}
                >
                  {formatRelative(t.occurred_at)}
                </span>
              </li>
            );
            return t.items
              ? <Link key={t.id} to={`/items/${t.item_id}`} className="block hover:bg-slate-800/40 active:bg-slate-700/40 transition-colors">{row}</Link>
              : <div key={t.id}>{row}</div>;
          })}
        </ul>
      )}
    </div>
  );
}
