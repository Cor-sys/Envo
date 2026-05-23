import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ITEM_TYPES,
  METADATA_FIELDS_BY_TYPE,
  createItem,
  itemTypeLabel,
  updateItem,
} from '../lib/items.js';
import { uploadItemPhoto } from '../lib/photos.js';
import { savePrices } from '../lib/prices.js';
import { isAdmin, useStaffProfile } from '../lib/auth.jsx';
import PhotoInput from '../components/PhotoInput.jsx';
import PricingEditor from '../components/PricingEditor.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';

const NULLABLE = ['category', 'brand', 'model', 'barcode', 'location_text'];

export default function NewItem() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  // Pre-fill barcode if we arrived here from /scan via the "Add to catalog"
  // shortcut on an unrecognized code. Saves re-typing the UPC.
  const prefillBarcode = searchParams.get('barcode') ?? '';
  const { profile } = useStaffProfile();
  const admin = isAdmin(profile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Held in component state until save — we don't have an item id to upload
  // against until the row exists, so the upload is a second step after insert.
  const [photoBlob, setPhotoBlob] = useState(null);
  const [prices, setPrices] = useState([]);

  const [v, setV] = useState({
    item_type: 'light_bulb',
    category: '',
    name: '',
    brand: '',
    model: '',
    barcode: prefillBarcode,
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
      const payload = {
        item_type:     v.item_type,
        category:      v.category,
        name:          v.name,
        brand:         v.brand,
        model:         v.model,
        barcode:       v.barcode,
        qty:           v.qty,
        threshold:     v.threshold,
        location_text: v.location_text,
        metadata:      v.metadata,
      };

      for (const k of NULLABLE) {
        if (typeof payload[k] === 'string' && payload[k].trim() === '') payload[k] = null;
      }
      payload.qty       = Math.max(0, Number(payload.qty)       || 0);
      payload.threshold = Math.max(0, Number(payload.threshold) || 0);

      const cleaned = {};
      for (const f of metaFields) {
        const raw = v.metadata[f.key];
        if (raw === undefined || raw === null || raw === '') continue;
        cleaned[f.key] = f.type === 'number' ? Number(raw) : raw;
      }
      payload.metadata = cleaned;

      const created = await createItem(payload);

      // Photo upload: deferred until after insert so the path can be keyed
      // by the new item's UUID. A failed upload doesn't roll back the item —
      // staff can re-add the photo via Edit.
      if (photoBlob) {
        try {
          const path = await uploadItemPhoto(created.id, photoBlob);
          await updateItem(created.id, { image_path: path });
        } catch (e) {
          console.warn('Photo upload failed:', e);
        }
      }

      // Pricing: insert each non-empty vendor row keyed to the new item.
      // Soft-fail like the photo upload — staff can fix on Edit if any
      // row rejects.
      if (admin) {
        const cleanRows = prices
          .map(p => ({
            vendor: (p.vendor ?? '').trim(),
            price: p.price === '' || p.price == null ? null : Number(p.price),
            url: (p.url ?? '').trim() || null,
            note: (p.note ?? '').trim() || null,
          }))
          .filter(p => p.vendor);
        if (cleanRows.length > 0) {
          try {
            await savePrices({ itemId: created.id, nextRows: cleanRows, originalRows: [] });
          } catch (e) {
            console.warn('Pricing save failed:', e);
          }
        }
      }

      nav(`/items/${created.id}`, { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const inputCls = 'mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 placeholder-slate-500';

  return (
    <form className="space-y-3 p-3" onSubmit={submit}>
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
        <input
          className={inputCls}
          required
          value={v.name}
          onChange={(e) => setField('name', e.target.value)}
        />
      </label>

      <PhotoInput onChange={(blob) => setPhotoBlob(blob)} />

      <label className="block">
        <span className="block text-sm text-slate-300">Category</span>
        <input
          className={inputCls}
          placeholder="optional sub-category"
          value={v.category}
          onChange={(e) => setField('category', e.target.value)}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-sm text-slate-300">Brand</span>
          <input
            className={inputCls}
            value={v.brand}
            onChange={(e) => setField('brand', e.target.value)}
          />
        </label>
        <label className="block">
          <span className="block text-sm text-slate-300">Model</span>
          <input
            className={inputCls}
            value={v.model}
            onChange={(e) => setField('model', e.target.value)}
          />
        </label>
      </div>

      <label className="block">
        <span className="block text-sm text-slate-300">Factory UPC barcode</span>
        <input
          className={inputCls}
          placeholder="leave blank if none — we'll print a QR"
          value={v.barcode}
          onChange={(e) => setField('barcode', e.target.value)}
        />
      </label>

      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="block text-sm text-slate-300">Qty</span>
          <input
            className={inputCls}
            type="number"
            min="0"
            value={v.qty}
            onChange={(e) => setField('qty', e.target.value)}
          />
        </label>
        <label className="block">
          <span className="block text-sm text-slate-300">Threshold</span>
          <input
            className={inputCls}
            type="number"
            min="0"
            value={v.threshold}
            onChange={(e) => setField('threshold', e.target.value)}
          />
        </label>
        <label className="block">
          <span className="block text-sm text-slate-300">Location</span>
          <input
            className={inputCls}
            placeholder="A1, B3…"
            value={v.location_text}
            onChange={(e) => setField('location_text', e.target.value)}
          />
        </label>
      </div>

      <PricingEditor
        rows={prices}
        onChange={setPrices}
        disabled={!admin}
      />

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

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

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
