import { useEffect, useRef, type RefObject } from 'react';

/** Horizontal travel (px) past which releasing commits the swipe. */
const COMMIT = 96;

interface SwipeHandlers {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}

/**
 * Horizontal swipe on a card. Engages only when the gesture is clearly
 * sideways, so vertical scrolling (the card has `touch-action: pan-y`) and
 * taps are untouched. Writes `--swipe-x` and `data-swipe` on `ref`.
 * Returns a ref that is true right after a swipe, to swallow the click.
 */
export function useSwipe(ref: RefObject<HTMLElement | null>, handlers: SwipeHandlers): RefObject<boolean> {
  const justSwiped = useRef(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let tracking = false;
    let swiping = false;
    let startX = 0;
    let startY = 0;
    let dx = 0;

    const set = (x: number, animate: boolean) => {
      el.classList.toggle('swipe-animating', animate);
      el.style.setProperty('--swipe-x', `${x}px`);
      el.dataset.swipe = x < -COMMIT ? 'left-armed' : x < 0 ? 'left' : x > COMMIT ? 'right-armed' : x > 0 ? 'right' : '';
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      tracking = true;
      swiping = false;
      dx = 0;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const mx = e.touches[0].clientX - startX;
      const my = e.touches[0].clientY - startY;
      if (!swiping) {
        if (Math.abs(my) > 10) {
          tracking = false;
          return;
        }
        if (Math.abs(mx) < 12 || Math.abs(mx) < Math.abs(my) * 1.5) return;
        swiping = true;
        startX = e.touches[0].clientX;
      }
      if (e.cancelable) e.preventDefault();
      const raw = e.touches[0].clientX - startX;
      // Past the commit point the card lags behind the finger.
      dx = Math.abs(raw) > COMMIT ? Math.sign(raw) * (COMMIT + (Math.abs(raw) - COMMIT) * 0.35) : raw;
      set(dx, false);
    };

    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (!swiping) return;
      justSwiped.current = true;
      setTimeout(() => {
        justSwiped.current = false;
      }, 400);
      const committed = Math.abs(dx) >= COMMIT ? Math.sign(dx) : 0;
      set(0, true);
      if (committed < 0) handlersRef.current.onSwipeLeft();
      if (committed > 0) handlersRef.current.onSwipeRight();
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    // The system took the touch (call, notification): snap back, do nothing.
    const onCancel = () => {
      tracking = false;
      if (swiping) set(0, true);
      swiping = false;
    };

    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onCancel);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };
  }, [ref]);

  return justSwiped;
}
