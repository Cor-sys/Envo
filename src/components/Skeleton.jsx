// Animated loading placeholders. Drop these in instead of "Loading…" text
// when the user is staring at a blank screen waiting for the first paint
// of a non-trivial layout (Inventory list, Reports tiles).
//
//   <Skeleton className="h-4 w-32" />     // bare bar — basic building block
//   <SkeletonRow />                        // inventory-row shape (thumb + 2 lines)
//   <SkeletonCard />                       // report summary tile shape
//
// The pulse uses Tailwind's animate-pulse so it shares timing/easing with
// any other animations and pauses with prefers-reduced-motion.

export default function Skeleton({ className = '' }) {
  return (
    <div className={`animate-pulse rounded bg-slate-800/70 ${className}`} />
  );
}

// One inventory row: thumb on the left, two text bars on the right.
// Mirrors the real row's dimensions so the page doesn't jump when data
// lands.
export function SkeletonRow() {
  return (
    <div className="surface p-3 flex items-center gap-3">
      <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-3.5 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
      </div>
      <Skeleton className="h-6 w-12 shrink-0" />
    </div>
  );
}

// One reports summary tile. Eyebrow label + big number + tiny caption.
export function SkeletonCard() {
  return (
    <div className="surface p-3 space-y-2">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-7 w-12" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

// A column of N rows — convenience wrapper for full-page list skeletons.
export function SkeletonList({ rows = 6 }) {
  return (
    <ul className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i}><SkeletonRow /></li>
      ))}
    </ul>
  );
}
