import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ITEM_TYPES,
  METADATA_FIELDS_BY_TYPE,
  getItem,
  itemTypeLabel,
  updateItem,
} from '../lib/items.js';

const NULLABLE = ['category', 'brand', 'model', 'barcode', 'location_text'];

export default function EditItem() {
  const { id } = useParams();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [v, setV] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getItem(id)
      .then((it) => {
        if (cancelled) return;
        if (!it) {
          setError('Item not found.');
          setLoaded(true);
          return;
        }
        // Pull the metadata out into the form fields where it lives in the
        // editable UI. Metadata stays flexible (extra keys not in the field
        // schema are preserved on save).
        setV({
          item_type: it.item_type,
          category: it.category ?? '',
          name: it.name ?? '',
          brand: it.brand ?? '',
          model: it.model ?? '',
          barcode: it.barcode ?? '',
          qty: it.qty,
          threshold: it.threshold,
          location_text: it.location_text ?? '',
          metadata: it.metadata ?? {},
        });
        setLoaded(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [id]);

  const metaFields = useMemo(
    () => (v ? METADATA_FIELDS_BY_TYPE[v.item_type] ?? [] : []),
    [v?.item_type],
  );

  function setField(name, value) {
    setV((prev) => ({ ...prev, [name]: value }));
  }
  function setMetadataField(key, value) {
    setV((prev) => ({
      ...prev,
      metadata: { ...prev.metadata, [key]: value },
    }));
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = { ...v };
      for (const k of NULLABLE) {
        if (typeof payload[k] === 'string' && payload[k].trim() === '') payload[k] = null;
      }
      payload.qty       = Math.max(0, Number(payload.qty)       || 0);
      payload.threshold = Math.max(0, Number(payload.threshold) || 0);

      // Rebuild metadata from form fields. Preserve any extra keys the user
      // may have set outside the known field schema.
      const known = new Set(metaFields.map((f) => f.key));
      const cleaned = {};
      for (const [k, val] of Object.entries(v.metadata ?? {})) {
        if (known.has(k)) continue;            // re-added below from form
        if (val === undefined || val === null || val === '') continue;
        cleaned[k] = val;
      }
      for (const f of metaFields) {
        const raw = v.metadata[f.key];
        if (raw === undefined || raw === null || raw === '') continue;
        cleaned[f.key] = f.type === 'number' ? Number(raw) : raw;
      }
      payload.metadata = cleaned;

      await updateItem(id, payload);
      nav(`/items/${id}`, { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <div className="p-3 text-slate-400">Loading…</div>;
  if (loaded && !v && error) return <div className="p-3 text-red-400">{error}</div>;
  if (!v) return <div className="p-3 text-slate-400">Item not found.</div>;

  const inputCls = 'mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 placeholder-slate-500';

  return (
    <form className="space-y-3 p-3" onSubmit={submit}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Edit item</h2>
        <button type="button" onClick={() => nav(-1)} className="text-sm text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>

      <label className="block">
        <span className="block text-sm text-slate-300">Type *</span>
        <select
          className={inputCls}
          value={v.item_type}
          onChange={(e) => setField('item_type', e.target.value)}
        >
          {ITEM_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="block text-sm text-slate-300">Name *</span>
        <input className={inputCls} required value={v.name}
               onChange={(e) => setField('name', e.target.value)} />
      </label>

      <label className="block">
        <span className="block text-sm text-slate-300">Category</span>
        <input className={inputCls} value={v.category}
               onChange={(e) => setField('category', e.target.value)} />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-sm text-slate-300">Brand</span>
          <input className={inputCls} value={v.brand}
                 onChange={(e) => setField('brand', e.target.value)} />
        </label>
        <label className="block">
          <span className="block text-sm text-slate-300">Model</span>
          <input className={inputCls} value={v.model}
                 onChange={(e) => setField('model', e.target.value)} />
        </label>
      </div>

      <label className="block">
        <span className="block text-sm text-slate-300">Factory UPC barcode</span>
        <input className={inputCls} value={v.barcode}
               onChange={(e) => setField('barcode', e.target.value)} />
      </label>

      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="block text-sm text-slate-300">Qty</span>
          <input className={inputCls} type="number" min="0" value={v.qty}
                 onChange={(e) => setField('qty', e.target.value)} />
        </label>
        <label className="block">
          <span className="block text-sm text-slate-300">Threshold</span>
          <input className={inputCls} type="number" min="0" value={v.threshold}
                 onChange={(e) => setField('threshold', e.target.value)} />
        </label>
        <label className="block">
          <span className="block text-sm text-slate-300">Location</span>
          <input className={inputCls} value={v.location_text}
                 onChange={(e) => setField('location_text', e.target.value)} />
        </label>
      </div>

      {metaFields.length > 0 && (
        <fieldset className="space-y-3 surface p-3">
          <legend className="px-1 text-sm font-medium text-slate-300">
            {itemTypeLabel(v.item_type)} details
          </legend>
          {metaFields.map((f) => (
            <label key={f.key} className="block">
              <span className="block text-sm text-slate-300">{f.label}</span>
              <input
                className={inputCls}
                type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                placeholder={f.placeholder ?? ''}
                value={v.metadata[f.key] ?? ''}
                onChange={(e) => setMetadataField(f.key, e.target.value)}
              />
            </label>
          ))}
        </fieldset>
      )}

      <p className="text-xs text-slate-500">
        Note: changing <strong>qty</strong> here is a direct edit (no
        transaction logged). For normal check-in / check-out, use the ± buttons
        on the item page or the Scan tab — those go through the activity log.
      </p>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={() => nav(-1)} className="tap-secondary flex-1">
          Cancel
        </button>
        <button type="submit" disabled={busy} className="tap-primary flex-1">
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
