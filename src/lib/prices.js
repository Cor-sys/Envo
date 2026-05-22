import { supabase } from './supabase.js';

// Per-item vendor price quotes. Backed by the `item_prices` table.
// See COST-TRACKING-PLAN.md for design notes (admin-only writes, USD only
// in v1, NULL price = "URL on file, price unknown").

// Soft cap on quote count enforced in the UI only — schema lets you have
// more. Five is enough for any small business to comparison-shop without
// drowning in vendor rows.
export const MAX_QUOTES = 5;

// Shape returned everywhere:
//   { id, item_id, vendor, price, url, currency, note, position,
//     created_at, updated_at }

export async function listPricesForItem(itemId) {
  const { data, error } = await supabase
    .from('item_prices')
    .select('*')
    .eq('item_id', itemId)
    .order('position', { ascending: true })
    .order('vendor', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Insert or update by id. The unique (item_id, lower(vendor)) constraint
// surfaces a duplicate-vendor attempt as a Postgres unique_violation; the
// caller catches it and renders an inline error next to the offending row.
export async function upsertPrice({ id, itemId, vendor, price, url, note, position }) {
  const trimmedVendor = (vendor ?? '').trim();
  if (!trimmedVendor) throw new Error('Vendor is required.');
  if (price != null && price !== '' && Number(price) < 0) {
    throw new Error('Price must be 0 or more.');
  }
  const row = {
    item_id: itemId,
    vendor:  trimmedVendor,
    price:   price === '' || price == null ? null : Number(price),
    url:     (url ?? '').trim() || null,
    note:    (note ?? '').trim() || null,
    position: position ?? 0,
  };
  if (id) {
    const { data, error } = await supabase
      .from('item_prices')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from('item_prices')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePrice(id) {
  const { error } = await supabase
    .from('item_prices')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// One-shot "what's the best price right now" read against the
// items_with_best_price view. Use sparingly — most call sites already
// have these fields loaded on the item.
export async function getBestPrice(itemId) {
  const { data, error } = await supabase
    .from('items_with_best_price')
    .select('best_price, best_vendor, best_url, max_price, quote_count')
    .eq('id', itemId)
    .maybeSingle();
  if (error) throw error;
  return data ?? { best_price: null, best_vendor: null, best_url: null, max_price: null, quote_count: 0 };
}

// Pure-JS derivation when prices are already loaded (e.g. inside the
// EditItem form's local state while the user is editing). Mirrors the
// view's SQL: best = cheapest among quotes that have both price + url.
export function deriveBestPrice(prices) {
  const all = prices ?? [];
  const actionable = all.filter(p => p.price != null && p.url);
  const priced = all.filter(p => p.price != null);
  const max = priced.length > 0 ? Math.max(...priced.map(p => Number(p.price))) : null;
  if (actionable.length === 0) {
    return { bestPrice: null, bestVendor: null, bestUrl: null, maxPrice: max, quoteCount: all.length };
  }
  const sorted = [...actionable].sort((a, b) => Number(a.price) - Number(b.price));
  return {
    bestPrice:  Number(sorted[0].price),
    bestVendor: sorted[0].vendor,
    bestUrl:    sorted[0].url,
    maxPrice:   max,
    quoteCount: all.length,
  };
}

// Diff the editor's working list against the originals from the DB and
// apply the smallest possible set of inserts / updates / deletes. Returns
// the persisted rows (matching the order of `nextRows`).
//
// `nextRows` and `originalRows` are arrays of the same row shape (id may
// be absent on new rows). Rows compared by `id`. Field comparison is
// shallow — if any of vendor/price/url/note/position changed, we update.
export async function savePrices({ itemId, nextRows, originalRows }) {
  const origById = new Map((originalRows ?? []).filter(r => r.id).map(r => [r.id, r]));
  const nextIds  = new Set(nextRows.filter(r => r.id).map(r => r.id));

  // Deletes first so a re-added vendor of the same name doesn't trip the
  // unique-on-(item_id, lower(vendor)) constraint when we then insert.
  for (const orig of (originalRows ?? [])) {
    if (orig.id && !nextIds.has(orig.id)) {
      await deletePrice(orig.id);
    }
  }

  const out = [];
  for (let i = 0; i < nextRows.length; i++) {
    const r = nextRows[i];
    const position = i;
    if (r.id) {
      const prev = origById.get(r.id);
      const changed = !prev
        || prev.vendor !== r.vendor
        || prev.price  !== r.price
        || prev.url    !== r.url
        || prev.note   !== r.note
        || prev.position !== position;
      if (changed) {
        const saved = await upsertPrice({ id: r.id, itemId, ...r, position });
        out.push(saved);
      } else {
        out.push(prev);
      }
    } else {
      const saved = await upsertPrice({ itemId, ...r, position });
      out.push(saved);
    }
  }
  return out;
}

// Friendly money formatter — USD only in v1.
export function formatMoney(amount) {
  if (amount == null || amount === '') return '';
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}
