import { useEffect, useState } from 'react';
import { drainQueue, getPendingCount, subscribeQueue } from '../lib/offlineQueue.js';
import { supabase } from '../lib/supabase.js';

// Small header indicator: shows when offline movements are sitting in the
// local queue waiting to sync. Tap it to force a drain.
export default function PendingBadge() {
  const [count, setCount] = useState(0);
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    let cancelled = false;
    function refresh() {
      getPendingCount().then((n) => { if (!cancelled) setCount(n); }).catch(() => {});
    }
    refresh();
    const unsub = subscribeQueue(refresh);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      cancelled = true;
      unsub();
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (count === 0 && online) return null;

  if (count === 0 && !online) {
    return (
      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">
        offline
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => drainQueue(supabase)}
      title={online ? 'Tap to retry sync' : 'Will sync when back online'}
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
        online ? 'bg-amber-500/20 text-amber-200' : 'bg-slate-800 text-slate-300'
      }`}
    >
      {count} pending{!online ? ' · offline' : ''}
    </button>
  );
}
