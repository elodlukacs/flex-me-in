import { useEffect, useRef, useState, type RefObject } from 'react';

/** Visible pull distance (px) at which releasing triggers a refresh. */
export const PULL_THRESHOLD = 64;
const MAX_PULL = 140;
const HOLD = 52;
const HOLD_MS = 700;

/** Rubber band: follows the finger at first, then stiffens toward MAX_PULL. */
function resist(dy: number): number {
  return MAX_PULL * (1 - Math.exp(-dy / 200));
}

export type PullPhase = 'idle' | 'pulling' | 'armed' | 'refreshing';

/**
 * Hand-rolled pull-to-refresh on the window scroller. Only engages when the
 * page is scrolled to the very top and the finger moves mostly downward;
 * anything else is left to native scrolling. The distance is written to the
 * `--pull` CSS variable on `ref` (no React render per touchmove).
 */
export function usePullToRefresh(
  ref: RefObject<HTMLElement | null>,
  onRefresh: () => void,
  disabled = false,
): PullPhase {
  const [phase, setPhase] = useState<PullPhase>('idle');
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;

    let tracking = false;
    let pulling = false;
    let startX = 0;
    let startY = 0;
    let distance = 0;
    let current: PullPhase = 'idle';
    let holdTimer: ReturnType<typeof setTimeout> | null = null;

    const setPull = (px: number, animate: boolean) => {
      el.classList.toggle('ptr-animating', animate);
      el.style.setProperty('--pull', `${px}px`);
      el.style.setProperty('--pull-progress', String(Math.min(px / PULL_THRESHOLD, 1)));
    };
    const go = (next: PullPhase) => {
      if (next !== current) {
        current = next;
        setPhase(next);
      }
    };

    const onStart = (e: TouchEvent) => {
      if (current === 'refreshing' || e.touches.length !== 1 || window.scrollY > 0) {
        tracking = false;
        return;
      }
      tracking = true;
      pulling = false;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!pulling) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) {
          tracking = false;
          return;
        }
        pulling = true;
        startY = e.touches[0].clientY;
      }
      if (e.cancelable) e.preventDefault();
      distance = resist(Math.max(0, e.touches[0].clientY - startY));
      setPull(distance, false);
      go(distance >= PULL_THRESHOLD ? 'armed' : 'pulling');
    };

    const onEnd = () => {
      if (!tracking || !pulling) {
        tracking = false;
        return;
      }
      tracking = false;
      pulling = false;
      if (distance >= PULL_THRESHOLD) {
        go('refreshing');
        setPull(HOLD, true);
        onRefreshRef.current();
        holdTimer = setTimeout(() => {
          setPull(0, true);
          go('idle');
        }, HOLD_MS);
      } else {
        setPull(0, true);
        go('idle');
      }
      distance = 0;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      if (holdTimer) clearTimeout(holdTimer);
      setPull(0, false);
    };
  }, [ref, disabled]);

  return phase;
}
