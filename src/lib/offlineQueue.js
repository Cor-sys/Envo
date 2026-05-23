// IndexedDB-backed write queue for stock movements (BRIEF §8.3).
//
// Why this file exists:
//   Stockrooms have dead zones. A staffer scanning in the back room may have
//   no signal for minutes at a time. We want their scans to feel instant and
//   never get lost — so when the network is down (or a call fails), we queue
//   the movement locally and drain when connectivity returns.
//
// Safety:
//   Every queued entry carries a client-generated `idempotency_key` that the
//   `record_movement` RPC dedupes on. A flaky network that succeeds on the
//   server but loses the response will *not* double-charge — the next drain
//   retries with the same key and the server returns the original row.
//
// Storage:
//   IndexedDB (not localStorage) so the queue survives storage pressure on
//   iOS Safari and never silently truncates large payloads.

const DB_NAME = 'stockroom';
const DB_VERSION = 1;
const STORE = 'pending_movements';

let dbPromise = null;
const listeners = new Set();

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode) {
  return openDb().then(db => db.transaction(STORE, mode).objectStore(STORE));
}

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function notify() {
  for (const cb of listeners) {
    try { cb(); } catch { /* swallow */ }
  }
}

export function subscribeQueue(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function getPendingCount() {
  const store = await tx('readonly');
  return req(store.count());
}

export async function getPending() {
  const store = await tx('readonly');
  return req(store.getAll());
}

// Snapshot fields (unitCostSnapshot / maxPriceSnapshot / vendorSnapshot)
// are captured at scan time by the caller and persisted on the queue
// entry — so a queued movement that drains hours later still records
// the price the staffer saw, not the price as of the drain. Critical
// for offline correctness of historical spend reports.
//
// Legacy queue entries (enqueued before snapshot capture shipped) won't
// have these fields; the drain treats undefined as null and lands the
// transaction with NULL snapshots, which the Reports rollups exclude.
export async function enqueueMovement({
  itemId, direction, qty, note = null, idempotencyKey,
  unitCostSnapshot = null, maxPriceSnapshot = null, vendorSnapshot = null,
  buildingId = null,
}) {
  const entry = {
    idempotencyKey,
    itemId,
    direction,
    qty,
    note,
    unitCostSnapshot,
    maxPriceSnapshot,
    vendorSnapshot,
    buildingId,
    enqueuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  };
  const store = await tx('readwrite');
  const id = await req(store.add(entry));
  notify();
  return { id, ...entry };
}

async function removeEntry(id) {
  const store = await tx('readwrite');
  await req(store.delete(id));
}

async function bumpAttempt(id, errMsg) {
  const store = await tx('readwrite');
  const entry = await req(store.get(id));
  if (!entry) return;
  entry.attempts = (entry.attempts ?? 0) + 1;
  entry.lastError = errMsg;
  await req(store.put(entry));
}

let draining = false;

// Drain all pending entries against the live RPC. Returns counts so callers
// can show a "synced 3" toast. Safe to call concurrently — only one drain
// runs at a time; the others return immediately.
export async function drainQueue(supabase) {
  if (draining) return { skipped: true };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { skipped: true, offline: true };
  }
  draining = true;
  let ok = 0;
  let failed = 0;
  try {
    const pending = await getPending();
    for (const entry of pending) {
      try {
        const { error } = await supabase.rpc('record_movement', {
          p_item_id: entry.itemId,
          p_direction: entry.direction,
          p_qty: entry.qty,
          p_note: entry.note,
          p_idempotency_key: entry.idempotencyKey,
          p_unit_cost_snapshot: entry.unitCostSnapshot ?? null,
          p_max_price_snapshot: entry.maxPriceSnapshot ?? null,
          p_vendor_snapshot:    entry.vendorSnapshot   ?? null,
          p_building_id:        entry.buildingId       ?? null,
        });
        if (error) throw error;
        await removeEntry(entry.id);
        ok += 1;
      } catch (e) {
        await bumpAttempt(entry.id, e?.message ?? String(e));
        failed += 1;
        // Stop on first failure to avoid hammering a flaky network. Next
        // drain (online event or manual) will pick up where we left off.
        break;
      }
    }
  } finally {
    draining = false;
    notify();
  }
  return { ok, failed };
}

// Install once at app boot: drain on connectivity return, and on a periodic
// fallback in case the `online` event misses (some mobile networks transition
// without firing it).
let installed = false;
export function installQueueDrainer(supabase) {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const tick = () => { drainQueue(supabase); };
  window.addEventListener('online', tick);
  // Best-effort: try once at boot in case there's a leftover from a prior
  // session, then every 60s while the tab is open.
  tick();
  setInterval(tick, 60_000);
}
