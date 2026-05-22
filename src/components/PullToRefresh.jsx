import { useRef, useState } from 'react';

// Custom pull-to-refresh wrapper. iOS Safari (PWA mode) doesn't provide a
// native one; Android Chrome's native version doesn't fire inside an SPA
// route, so we own this ourselves to keep behavior consistent.
//
// Trigger threshold: drag down ~70px from the top of the scroll container
// before releasing. The visual indicator follows the drag with a damping
// factor so the page doesn't feel like it's being yanked.

const PULL_THRESHOLD = 70;
const DAMPING = 0.5;

export default function PullToRefresh({ onRefresh, children }) {
  const startY = useRef(null);
  const [pull, setPull] = useState(0);       // current pull distance in px
  const [refreshing, setRefreshing] = useState(false);

  function onTouchStart(e) {
    if (refreshing) return;
    // Only initiate pull when scrolled to the very top of the page.
    if (window.scrollY > 0) return;
    startY.current = e.touches[0].clientY;
  }

  function onTouchMove(e) {
    if (startY.current === null || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) return;
    // Damp the visible offset so a 200px finger drag shows as 100px of pull.
    setPull(delta * DAMPING);
  }

  async function onTouchEnd() {
    if (startY.current === null) return;
    startY.current = null;
    if (pull >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true);
      try {
        await onRefresh?.();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  }

  const indicatorOpacity = Math.min(1, pull / PULL_THRESHOLD);
  const indicatorRotate  = Math.min(180, (pull / PULL_THRESHOLD) * 180);
  const triggered = pull >= PULL_THRESHOLD;

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ touchAction: 'pan-y' }}
    >
      {/* Pull indicator: fixed at the very top of the viewport so it doesn't
          shove the page content down (which would feel laggy). */}
      <div
        className="pointer-events-none flex items-center justify-center"
        style={{
          height: pull || refreshing ? `${refreshing ? PULL_THRESHOLD : pull}px` : 0,
          transition: refreshing || pull === 0 ? 'height 200ms ease' : 'none',
        }}
      >
        <div
          className="text-orange-400 text-xs flex items-center gap-2"
          style={{ opacity: refreshing ? 1 : indicatorOpacity }}
        >
          {refreshing ? (
            <>
              <span className="inline-block h-3 w-3 rounded-full border-2 border-orange-400 border-t-transparent animate-spin" />
              <span>Refreshing…</span>
            </>
          ) : (
            <>
              <span
                className="inline-block transition-transform"
                style={{ transform: `rotate(${indicatorRotate}deg)` }}
              >
                ↓
              </span>
              <span>{triggered ? 'Release to refresh' : 'Pull to refresh'}</span>
            </>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
