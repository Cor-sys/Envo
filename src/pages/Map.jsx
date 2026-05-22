import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Pencil, Plus, X } from 'lucide-react';
import {
  addBuildingItem,
  getBuilding,
  listBuildings,
  removeBuildingItem,
  updateBuildingNotes,
} from '../lib/buildings.js';
import { listItems } from '../lib/items.js';
import { isAdmin, useStaffProfile } from '../lib/auth.jsx';
import StatusPill from '../components/StatusPill.jsx';

// Map tab — pragmatic interim shape. The campus illustration is a
// decorative banner at the top; all interaction happens through the
// numbered building list below it. The on-image tap-zone approach
// (earlier iterations) was unreliable because a static PNG without
// pixel-accurate coordinates can't pin every zone to its building,
// and admins would chase positions forever. Until we have either an
// SVG-based map or a drag-to-relocate editor, the list wins.
//
// The image is served at /campus-map.png from public/. Actual asset
// dimensions are 1448×1086 = exact 4:3.

const IMG_SRC = '/campus-map.png';
const IMG_ASPECT = '1448 / 1086'; // exact PNG dimensions

export default function MapPage() {
  const [buildings, setBuildings] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  // Deep-link support: /map?building=<uuid> opens that building's sheet on
  // load. Used by the ItemDetail cross-reference ("Used in buildings: …").
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    let cancelled = false;
    listBuildings()
      .then((rows) => { if (!cancelled) setBuildings(rows); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);

  // Sync the ?building param into local state. Reading it as a useEffect
  // (vs. inline) keeps the back-button behaviour clean — go back, sheet
  // closes; come back forward, it reopens.
  useEffect(() => {
    const id = searchParams.get('building');
    if (id) setOpenId(id);
  }, [searchParams]);

  function closeSheet() {
    setOpenId(null);
    // Strip the query param so closing the sheet doesn't leave a stale URL
    // that would re-open the same sheet on the next render.
    if (searchParams.has('building')) {
      const next = new URLSearchParams(searchParams);
      next.delete('building');
      setSearchParams(next, { replace: true });
    }
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold text-slate-100">Campus map</h2>
        {buildings && (
          <span className="text-xs text-slate-500 tabular-nums">
            {buildings.length} buildings
          </span>
        )}
      </div>

      {error && <p className="text-red-300 text-sm">{error}</p>}
      {!buildings && !error && <p className="text-slate-400 text-sm">Loading…</p>}

      {/* Decorative reference. The illustration's own legend at the bottom
          numbers every building; staff use that to find what they want,
          then tap the row in the list below. */}
      <div
        className="w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900"
        style={{ aspectRatio: IMG_ASPECT }}
      >
        <img
          src={IMG_SRC}
          alt="Campus map"
          className="h-full w-full object-cover select-none"
          draggable={false}
        />
      </div>

      {buildings && (
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
              <span className="inline-flex h-7 w-7 items-center justify-center
                               rounded-full bg-honey-500 text-[12px] font-semibold
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
      )}

      {openId && (
        <BuildingSheet
          id={openId}
          onClose={closeSheet}
        />
      )}
    </div>
  );
}

// Bottom sheet that loads + shows the building's notes and linked items.
// For admins, the sheet has an edit toggle that opens an inline editor for
// the notes textarea, an item picker that links inventory rows via
// building_items, and an unlink X on each linked row.
function BuildingSheet({ id, onClose }) {
  const { profile } = useStaffProfile();
  const admin = isAdmin(profile);
  const [b, setB] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);

  async function reload() {
    setError(null);
    try { setB(await getBuilding(id)); }
    catch (e) { setError(e.message); }
  }

  useEffect(() => {
    let cancelled = false;
    setB(null);
    setEditing(false);
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
          <div className="flex items-center gap-1 shrink-0">
            {admin && b && (
              <button
                onClick={() => setEditing((v) => !v)}
                aria-label={editing ? 'Done editing' : 'Edit building'}
                title={editing ? 'Done editing' : 'Edit'}
                className={`p-1.5 rounded-md transition-colors ${
                  editing
                    ? 'text-honey-300 bg-honey-500/15 hover:bg-honey-500/25'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/40'
                }`}
              >
                <Pencil size={16} />
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-slate-400 hover:text-slate-100 p-1.5 rounded-md hover:bg-slate-800/40"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {error && <p className="text-red-300 text-sm">{error}</p>}

        {b && (
          <>
            <NotesBlock
              building={b}
              editable={admin && editing}
              onSaved={reload}
            />

            <div className="space-y-2 border-t border-slate-800 pt-3">
              <div className="flex items-center justify-between">
                <div className="eyebrow">Stocked items ({b.items.length})</div>
              </div>
              {b.items.length === 0 && !editing && (
                <p className="text-sm text-slate-500 italic">
                  No items linked to this building yet.
                </p>
              )}
              {b.items.length > 0 && (
                <ul className="surface-interactive divide-y divide-slate-800">
                  {b.items.map((it) => (
                    <li key={it.id} className="flex items-stretch">
                      <Link
                        to={`/items/${it.id}`}
                        className="flex items-center gap-3 px-3 py-2 flex-1 min-w-0 hover:bg-slate-800/40"
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
                      {admin && editing && (
                        <button
                          type="button"
                          onClick={async () => {
                            try { await removeBuildingItem(id, it.id); await reload(); }
                            catch (e) { setError(e.message); }
                          }}
                          aria-label={`Unlink ${it.name}`}
                          title="Unlink"
                          className="px-3 text-slate-400 hover:text-red-300 hover:bg-red-500/10 transition-colors border-l border-slate-800"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {admin && editing && (
                <ItemPicker
                  alreadyLinkedIds={new Set(b.items.map((i) => i.id))}
                  onPick={async (item) => {
                    try { await addBuildingItem(id, item.id); await reload(); }
                    catch (e) { setError(e.message); }
                  }}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Notes block — read view shows plaintext; edit view shows a textarea and
// "Save" button. Plays nice with the sheet's existing space-y-* rhythm.
function NotesBlock({ building, editable, onSaved }) {
  const [draft, setDraft] = useState(building.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // If the building changes (different one tapped), reset the draft.
  useEffect(() => { setDraft(building.notes ?? ''); }, [building.id]);

  if (!editable) {
    return (
      <div className="space-y-1">
        <div className="eyebrow">Notes</div>
        <p className="text-sm text-slate-200 whitespace-pre-line min-h-[1.5rem]">
          {building.notes?.trim() || (
            <span className="text-slate-500 italic">
              No notes yet. Tap the pencil to add maintenance info (bulb type,
              air filter, oil grade, etc.).
            </span>
          )}
        </p>
      </div>
    );
  }

  const dirty = draft !== (building.notes ?? '');
  async function save() {
    setBusy(true); setErr(null);
    try {
      await updateBuildingNotes(building.id, draft.trim() || null);
      await onSaved();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-2">
      <div className="eyebrow">Notes</div>
      <textarea
        rows={4}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Bulb type, air filter, oil grade, breaker panel, etc."
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm placeholder-slate-500"
      />
      <div className="flex items-center justify-between gap-2">
        {err && <span className="text-red-300 text-xs">{err}</span>}
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={save}
          className="tap-primary text-xs px-3 py-1.5 min-h-0 ml-auto disabled:opacity-50"
        >
          {busy ? 'Saving…' : dirty ? 'Save notes' : 'Saved'}
        </button>
      </div>
    </div>
  );
}

// Search-as-you-type picker that calls listItems() with the typed query and
// shows up to ~8 matches. Already-linked items are filtered out so the admin
// can't accidentally double-link.
function ItemPicker({ alreadyLinkedIds, onPick }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);

  // Debounced search — wait 250ms after the last keystroke before hitting the
  // server. Empty query → clear results (don't show the full inventory).
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    let cancelled = false;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const data = await listItems({ search: term });
        if (cancelled) return;
        setResults(data.slice(0, 8));
      } catch { /* swallow — picker is best-effort */ }
      finally { if (!cancelled) setBusy(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  const filtered = useMemo(
    () => results.filter((r) => !alreadyLinkedIds.has(r.id)),
    [results, alreadyLinkedIds],
  );

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search inventory to link…"
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm placeholder-slate-500"
        />
        {busy && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">
            …
          </span>
        )}
      </div>
      {q.trim().length >= 2 && filtered.length === 0 && !busy && (
        <p className="text-xs text-slate-500 italic px-1">No matches.</p>
      )}
      {filtered.length > 0 && (
        <ul className="surface divide-y divide-slate-800">
          {filtered.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => { onPick(it); setQ(''); setResults([]); }}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-800/40 transition-colors"
              >
                <Plus size={14} className="text-honey-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-100 truncate">{it.name}</div>
                  <div className="text-[11px] text-slate-500 font-mono truncate">
                    {it.sku}{it.brand ? ` · ${it.brand}` : ''}
                  </div>
                </div>
                <span className="text-xs text-slate-400 tabular-nums shrink-0">{it.qty}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
