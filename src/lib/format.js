// Human-friendly date / time helpers. Centralised so the entire app reads
// dates the same way and we can tune the thresholds in one place.

const MIN_MS  = 60_000;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS  = 24 * HOUR_MS;

// "2h ago" / "yesterday" / "Mar 14" / "Aug 14, 2024" — chosen so a glance
// at an activity feed conveys recency without having to parse a long
// datetime. Crosses thresholds as follows:
//
//   < 45s              "just now"
//   < 60m              "Xm ago"
//   < 24h              "Xh ago"
//   < 48h              "yesterday"
//   < 7 days           weekday name ("Mon", "Tue", …)
//   same calendar year "Mar 14"
//   prior year         "Aug 14, 2024"
//
// Pass an ISO string, a Date, or null. Returns "" for null/undefined/invalid
// so callers can render the result without guarding.
export function formatRelative(input, now = Date.now()) {
  if (!input) return '';
  const t = typeof input === 'string' || typeof input === 'number'
    ? new Date(input).getTime()
    : input instanceof Date ? input.getTime() : NaN;
  if (!Number.isFinite(t)) return '';

  const diff = now - t;
  if (diff < 45_000)  return 'just now';
  if (diff < HOUR_MS) return `${Math.round(diff / MIN_MS)}m ago`;
  if (diff < DAY_MS)  return `${Math.round(diff / HOUR_MS)}h ago`;
  if (diff < 2 * DAY_MS) return 'yesterday';

  const then = new Date(t);
  if (diff < 7 * DAY_MS) {
    return then.toLocaleDateString(undefined, { weekday: 'short' });
  }

  const sameYear = new Date(now).getFullYear() === then.getFullYear();
  return then.toLocaleDateString(undefined, sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' }
  );
}

// Verbose form used on hover/title attributes — full datetime in the
// user's locale so power users can still get the precise moment.
export function formatAbsolute(input) {
  if (!input) return '';
  const d = typeof input === 'string' || typeof input === 'number'
    ? new Date(input) : input;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}
