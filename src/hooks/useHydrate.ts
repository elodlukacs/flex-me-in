import { useEffect } from 'react';
import { useDispatch } from '../state/store.js';
import { getAiFilteredResults, getAiFilteredJobs } from '../db/repository.js';

/**
 * Loads persisted AI results after mount. This used to happen inside
 * `createInitialState`, i.e. blocking SQLite I/O in a render path.
 */
export function useHydrate() {
  const dispatch = useDispatch();

  useEffect(() => {
    // The joined rows decide whether there is anything to show; result ids
    // without a job row would otherwise mark an empty panel as "done".
    const aiJobs = getAiFilteredJobs();
    if (aiJobs.length === 0) return;
    dispatch({ type: 'HYDRATE', aiJobs, aiResults: getAiFilteredResults() });
  }, [dispatch]);
}
