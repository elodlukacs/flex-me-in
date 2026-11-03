import { ALL_SOURCES } from '../state/types.js';
import { logError } from '../utils/log.js';
import { readLastRefreshAt, type RefreshRunner } from './runs.js';

/**
 * Background refresh for the long-running server. LinkedIn only offers the
 * past 7 days and most boards only their newest page, so a listing that is
 * never fetched while it is up is lost for good; fetching on a timer is what
 * keeps the database complete between visits to the PWA.
 */

/** How often the scheduler wakes to ask "is a refresh due?". */
const TICK_MS = 5 * 60 * 1000;

/**
 * Due when no refresh ever finished, or the last one (scheduled or manual —
 * a manual refresh resets the clock) is at least `intervalMs` old. An
 * unparseable timestamp counts as never.
 */
export function isRefreshDue(lastRefreshAt: string | undefined, intervalMs: number, now: number): boolean {
  if (!lastRefreshAt) return true;
  const last = Date.parse(lastRefreshAt);
  if (Number.isNaN(last)) return true;
  return now - last >= intervalMs;
}

export interface Scheduler {
  stop(): void;
}

/**
 * Checks every few minutes rather than sleeping a whole interval, so a
 * restart, a sleeping host or a manual refresh never pushes the next run a
 * full interval out. `start` is a no-op while a run is going.
 */
export function startScheduler(refresh: RefreshRunner, intervalMs: number, tickMs: number = TICK_MS): Scheduler {
  const tick = () => {
    try {
      if (isRefreshDue(readLastRefreshAt(), intervalMs, Date.now())) {
        refresh.start(ALL_SOURCES);
      }
    } catch (err) {
      logError('server: scheduled refresh', err);
    }
  };
  // First check shortly after boot, not immediately: let the server settle.
  const first = setTimeout(tick, Math.min(tickMs, 30_000));
  const timer = setInterval(tick, tickMs);
  first.unref();
  timer.unref();
  return {
    stop() {
      clearTimeout(first);
      clearInterval(timer);
    },
  };
}
