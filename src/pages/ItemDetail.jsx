import { Fragment, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getItem,
  itemTypeLabel,
  recentTransactions,
  recordMovement,
} from '../lib/items.js';
import StatusPill from '../components/StatusPill.jsx';

function humanizeKey(k) {
  return k.replaceAll('_', ' ');
}

export default function ItemDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [item, setItem] = useState(null);
  const [txns, setTxns] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function reload() {
    setError(null);
    try {
      const [it, t] = await Promise.all([getItem(id), recentTransactions(id, 10)]);
      setItem(it);
      setTxns(t);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    setLoaded(false);
    reload();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function adjust(direction, qty) {
    setBusy(true);
    setError(null);
    try {
      await recordMovement({ itemId: id, direction, qty });
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!item && error) return <div className="p-3 text-red-700">{error}</div>;
  if (!item && loaded) return <div className="p-3 text-slate-500">Item not found.</div>;
  if (!item) return <div className="p-3 text-slate-500">Loading…</div>;

  const md = item.metadata ?? {};
  const subParts = [];
  if (item.brand) subParts.push(item.brand);
  if (md.watts) subParts.push(`${md.watts}W`);
  subParts.push(item.sku);

  return (
    <div className="p-3 space-y-4">
      <button onClick={() => nav(-1)} className="text-sm text-slate-500">← Back</button>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{item.name}</h2>
          <StatusPill status={item.status} />
        </div>
        <div className="text-xs text-slate-400">{itemTypeLabel(item.item_type)}</div>
        <div className="text-sm text-slate-600">{subParts.join(' · ')}</div>
        {item.needs_label && (
          <div className="text-xs text-amber-700">
            no factory barcode — needs printed QR label
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase text-slate-500">On hand</div>
            <div className="text-3xl font-semibold tabular-nums">{item.qty}</div>
            <div className="text-xs text-slate-500">threshold {item.threshold}</div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              disabled={busy}
              onClick={() => adjust('in', 1)}
              className="tap-primary"
            >
              +1 in
            </button>
            <button
              disabled={busy || item.qty < 1}
              onClick={() => adjust('out', 1)}
              className="tap-danger"
            >
              −1 out
            </button>
          </div>
        </div>
        {error && <p className="mt-3 text-red-700 text-sm">{error}</p>}
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-slate-700">Details</h3>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-slate-500">Type</dt><dd>{itemTypeLabel(item.item_type)}</dd>
          {item.category && (
            <><dt className="text-slate-500">Category</dt><dd>{item.category}</dd></>
          )}
          {item.model && (
            <><dt className="text-slate-500">Model</dt><dd>{item.model}</dd></>
          )}
          {item.barcode && (
            <>
              <dt className="text-slate-500">Barcode</dt>
              <dd className="font-mono text-xs">{item.barcode}</dd>
            </>
          )}
          {item.location_text && (
            <><dt className="text-slate-500">Location</dt><dd>{item.location_text}</dd></>
          )}
          {Object.entries(md).map(([k, val]) => (
            <Fragment key={k}>
              <dt className="text-slate-500 capitalize">{humanizeKey(k)}</dt>
              <dd>{String(val)}</dd>
            </Fragment>
          ))}
        </dl>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-slate-700">Recent activity</h3>
        {txns.length === 0 ? (
          <p className="text-sm text-slate-500">No movements yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {txns.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <span className={t.direction === 'in' ? 'text-emerald-700' : 'text-red-700'}>
                    {t.direction === 'in' ? '+' : '−'}{t.qty}
                  </span>
                  <span className="ml-2 text-slate-500">{t.staff_label || '—'}</span>
                </div>
                <div className="text-xs text-slate-500">
                  {new Date(t.occurred_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
