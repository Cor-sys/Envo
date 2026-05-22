import { useEffect, useId, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { MAX_QUOTES, deriveBestPrice, formatMoney } from '../lib/prices.js';

// Up-to-N (default 5) vendor-price rows for one item. Controlled component:
// parent owns the canonical `rows` array; we emit the full list whenever
// the user edits. The parent persists via savePrices(itemId, rows, originals)
// from src/lib/prices.js when the form submits.
//
// Row shape:
//   { id?, vendor, price (string|number|null), url, note }
//
// Empty-vendor rows are filtered out at the parent (treated as abandoned
// slots). Non-admin staff get a read-only fieldset — same layout, inputs
// disabled, no add/remove buttons.

function blankRow() {
  return { vendor: '', price: '', url: '', note: '' };
}

export default function PricingEditor({
  rows,
  onChange,
  disabled = false,
  rowError = null,            // optional { index, message } — render inline by that row
}) {
  // Stable per-row keys so React doesn't shuffle inputs when the user
  // adds/removes rows. We derive keys from existing ids + an instance
  // counter for new rows.
  const baseId = useId();
  const [keys, setKeys] = useState(() => rows.map((r, i) => r.id ?? `${baseId}-new-${i}`));

  // Keep keys aligned with rows on out-of-band changes (e.g. initial load
  // after data fetch). If lengths differ, regenerate.
  useEffect(() => {
    if (keys.length !== rows.length) {
      setKeys(rows.map((r, i) => r.id ?? `${baseId}-new-${i}-${Math.random()}`));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const { bestPrice, bestVendor, quoteCount } = useMemo(
    () => deriveBestPrice(rows),
    [rows],
  );

  function updateRow(idx, patch) {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeRow(idx) {
    onChange(rows.filter((_, i) => i !== idx));
    setKeys(keys.filter((_, i) => i !== idx));
  }

  function addRow() {
    if (rows.length >= MAX_QUOTES) return;
    onChange([...rows, blankRow()]);
    setKeys([...keys, `${baseId}-new-${Date.now()}`]);
  }

  return (
    <fieldset disabled={disabled} className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <legend className="text-sm font-medium text-slate-300">
          Vendor pricing
          {disabled && (
            <span className="ml-2 text-[10.5px] font-semibold uppercase tracking-wider text-sage-300">
              admin only
            </span>
          )}
        </legend>
        {quoteCount > 0 && (
          <span className="text-xs text-slate-500">
            {bestPrice != null
              ? <>Best: <span className="text-slate-200 font-medium tabular-nums">{formatMoney(bestPrice)}</span>{bestVendor && <> from {bestVendor}</>}</>
              : 'No actionable quote yet (need price + URL)'}
          </span>
        )}
      </div>

      {rows.length === 0 && (
        <p className="text-xs text-slate-500">
          No quotes yet. Add up to {MAX_QUOTES} vendors and the cheapest one will
          drive the Order button.
        </p>
      )}

      <div className="space-y-3">
        {rows.map((r, i) => (
          <div
            key={keys[i]}
            className="surface p-3 space-y-2"
          >
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                placeholder="Vendor (Acme, Grainger, …)"
                value={r.vendor}
                onChange={(e) => updateRow(i, { vendor: e.target.value })}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm placeholder-slate-500"
                aria-label="Vendor name"
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="tap-sm-ghost-danger"
                  aria-label={`Remove vendor row ${i + 1}`}
                >
                  <Trash2 size={14} strokeWidth={2.2} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <input
                placeholder="Price"
                inputMode="decimal"
                value={r.price ?? ''}
                onChange={(e) => updateRow(i, { price: e.target.value })}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm placeholder-slate-500 tabular-nums"
                aria-label="Unit price"
              />
              <input
                placeholder="https://vendor.com/product"
                value={r.url ?? ''}
                onChange={(e) => updateRow(i, { url: e.target.value })}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm placeholder-slate-500"
                aria-label="Vendor URL"
              />
            </div>
            <input
              placeholder="Note (optional — e.g. case of 24, $10 shipping)"
              value={r.note ?? ''}
              onChange={(e) => updateRow(i, { note: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs placeholder-slate-500"
              aria-label="Note"
            />
            {rowError && rowError.index === i && (
              <p className="text-xs text-red-300">{rowError.message}</p>
            )}
          </div>
        ))}
      </div>

      {!disabled && rows.length < MAX_QUOTES && (
        <button
          type="button"
          onClick={addRow}
          className="tap-secondary w-full"
        >
          <Plus size={14} strokeWidth={2.4} />
          Add vendor ({rows.length}/{MAX_QUOTES})
        </button>
      )}
    </fieldset>
  );
}
