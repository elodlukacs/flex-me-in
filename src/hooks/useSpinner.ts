import { useSyncExternalStore } from 'react';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const INTERVAL_MS = 80;

/**
 * One process-wide ticker shared by every spinner. Each fetching chip and the
 * AI panel used to run its own 80 ms interval — up to eight timers, each
 * forcing a separate Ink frame.
 */
let frame = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => {
      frame = (frame + 1) % FRAMES.length;
      listeners.forEach((l) => l());
    }, INTERVAL_MS);
    // A spinner must never be what keeps the process alive on quit.
    timer.unref?.();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const idle = () => () => {};
const getFrame = () => frame;

/** The current spinner glyph; only ticks (and re-renders) while `active`. */
export function useSpinner(active: boolean): string {
  const f = useSyncExternalStore(active ? subscribe : idle, getFrame);
  return FRAMES[f]!;
}
