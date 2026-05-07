import { useEffect } from 'react';
import { useStore, useDispatch } from '../state/store.js';
import { getFilteredJobs, getJobCounts } from '../db/repository.js';

export function useJobLoader() {
  const dispatch = useDispatch();
  const filters = useStore((s) => s.filters);
  const sourceFilter = useStore((s) => s.sourceFilter);

  useEffect(() => {
    const jobs = getFilteredJobs(filters, sourceFilter);
    dispatch({ type: 'SET_JOBS', jobs });
    const counts = getJobCounts();
    dispatch({ type: 'SET_JOB_COUNTS', counts });
  }, [filters, sourceFilter, dispatch]);
}
