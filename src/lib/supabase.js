import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anon);

// Export `null` when env vars are missing so the app shell can render a
// friendly setup screen instead of crashing on import.
export const supabase = isConfigured ? createClient(url, anon) : null;

// Atomic check-in / check-out — see db/schema.sql::record_movement.
// Direction: 'in' | 'out'. Qty must be a positive integer.
export async function recordMovement({ itemId, direction, qty, note = null }) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.rpc('record_movement', {
    p_item_id: itemId,
    p_direction: direction,
    p_qty: qty,
    p_note: note,
  });
  if (error) throw error;
  return data;
}
