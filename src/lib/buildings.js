import { supabase } from './supabase.js';

// Data access for the Map tab.
//
// All reads are open to authenticated staff (RLS). Writes (notes edits,
// link-add/remove) require admin role; the underlying RLS policy enforces
// that — these helpers don't redo the check client-side.

// Pull every building plus the count of linked items, in one round trip.
// Used by the Map tab to render tap targets + the building list.
export async function listBuildings() {
  const { data, error } = await supabase
    .from('buildings')
    .select('id, number, name, notes, map_x, map_y, building_items(count)')
    .order('number');
  if (error) throw error;
  return (data ?? []).map((b) => ({
    ...b,
    item_count: b.building_items?.[0]?.count ?? 0,
  }));
}

// Fetch a single building with its linked items expanded. Used by the
// detail sheet when a tap target is hit. Items come from the items_with_status
// view so we get the OUT/LOW/OK label for the row.
export async function getBuilding(id) {
  const { data: b, error: bErr } = await supabase
    .from('buildings')
    .select('id, number, name, notes, map_x, map_y, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (bErr) throw bErr;
  if (!b) return null;

  const { data: links, error: lErr } = await supabase
    .from('building_items')
    .select('usage_note, item:items_with_status(id, name, sku, qty, status)')
    .eq('building_id', id);
  if (lErr) throw lErr;

  return {
    ...b,
    items: (links ?? [])
      .map((l) => ({ ...l.item, usage_note: l.usage_note }))
      .filter((i) => i.id) // defensive: drop nulls if an item was soft-deleted
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
  };
}

// Admin-only — RLS will reject for non-admins.
export async function updateBuildingNotes(id, notes) {
  const { error } = await supabase
    .from('buildings')
    .update({ notes })
    .eq('id', id);
  if (error) throw error;
}

export async function updateBuildingPosition(id, mapX, mapY) {
  const { error } = await supabase
    .from('buildings')
    .update({ map_x: mapX, map_y: mapY })
    .eq('id', id);
  if (error) throw error;
}

export async function addBuildingItem(buildingId, itemId, usageNote = null) {
  const { error } = await supabase
    .from('building_items')
    .insert({ building_id: buildingId, item_id: itemId, usage_note: usageNote });
  if (error) throw error;
}

export async function removeBuildingItem(buildingId, itemId) {
  const { error } = await supabase
    .from('building_items')
    .delete()
    .eq('building_id', buildingId)
    .eq('item_id', itemId);
  if (error) throw error;
}
