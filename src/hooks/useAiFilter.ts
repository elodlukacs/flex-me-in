import { useRef, useCallback, useEffect } from 'react';
import type { Job } from '../state/types.js';
import { BATCH_SIZE, getApiKey } from '../api/deepseek.js';
import { classifyJobs, MISSING_KEY_MESSAGE, partialRunWarning } from '../core/ai.js';
import { useDispatch } from '../state/store.js';
import { beginAiFilter, isCurrentAiFilter } from '../state/epochs.js';
import { logError } from '../utils/log.js';

/** Runs above this many jobs ask for `y` first: each batch is a paid request. */
export const AI_CONFIRM_THRESHOLD = 200;

export function useAiFilter() {
  const dispatch = useDispatch();
  const abortRef = useRef<AbortController | null>(null);

  // Quitting mid-run must not leave a request holding the event loop open.
  useEffect(() => () => abortRef.current?.abort(), []);

  /**
   * `confirmed` skips the large-run prompt; the keyboard handler passes it
   * when the user answers `y`.
   */
  const runFilter = useCallback(
    async (jobs: Job[], confirmed = false) => {
      if (!getApiKey()) {
        dispatch({ type: 'AI_FILTER_ERROR', error: MISSING_KEY_MESSAGE });
        return;
      }

      if (jobs.length === 0) {
        dispatch({ type: 'AI_FILTER_ERROR', error: 'No jobs to filter' });
        return;
      }

      // Every source goes through the model, LinkedIn included. Skipping it
      // ("already filtered at ingest") left its roles — usually most of the
      // list — out of the AI panel entirely.
      const candidates = jobs;

      if (!confirmed && candidates.length > AI_CONFIRM_THRESHOLD) {
        dispatch({
          type: 'REQUEST_AI_FILTER',
          jobs: candidates,
          batches: Math.ceil(candidates.length / BATCH_SIZE),
        });
        return;
      }

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // A fetch started mid-filter invalidates this run: its jobs may already
      // be purged, so writing results back would resurrect dead ids.
      const generation = beginAiFilter();

      dispatch({ type: 'AI_FILTER_START', submitted: candidates });

      try {
        const outcome = await classifyJobs(
          candidates,
          controller.signal,
          (batch, total) => {
            if (total > 1 && isCurrentAiFilter(generation)) {
              dispatch({ type: 'AI_FILTER_PROGRESS', batch, total });
            }
          },
          () => isCurrentAiFilter(generation)
        );
        if (!outcome) return;

        dispatch({ type: 'AI_FILTER_DONE', results: outcome.results });

        const warning = partialRunWarning(outcome);
        if (warning) {
          dispatch({ type: 'SET_STATUS', message: warning, statusType: 'warning' });
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (!isCurrentAiFilter(generation)) return;
        logError('ai filter', err);
        dispatch({
          type: 'AI_FILTER_ERROR',
          error: err instanceof Error ? err.message : 'AI filter failed',
        });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [dispatch]
  );

  /**
   * Stops the in-flight run and invalidates it, so nothing it computes is
   * saved or dispatched afterwards. Leaves the stored results alone; callers
   * that discard them do so themselves.
   */
  const cancelFilter = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    beginAiFilter();
  }, []);

  return { runFilter, cancelFilter };
}
