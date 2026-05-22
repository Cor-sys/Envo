import { Fragment, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  getItem,
  itemTypeLabel,
  recentTransactions,
  recordMovement,
} from '../lib/items.js';
import { photoUrl } from '../lib/photos.js';
import { success as hapticSuccess, error as hapticError, tap as hapticTap } from '../lib/haptics.js';
import StatusPill from '../components/StatusPill.jsx';
import OrderButton from '../components/OrderButton.jsx';

function humanizeKey(k) {
  return k.replaceAll('_', ' ');
}

// purchase_url is a UX field surfaced on its own row, not in the generic
// "details" dl, so it doesn't show up twice.
const HIDDEN_META_KEYS = new Set(['purchase_url']);

const QTY_PRESETS = [1, 5, 10, 25];

export default function ItemDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [item, setItem] = useState(null);
  const [txns, setTxns] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [adjustQty, setAdjustQty] = useState(1);
  const [flash, setFlash] = useState(null);

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

  async function adjust(direction) {
    if (!item || busy) return;
    const qty = Math.max(1, Math.floor(Number(adjustQty) || 1));
    if (direction === 'out' && item.qty < qty) {
      setError(`Only ${item.qty} on hand — can't pull ${qty}.`);
      hapticError();
      return;
    }
    setBusy(true);
    setError(null);
    hapticTap();
    const prev = item;
    const delta = direction === 'in' ? qty : -qty;
    setItem({
      ...item,
      qty: item.qty + delta,
      status: item.qty + delta <= 0 ? 'out'
            : item.qty + delta <= item.threshold ? 'low'
            : 'ok',
    });
    try {
      const result = await recordMovement({ itemId: id, direction, qty });
      const queued = result?.queued === true;
      hapticSuccess();
      setFlash({ direction, qty, queued });
      setTimeout(() => setFlash(null), 1500);
      if (!queued) await reload();
    } catch (e) {
      setItem(prev);
      setError(e.message);
      hapticError();
    } finally {
      setBusy(false);
    }
  }

  if (!item && error) return <div className="p-3 text-red-400">{error}</div>;
  if (!item && loaded) return <div className="p-3 text-slate-400">Item not found.</div>;
  if (!item) return <div className="p-3 text-slate-400">Loading…</div>;

  const md = item.metadata ?? {};
  const subParts = [];
  if (item.brand) subParts.push(item.brand);
  if (md.watts) subParts.push(`${md.watts}W`);
  subParts.push(item.sku);

  const outQty = Math.max(1, Math.floor(Number(adjustQty) || 1));
  const outDisabled = busy || item.qty < outQty;
  const needsReorder = item.status === 'out' || item.status === 'low';
  const heroUrl = photoUrl(item.image_path);

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => nav(-1)} className="text-sm text-slate-400 hover:text-slate-200 transition-colors">
          ← Back
        </button>
        <Link
          to={`/items/${id}/edit`}
          className="text-sm text-orange-400 hover:text-orange-300 transition-colors"
        >
          Edit
        </Link>
      </div>

      {heroUrl && (
        <img
          src={heroUrl}
          alt={item.name}
          className="w-full h-48 object-cover rounded-2xl border border-slate-800 bg-slate-900"
        />
      )}

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-100">{item.name}</h2>
          <StatusPill status={item.status} />
        </div>
        <div className="text-xs text-slate-500 uppercase tracking-wide">
          {itemTypeLabel(item.item_type)}
        </div>
        <div className="text-sm text-slate-400">{subParts.join(' · ')}</div>
        {item.needs_label && (
          <div className="text-xs text-amber-300">
            no factory barcode — needs printed QR label
          </div>
        )}
      </div>

      {needsReorder && (
        <div className="rounded-2xl border border-orange-500/30 bg-orange-500/5 p-3 flex items-center justify-between gap-3">
          <div className="text-sm">
            <div className="font-medium text-orange-200">
              {item.status === 'out' ? 'Out of stock' : 'Low stock'}
            </div>
            <div className="text-xs text-orange-200/70">
              {md.purchase_url ? 'Tap to reorder from supplier.' : 'Tap to search the web.'}
            </div>
          </div>
          <OrderButton item={item} variant="primary" />
        </div>
      )}

      <div className="surface p-4 space-y-4 relative">
        {flash && (
          <div className={`absolute -top-3 inset-x-3 rounded-lg text-white text-xs font-medium px-3 py-1.5 text-center shadow-lg ${
            flash.queued ? 'bg-amber-500/95' : 'bg-emerald-500/95'
          }`}>
            ✓ {flash.direction === 'in' ? '+' : '−'}{flash.qty}
            {flash.queued ? ' queued (offline) — will sync' : ' saved'}
          </div>
        )}

        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs uppercase text-slate-500 tracking-wide">On hand</div>
            <div className="text-5xl font-semibold tabular-nums text-slate-100 leading-none">
              {item.qty}
            </div>
            <div className="text-xs text-slate-500 mt-1">threshold {item.threshold}</div>
          </div>
        </div>

        <div className="space-y-2 pt-1 border-t border-slate-800">
          <div className="text-xs uppercase text-slate-500 tracking-wide pt-2">Adjust by</div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {QTY_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setAdjustQty(n)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-sm tabular-nums transition-colors ${
                    Number(adjustQty) === n
                      ? 'bg-orange-600 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18)]'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <input
              type="number"
              min="1"
              value={adjustQty}
              onChange={(e) => setAdjustQty(e.target.value)}
              className="w-20 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm tabular-nums"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={outDisabled}
              onClick={() => adjust('out')}
              className="tap-danger"
            >
              −{outQty} out
            </button>
            <button
              disabled={busy}
              onClick={() => adjust('in')}
              className="tap-primary"
            >
              +{outQty} in
            </button>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-slate-300">Details</h3>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm text-slate-200">
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
              <dd className="font-mono text-xs text-slate-300">{item.barcode}</dd>
            </>
          )}
          {item.location_text && (
            <><dt className="text-slate-500">Location</dt><dd>{item.location_text}</dd></>
          )}
          {md.purchase_url && (
            <>
              <dt className="text-slate-500">Reorder</dt>
              <dd className="truncate">
                <a
                  href={md.purchase_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-400 hover:text-orange-300 underline-offset-2 hover:underline truncate inline-block max-w-full align-bottom"
                >
                  {md.purchase_url}
                </a>
              </dd>
            </>
          )}
          {Object.entries(md)
            .filter(([k]) => !HIDDEN_META_KEYS.has(k))
            .map(([k, val]) => (
              <Fragment key={k}>
                <dt className="text-slate-500 capitalize">{humanizeKey(k)}</dt>
                <dd>{String(val)}</dd>
              </Fragment>
            ))}
        </dl>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-slate-300">Recent activity</h3>
        {txns.length === 0 ? (
          <p className="text-sm text-slate-500">No movements yet.</p>
        ) : (
          <ul className="surface divide-y divide-slate-800">
            {txns.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <span className={t.direction === 'in' ? 'text-emerald-400' : 'text-red-400'}>
                    {t.direction === 'in' ? '+' : '−'}{t.qty}
                  </span>
                  <span className="ml-2 text-slate-400">{t.staff_label || '—'}</span>
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
