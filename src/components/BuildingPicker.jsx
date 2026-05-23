import { useEffect, useState } from 'react';
import { listBuildings } from '../lib/buildings.js';

// Optional building tag for stock movements. Used on Scan and ItemDetail
// to attach a destination to every check-in/out. The choice persists for
// the session (sessionStorage) so a staffer working in Building 5 doesn't
// have to re-pick on every scan.
//
// `value` is the currently selected building_id (or '' for none).
// `onChange(id)` fires with the selected id ('' when None).

const SESSION_KEY = 'stockroom.lastBuilding.v1';

export default function BuildingPicker({ value, onChange, label = 'Going to', className = '' }) {
  const [buildings, setBuildings] = useState(null);
  const [error, setError]         = useState(false);

  useEffect(() => {
    let cancelled = false;
    listBuildings()
      .then((b) => { if (!cancelled) setBuildings(b); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  // First mount: hydrate from session if the caller hasn't provided a value.
  useEffect(() => {
    if (value) return;
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) onChange(saved);
    } catch { /* private mode → fine */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handle(e) {
    const next = e.target.value;
    onChange(next);
    try {
      if (next) sessionStorage.setItem(SESSION_KEY, next);
      else      sessionStorage.removeItem(SESSION_KEY);
    } catch { /* fine */ }
  }

  // If buildings can't load (no data, no perms, schema not migrated), the
  // picker disappears entirely. Scan + ItemDetail still work; movements
  // just land without a building tag.
  if (error || (buildings && buildings.length === 0)) return null;

  return (
    <label className={`block ${className}`}>
      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <select
        value={value ?? ''}
        onChange={handle}
        disabled={!buildings}
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
      >
        <option value="">— No building tag —</option>
        {buildings?.map((b) => (
          <option key={b.id} value={b.id}>
            {b.number}. {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}
