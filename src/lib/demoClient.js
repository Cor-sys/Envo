// Demo client — a tiny in-memory mock of the Supabase JS client surface that
// the app actually uses. Lets a frontend dev (no Supabase credentials) clone
// the repo, `npm install`, set `VITE_DEMO_MODE=true` in .env.local, run
// `npm run dev`, and immediately see a styled, working app with realistic
// sample data across every item type.
//
// Mutations stay in memory only — refreshing the page resets everything to
// the seed below. Auth is auto-granted; signing out and back in works for
// visual testing of the login screen.

const fakeUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'demo@stockroom.local',
  user_metadata: { full_name: 'Demo User' },
};
const fakeSession = {
  access_token: 'demo',
  token_type: 'bearer',
  expires_in: 3600,
  user: fakeUser,
};

let currentSession = fakeSession;
let listeners = [];

function fire(event) {
  for (const cb of listeners) {
    try { cb(event, currentSession); } catch { /* swallow */ }
  }
}

// ---------- seed data ----------

let items = [
  {
    id: 'demo-001', sku: 'STK0001',
    item_type: 'light_bulb', category: 'CFL',
    name: 'Triple-tube T/E CFL', brand: 'Philips', model: 'PL-T 26W/830',
    barcode: '046677123456',
    qty: 24, threshold: 6, location_text: 'A1',
    location_id: null, supplier_id: null, image_path: null,
    metadata: { watts: 26, base: 'GX24q-3', lumens: 1800, color_temp_k: 3000 },
    created_at: '2026-04-12T09:00:00Z', updated_at: '2026-04-12T09:00:00Z',
    deleted_at: null,
  },
  {
    id: 'demo-002', sku: 'STK0002',
    item_type: 'light_bulb', category: 'T8 LED',
    name: '4ft T8 LED tube', brand: 'Sylvania', model: 'LEDT8/12G/4FT/F/830',
    barcode: null,                                   // needs label
    qty: 3, threshold: 8, location_text: 'A2',       // LOW
    location_id: null, supplier_id: null, image_path: null,
    metadata: {
      watts: 12, base: 'G13', lumens: 1700, color_temp_k: 3000,
      purchase_url: 'https://www.grainger.com/category/lighting/light-bulbs/linear-fluorescent-tubes',
    },
    created_at: '2026-04-12T09:00:00Z', updated_at: '2026-04-12T09:00:00Z',
    deleted_at: null,
  },
  {
    id: 'demo-003', sku: 'STK0003',
    item_type: 'tool', category: 'Power tools',
    name: 'Cordless drill', brand: 'DeWalt', model: 'DCD771C2',
    barcode: '885911349246',
    qty: 2, threshold: 1, location_text: 'Cabinet B',
    location_id: null, supplier_id: null, image_path: null,
    metadata: { serial_number: 'DCD771-22A', condition: 'good', battery_v: 20 },
    created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-01T09:00:00Z',
    deleted_at: null,
  },
  {
    id: 'demo-004', sku: 'STK0004',
    item_type: 'paint', category: 'Latex interior',
    name: 'Almond eggshell', brand: 'Sherwin-Williams', model: 'SW7012',
    barcode: null,                                   // needs label
    qty: 1, threshold: 2, location_text: 'Shelf C-2', // LOW
    location_id: null, supplier_id: null, image_path: null,
    metadata: { color_code: 'SW7012', sheen: 'eggshell', size: 'quart' },
    created_at: '2026-04-20T09:00:00Z', updated_at: '2026-04-20T09:00:00Z',
    deleted_at: null,
  },
  {
    id: 'demo-005', sku: 'STK0005',
    item_type: 'chemical', category: 'Solvent',
    name: 'Mineral spirits', brand: 'Klean-Strip', model: 'GKSP94005',
    barcode: '050676941005',
    qty: 0, threshold: 2, location_text: 'Cabinet D (vented)', // OUT
    location_id: null, supplier_id: null, image_path: null,
    metadata: {
      hazard_class: 'flammable_liquid', size: '32oz',
      purchase_url: 'https://www.homedepot.com/p/Klean-Strip-1-qt-Mineral-Spirits-Paint-Thinner-QKSP94005/100150921',
    },
    created_at: '2026-02-15T09:00:00Z', updated_at: '2026-05-10T14:30:00Z',
    deleted_at: null,
  },
  {
    id: 'demo-006', sku: 'STK0006',
    item_type: 'belt', category: 'V-belt',
    name: '4L drive belt, 36in', brand: 'Gates', model: '4L360',
    barcode: '037708027534',
    qty: 6, threshold: 3, location_text: 'A3',
    location_id: null, supplier_id: null, image_path: null,
    metadata: { length_in: 36, profile: '4L', compatible_with: 'Carrier AHU' },
    created_at: '2026-03-10T09:00:00Z', updated_at: '2026-03-10T09:00:00Z',
    deleted_at: null,
  },
  {
    id: 'demo-007', sku: 'STK0007',
    item_type: 'supplies', category: 'Fasteners',
    name: '#10-32 machine screws, 1in, zinc', brand: 'Crown Bolt', model: '801206',
    barcode: null,                                   // needs label
    qty: 87, threshold: 50, location_text: 'D4',
    location_id: null, supplier_id: null, image_path: null,
    metadata: {},
    created_at: '2026-04-05T09:00:00Z', updated_at: '2026-04-05T09:00:00Z',
    deleted_at: null,
  },
  {
    id: 'demo-008', sku: 'STK0008',
    item_type: 'light_bulb', category: 'Incandescent / LED / misc',
    name: 'Halogen MR16, 50W, GU5.3', brand: 'GE', model: 'Q50MR16',
    barcode: '043168000284',
    qty: 0, threshold: 3, location_text: 'A1',       // OUT
    location_id: null, supplier_id: null, image_path: null,
    metadata: { watts: 50, base: 'GU5.3', lumens: 900 },
    created_at: '2026-01-20T09:00:00Z', updated_at: '2026-05-12T11:00:00Z',
    deleted_at: null,
  },
];

let transactions = [
  { id: 'demo-txn-1', item_id: 'demo-001', direction: 'in',  qty: 12,
    staff_id: fakeUser.id, staff_label: 'Demo User', note: 'Restock',
    occurred_at: '2026-04-12T09:00:00Z' },
  { id: 'demo-txn-2', item_id: 'demo-001', direction: 'out', qty: 2,
    staff_id: fakeUser.id, staff_label: 'Demo User', note: 'Hallway B fixtures',
    occurred_at: '2026-05-01T13:20:00Z' },
  { id: 'demo-txn-3', item_id: 'demo-005', direction: 'out', qty: 2,
    staff_id: fakeUser.id, staff_label: 'Demo User', note: 'Cleaning brush parts',
    occurred_at: '2026-05-10T14:30:00Z' },
  { id: 'demo-txn-4', item_id: 'demo-008', direction: 'out', qty: 3,
    staff_id: fakeUser.id, staff_label: 'Demo User', note: 'Last 3 — need to reorder',
    occurred_at: '2026-05-12T11:00:00Z' },
];

// ---------- view helpers ----------

function withStatus(it) {
  let status = 'ok';
  if (it.qty <= 0)            status = 'out';
  else if (it.qty <= it.threshold) status = 'low';
  return { ...it, status, needs_label: !it.barcode };
}

function tableRows(table) {
  if (table === 'transactions')     return [...transactions];
  if (table === 'items_with_status') return items.filter(i => !i.deleted_at).map(withStatus);
  if (table === 'items')            return items.filter(i => !i.deleted_at);
  return [];
}

// ---------- query builder mock ----------

function makeBuilder(table) {
  let rows = tableRows(table);
  let limit = null;
  let orderBys = [];   // record but don't fully implement multi-sort
  let pendingUpdate = null;

  const apply = () => {
    // Apply any pending update against the (now filtered) rows. Mutates the
    // backing `items` array so subsequent queries see the change.
    if (pendingUpdate && table === 'items') {
      const targetIds = new Set(rows.map((r) => r.id));
      items = items.map((it) =>
        targetIds.has(it.id) ? { ...it, ...pendingUpdate, updated_at: new Date().toISOString() } : it,
      );
      rows = items.filter((i) => !i.deleted_at && targetIds.has(i.id));
      pendingUpdate = null;
    }
    let r = rows;
    if (orderBys.length) {
      const [{ col, ascending }] = orderBys; // honor first order only — enough for demo
      r = [...r].sort((a, b) => {
        const av = a[col], bv = b[col];
        if (av == null && bv == null) return 0;
        if (av == null) return ascending ? 1 : -1;
        if (bv == null) return ascending ? -1 : 1;
        if (av < bv) return ascending ? -1 : 1;
        if (av > bv) return ascending ? 1 : -1;
        return 0;
      });
    }
    if (limit != null) r = r.slice(0, limit);
    return r;
  };

  const builder = {
    select() { return builder; },
    eq(col, val)   { rows = rows.filter(r => r[col] === val); return builder; },
    is(col, val)   { rows = rows.filter(r => (val === null ? r[col] == null : r[col] === val)); return builder; },
    in(col, vals)  { const s = new Set(vals); rows = rows.filter(r => s.has(r[col])); return builder; },
    or()           { return builder; },  // search ilike — ignored in demo (returns full set)
    order(col, opts = {}) { orderBys.push({ col, ascending: opts.ascending !== false }); return builder; },
    limit(n)       { limit = n; return builder; },
    update(values) {
      // The chained .eq() will narrow `rows` before the terminal call resolves,
      // so we capture the patch and apply it in apply() once the filter is in.
      pendingUpdate = values;
      return builder;
    },
    insert(values) {
      const arr = Array.isArray(values) ? values : [values];
      const created = arr.map((v, i) => ({
        ...v,
        id: 'demo-' + Math.random().toString(36).slice(2, 10),
        sku: 'STK' + String(items.length + i + 1).padStart(4, '0'),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        metadata: v.metadata ?? {},
        location_id: v.location_id ?? null,
        supplier_id: v.supplier_id ?? null,
        image_path: v.image_path ?? null,
      }));
      items = items.concat(created);
      rows = created;
      return builder;
    },
    maybeSingle() { return Promise.resolve({ data: apply()[0] ?? null, error: null }); },
    single()      { return Promise.resolve({ data: apply()[0] ?? null, error: null }); },
    then(resolve, reject) {
      try { resolve({ data: apply(), error: null }); }
      catch (e) { reject && reject(e); }
    },
  };
  return builder;
}

// ---------- storage mock ----------
//
// In-memory blob URLs keyed by storage path. Each upload replaces the prior
// URL at that path and revokes the old one so we don't leak. Persists only
// for the page lifetime — refreshing resets just like the rest of the demo.

const demoPhotoUrls = new Map();

const demoStorage = {
  from(_bucket) {
    return {
      async upload(path, blob) {
        const oldUrl = demoPhotoUrls.get(path);
        if (oldUrl) URL.revokeObjectURL(oldUrl);
        demoPhotoUrls.set(path, URL.createObjectURL(blob));
        return { data: { path }, error: null };
      },
      getPublicUrl(path) {
        return { data: { publicUrl: demoPhotoUrls.get(path) ?? null } };
      },
      async remove(paths) {
        for (const p of paths) {
          const u = demoPhotoUrls.get(p);
          if (u) URL.revokeObjectURL(u);
          demoPhotoUrls.delete(p);
        }
        return { data: paths.map((name) => ({ name })), error: null };
      },
    };
  },
};

// ---------- exported client ----------

export const demoClient = {
  storage: demoStorage,
  auth: {
    async getSession() {
      return { data: { session: currentSession }, error: null };
    },
    onAuthStateChange(cb) {
      listeners.push(cb);
      // Fire current state asynchronously so subscribers see the event after
      // their own state setup, mirroring real Supabase behavior.
      setTimeout(() => cb(currentSession ? 'SIGNED_IN' : 'SIGNED_OUT', currentSession), 0);
      return {
        data: {
          subscription: {
            unsubscribe() {
              listeners = listeners.filter(l => l !== cb);
            },
          },
        },
      };
    },
    async signInWithPassword() {
      currentSession = fakeSession;
      fire('SIGNED_IN');
      return { data: { session: currentSession, user: fakeUser }, error: null };
    },
    async signUp() {
      currentSession = fakeSession;
      fire('SIGNED_IN');
      return { data: { session: currentSession, user: fakeUser }, error: null };
    },
    async signOut() {
      currentSession = null;
      fire('SIGNED_OUT');
      return { error: null };
    },
  },
  from(table) {
    return makeBuilder(table);
  },
  // In demo mode invites + auth aren't wired up — anyone can "sign in" with
  // any credentials and there's no admin role. These stubs keep the new
  // login form working: typing any non-empty username succeeds.
  functions: {
    async invoke(name) {
      return {
        data: null,
        error: new Error(`demo: functions.invoke(${name}) is not supported`),
      };
    },
  },
  async rpc(fn, args) {
    if (fn === 'get_email_for_username') {
      const u = String(args?.p_username ?? '').trim();
      if (!u) return { data: null, error: null };
      // Pretend any username resolves to the demo session's email so the
      // subsequent signInWithPassword auto-accepts.
      return { data: fakeUser.email, error: null };
    }
    if (fn !== 'record_movement') {
      return { data: null, error: new Error('demo: unknown rpc ' + fn) };
    }
    const item = items.find(i => i.id === args.p_item_id && !i.deleted_at);
    if (!item) return { data: null, error: new Error('item not found (or deleted)') };
    const delta = args.p_direction === 'in' ? args.p_qty : -args.p_qty;
    if (item.qty + delta < 0) {
      return { data: null, error: new Error('check-out would drop qty below zero') };
    }
    item.qty += delta;
    item.updated_at = new Date().toISOString();
    const txn = {
      id: 'demo-' + Math.random().toString(36).slice(2, 10),
      item_id: item.id,
      direction: args.p_direction,
      qty: args.p_qty,
      staff_id: fakeUser.id,
      staff_label: fakeUser.user_metadata.full_name,
      note: args.p_note ?? null,
      occurred_at: new Date().toISOString(),
    };
    transactions = [txn, ...transactions];
    return { data: txn, error: null };
  },
};
