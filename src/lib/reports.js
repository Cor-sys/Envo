import { supabase } from './supabase.js';

// Lightweight roll-ups for the Reports screen (BRIEF §10).
//
// We deliberately compute totals client-side from `items_with_status` rather
// than building Postgres views per metric — the dataset is small (hundreds
// of rows at most for a small stockroom), and keeping the math in JS makes
// adding a new breakdown a zero-migration change.

export async function getInventorySnapshot() {
  const { data, error } = await supabase
    .from('items_with_status')
    .select('id, sku, item_type, category, name, brand, qty, threshold, status, location_text, barcode')
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
      qty: i.qty,
      threshold: i.threshold,
      location_text: i.location_text,
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

export async function getRecentActivity(limit = 25) {
  // Two parallel queries + a client-side join. We avoid PostgREST's embedding
  // syntax so the demo client (and any future read replica without FK metadata)
  // returns identical shapes. Item set is small for a small stockroom.
  const [txnRes, itemRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, direction, qty, staff_label, note, occurred_at, item_id')
      .order('occurred_at', { ascending: false })
      .limit(limit),
    supabase.from('items').select('id, name, sku'),
  ]);
  if (txnRes.error) throw txnRes.error;
  if (itemRes.error) throw itemRes.error;
  const byId = new Map((itemRes.data ?? []).map((i) => [i.id, i]));
  return (txnRes.data ?? []).map((t) => ({ ...t, items: byId.get(t.item_id) ?? null }));
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
