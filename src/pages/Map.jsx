import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { getBuilding, listBuildings } from '../lib/buildings.js';
import StatusPill from '../components/StatusPill.jsx';

// Map tab — renders the campus illustration with 18 tap-target badges, one
// per building row. Tap a badge → bottom sheet opens with the building's
// notes + the inventory items linked to it (see PR 4 for the link list).
//
// The image is at /campus-map.png (served from public/). It has a natural
// aspect ratio of roughly 1450:1100 — we wrap it in an aspect-ratio
// container so the page scales cleanly on any width and the percentage
// tap-target coordinates stay correct.

const IMG_SRC = '/campus-map.png';
const IMG_ASPECT = '1450 / 1100'; // matches the actual asset dimensions

export default function MapPage() {
  const [buildings, setBuildings] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listBuildings()
      .then((rows) => { if (!cancelled) setBuildings(rows); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold text-slate-100">Campus map</h2>
        {buildings && (
          <span className="text-xs text-slate-500 tabular-nums">
            {buildings.length} buildings
          </span>
        )}
      </div>

      {error && <p className="text-red-300 text-sm">{error}</p>}
      {!buildings && !error && <p className="text-slate-400 text-sm">Loading…</p>}

      {buildings && (
        <>
          {/* Map with overlaid tap targets. The aspect-ratio container keeps
              the badges aligned no matter the viewport width. */}
          <div
            className="relative w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900"
            style={{ aspectRatio: IMG_ASPECT }}
          >
            <img
              src={IMG_SRC}
              alt="Campus map"
              className="absolute inset-0 h-full w-full object-cover select-none"
              draggable={false}
            />
            {buildings.map((b) => (
              b.map_x != null && b.map_y != null && (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setOpenId(b.id)}
                  aria-label={`${b.name} — building ${b.number}`}
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-10
                             min-h-[28px] min-w-[28px] rounded-full
                             border-2 border-honey-300 bg-honey-500/80
                             text-[11px] font-semibold tabular-nums text-white
                             hover:bg-honey-500 hover:scale-110
                             active:scale-95 transition-transform
                             shadow-md"
                  style={{ left: `${b.map_x}%`, top: `${b.map_y}%` }}
                >
                  {b.number}
                </button>
              )
            ))}
          </div>

          {/* Legend — also tappable. Useful when the map is small on phone
              and the badges are hard to hit precisely. */}
          <div className="surface p-1 divide-y divide-slate-800">
            {buildings.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setOpenId(b.id)}
                className="w-full flex items-center gap-3 px-2 py-2 text-left
                           hover:bg-slate-800/40 active:bg-slate-700/40
                           transition-colors first:rounded-t-xl last:rounded-b-xl"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center
                                 rounded-full bg-honey-500 text-[11px] font-semibold
                                 text-white tabular-nums shrink-0">
                  {b.number}
                </span>
                <span className="flex-1 min-w-0 truncate text-sm text-slate-100">
                  {b.name}
                </span>
                {b.item_count > 0 && (
                  <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                    {b.item_count} item{b.item_count === 1 ? '' : 's'}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {openId && (
        <BuildingSheet
          id={openId}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

// Bottom sheet that loads + shows the building's notes and any linked items.
// PR 4 builds out the linked-items list; this PR ships the basic notes view.
function BuildingSheet({ id, onClose }) {
  const [b, setB] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setB(null);
    getBuilding(id)
      .then((row) => { if (!cancelled) setB(row); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [id]);

  return (
    <div
      className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
      onClick={onClose}
    >
      <div
        className="surface w-full max-w-md p-4 space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="eyebrow">Building {b?.number ?? '…'}</div>
            <h3 className="text-lg font-semibold text-slate-100 truncate">
              {b?.name ?? 'Loading…'}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-100 p-1.5 -m-1.5 rounded-md hover:bg-slate-800/40"
          >
            <X size={18} />
          </button>
        </div>

        {error && <p className="text-red-300 text-sm">{error}</p>}

        {b && (
          <>
            <div className="space-y-1">
              <div className="eyebrow">Notes</div>
              <p className="text-sm text-slate-200 whitespace-pre-line min-h-[1.5rem]">
                {b.notes?.trim() || (
                  <span className="text-slate-500 italic">
                    No notes yet. Admin can add maintenance info (bulb type, air filter,
                    oil grade, etc.) from the inventory page.
                  </span>
                )}
              </p>
            </div>

            <div className="space-y-1 border-t border-slate-800 pt-3">
              <div className="eyebrow">Stocked items ({b.items.length})</div>
              {b.items.length === 0 ? (
                <p className="text-sm text-slate-500 italic">
                  No items linked to this building yet.
                </p>
              ) : (
                <ul className="surface-interactive divide-y divide-slate-800">
                  {b.items.map((it) => (
                    <li key={it.id}>
                      <Link
                        to={`/items/${it.id}`}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-slate-800/40"
                        onClick={onClose}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-slate-100 truncate">{it.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono truncate">
                            {it.sku}
                            {it.usage_note ? ` · ${it.usage_note}` : ''}
                          </div>
                        </div>
                        <span className="text-sm text-slate-200 tabular-nums shrink-0">{it.qty}</span>
                        <StatusPill status={it.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
