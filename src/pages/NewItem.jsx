import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CATEGORIES, createItem } from '../lib/items.js';

const NULLABLE = ['brand', 'watts', 'base', 'type', 'model', 'barcode', 'location'];

export default function NewItem() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [v, setV] = useState({
    category: CATEGORIES[0],
    name: '',
    brand: '',
    watts: '',
    base: '',
    type: '',
    model: '',
    barcode: '',
    qty: 0,
    threshold: 0,
    location: '',
  });

  function field(name) {
    return {
      value: v[name],
      onChange: (e) => setV({ ...v, [name]: e.target.value }),
    };
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
      payload.qty = Math.max(0, Number(payload.qty) || 0);
      payload.threshold = Math.max(0, Number(payload.threshold) || 0);
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
        <span className="block text-sm text-slate-700">Category</span>
        <select className={inputCls} {...field('category')}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>

      <label className="block">
        <span className="block text-sm text-slate-700">Name *</span>
        <input className={inputCls} required {...field('name')} />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-sm text-slate-700">Brand</span>
          <input className={inputCls} {...field('brand')} />
        </label>
        <label className="block">
          <span className="block text-sm text-slate-700">Watts</span>
          <input className={inputCls} placeholder="e.g. 32 or ?" {...field('watts')} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-sm text-slate-700">Base / fixture</span>
          <input className={inputCls} placeholder="e.g. G13, E26" {...field('base')} />
        </label>
        <label className="block">
          <span className="block text-sm text-slate-700">Type</span>
          <input className={inputCls} placeholder="e.g. T8 LED" {...field('type')} />
        </label>
      </div>

      <label className="block">
        <span className="block text-sm text-slate-700">Model / order code</span>
        <input className={inputCls} {...field('model')} />
      </label>

      <label className="block">
        <span className="block text-sm text-slate-700">Factory UPC barcode</span>
        <input
          className={inputCls}
          placeholder="leave blank if none — we'll print a QR"
          {...field('barcode')}
        />
      </label>

      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="block text-sm text-slate-700">Qty</span>
          <input className={inputCls} type="number" min="0" {...field('qty')} />
        </label>
        <label className="block">
          <span className="block text-sm text-slate-700">Threshold</span>
          <input className={inputCls} type="number" min="0" {...field('threshold')} />
        </label>
        <label className="block">
          <span className="block text-sm text-slate-700">Location</span>
          <input className={inputCls} placeholder="A1, B3…" {...field('location')} />
        </label>
      </div>

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
