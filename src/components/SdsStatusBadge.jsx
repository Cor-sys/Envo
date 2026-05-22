// SDS readiness badge. Maps the lib/sds.js status values to color + label.
//
//   uploaded ✓  we have the PDF on file (best)
//   linked   🔗 external URL set (good — manufacturer-hosted)
//   hint     ?  only a web-search hint (needs follow-up)
//   missing  ⚠  nothing on file (compliance gap)

export default function SdsStatusBadge({ status, size = 'sm' }) {
  const cls = size === 'lg' ? 'text-xs px-2 py-0.5' : 'text-[10px] px-1.5 py-0.5';
  if (status === 'uploaded') {
    return <span className={`pill bg-emerald-500/15 text-emerald-300 ${cls}`}>✓ on file</span>;
  }
  if (status === 'linked') {
    return <span className={`pill bg-sky-500/15 text-sky-300 ${cls}`}>🔗 linked</span>;
  }
  if (status === 'hint') {
    return <span className={`pill bg-amber-500/15 text-amber-300 ${cls}`}>? unverified</span>;
  }
  return <span className={`pill bg-red-500/15 text-red-300 ${cls}`}>⚠ missing</span>;
}
