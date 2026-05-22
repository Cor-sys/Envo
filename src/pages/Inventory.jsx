import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus, Printer } from 'lucide-react';
import { ITEM_TYPES, itemTypeLabel, listItems } from '../lib/items.js';
import { photoUrl } from '../lib/photos.js';
import StatusPill from '../components/StatusPill.jsx';
import PullToRefresh from '../components/PullToRefresh.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import { SkeletonList } from '../components/Skeleton.jsx';

function Thumb({ item, size = 'sm' }) {
  const url = photoUrl(item.image_path);
  const cls = size === 'lg'
    ? 'h-16 w-16 rounded-lg'
    : 'h-12 w-12 rounded-lg';
  if (url) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        className={`${cls} object-cover bg-slate-800 border border-slate-800 shrink-0`}
      />
    );
  }
  // Placeholder when no photo: typed initial in a muted tile so the row
  // height stays consistent and rows scan as a grid.
  return (
    <div className={`${cls} bg-slate-800/70 border border-slate-800 shrink-0 flex items-center justify-center text-slate-500 text-sm font-medium`}>
      {(item.name ?? '?').slice(0, 1).toUpperCase()}
    </div>
  );
}

// Persisted collapsed-group state. With 11+ type groups after the chemical
// import a single Inventory page is several hundred items long; remembering
// which groups the user has hidden across reloads makes scrolling sane.
//
// First visit (no localStorage entry yet) collapses ALL groups by default
// so the page opens compact — the user sees the catalog at a glance and
// expands the section they need. Subsequent visits restore whatever they
// left collapsed. `loadCollapsed()` returns null in that first-visit case
// so the page can initialise the Set once it knows the actual group keys.
const COLLAPSE_STORAGE_KEY = 'stockroom.inventory.collapsedGroups.v1';
function loadCollapsed() {
  if (typeof localStorage === 'undefined') return null; // SSR-safe; first-visit treated downstream
  try {
    const raw = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (!raw) return null;                                // first visit — collapse all once groups load
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return null;
  }
}
function saveCollapsed(set) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify([...set])); }
  catch { /* quota or disabled — non-fatal */ }
}

export default function Inventory() {
  const [items, setItems] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  // `collapsed === null` is the first-visit sentinel — once groups load we
  // populate it with every group key (default = all collapsed). All other
  // code that consumes `collapsed` treats null as the empty set for
  // membership tests, since the very first render runs before items have
  // arrived anyway.
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [error, setError] = useState(null);

  function toggleGroup(key) {
    setCollapsed((prev) => {
      const base = prev instanceof Set ? prev : new Set();
      const next = new Set(base);
      if (next.has(key)) next.delete(key); else next.add(key);
      saveCollapsed(next);
      return next;
    });
  }

  function setAllCollapsed(toCollapse) {
    setCollapsed(() => {
      const next = toCollapse && groupedVisible
        ? new Set(groupedVisible.map((g) => g.type))
        : new Set();
      saveCollapsed(next);
      return next;
    });
  }

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await listItems({ search, itemType: typeFilter || undefined });
      setItems(data);
    } catch (e) {
      setError(e.message);
    }
  }, [search, typeFilter]);

  useEffect(() => {
    let cancelled = false;
    load().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [load]);

  const counts = useMemo(() => {
    if (!items) return { out: 0, low: 0, total: 0 };
    return items.reduce(
      (acc, it) => {
        acc.total++;
        if (it.status === 'out') acc.out++;
        else if (it.status === 'low') acc.low++;
        return acc;
      },
      { out: 0, low: 0, total: 0 },
    );
  }, [items]);

  const visible = useMemo(() => {
    if (!items) return null;
    return attentionOnly ? items.filter((it) => it.status !== 'ok') : items;
  }, [items, attentionOnly]);

  // Bucket the visible items by item_type. Groups render alphabetically by
  // label (Belts → Chemicals → Light bulbs → …) and items within each group
  // sort alphabetically by name, so a staffer scrolling the All view can
  // always predict where to find something. The attention banner up top
  // and per-group OUT/LOW chips in each section header keep priority items
  // visible without breaking that alphabetical order.
  const groupedVisible = useMemo(() => {
    if (!visible) return null;
    const byType = new Map();
    for (const it of visible) {
      const key = it.item_type ?? 'unknown';
      if (!byType.has(key)) byType.set(key, []);
      byType.get(key).push(it);
    }
    const groups = [...byType.entries()].map(([type, arr]) => ({
      type,
      label: itemTypeLabel(type),
      items: [...arr].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
    }));
    groups.sort((a, b) => a.label.localeCompare(b.label));
    return groups;
  }, [visible]);

  // First-visit default: once groups arrive AND we have no prior collapsed
  // state in localStorage (sentinel `null`), collapse every group. This
  // gives staff a compact "table of contents" landing view; they tap to
  // open the section they care about.
  useEffect(() => {
    if (collapsed === null && groupedVisible && groupedVisible.length > 0) {
      const allKeys = new Set(groupedVisible.map((g) => g.type));
      setCollapsed(allKeys);
      saveCollapsed(allKeys);
    }
  }, [collapsed, groupedVisible]);

  // Recent items: look them up in the full inventory list, preserving the
  const needsAttention = counts.out + counts.low;

  return (
    <PullToRefresh onRefresh={load}>
      <div className="space-y-3 p-3">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 placeholder-slate-500"
            placeholder="Search name / brand / SKU / barcode"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Link to="/labels" className="tap-secondary" title="Print labels for items without a factory barcode" aria-label="Print labels">
            <Printer size={16} strokeWidth={1.8} />
          </Link>
          <Link to="/items/new" className="tap-primary">
            <Plus size={16} strokeWidth={2.5} />
            Item
          </Link>
        </div>

        {needsAttention > 0 && (
          <button
            type="button"
            onClick={() => setAttentionOnly((v) => !v)}
            className={`w-full rounded-2xl border p-3 text-left transition-colors ${
              attentionOnly
                ? 'border-amber-500/50 bg-amber-500/10'
                : 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm">
                <span className="font-medium text-amber-200">
                  {counts.out > 0 && (<>{counts.out} OUT </>)}
                  {counts.out > 0 && counts.low > 0 && (<span className="text-amber-300/60">· </span>)}
                  {counts.low > 0 && (<>{counts.low} LOW</>)}
                </span>
                <span className="text-amber-300/70 ml-2">
                  {attentionOnly ? '— showing attention items only' : '— tap to focus'}
                </span>
              </div>
              <span className="text-xs text-amber-300/70 shrink-0">
                {attentionOnly ? 'show all' : 'focus'}
              </span>
            </div>
          </button>
        )}

        <div className="chip-row">
          <button
            type="button"
            onClick={() => setTypeFilter('')}
            className={typeFilter === '' ? 'chip-active' : 'chip-inactive'}
          >
            All
          </button>
          {ITEM_TYPES.map((t) => (
            <button
              type="button"
              key={t.value}
              onClick={() => setTypeFilter(t.value)}
              className={typeFilter === t.value ? 'chip-active' : 'chip-inactive'}
            >
              {t.label}
            </button>
          ))}
        </div>

        <ErrorBanner message={error} onDismiss={() => setError(null)} />

        {items === null && !error && <SkeletonList rows={6} />}

        {items && items.length === 0 && (
          <EmptyState
            title="No items yet."
            description={'Tap "+ Item" to add your first.'}
          />
        )}

        {items && items.length > 0 && visible.length === 0 && (
          <EmptyState
            title="Nothing needs attention."
            description="Tap the banner above to see all items."
          />
        )}

        {groupedVisible && groupedVisible.length > 1 && (() => {
          // `collapsed` is null on the very first render before the
          // first-visit-default effect fires; treat that as "everything
          // collapsed" since that's the state we're about to set.
          const collapsedSize = collapsed instanceof Set ? collapsed.size : groupedVisible.length;
          const allCollapsed = collapsedSize >= groupedVisible.length;
          return (
            <div className="flex justify-end -my-1">
              <button
                type="button"
                onClick={() => setAllCollapsed(!allCollapsed)}
                className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                {allCollapsed ? 'Expand all' : 'Collapse all'}
              </button>
            </div>
          );
        })()}

        {groupedVisible && groupedVisible.length > 0 && groupedVisible.map((group) => {
          // Per-group attention counts so the header can flag "2 OUT" etc.
          let outCount = 0, lowCount = 0;
          for (const it of group.items) {
            if (it.status === 'out') outCount += 1;
            else if (it.status === 'low') lowCount += 1;
          }
          // Default to collapsed when state hasn't initialised yet so the
          // first paint matches the first-visit-collapsed UX (no flash of
          // expanded content).
          const isCollapsed = collapsed instanceof Set ? collapsed.has(group.type) : true;
          return (
            <section key={group.type} className="space-y-2">
              <button
                type="button"
                onClick={() => toggleGroup(group.type)}
                aria-expanded={!isCollapsed}
                style={{ top: 'var(--header-h)' }}
                className="sticky z-10 -mx-3 px-3 py-2 bg-slate-950/90 backdrop-blur border-b border-slate-800/70 flex items-center justify-between w-[calc(100%+1.5rem)] text-left hover:bg-slate-900/40 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ChevronRight
                    size={14}
                    strokeWidth={2}
                    className={`text-slate-400 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                    aria-hidden="true"
                  />
                  <h3 className="eyebrow truncate">{group.label}</h3>
                  <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                    {group.items.length}
                  </span>
                </div>
                {(outCount > 0 || lowCount > 0) && (
                  <div className="flex items-center gap-2 shrink-0 text-[10.5px] font-medium uppercase tracking-wider">
                    {outCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-red-300 tabular-nums">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                        {outCount} out
                      </span>
                    )}
                    {lowCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-amber-300 tabular-nums">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
                        {lowCount} low
                      </span>
                    )}
                  </div>
                )}
              </button>

              {isCollapsed ? null : (

              <ul className="space-y-2">
                {group.items.map((it) => {
                  const md = it.metadata ?? {};
                  const subParts = [];
                  if (it.brand) subParts.push(it.brand);
                  if (md.watts) subParts.push(`${md.watts}W`);
                  subParts.push(it.sku);
                  const rowAccent = it.status === 'out' ? 'row-out'
                                  : it.status === 'low' ? 'row-low'
                                  : '';
                  return (
                    <li key={it.id}>
                      <Link
                        to={`/items/${it.id}`}
                        className={`block surface-interactive p-3 ${rowAccent}`}
                      >
                        <div className="flex items-start gap-3">
                          <Thumb item={it} />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-slate-100 truncate">
                              {it.name}
                            </div>
                            <div className="text-xs text-slate-400 truncate mt-0.5">
                              {subParts.join(' · ')}
                              {it.needs_label && (
                                <> · <span className="text-amber-300">needs label</span></>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm text-slate-200 tabular-nums">{it.qty}</span>
                            <StatusPill status={it.status} />
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              )}
            </section>
          );
        })}
      </div>
    </PullToRefresh>
  );
}
