import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  downloadCsv,
  getInventorySnapshot,
  getRecentActivity,
  getSpendReport,
  rangeForPreset,
  REPORT_PRESETS,
  reorderToCsv,
  summarize,
} from '../lib/reports.js';
import { getMyRecentItemIds, itemTypeLabel } from '../lib/items.js';
import { formatMoney } from '../lib/prices.js';
import { photoUrl } from '../lib/photos.js';
import { ArrowDown, ArrowUp, TrendingDown, TrendingUp } from 'lucide-react';
import StatusPill from '../components/StatusPill.jsx';
import OrderButton from '../components/OrderButton.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import Skeleton, { SkeletonCard, SkeletonList } from '../components/Skeleton.jsx';
import { formatAbsolute, formatRelative } from '../lib/format.js';

// Tiny thumbnail used by the Recently scanned strip. Falls back to the
// item's first letter when there's no photo so the strip's row heights
// stay consistent.
function RecentThumb({ item }) {
  const url = photoUrl(item.image_path);
  if (url) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        className="h-16 w-16 rounded-lg object-cover bg-slate-800 border border-slate-800 shrink-0"
      />
    );
  }
  return (
    <div className="h-16 w-16 rounded-lg bg-slate-800/70 border border-slate-800 shrink-0 flex items-center justify-center text-slate-500 text-sm font-medium">
      {(item.name ?? '?').slice(0, 1).toUpperCase()}
    </div>
  );
}

// Reports screen (BRIEF §10): point-in-time roll-up that staff/owner can
// print or Save-as-PDF straight from the browser. Print CSS (in index.css)
// already hides the header + nav; this page also wraps each section in a
// `.report-section` div so we can tune the print layout in one place.

// Quiet summary tile: same slate canvas everywhere; the VALUE carries the
// tone. Lets the page read as a clean grid of numbers instead of four
// competing colored backgrounds — color stays meaningful because it's
// reserved for actual status (red OUT / amber LOW / green OK).
function Card({ label, value, tone = 'default' }) {
  const valueCls = {
    default: 'text-slate-100',
    out:     'text-red-300',
    low:     'text-amber-300',
    ok:      'text-emerald-300',
  }[tone];
  return (
    <div className="surface p-3 print:border-slate-300">
      <div className="eyebrow print:text-slate-700">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums mt-0.5 ${valueCls} print:text-slate-900`}>{value}</div>
    </div>
  );
}

export default function Reports() {
  const [items, setItems]       = useState(null);
  const [activity, setActivity] = useState(null);
  const [recentIds, setRecentIds] = useState([]);
  const [error, setError]       = useState(null);
  const [preset, setPreset]     = useState('this-month');
  const [spend, setSpend]       = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getInventorySnapshot(),
      getRecentActivity(25),
      getMyRecentItemIds(8).catch(() => []),
    ])
      .then(([i, a, ids]) => {
        if (cancelled) return;
        setItems(i);
        setActivity(a);
        setRecentIds(ids);
      })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);

  // Spend report — re-runs whenever the preset changes. Soft-fail like
  // everything else on the page: if the cost-tracking schema isn't there
  // yet (older DB), we just hide the section.
  useEffect(() => {
    let cancelled = false;
    const { from, to } = rangeForPreset(preset);
    getSpendReport({ from, to })
      .then((r) => { if (!cancelled) setSpend(r); })
      .catch(() => { if (!cancelled) setSpend(null); });
    return () => { cancelled = true; };
  }, [preset]);

  const summary = useMemo(() => (items ? summarize(items) : null), [items]);

  // Map the recent ids onto the full item snapshot, preserving recency order.
  const recentItems = useMemo(() => {
    if (!items || recentIds.length === 0) return [];
    const byId = new Map(items.map((it) => [it.id, it]));
    return recentIds.map((id) => byId.get(id)).filter(Boolean);
  }, [items, recentIds]);

  if (error) return <div className="p-3"><ErrorBanner message={error} /></div>;
  if (!items || !activity || !summary) {
    return (
      <div className="p-3 space-y-5">
        <Skeleton className="h-6 w-32" />
        <div className="grid grid-cols-2 gap-2">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <SkeletonList rows={4} />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-5 reports-page">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            const date = new Date().toISOString().slice(0, 10);
            downloadCsv(`reorder-${date}.csv`, reorderToCsv(items));
          }}
          disabled={!items || items.every((i) => i.status === 'ok')}
          className="tap-secondary no-print"
          title="Download reorder list as CSV (one row per non-OK item)"
        >
          Reorder CSV
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="tap-secondary no-print"
        >
          Print / PDF
        </button>
      </div>

      <p className="text-xs text-slate-500 print:text-slate-700 -mt-3">
        Snapshot as of {new Date().toLocaleString()}.
      </p>

      {/* Spend / Saved / Drift tiles — driven by transaction snapshots
          captured at scan time. Picker controls the period. */}
      {spend && (
        <section className="space-y-2 report-section">
          <div className="flex items-center justify-between gap-2 no-print">
            <h3 className="text-sm font-medium text-slate-300">Spend</h3>
            <div className="chip-row no-print">
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
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="surface p-3 print:border-slate-300">
              <div className="eyebrow print:text-slate-700">Spent</div>
              <div className="text-2xl font-semibold tabular-nums mt-0.5 text-slate-100 print:text-slate-900">
                {formatMoney(spend.spent)}
              </div>
              {spend.missingPricingCount > 0 && (
                <div className="text-[11px] text-slate-500 mt-1">
                  {spend.missingPricingCount} txn{spend.missingPricingCount === 1 ? '' : 's'} without pricing
                </div>
              )}
            </div>
            <div className="surface p-3 print:border-slate-300">
              <div className="eyebrow print:text-slate-700">Saved</div>
              <div className="text-2xl font-semibold tabular-nums mt-0.5 text-emerald-300 print:text-emerald-700">
                {formatMoney(spend.saved)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">vs. highest quote</div>
            </div>
            <div className="surface p-3 print:border-slate-300">
              <div className="eyebrow print:text-slate-700">Drift</div>
              <div className={`text-2xl font-semibold tabular-nums mt-0.5 inline-flex items-center gap-1 ${
                spend.avgDrift == null
                  ? 'text-slate-500'
                  : spend.avgDrift > 0
                    ? 'text-red-300 print:text-red-700'
                    : 'text-emerald-300 print:text-emerald-700'
              }`}>
                {spend.avgDrift == null
                  ? '—'
                  : (
                    <>
                      {spend.avgDrift > 0
                        ? <TrendingUp size={18} strokeWidth={2.2} />
                        : <TrendingDown size={18} strokeWidth={2.2} />}
                      {(spend.avgDrift >= 0 ? '+' : '')}{(spend.avgDrift * 100).toFixed(1)}%
                    </>
                  )}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">avg price change vs. last buy</div>
            </div>
          </div>

          {spend.byBuilding && spend.byBuilding.length > 0 && (() => {
            const maxSpent = Math.max(...spend.byBuilding.map((b) => b.spent));
            return (
              <div className="surface p-3 space-y-2 print:border-slate-300">
                <div className="eyebrow print:text-slate-700">By building</div>
                <ul className="space-y-1.5">
                  {spend.byBuilding.map((b) => {
                    const pct = maxSpent > 0 ? (b.spent / maxSpent) * 100 : 0;
                    return (
                      <li key={b.id} className="space-y-0.5">
                        <div className="flex items-baseline justify-between text-xs">
                          <span className="text-slate-300 truncate">{b.label}</span>
                          <span className="tabular-nums text-slate-100">{formatMoney(b.spent)}</span>
                        </div>
                        <div className="h-1 rounded bg-slate-800 overflow-hidden">
                          <div className="h-full bg-sage-500" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()}

          {spend.byCategory.length > 0 && (() => {
            const maxSpent = Math.max(...spend.byCategory.map((c) => c.spent));
            return (
              <div className="surface p-3 space-y-2 print:border-slate-300">
                <div className="eyebrow print:text-slate-700">By category</div>
                <ul className="space-y-1.5">
                  {spend.byCategory.map((c) => {
                    const pct = maxSpent > 0 ? (c.spent / maxSpent) * 100 : 0;
                    return (
                      <li key={c.category} className="space-y-0.5">
                        <div className="flex items-baseline justify-between text-xs">
                          <span className="text-slate-300 truncate">{c.category}</span>
                          <span className="tabular-nums text-slate-100">{formatMoney(c.spent)}</span>
                        </div>
                        <div className="h-1 rounded bg-slate-800 overflow-hidden">
                          <div className="h-full bg-sage-500" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()}

          {spend.topVendors.length > 0 && (
            <div className="surface p-3 space-y-2 print:border-slate-300">
              <div className="eyebrow print:text-slate-700">Top vendors</div>
              <ul className="divide-y divide-slate-800">
                {spend.topVendors.map((v) => (
                  <li key={v.vendor} className="flex items-baseline justify-between gap-2 py-1.5 text-sm">
                    <span className="text-slate-100 truncate">{v.vendor}</span>
                    <span className="text-slate-500 text-xs tabular-nums shrink-0">
                      {v.count} order{v.count === 1 ? '' : 's'} ·{' '}
                      <span className="text-slate-200">{formatMoney(v.spent)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[10.5px] text-slate-500 print:text-slate-700">
            Spend reflects entered unit prices. Tax and shipping are not tracked.
          </p>
        </section>
      )}

      {recentItems.length > 0 && (
        <section className="space-y-2 no-print">
          <h3 className="text-sm font-medium text-slate-300">Recently scanned</h3>
          <div className="flex gap-2 overflow-x-auto -mx-3 px-3 pb-1">
            {recentItems.map((it) => (
              <Link
                key={it.id}
                to={`/items/${it.id}`}
                className="shrink-0 w-24 surface-interactive p-2 flex flex-col items-center gap-1.5"
              >
                <RecentThumb item={it} />
                <div className="text-[11px] text-slate-200 line-clamp-2 text-center leading-tight w-full">
                  {it.name}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-300 tabular-nums">{it.qty}</span>
                  <StatusPill status={it.status} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2 report-section">
        <h3 className="text-sm font-medium text-slate-300 print:text-slate-900">Summary</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Card label="Items"     value={summary.total} />
          <Card label="Out"       value={summary.out} tone="out" />
          <Card label="Low"       value={summary.low} tone="low" />
          <Card label="OK"        value={summary.ok}  tone="ok"  />
        </div>
      </section>

      {/* Inventory: one section that combines the old "Reorder list" and
          "Full inventory by type" views. Rows that need reorder get an
          Order button inline; everything else is the same dense table
          grouped by type. One section instead of two = less scrolling,
          and the Order action sits in context with the item it refers to. */}
      <section className="space-y-2 report-section">
        <h3 className="text-sm font-medium text-slate-300 print:text-slate-900">
          Inventory
          {summary.out + summary.low > 0 && (
            <span className="text-slate-500 print:text-slate-700 ml-1.5">
              ({summary.out + summary.low} need reorder)
            </span>
          )}
        </h3>
        {summary.byType.map((group) => {
          const groupItems = items.filter((i) => i.item_type === group.type);
          return (
            <div key={group.type} className="space-y-1">
              <div className="text-xs uppercase tracking-wide text-slate-500 print:text-slate-700 mt-3">
                {itemTypeLabel(group.type)} — {group.count} items, {group.qty} on hand
                {group.out > 0 && <span className="text-red-300 ml-2 normal-case tracking-normal">{group.out} out</span>}
                {group.low > 0 && <span className="text-amber-300 ml-2 normal-case tracking-normal">{group.low} low</span>}
              </div>
              <div className="-mx-3 px-3 overflow-x-auto print:overflow-visible">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-800 print:divide-slate-300">
                    {groupItems.map((it) => {
                      const needsReorder = it.status === 'out' || it.status === 'low';
                      const suggestedQty = Math.max((it.threshold ?? 0) - (it.qty ?? 0), 1);
                      return (
                        <tr key={it.id}>
                          <td className="py-1 pr-2 text-slate-100 print:text-slate-900">
                            <div className="truncate max-w-[10rem]">{it.name}</div>
                            <div className="text-[11px] text-slate-500 print:text-slate-700 font-mono">
                              {it.sku}{it.brand ? ` · ${it.brand}` : ''}
                            </div>
                          </td>
                          <td className="py-1 pr-2 text-slate-300 print:text-slate-700 text-xs whitespace-nowrap">
                            {it.location_text ?? ''}
                          </td>
                          <td className="py-1 pr-2 text-right tabular-nums">{it.qty}</td>
                          <td className="py-1 pr-2"><StatusPill status={it.status} /></td>
                          <td className="py-1 pl-2 no-print">
                            {needsReorder && (
                              <OrderButton item={it} variant="compact">
                                Order {suggestedQty}
                              </OrderButton>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </section>

      <section className="space-y-2 report-section">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium text-slate-300 print:text-slate-900">
            Recent activity <span className="text-slate-500 print:text-slate-700">(last {activity.length})</span>
          </h3>
          <Link
            to="/activity"
            className="text-xs text-sage-300 hover:text-sage-200 transition-colors no-print"
          >
            View all →
          </Link>
        </div>
        {activity.length === 0 ? (
          <p className="text-sm text-slate-500 print:text-slate-700">No movements yet.</p>
        ) : (
          <ul className="surface print:border-slate-300 divide-y divide-slate-800 print:divide-slate-300">
            {activity.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-semibold tabular-nums shrink-0 print:bg-transparent ${
                  t.direction === 'in'
                    ? 'bg-emerald-500/15 text-emerald-300 print:text-emerald-700'
                    : 'bg-red-500/15 text-red-300 print:text-red-700'
                }`}>
                  {t.direction === 'in'
                    ? <ArrowUp size={12} strokeWidth={2.6} />
                    : <ArrowDown size={12} strokeWidth={2.6} />}
                  {t.qty}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-slate-100 print:text-slate-900">
                    {t.items?.name ?? '(item removed)'}
                  </div>
                  <div className="text-[11px] text-slate-500 print:text-slate-700 truncate">
                    {t.items?.sku} · {t.staff_label ?? 'unknown'}
                    {t.building && <> · <span className="text-sage-300 print:text-sage-700">{t.building.number}. {t.building.name}</span></>}
                    {t.note ? ` · ${t.note}` : ''}
                  </div>
                </div>
                <span
                  className="text-xs text-slate-500 print:text-slate-700 shrink-0"
                  title={formatAbsolute(t.occurred_at)}
                >
                  {formatRelative(t.occurred_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
