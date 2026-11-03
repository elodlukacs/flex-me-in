import { useEffect, useRef } from 'react';
import { useStore, useStoreInstance } from '../state/store.js';
import type { Store } from '../state/store.js';
import { expireStaleJobs, getFilteredJobs, getJobCounts } from '../db/repository.js';

/**
 * Re-reads the list for the current filters and the status-bar counts. Every
 * DB write the user can see goes through here: counts used to refresh only on
 * filter changes, so the bar said "0 jobs" right after the first fetch and
 * ignored `a`/`i`/`n`.
 */
export function reloadJobs(store: Store): void {
  const { filters, sourceFilter } = store.getState();
  store.dispatch({ type: 'SET_JOBS', jobs: getFilteredJobs(filters, sourceFilter) });
  store.dispatch({ type: 'SET_JOB_COUNTS', counts: getJobCounts() });
}

export function useJobLoader() {
  const store = useStoreInstance();
  const filters = useStore((s) => s.filters);
  const sourceFilter = useStore((s) => s.sourceFilter);
  const expired = useRef(false);

  useEffect(() => {
    // Once per launch, before the first load: rows go stale between fetches,
    // and a fetch may never come.
    if (!expired.current) {
      expired.current = true;
      expireStaleJobs();
    }
    reloadJobs(store);
  }, [filters, sourceFilter, store]);
}
