import { useRef, useCallback } from 'react';
import type { Job } from '../state/types.js';
import { filterJobsWithClaude, getApiKey } from '../api/claude.js';
import { saveAiFilteredJobs } from '../db/repository.js';
import { useAppState } from '../state/context.js';

export function useAiFilter() {
  const { dispatch } = useAppState();
  const abortRef = useRef<AbortController | null>(null);

  const runFilter = useCallback(
    async (jobs: Job[]) => {
      if (!getApiKey()) {
        dispatch({
          type: 'AI_FILTER_ERROR',
          error: 'Set ANTHROPIC_API_KEY env var',
        });
        return;
      }

      // Filter out LinkedIn jobs (already well filtered by region)
      const nonLinkedInJobs = jobs.filter(j => j.source !== 'linkedin');
      
      if (nonLinkedInJobs.length === 0) {
        dispatch({ type: 'AI_FILTER_ERROR', error: 'No jobs to filter (LinkedIn excluded)' });
        return;
      }

      if (jobs.length === 0) {
        dispatch({ type: 'AI_FILTER_ERROR', error: 'No jobs to filter' });
        return;
      }

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      dispatch({ type: 'AI_FILTER_START' });

      try {
        const results = await filterJobsWithClaude(nonLinkedInJobs, controller.signal);
        if (!controller.signal.aborted) {
          saveAiFilteredJobs(results);
          dispatch({ type: 'AI_FILTER_DONE', results });
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        dispatch({
          type: 'AI_FILTER_ERROR',
          error: err?.message ?? 'AI filter failed',
        });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [dispatch]
  );

  return { runFilter };
}
