import { supabase } from './supabase.js';

export const CATEGORIES = [
  'Linear/U-bent fluorescent',
  'Compact fluorescent (CFL)',
  'HID (mercury/metal halide/HPS)',
  'Incandescent / LED / misc',
];

export async function listItems({ search } = {}) {
  let q = supabase.from('items_with_status').select('*').order('name');
  const s = (search ?? '').trim();
  if (s) {
    const pat = `%${s}%`;
    q = q.or(
      `name.ilike.${pat},brand.ilike.${pat},model.ilike.${pat},sku.ilike.${pat},barcode.ilike.${pat}`,
    );
  }
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function getItem(id) {
  const { data, error } = await supabase
    .from('items_with_status')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
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

// Atomic check-in / check-out. Direction: 'in' | 'out'. Qty must be positive.
export async function recordMovement({ itemId, direction, qty, note = null }) {
  const { data, error } = await supabase.rpc('record_movement', {
    p_item_id: itemId,
    p_direction: direction,
    p_qty: qty,
    p_note: note,
  });
  if (error) throw error;
  return data;
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
