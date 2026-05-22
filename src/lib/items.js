import { supabase } from './supabase.js';
import { enqueueMovement } from './offlineQueue.js';

// Item types are first-class top-level groupings. Adding a new one is a
// zero-migration change: pick a new value and the database accepts it.
export const ITEM_TYPES = [
  { value: 'light_bulb', label: 'Light bulb' },
  { value: 'tool',       label: 'Tool' },
  { value: 'paint',      label: 'Paint' },
  { value: 'chemical',   label: 'Chemical' },
  { value: 'belt',       label: 'Belt' },
  { value: 'supplies',   label: 'Supplies / other' },
];

// Per-type metadata field hints used by the New/Edit forms. Adding a field
// here is zero-migration too — the values land in items.metadata (jsonb).
export const METADATA_FIELDS_BY_TYPE = {
  light_bulb: [
    { key: 'watts',        label: 'Watts',           placeholder: 'e.g. 32 or ?' },
    { key: 'base',         label: 'Base / fixture',  placeholder: 'e.g. G13, E26' },
    { key: 'lumens',       label: 'Lumens',          type: 'number' },
    { key: 'color_temp_k', label: 'Color temp (K)',  type: 'number', placeholder: '2700, 4000…' },
  ],
  tool: [
    { key: 'serial_number', label: 'Serial number' },
    { key: 'condition',     label: 'Condition',      placeholder: 'good / fair / poor' },
    { key: 'battery_v',     label: 'Battery (V)',    type: 'number' },
  ],
  paint: [
    { key: 'color_code',    label: 'Color code',     placeholder: 'e.g. SW7012' },
    { key: 'sheen',         label: 'Sheen',          placeholder: 'matte / eggshell / semi-gloss / gloss' },
    { key: 'size',          label: 'Size',           placeholder: 'quart / gallon / 5gal' },
  ],
  chemical: [
    { key: 'hazard_class',  label: 'Hazard class',   placeholder: 'flammable / corrosive / toxic' },
    { key: 'size',          label: 'Size',           placeholder: 'e.g. 32oz, 1 gal' },
    { key: 'expires_on',    label: 'Expires on',     type: 'date' },
  ],
  belt: [
    { key: 'length_in',       label: 'Length (in)',   type: 'number' },
    { key: 'profile',         label: 'Profile',       placeholder: 'e.g. 4L, V-belt, timing' },
    { key: 'compatible_with', label: 'Compatible with' },
  ],
  supplies: [],
};

export function itemTypeLabel(value) {
  return ITEM_TYPES.find(t => t.value === value)?.label ?? value;
}

// Status priority for sorting — OUT items first (need attention now),
// LOW second (need attention soon), OK at the bottom (no action).
const STATUS_ORDER = { out: 0, low: 1, ok: 2 };

export async function listItems({ search, itemType } = {}) {
  let q = supabase.from('items_with_best_price').select('*');
  if (itemType) q = q.eq('item_type', itemType);
  const s = (search ?? '').trim();
  if (s) {
    const pat = `%${s}%`;
    q = q.or(
      `name.ilike.${pat},brand.ilike.${pat},model.ilike.${pat},sku.ilike.${pat},barcode.ilike.${pat}`,
    );
  }
  const { data, error } = await q;
  if (error) throw error;
  // Sort attention-first, then alphabetically. Done client-side so the
  // priority logic stays here and not coupled into the view definition.
  return [...data].sort((a, b) => {
    const pa = STATUS_ORDER[a.status] ?? 99;
    const pb = STATUS_ORDER[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    return (a.name ?? '').localeCompare(b.name ?? '');
  });
}

// Items missing a factory UPC barcode — they need a printed QR label so
// staff can scan them in/out.
export async function listItemsNeedingLabel() {
  const { data, error } = await supabase
    .from('items_with_best_price')
    .select('id, sku, name, brand, item_type, category, location_text, metadata')
    .is('barcode', null)
    .order('item_type')
    .order('name');
  if (error) throw error;
  return data;
}

export async function getItem(id) {
  const { data, error } = await supabase
    .from('items_with_best_price')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Look up an item by scanned code. Order matters per BRIEF section 7:
// exact factory UPC match -> exact SKU match. Returns null if neither hits.
export async function lookupItemByCode(code) {
  const trimmed = (code ?? '').trim();
  if (!trimmed) return null;

  const byBarcode = await supabase
    .from('items_with_best_price')
    .select('*')
    .eq('barcode', trimmed)
    .maybeSingle();
  if (byBarcode.error) throw byBarcode.error;
  if (byBarcode.data) return byBarcode.data;

  const bySku = await supabase
    .from('items_with_best_price')
    .select('*')
    .eq('sku', trimmed)
    .maybeSingle();
  if (bySku.error) throw bySku.error;
  return bySku.data ?? null;
}

export async function createItem(values) {
  const { data, error } = await supabase
    .from('items')
    .insert(values)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Update an existing item. Pass partial values — only changed columns
// need to be in the payload.
export async function updateItem(id, values) {
  const { data, error } = await supabase
    .from('items')
    .update(values)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Atomic check-in / check-out. Direction: 'in' | 'out'. Qty must be positive.
//
// Offline-aware: if the device is offline (or the call fails with a network
// error), the movement is queued in IndexedDB and synced when connectivity
// returns. The idempotency_key on the RPC side guards against double-apply
// during retry, so a queued movement is safe to send even if a previous
// attempt's response was lost.
//
// Price snapshots (unitCostSnapshot / maxPriceSnapshot / vendorSnapshot)
// MUST be captured at the call site at the time of scan. The Scan and
// ItemDetail pages read these off the looked-up item (which comes from
// items_with_best_price). Passing them here so they ride through both the
// online path and the offline queue without drift.
//
// Returns one of:
//   { queued: true,  idempotencyKey }  — saved locally, will sync later
//   <transaction row>                  — applied on the server immediately
export async function recordMovement({
  itemId, direction, qty, note = null,
  unitCostSnapshot = null, maxPriceSnapshot = null, vendorSnapshot = null,
}) {
  const idempotencyKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : null;

  const enqueue = () => enqueueMovement({
    itemId, direction, qty, note, idempotencyKey,
    unitCostSnapshot, maxPriceSnapshot, vendorSnapshot,
  });

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (offline) {
    await enqueue();
    return { queued: true, idempotencyKey };
  }

  try {
    const { data, error } = await supabase.rpc('record_movement', {
      p_item_id: itemId,
      p_direction: direction,
      p_qty: qty,
      p_note: note,
      p_idempotency_key: idempotencyKey,
      p_unit_cost_snapshot: unitCostSnapshot,
      p_max_price_snapshot: maxPriceSnapshot,
      p_vendor_snapshot:    vendorSnapshot,
    });
    if (error) throw error;
    return data;
  } catch (e) {
    // Network failure: enqueue and let the drainer retry. Anything with a
    // Postgres error code is a real server-side reject (negative qty, item
    // missing, etc.) and must surface to the caller — those don't get queued.
    const isNetwork =
      !e?.code &&
      /fetch|network|failed to|timeout|offline/i.test(e?.message ?? '');
    if (isNetwork) {
      await enqueue();
      return { queued: true, idempotencyKey };
    }
    throw e;
  }
}

export async function recentTransactions(itemId, limit = 10) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('item_id', itemId)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// IDs of items the current user has touched most recently. The list is
// returned in recency order (most recent first) and deduped — multiple
// scans of the same item only count once.
// The caller joins these IDs against an items list they already have
// (typically the Inventory snapshot) to avoid a second round trip.
export async function getMyRecentItemIds(limit = 8) {
  const sessRes = await supabase.auth.getSession();
  const userId = sessRes.data.session?.user?.id;
  if (!userId) return [];

  const { data: txns, error } = await supabase
    .from('transactions')
    .select('item_id, occurred_at')
    .eq('staff_id', userId)
    .order('occurred_at', { ascending: false })
    .limit(50);
  if (error) throw error;

  const ids = [];
  const seen = new Set();
  for (const t of txns ?? []) {
    if (seen.has(t.item_id)) continue;
    seen.add(t.item_id);
    ids.push(t.item_id);
    if (ids.length >= limit) break;
  }
  return ids;
}
