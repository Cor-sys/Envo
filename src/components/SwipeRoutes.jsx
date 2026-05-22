import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';

// Phone-first horizontal swipe between the bottom-tab routes.
//
// The wrapped <Routes/> sits inside a motion.div whose x-position responds
// to horizontal drag. On release we either spring back (insufficient
// distance) or navigate to the neighbor tab, in which case the page swaps.
//
// The drag is direction-locked: a clearly-vertical gesture passes through
// to native scrolling untouched. Without this, scrolling a long inventory
// list would feel sticky.
//
// `tabOrder` is the prop the AppShell passes in — the order of the bottom
// tabs (left to right). Swiping right moves to the previous tab, left to
// the next; off the ends is a no-op.

const SWIPE_DISTANCE = 80;      // px past which we commit to a navigation
const SWIPE_VELOCITY = 500;     // px/s — fast flick can override distance
const PEEK_PX        = 30;      // how far the page can slide as a tease

export default function SwipeRoutes({ tabOrder, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const x = useMotionValue(0);
  const containerRef = useRef(null);

  // Mild parallax: as you drag, fade the page slightly to suggest a transition.
  const opacity = useTransform(x, [-200, 0, 200], [0.6, 1, 0.6]);

  const idx = tabOrder.indexOf(location.pathname);
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < tabOrder.length - 1;

  // Reset position when the route actually changes — without this, the new
  // page would mount already off-screen.
  useEffect(() => { x.set(0); }, [location.pathname, x]);

  function handleDragEnd(_, info) {
    const { offset, velocity } = info;
    const goPrev = (offset.x > SWIPE_DISTANCE || velocity.x >  SWIPE_VELOCITY) && hasPrev;
    const goNext = (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) && hasNext;
    if (goPrev) {
      navigate(tabOrder[idx - 1]);
    } else if (goNext) {
      navigate(tabOrder[idx + 1]);
    } else {
      animate(x, 0, { type: 'spring', stiffness: 400, damping: 35 });
    }
  }

  return (
    <motion.div
      ref={containerRef}
      style={{ x, opacity, touchAction: 'pan-y' }}
      drag="x"
      dragDirectionLock
      dragElastic={0.15}
      dragConstraints={{
        left:  hasNext ? -PEEK_PX * 4 : 0,
        right: hasPrev ?  PEEK_PX * 4 : 0,
      }}
      onDragEnd={handleDragEnd}
      className="min-h-full"
    >
      {children}
    </motion.div>
  );
}
