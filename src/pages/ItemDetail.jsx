import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDown, ArrowUp, Check, ChevronLeft, Pencil,
  Box, Database, ShoppingCart, Shield, Tag, Zap,
} from 'lucide-react';
import { formatAbsolute, formatRelative } from '../lib/format.js';
import {
  getItem,
  itemTypeLabel,
  recentTransactions,
  recordMovement,
} from '../lib/items.js';
import { listBuildingsForItem } from '../lib/buildings.js';
import { photoUrl } from '../lib/photos.js';
import { success as hapticSuccess, error as hapticError, tap as hapticTap } from '../lib/haptics.js';
import StatusPill from '../components/StatusPill.jsx';
import OrderButton from '../components/OrderButton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';

function humanizeKey(k) {
  return k.replaceAll('_', ' ');
}

// Spec-sheet grouping. Each section pulls a fixed set of keys out of
// `item` + `item.metadata` so the page reads like a product datasheet
// instead of a flat alphabetical dump.
//
// Keys not in any section drop into "Other" — nothing silently vanishes,
// but the grouped sections take precedence visually.
//
// Backend-managed metadata (sds_*, audit columns) is hidden from the
// user-facing spec sheet entirely — staff get a dedicated SDS tab and
// activity feed for that data.
const HIDDEN_META_KEYS = new Set([
  'purchase_url',          // own row inside the Reorder section
  'sds_path', 'sds_url', 'sds_cached_at', 'sds_cached_from',
  'sds_check_at', 'sds_check_http_status', 'sds_check_status',
  'sds_final_url', 'sds_updated_at', 'sds_check_pdf_bytes',
]);

const SPEC_SECTIONS = [
  { key: 'identity',   label: 'Identity',   Icon: Tag,
    fields: ['type', 'category', 'model', 'model_code', 'barcode', 'location'] },
  { key: 'physical',   label: 'Physical',   Icon: Box,
    fields: ['size', 'color_notes', 'base_fixture', 'lamp_type', 'beam_angle'] },
  { key: 'electrical', label: 'Electrical', Icon: Zap,
    fields: ['watts', 'voltage', 'lumens', 'lifespan_hours', 'cri', 'color_temp_k'] },
  { key: 'compliance', label: 'Compliance', Icon: Shield,
    fields: ['cas', 'epa_reg_no', 'hazard_class'] },
  { key: 'reorder',    label: 'Reorder',    Icon: ShoppingCart,
    fields: ['purchase_url'] },
  { key: 'sourcing',   label: 'Sourcing',   Icon: Database,
    fields: ['import_source', 'spec_source', 'completion_note', 'qty_per_box', 'ansi_code'] },
];

// Friendlier labels for fields whose underscored key reads as jargon.
const FIELD_LABEL = {
  type:           'Type',
  category:       'Category',
  model:          'Model',
  model_code:     'Model code',
  barcode:        'Barcode',
  location:       'Location',
  cas:            'CAS number',
  epa_reg_no:     'EPA reg. #',
  cri:            'CRI',
  color_temp_k:   'Color temperature',
  lifespan_hours: 'Lifespan',
  base_fixture:   'Base / fixture',
  lamp_type:      'Lamp type',
  color_notes:    'Color / notes',
  beam_angle:     'Beam angle',
  hazard_class:   'Hazard class',
  ansi_code:      'ANSI code',
  qty_per_box:    'Qty per box',
  import_source:  'Imported from',
  spec_source:    'Spec source',
  completion_note:'Notes',
  purchase_url:   'Vendor URL',
};

// Append units to known numeric-ish keys at render time so the catalog
// doesn't need to store "1800 lm" — just "1800".
function formatSpecValue(key, raw) {
  const v = String(raw);
  if (key === 'lifespan_hours') return `${v} h`;
  if (key === 'color_temp_k')   return `${v} K`;
  if (key === 'lumens')         return `${v} lm`;
  return v;
}

// Pull the value for a single field. Top-level columns (type, category,
// model, barcode, location) live on `item`; everything else lives on
// `item.metadata`. `type` → itemTypeLabel for the human name.
function getSpecValue(item, key) {
  if (key === 'type')     return itemTypeLabel(item.item_type);
  if (key === 'category') return item.category;
  if (key === 'model')    return item.model;
  if (key === 'barcode')  return item.barcode;
  if (key === 'location') return item.location_text;
  return item.metadata?.[key];
}

const QTY_PRESETS = [1, 5, 10, 25];

export default function ItemDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [item, setItem] = useState(null);
  const [txns, setTxns] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [adjustQty, setAdjustQty] = useState(1);
  const [flash, setFlash] = useState(null);

  async function reload() {
    setError(null);
    try {
      const [it, t, b] = await Promise.all([
        getItem(id),
        recentTransactions(id, 10),
        // Soft-fail the buildings join: a missing buildings table or RLS
        // hiccup shouldn't break the rest of the item detail page.
        listBuildingsForItem(id).catch(() => []),
      ]);
      setItem(it);
      setTxns(t);
      setBuildings(b);
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

  if (!item && error) return <div className="p-3 text-red-300">{error}</div>;
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
        <button onClick={() => nav(-1)} className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors">
          <ChevronLeft size={16} strokeWidth={2} />
          Back
        </button>
        <Link
          to={`/items/${id}/edit`}
          className="inline-flex items-center gap-1 text-sm text-honey-500 hover:text-honey-400 transition-colors"
        >
          <Pencil size={14} strokeWidth={2} />
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
        <div className="rounded-2xl border border-honey-500/30 bg-honey-500/5 p-3 flex items-center justify-between gap-3">
          <div className="text-sm">
            <div className="font-medium text-honey-300">
              {item.status === 'out' ? 'Out of stock' : 'Low stock'}
            </div>
            <div className="text-xs text-honey-300/70">
              {md.purchase_url ? 'Tap to reorder from supplier.' : 'Tap to search the web.'}
            </div>
          </div>
          <OrderButton item={item} variant="primary" />
        </div>
      )}

      <div className="surface p-4 space-y-4 relative">
        {flash && (
          <div className={`absolute -top-3 inset-x-3 rounded-lg text-white text-xs font-medium px-3 py-1.5 text-center shadow-md flex items-center justify-center gap-1.5 ${
            flash.queued ? 'bg-amber-600' : 'bg-emerald-600'
          }`}>
            <Check size={12} strokeWidth={3} />
            {flash.direction === 'in' ? '+' : '−'}{flash.qty}
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

        <div className="space-y-2 pt-3 border-t border-slate-800">
          <div className="eyebrow">Adjust by</div>
          <div className="flex items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {QTY_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setAdjustQty(n)}
                  className={Number(adjustQty) === n ? 'chip-active' : 'chip-inactive'}
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
              className="w-16 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm tabular-nums text-center"
              aria-label="Adjustment quantity"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
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

        <ErrorBanner message={error} onDismiss={() => setError(null)} />
      </div>

      {(() => {
        // Build the grouped spec sheet. For each section, collect the
        // fields whose values are non-empty; render the section only
        // if at least one field made it through.
        const claimedKeys = new Set();
        SPEC_SECTIONS.forEach((s) => s.fields.forEach((k) => claimedKeys.add(k)));
        const otherEntries = Object.entries(md).filter(
          ([k, v]) => !HIDDEN_META_KEYS.has(k) && !claimedKeys.has(k) && v != null && v !== ''
        );
        return (
          <section className="space-y-3">
            {SPEC_SECTIONS.map((section) => {
              const rows = section.fields
                .map((k) => [k, getSpecValue(item, k)])
                .filter(([, v]) => v != null && v !== '');
              if (rows.length === 0) return null;
              return (
                <div key={section.key} className="surface p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sage-300">
                    <section.Icon size={14} strokeWidth={2.2} />
                    <h3 className="eyebrow text-sage-300">{section.label}</h3>
                  </div>
                  <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm text-slate-200">
                    {rows.map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-slate-500">
                          {FIELD_LABEL[k] ?? humanizeKey(k)}
                        </dt>
                        <dd className={k === 'barcode' ? 'font-mono text-xs text-slate-300' : ''}>
                          {k === 'purchase_url' ? (
                            <a
                              href={v}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-honey-400 hover:text-honey-300 underline-offset-2 hover:underline transition-colors truncate inline-block max-w-full align-bottom"
                            >
                              {v}
                            </a>
                          ) : formatSpecValue(k, v)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}

            {otherEntries.length > 0 && (
              <div className="surface p-3 space-y-2">
                <h3 className="eyebrow">Other</h3>
                <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm text-slate-200">
                  {otherEntries.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-slate-500 capitalize">{humanizeKey(k)}</dt>
                      <dd>{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </section>
        );
      })()}

      {buildings.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-slate-300">
            Used in {buildings.length} building{buildings.length === 1 ? '' : 's'}
          </h3>
          <ul className="surface divide-y divide-slate-800">
            {buildings.map((b) => (
              <li key={b.id}>
                <Link
                  to={`/map?building=${b.id}`}
                  className="flex items-center gap-3 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800/40 transition-colors"
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sage-500 text-[11px] font-semibold text-white tabular-nums shrink-0">
                    {b.number}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{b.name}</span>
                  {b.usage_note && (
                    <span className="text-[11px] text-slate-500 truncate max-w-[10rem] shrink-0">
                      {b.usage_note}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-slate-300">Recent activity</h3>
        {txns.length === 0 ? (
          <EmptyState variant="inline" title="No movements yet." />
        ) : (
          <ul className="surface divide-y divide-slate-800">
            {txns.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
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
                <span className="flex-1 min-w-0 truncate text-slate-300">
                  {t.staff_label || 'unknown'}
                </span>
                <span
                  className="text-xs text-slate-500 shrink-0"
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
