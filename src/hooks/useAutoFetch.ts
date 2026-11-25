import { useEffect, useRef } from 'react';
import { useStoreInstance } from '../state/store.js';

export const AUTO_FETCH_INTERVAL_MS = 2 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60_000;
/** First check soon after launch, once useJobLoader has read lastRefreshAt. */
const FIRST_CHECK_MS = 3_000;

/**
 * Due once `intervalMs` has passed since the later of the last finished run
 * (`lastRefreshAt`, persisted, so it spans launches) and the last run started
 * in this session (covers one still in flight or one that never finished).
 * Never fetched at all: due now.
 */
export function isAutoFetchDue(
  now: number,
  lastRefreshAt: string | undefined,
  lastStart: number | undefined,
  intervalMs: number
): boolean {
  const refreshed = lastRefreshAt ? Date.parse(lastRefreshAt) : NaN;
  const last = Math.max(Number.isNaN(refreshed) ? 0 : refreshed, lastStart ?? 0);
  return now - last >= intervalMs;
}

/**
 * While the app is open, fetch every source whenever the data is more than
 * `intervalMs` old — including at launch, when the last fetch was in an
 * earlier session. Counting from launch instead meant data four hours old
 * waited out another two. Wall-clock checks rather than one long timer, so a
 * laptop waking from sleep catches up within a minute.
 */
export function useAutoFetch(fetchAll: () => void, intervalMs: number = AUTO_FETCH_INTERVAL_MS) {
  const store = useStoreInstance();
  const fetchRef = useRef(fetchAll);
  fetchRef.current = fetchAll;

  useEffect(() => {
    let lastStart: number | undefined;
    let wasFetching = store.getState().isFetching;

    // Manual runs (f / F) restart the wait as well.
    const unsubscribe = store.subscribe(() => {
      const fetching = store.getState().isFetching;
      if (fetching && !wasFetching) lastStart = Date.now();
      wasFetching = fetching;
    });

    const check = () => {
      const state = store.getState();
      if (state.isFetching) return;
      if (!isAutoFetchDue(Date.now(), state.lastRefreshAt, lastStart, intervalMs)) return;
      lastStart = Date.now();
      fetchRef.current();
      store.dispatch({ type: 'SET_STATUS', message: 'Auto-fetch: refreshing all sources', statusType: 'info' });
    };

    const first = setTimeout(check, Math.min(FIRST_CHECK_MS, intervalMs));
    const timer = setInterval(check, Math.min(CHECK_INTERVAL_MS, intervalMs));

    return () => {
      unsubscribe();
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [store, intervalMs]);
}
