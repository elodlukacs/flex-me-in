import { useEffect, useCallback } from 'react';
import { useAppState } from '../state/context.js';
import { getFilteredJobs, getJobCounts } from '../db/repository.js';

export function useJobLoader() {
  const { state, dispatch } = useAppState();
  const { filters, sourceFilter } = state;

  const loadJobs = useCallback(() => {
    const jobs = getFilteredJobs(filters, sourceFilter);
    dispatch({ type: 'SET_JOBS', jobs });
    const counts = getJobCounts();
    dispatch({ type: 'SET_JOB_COUNTS', counts });
  }, [filters, sourceFilter, dispatch]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);
}
