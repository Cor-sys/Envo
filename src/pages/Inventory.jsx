import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listItems } from '../lib/items.js';
import StatusPill from '../components/StatusPill.jsx';

export default function Inventory() {
  const [items, setItems] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    listItems({ search })
      .then((data) => { if (!cancelled) setItems(data); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [search]);

  return (
    <div className="space-y-3 p-3">
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
          placeholder="Search name / brand / SKU / barcode"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Link to="/items/new" className="tap-primary">+ Item</Link>
      </div>

      {error && <p className="text-red-700 text-sm">{error}</p>}

      {items === null && !error && (
        <p className="text-slate-500">Loading…</p>
      )}

      {items && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-600">
          <p className="font-medium">No items yet.</p>
          <p className="text-sm mt-1">Tap "+ Item" to add your first bulb type.</p>
        </div>
      )}

      {items && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id}>
              <Link
                to={`/items/${it.id}`}
                className="block rounded-xl border border-slate-200 bg-white p-3 active:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{it.name}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {it.brand && <>{it.brand} · </>}
                      {it.watts && <>{it.watts}W · </>}
                      {it.sku}
                      {it.needs_label && (
                        <> · <span className="text-amber-700">needs label</span></>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm tabular-nums">{it.qty}</span>
                    <StatusPill status={it.status} />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
