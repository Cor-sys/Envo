import { useEffect, useMemo, useState } from 'react';
import {
  deriveReorderList,
  getInventorySnapshot,
  getRecentActivity,
  summarize,
} from '../lib/reports.js';
import { itemTypeLabel } from '../lib/items.js';
import StatusPill from '../components/StatusPill.jsx';
import OrderButton from '../components/OrderButton.jsx';

// Reports screen (BRIEF §10): point-in-time roll-up that staff/owner can
// print or Save-as-PDF straight from the browser. Print CSS (in index.css)
// already hides the header + nav; this page also wraps each section in a
// `.report-section` div so we can tune the print layout in one place.

function Card({ label, value, tone = 'default' }) {
  const toneCls = {
    default: 'bg-slate-900 border-slate-800 text-slate-100',
    out:     'bg-red-500/10 border-red-500/30 text-red-300',
    low:     'bg-amber-500/10 border-amber-500/30 text-amber-200',
    ok:      'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
  }[tone];
  return (
    <div className={`rounded-2xl border p-3 ${toneCls}`}>
      <div className="text-[11px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export default function Reports() {
  const [items, setItems]       = useState(null);
  const [activity, setActivity] = useState(null);
  const [error, setError]       = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getInventorySnapshot(),
      getRecentActivity(25),
    ])
      .then(([i, a]) => {
        if (cancelled) return;
        setItems(i);
        setActivity(a);
      })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);

  const summary = useMemo(() => (items ? summarize(items) : null), [items]);
  const reorder = useMemo(() => (items ? deriveReorderList(items) : null), [items]);

  if (error) return <div className="p-3 text-red-300">{error}</div>;
  if (!items || !activity || !summary || !reorder) {
    return <div className="p-3 text-slate-400">Loading…</div>;
  }

  return (
    <div className="p-3 space-y-5 reports-page">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-100">Reports</h2>
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

      <section className="space-y-2 report-section">
        <h3 className="text-sm font-medium text-slate-300 print:text-slate-900">Summary</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Card label="Items"     value={summary.total} />
          <Card label="Out"       value={summary.out} tone="out" />
          <Card label="Low"       value={summary.low} tone="low" />
          <Card label="OK"        value={summary.ok}  tone="ok"  />
        </div>
      </section>

      <section className="space-y-2 report-section">
        <h3 className="text-sm font-medium text-slate-300 print:text-slate-900">By type</h3>
        <div className="surface print:border-slate-300 divide-y divide-slate-800 print:divide-slate-300">
          {summary.byType.map((row) => (
            <div key={row.type} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="text-slate-200 print:text-slate-900 min-w-0 truncate">
                {itemTypeLabel(row.type)}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-0.5 text-xs shrink-0">
                <span className="text-slate-400 print:text-slate-700 tabular-nums whitespace-nowrap">{row.count} items</span>
                <span className="text-slate-500 print:text-slate-700 tabular-nums whitespace-nowrap">{row.qty} on hand</span>
                {row.out > 0 && <span className="text-red-300 tabular-nums whitespace-nowrap">{row.out} out</span>}
                {row.low > 0 && <span className="text-amber-300 tabular-nums whitespace-nowrap">{row.low} low</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2 report-section">
        <h3 className="text-sm font-medium text-slate-300 print:text-slate-900">
          Reorder list <span className="text-slate-500 print:text-slate-700">({reorder.length})</span>
        </h3>
        {reorder.length === 0 ? (
          <p className="text-sm text-slate-500 print:text-slate-700">
            Nothing to reorder — every item is above its threshold.
          </p>
        ) : (
          <>
            {/* Mobile (< md): stacked cards. The Order button is the primary
                action so it sits full-width at the bottom of each card —
                no horizontal scroll, always reachable with one thumb. The
                same data the desktop table exposes is laid out as a 3-up
                stat row above the button. Hidden when printing; the
                desktop table prints instead. */}
            <ul className="space-y-2 md:hidden print:hidden">
              {reorder.map((r) => (
                <li key={r.id} className="surface p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-100 truncate">{r.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
                        {r.sku} · {itemTypeLabel(r.item_type)}
                      </div>
                    </div>
                    <StatusPill status={r.status} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="eyebrow">On hand</div>
                      <div className="text-base font-semibold tabular-nums text-slate-100 mt-0.5">{r.qty}</div>
                    </div>
                    <div>
                      <div className="eyebrow">Threshold</div>
                      <div className="text-base tabular-nums text-slate-400 mt-0.5">{r.threshold}</div>
                    </div>
                    <div>
                      <div className="eyebrow">Order qty</div>
                      <div className="text-base font-semibold tabular-nums text-honey-300 mt-0.5">{r.suggested_qty}</div>
                    </div>
                  </div>
                  <OrderButton item={r} variant="primary" className="w-full">
                    Order {r.suggested_qty}
                  </OrderButton>
                </li>
              ))}
            </ul>

            {/* Tablet/desktop (≥ md) and print: dense table. The negative
                margin + overflow-x-auto is kept as a defensive guard but
                at ≥768px the table fits naturally. */}
            <div className="hidden md:block print:block -mx-3 px-3 overflow-x-auto print:overflow-visible">
              <table className="w-full text-sm print:min-w-0">
                <thead className="text-[11px] uppercase tracking-wide text-slate-500 print:text-slate-700">
                  <tr className="text-left">
                    <th className="py-1 pr-2 font-medium">Item</th>
                    <th className="py-1 pr-2 font-medium">Type</th>
                    <th className="py-1 pr-2 font-medium text-right">On hand</th>
                    <th className="py-1 pr-2 font-medium text-right">Threshold</th>
                    <th className="py-1 pr-2 font-medium text-right">Order qty</th>
                    <th className="py-1 pr-2 font-medium">Status</th>
                    <th className="py-1 font-medium no-print"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 print:divide-slate-300">
                  {reorder.map((r) => (
                    <tr key={r.id}>
                      <td className="py-1 pr-2 text-slate-100 print:text-slate-900">
                        <div className="truncate max-w-[12rem]">{r.name}</div>
                        <div className="text-[11px] text-slate-500 print:text-slate-700 font-mono">{r.sku}</div>
                      </td>
                      <td className="py-1 pr-2 text-slate-400 print:text-slate-700 whitespace-nowrap">{itemTypeLabel(r.item_type)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{r.qty}</td>
                      <td className="py-1 pr-2 text-right tabular-nums text-slate-400 print:text-slate-700">{r.threshold}</td>
                      <td className="py-1 pr-2 text-right tabular-nums font-medium">{r.suggested_qty}</td>
                      <td className="py-1 pr-2"><StatusPill status={r.status} /></td>
                      <td className="py-1 pl-2 no-print">
                        <OrderButton
                          item={r}
                          variant="secondary"
                          className="text-xs px-2 py-1 min-h-0 min-w-0"
                        >
                          Order
                        </OrderButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="space-y-2 report-section">
        <h3 className="text-sm font-medium text-slate-300 print:text-slate-900">Full inventory by type</h3>
        {summary.byType.map((group) => {
          const groupItems = items.filter((i) => i.item_type === group.type);
          return (
            <div key={group.type} className="space-y-1">
              <div className="text-xs uppercase tracking-wide text-slate-500 print:text-slate-700 mt-3">
                {itemTypeLabel(group.type)} — {group.count} items, {group.qty} on hand
              </div>
              <div className="-mx-3 px-3 overflow-x-auto print:overflow-visible">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-800 print:divide-slate-300">
                    {groupItems.map((it) => (
                      <tr key={it.id}>
                        <td className="py-1 pr-2 text-slate-100 print:text-slate-900">
                          <div className="truncate max-w-[14rem]">{it.name}</div>
                          <div className="text-[11px] text-slate-500 print:text-slate-700 font-mono">
                            {it.sku}{it.brand ? ` · ${it.brand}` : ''}
                          </div>
                        </td>
                        <td className="py-1 pr-2 text-slate-400 print:text-slate-700 text-xs whitespace-nowrap">
                          {it.location_text ?? ''}
                        </td>
                        <td className="py-1 pr-2 text-right tabular-nums">{it.qty}</td>
                        <td className="py-1"><StatusPill status={it.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </section>

      <section className="space-y-2 report-section">
        <h3 className="text-sm font-medium text-slate-300 print:text-slate-900">
          Recent activity <span className="text-slate-500 print:text-slate-700">(last {activity.length})</span>
        </h3>
        {activity.length === 0 ? (
          <p className="text-sm text-slate-500 print:text-slate-700">No movements yet.</p>
        ) : (
          <ul className="surface print:border-slate-300 divide-y divide-slate-800 print:divide-slate-300">
            {activity.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate text-slate-100 print:text-slate-900">
                    {t.items?.name ?? '(item removed)'}
                  </div>
                  <div className="text-[11px] text-slate-500 print:text-slate-700">
                    {t.items?.sku} · {t.staff_label ?? '—'}
                    {t.note ? ` · ${t.note}` : ''}
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className={`tabular-nums font-medium ${
                    t.direction === 'in' ? 'text-emerald-400 print:text-emerald-400'
                                         : 'text-red-300 print:text-red-300'
                  }`}>
                    {t.direction === 'in' ? '+' : '−'}{t.qty}
                  </div>
                  <div className="text-slate-500 print:text-slate-700">
                    {new Date(t.occurred_at).toLocaleString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
