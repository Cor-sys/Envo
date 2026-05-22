import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { itemTypeLabel, listItemsNeedingLabel } from '../lib/items.js';
import EmptyState from '../components/EmptyState.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';

export default function Labels() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    listItemsNeedingLabel()
      .then((data) => {
        if (cancelled) return;
        setItems(data);
        // Default: all selected for printing
        setSelected(new Set(data.map((i) => i.id)));
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, []);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const printable = items?.filter((i) => selected.has(i.id)) ?? [];

  return (
    <div className="space-y-3 p-3 labels-page">
      <div className="flex items-center justify-end no-print">
        <button
          type="button"
          onClick={() => window.print()}
          disabled={printable.length === 0}
          className="tap-primary"
        >
          Print {printable.length || ''}
        </button>
      </div>

      <p className="text-sm text-slate-400 no-print">
        Items without a factory UPC need a printed QR label so staff can scan
        them. QR encodes the SKU.
      </p>

      <ErrorBanner message={error} className="no-print" />
      {items === null && !error && <p className="text-slate-400 no-print">Loading…</p>}

      {items && items.length === 0 && (
        <EmptyState
          className="no-print"
          title="Nothing to label."
          description="Every item has a factory barcode."
        />
      )}

      {items && items.length > 0 && (
        <>
          {/* Selection list — visible on screen only */}
          <ul className="space-y-1 no-print">
            {items.map((it) => (
              <li key={it.id}>
                <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(it.id)}
                    onChange={() => toggle(it.id)}
                    className="accent-sage-500"
                  />
                  <span className="font-medium text-slate-100 truncate">{it.name}</span>
                  <span className="ml-auto text-xs text-slate-400 font-mono">
                    {it.sku}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {/* Print layout — grid of label cards */}
          <div className="label-sheet">
            {printable.map((it) => (
              <Label key={it.id} item={it} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Label({ item }) {
  return (
    <div className="label-card">
      <QRCodeSVG value={item.sku} size={120} level="M" includeMargin={false} />
      <div className="label-meta">
        <div className="label-sku">{item.sku}</div>
        <div className="label-name">{item.name}</div>
        <div className="label-sub">
          {item.brand && <span>{item.brand}</span>}
          {item.location_text && <span> · {item.location_text}</span>}
        </div>
        <div className="label-type">{itemTypeLabel(item.item_type)}</div>
      </div>
    </div>
  );
}
