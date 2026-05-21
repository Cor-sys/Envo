import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ITEM_TYPES,
  METADATA_FIELDS_BY_TYPE,
  createItem,
  itemTypeLabel,
} from '../lib/items.js';

const NULLABLE = ['category', 'brand', 'model', 'barcode', 'location_text'];

export default function NewItem() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [v, setV] = useState({
    item_type: 'light_bulb',
    category: '',
    name: '',
    brand: '',
    model: '',
    barcode: '',
    qty: 0,
    threshold: 0,
    location_text: '',
    metadata: {},
  });

  const metaFields = useMemo(
    () => METADATA_FIELDS_BY_TYPE[v.item_type] ?? [],
    [v.item_type],
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

      // Empty strings → null on nullable columns
      for (const k of NULLABLE) {
        if (typeof payload[k] === 'string' && payload[k].trim() === '') payload[k] = null;
      }
      payload.qty       = Math.max(0, Number(payload.qty)       || 0);
      payload.threshold = Math.max(0, Number(payload.threshold) || 0);

      // Pack metadata: drop empty values, coerce numeric fields.
      const cleaned = {};
      for (const f of metaFields) {
        const raw = v.metadata[f.key];
        if (raw === undefined || raw === null || raw === '') continue;
        cleaned[f.key] = f.type === 'number' ? Number(raw) : raw;
      }
      payload.metadata = cleaned;

      const created = await createItem(payload);
      nav(`/items/${created.id}`, { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const inputCls = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2';

  return (
    <form className="space-y-3 p-3" onSubmit={submit}>
      <h2 className="text-xl font-semibold">New item</h2>

      <label className="block">
        <span className="block text-sm text-slate-700">Type *</span>
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
        <span className="block text-sm text-slate-700">Name *</span>
        <input
          className={inputCls}
          required
          value={v.name}
          onChange={(e) => setField('name', e.target.value)}
        />
      </label>

      <label className="block">
        <span className="block text-sm text-slate-700">Category</span>
        <input
          className={inputCls}
          placeholder="optional sub-category"
          value={v.category}
          onChange={(e) => setField('category', e.target.value)}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-sm text-slate-700">Brand</span>
          <input
            className={inputCls}
            value={v.brand}
            onChange={(e) => setField('brand', e.target.value)}
          />
        </label>
        <label className="block">
          <span className="block text-sm text-slate-700">Model</span>
          <input
            className={inputCls}
            value={v.model}
            onChange={(e) => setField('model', e.target.value)}
          />
        </label>
      </div>

      <label className="block">
        <span className="block text-sm text-slate-700">Factory UPC barcode</span>
        <input
          className={inputCls}
          placeholder="leave blank if none — we'll print a QR"
          value={v.barcode}
          onChange={(e) => setField('barcode', e.target.value)}
        />
      </label>

      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="block text-sm text-slate-700">Qty</span>
          <input
            className={inputCls}
            type="number"
            min="0"
            value={v.qty}
            onChange={(e) => setField('qty', e.target.value)}
          />
        </label>
        <label className="block">
          <span className="block text-sm text-slate-700">Threshold</span>
          <input
            className={inputCls}
            type="number"
            min="0"
            value={v.threshold}
            onChange={(e) => setField('threshold', e.target.value)}
          />
        </label>
        <label className="block">
          <span className="block text-sm text-slate-700">Location</span>
          <input
            className={inputCls}
            placeholder="A1, B3…"
            value={v.location_text}
            onChange={(e) => setField('location_text', e.target.value)}
          />
        </label>
      </div>

      {metaFields.length > 0 && (
        <fieldset className="space-y-3 rounded-xl border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium text-slate-700">
            {itemTypeLabel(v.item_type)} details
          </legend>
          {metaFields.map((f) => (
            <label key={f.key} className="block">
              <span className="block text-sm text-slate-700">{f.label}</span>
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

      {error && <p className="text-red-700 text-sm">{error}</p>}

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={() => nav(-1)} className="tap-secondary flex-1">
          Cancel
        </button>
        <button type="submit" disabled={busy} className="tap-primary flex-1">
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
