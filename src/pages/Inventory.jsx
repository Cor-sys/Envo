import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ITEM_TYPES, getMyRecentItemIds, itemTypeLabel, listItems } from '../lib/items.js';
import { photoUrl } from '../lib/photos.js';
import StatusPill from '../components/StatusPill.jsx';
import PullToRefresh from '../components/PullToRefresh.jsx';

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

export default function Inventory() {
  const [items, setItems] = useState(null);
  const [recentIds, setRecentIds] = useState([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [data, ids] = await Promise.all([
        listItems({ search, itemType: typeFilter || undefined }),
        // Recent items shouldn't filter by the search box — they're always
        // relevant. Catch any error here so a transactions-table hiccup
        // doesn't take down Inventory.
        getMyRecentItemIds(8).catch(() => []),
      ]);
      setItems(data);
      setRecentIds(ids);
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

  // Recent items: look them up in the full inventory list, preserving the
  // recency order returned by the txn query. Hidden when filters/search are
  // active (they'd compete with the main result set).
  const recentItems = useMemo(() => {
    if (!items || recentIds.length === 0) return [];
    if (search.trim() || typeFilter || attentionOnly) return [];
    const byId = new Map(items.map((it) => [it.id, it]));
    return recentIds.map((id) => byId.get(id)).filter(Boolean);
  }, [items, recentIds, search, typeFilter, attentionOnly]);

  function pillCls(active) {
    return `shrink-0 rounded-full px-3 py-1 text-xs transition-colors ${
      active
        ? 'bg-orange-600 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15)]'
        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
    }`;
  }

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
          <Link to="/items/new" className="tap-primary">+ Item</Link>
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

        {recentItems.length > 0 && (
          <section>
            <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5 px-1">
              Recently scanned
            </div>
            <div className="flex gap-2 overflow-x-auto -mx-3 px-3 pb-1">
              {recentItems.map((it) => (
                <Link
                  key={it.id}
                  to={`/items/${it.id}`}
                  className="shrink-0 w-24 surface-interactive p-2 flex flex-col items-center gap-1.5"
                >
                  <Thumb item={it} size="lg" />
                  <div className="text-[11px] text-slate-200 line-clamp-2 text-center leading-tight w-full">
                    {it.name}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-300 tabular-nums">{it.qty}</span>
                    <StatusPill status={it.status} />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3">
          <button type="button" onClick={() => setTypeFilter('')} className={pillCls(typeFilter === '')}>
            All
          </button>
          {ITEM_TYPES.map((t) => (
            <button
              type="button"
              key={t.value}
              onClick={() => setTypeFilter(t.value)}
              className={pillCls(typeFilter === t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {items === null && !error && (
          <p className="text-slate-400">Loading…</p>
        )}

        {items && items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-slate-400">
            <p className="font-medium text-slate-200">No items yet.</p>
            <p className="text-sm mt-1">Tap "+ Item" to add your first.</p>
          </div>
        )}

        {items && items.length > 0 && visible.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-slate-400">
            <p className="font-medium text-slate-200">Nothing needs attention.</p>
            <p className="text-sm mt-1">Tap the banner above to see all items.</p>
          </div>
        )}

        {visible && visible.length > 0 && (
          <ul className="space-y-2">
            {visible.map((it) => {
              const md = it.metadata ?? {};
              const subParts = [];
              if (it.brand) subParts.push(it.brand);
              if (md.watts) subParts.push(`${md.watts}W`);
              subParts.push(it.sku);
              return (
                <li key={it.id}>
                  <Link
                    to={`/items/${it.id}`}
                    className="block surface-interactive p-3"
                  >
                    <div className="flex items-start gap-3">
                      <Thumb item={it} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-100 truncate">{it.name}</span>
                          <span className="shrink-0 rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                            {itemTypeLabel(it.item_type)}
                          </span>
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
      </div>
    </PullToRefresh>
  );
}
