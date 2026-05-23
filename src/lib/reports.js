import { supabase } from './supabase.js';

// Lightweight roll-ups for the Reports screen (BRIEF §10).
//
// We deliberately compute totals client-side from `items_with_status` rather
// than building Postgres views per metric — the dataset is small (hundreds
// of rows at most for a small stockroom), and keeping the math in JS makes
// adding a new breakdown a zero-migration change.

export async function getInventorySnapshot() {
  const { data, error } = await supabase
    .from('items_with_best_price')
    .select('id, sku, item_type, category, name, brand, model, qty, threshold, status, location_text, barcode, image_path, metadata, best_price, best_vendor, best_url, max_price, quote_count')
    .order('item_type')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

// Derive the reorder list from a snapshot of items_with_status. Mirrors the
// shape of the SQL `reorder_list` view (suggested_qty = threshold - qty,
// floored at 1) but works in demo mode without touching the view.
export function deriveReorderList(items) {
  return items
    .filter((i) => i.status !== 'ok')
    .map((i) => ({
      id: i.id,
      sku: i.sku,
      item_type: i.item_type,
      category: i.category,
      name: i.name,
      brand: i.brand,
      model: i.model,
      qty: i.qty,
      threshold: i.threshold,
      location_text: i.location_text,
      metadata: i.metadata,
      best_price: i.best_price ?? null,
      best_vendor: i.best_vendor ?? null,
      best_url: i.best_url ?? null,
      suggested_qty: Math.max(i.threshold - i.qty, 1),
      status: i.status, // 'out' or 'low'
    }))
    .sort((a, b) => {
      // OUT first, then by type, then by name — same order as the SQL view.
      const pa = a.status === 'out' ? 0 : 1;
      const pb = b.status === 'out' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const t = (a.item_type ?? '').localeCompare(b.item_type ?? '');
      if (t !== 0) return t;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
}

// Full activity history with optional date-range + free-text search.
// Used by the /activity page. Search matches item name / sku / staff
// label / note. Date range follows the same half-open [from, to)
// semantics as getSpendReport.
//
// Returns the rows already joined to their item (so the page can render
// name + sku without a second round-trip). Cap at 500 to keep the page
// responsive — a real-world stockroom won't hit that in a typical
// filter window.
export async function getActivity({ from = null, to = null, search = '', limit = 500 } = {}) {
  const fromIso = from instanceof Date ? from.toISOString() : from;
  const toIso   = to   instanceof Date ? to.toISOString()   : to;

  let q = supabase
    .from('transactions')
    .select('id, item_id, direction, qty, staff_label, note, occurred_at, unit_cost_snapshot, vendor_snapshot, building_id')
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (fromIso) q = q.gte('occurred_at', fromIso);
  if (toIso)   q = q.lt('occurred_at',  toIso);
  const txnRes = await q;
  if (txnRes.error) throw txnRes.error;
  const txns = txnRes.data ?? [];

  const itemIds     = [...new Set(txns.map((t) => t.item_id).filter(Boolean))];
  const buildingIds = [...new Set(txns.map((t) => t.building_id).filter(Boolean))];

  const itemsById     = new Map();
  const buildingsById = new Map();

  await Promise.all([
    itemIds.length > 0 ? supabase
      .from('items')
      .select('id, sku, name, brand')
      .in('id', itemIds)
      .then((res) => { for (const it of res.data ?? []) itemsById.set(it.id, it); })
      : Promise.resolve(),
    buildingIds.length > 0 ? supabase
      .from('buildings')
      .select('id, number, name')
      .in('id', buildingIds)
      .then((res) => { for (const b of res.data ?? []) buildingsById.set(b.id, b); })
      : Promise.resolve(),
  ]);

  const enriched = txns.map((t) => ({
    ...t,
    items: itemsById.get(t.item_id) ?? null,
    building: t.building_id ? buildingsById.get(t.building_id) ?? null : null,
  }));

  const s = (search ?? '').trim().toLowerCase();
  if (!s) return enriched;
  return enriched.filter((t) =>
    (t.items?.name ?? '').toLowerCase().includes(s) ||
    (t.items?.sku ?? '').toLowerCase().includes(s) ||
    (t.staff_label ?? '').toLowerCase().includes(s) ||
    (t.note ?? '').toLowerCase().includes(s) ||
    (t.vendor_snapshot ?? '').toLowerCase().includes(s) ||
    (t.building?.name ?? '').toLowerCase().includes(s),
  );
}

export async function getRecentActivity(limit = 25) {
  // Three parallel queries + a client-side join. We avoid PostgREST's
  // embedding syntax so the demo client (and any future read replica
  // without FK metadata) returns identical shapes.
  const [txnRes, itemRes, buildingRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, direction, qty, staff_label, note, occurred_at, item_id, building_id')
      .order('occurred_at', { ascending: false })
      .limit(limit),
    supabase.from('items').select('id, name, sku'),
    supabase.from('buildings').select('id, number, name').then((r) => r).catch(() => ({ data: [], error: null })),
  ]);
  if (txnRes.error) throw txnRes.error;
  if (itemRes.error) throw itemRes.error;
  const byId  = new Map((itemRes.data ?? []).map((i) => [i.id, i]));
  const bById = new Map((buildingRes.data ?? []).map((b) => [b.id, b]));
  return (txnRes.data ?? []).map((t) => ({
    ...t,
    items: byId.get(t.item_id) ?? null,
    building: t.building_id ? bById.get(t.building_id) ?? null : null,
  }));
}

// Period spend / savings rollup. Driven by the snapshot columns on
// `transactions` (captured client-side at scan time, persisted on the
// queue entry across offline reconnects). Math is done client-side
// because: dataset is small, lets us add a new tile per release without
// migrations, and keeps every report definition in one file.
//
// from / to are ISO strings or Date objects. The range is half-open
// [from, to) so adjacent periods don't double-count.
//
// Returns:
//   {
//     spent,                  // sum of qty * unit_cost_snapshot, OUT minus IN, floored at 0
//     saved,                  // sum of qty * (max - unit_cost) on OUT rows
//     avgDrift,               // mean of (current_best - last_snap) / last_snap across items with ≥2 quotes
//     missingPricingCount,    // OUT transactions in the period that lacked a snapshot
//     byCategory: [{ category, spent, saved }],
//     topVendors: [{ vendor, count, spent }],   // descending by spent, top 5
//   }
export async function getSpendReport({ from, to } = {}) {
  const fromIso = from instanceof Date ? from.toISOString() : from;
  const toIso   = to   instanceof Date ? to.toISOString()   : to;

  // 1. Period transactions. We pull EVERY field we need so the math
  //    stays in one place.
  let q = supabase
    .from('transactions')
    .select('id, item_id, direction, qty, occurred_at, unit_cost_snapshot, max_price_snapshot, vendor_snapshot, building_id');
  if (fromIso) q = q.gte('occurred_at', fromIso);
  if (toIso)   q = q.lt('occurred_at',  toIso);
  const txnRes = await q;
  if (txnRes.error) throw txnRes.error;
  const txns = txnRes.data ?? [];

  // 2. Items referenced by those transactions — needed for the category
  //    split. One batched lookup so we don't do N+1.
  const itemIds = [...new Set(txns.map((t) => t.item_id).filter(Boolean))];
  let itemsById = new Map();
  if (itemIds.length > 0) {
    const itRes = await supabase
      .from('items')
      .select('id, category, item_type')
      .in('id', itemIds);
    if (itRes.error) throw itRes.error;
    itemsById = new Map((itRes.data ?? []).map((i) => [i.id, i]));
  }

  // 3. Drift: per-item current best vs. most-recent snapshot. We pull
  //    items_with_best_price (the view from PR A) for items with ≥2
  //    quotes and look up each one's last unit_cost_snapshot from the
  //    transaction history. Capped at 200 items to keep this cheap.
  const bpRes = await supabase
    .from('items_with_best_price')
    .select('id, best_price, quote_count')
    .gte('quote_count', 2)
    .not('best_price', 'is', null);
  if (bpRes.error) throw bpRes.error;
  const driftCandidates = (bpRes.data ?? []).slice(0, 200);

  let driftSum = 0;
  let driftN = 0;
  if (driftCandidates.length > 0) {
    const lastSnapRes = await supabase
      .from('transactions')
      .select('item_id, unit_cost_snapshot, occurred_at')
      .in('item_id', driftCandidates.map((d) => d.id))
      .not('unit_cost_snapshot', 'is', null)
      .order('occurred_at', { ascending: false });
    if (lastSnapRes.error) throw lastSnapRes.error;
    const lastSnap = new Map();
    for (const r of lastSnapRes.data ?? []) {
      if (!lastSnap.has(r.item_id)) lastSnap.set(r.item_id, Number(r.unit_cost_snapshot));
    }
    for (const d of driftCandidates) {
      const prev = lastSnap.get(d.id);
      if (prev == null || prev === 0) continue;
      driftSum += (Number(d.best_price) - prev) / prev;
      driftN  += 1;
    }
  }

  // 4. Buildings referenced by these transactions — needed for the
  //    by-building rollup label. Same defensive batched lookup.
  const buildingIds = [...new Set(txns.map((t) => t.building_id).filter(Boolean))];
  let buildingsById = new Map();
  if (buildingIds.length > 0) {
    const bRes = await supabase
      .from('buildings')
      .select('id, number, name')
      .in('id', buildingIds);
    if (bRes.error) throw bRes.error;
    buildingsById = new Map((bRes.data ?? []).map((b) => [b.id, b]));
  }

  // 5. Spend + savings + per-category + per-vendor + per-building rollup.
  let spent = 0;
  let saved = 0;
  let missingPricingCount = 0;
  const byCategory = new Map();
  const byVendor   = new Map();
  const byBuilding = new Map();

  for (const t of txns) {
    const cost = t.unit_cost_snapshot == null ? null : Number(t.unit_cost_snapshot);
    const max  = t.max_price_snapshot == null ? null : Number(t.max_price_snapshot);
    const qty  = Number(t.qty) || 0;

    if (cost == null) {
      if (t.direction === 'out') missingPricingCount += 1;
      continue;
    }

    if (t.direction === 'out') spent += qty * cost;
    if (t.direction === 'in')  spent -= qty * cost;

    if (t.direction === 'out' && max != null) {
      saved += qty * (max - cost);
    }

    const cat = itemsById.get(t.item_id)?.category ?? 'Uncategorized';
    const cSlot = byCategory.get(cat) ?? { category: cat, spent: 0, saved: 0 };
    if (t.direction === 'out') {
      cSlot.spent += qty * cost;
      if (max != null) cSlot.saved += qty * (max - cost);
    } else {
      cSlot.spent -= qty * cost;
    }
    byCategory.set(cat, cSlot);

    if (t.direction === 'out' && t.vendor_snapshot) {
      const v = t.vendor_snapshot;
      const vSlot = byVendor.get(v) ?? { vendor: v, count: 0, spent: 0 };
      vSlot.count += 1;
      vSlot.spent += qty * cost;
      byVendor.set(v, vSlot);
    }

    if (t.direction === 'out' && t.building_id) {
      const b = buildingsById.get(t.building_id);
      const label = b ? `${b.number}. ${b.name}` : 'Unknown building';
      const bSlot = byBuilding.get(t.building_id) ?? { id: t.building_id, label, count: 0, spent: 0 };
      bSlot.count += 1;
      bSlot.spent += qty * cost;
      byBuilding.set(t.building_id, bSlot);
    }
  }

  spent = Math.max(spent, 0);
  for (const c of byCategory.values()) c.spent = Math.max(c.spent, 0);

  return {
    spent,
    saved,
    avgDrift: driftN > 0 ? driftSum / driftN : null,
    missingPricingCount,
    byCategory: [...byCategory.values()]
      .filter((c) => c.spent > 0 || c.saved > 0)
      .sort((a, b) => b.spent - a.spent),
    topVendors: [...byVendor.values()].sort((a, b) => b.spent - a.spent).slice(0, 5),
    byBuilding: [...byBuilding.values()].sort((a, b) => b.spent - a.spent),
  };
}

// Preset date ranges for the Reports page picker. Returns half-open
// [from, to) so callers don't have to worry about timezone edge cases at
// the day boundary.
export const REPORT_PRESETS = [
  { key: 'this-month',    label: 'This month' },
  { key: 'last-30-days',  label: 'Last 30 days' },
  { key: 'last-quarter',  label: 'Last quarter' },
  { key: 'ytd',           label: 'Year to date' },
  { key: 'all-time',      label: 'All time' },
];

export function rangeForPreset(key, now = new Date()) {
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const end = new Date(now); // exclusive upper bound = "now"
  switch (key) {
    case 'this-month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: startOfDay(from), to: end };
    }
    case 'last-30-days': {
      const from = new Date(now);
      from.setDate(from.getDate() - 30);
      return { from: startOfDay(from), to: end };
    }
    case 'last-quarter': {
      const from = new Date(now);
      from.setMonth(from.getMonth() - 3);
      return { from: startOfDay(from), to: end };
    }
    case 'ytd': {
      const from = new Date(now.getFullYear(), 0, 1);
      return { from: startOfDay(from), to: end };
    }
    case 'all-time':
    default:
      return { from: null, to: null };
  }
}

// CSV export of the reorder list. Given a list of items from the
// inventory snapshot, emits a paste-into-PO-grade CSV string with one
// row per non-OK item. Includes best-price columns when the new
// item_prices data is present.
export function reorderToCsv(items) {
  const reorder = deriveReorderList(items);
  const headers = [
    'SKU', 'Name', 'Brand', 'Model', 'Type', 'Category', 'Location',
    'On Hand', 'Threshold', 'Suggested Qty', 'Status',
    'Best Vendor', 'Best Price', 'Best URL',
  ];
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = reorder.map((i) => [
    i.sku, i.name, i.brand, i.model, i.item_type, i.category, i.location_text,
    i.qty, i.threshold, i.suggested_qty, i.status,
    i.best_vendor ?? '',
    i.best_price != null ? Number(i.best_price).toFixed(2) : '',
    i.best_url ?? '',
  ]);
  return [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n') + '\n';
}

// Trigger a browser download of the given CSV content. Lives here (not
// in the page) so the page stays presentational and other reports can
// reuse it later.
export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function summarize(items) {
  const total = items.length;
  let out = 0, low = 0, ok = 0;
  const byType = new Map();
  for (const it of items) {
    if (it.status === 'out')      out += 1;
    else if (it.status === 'low') low += 1;
    else                          ok  += 1;
    const slot = byType.get(it.item_type) ?? { type: it.item_type, count: 0, qty: 0, out: 0, low: 0 };
    slot.count += 1;
    slot.qty   += it.qty ?? 0;
    if (it.status === 'out') slot.out += 1;
    if (it.status === 'low') slot.low += 1;
    byType.set(it.item_type, slot);
  }
  return {
    total,
    out,
    low,
    ok,
    byType: [...byType.values()].sort((a, b) => a.type.localeCompare(b.type)),
  };
}
