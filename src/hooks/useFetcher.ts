import { useRef, useCallback, useEffect } from 'react';
import type { Source } from '../state/types.js';
import { ALL_SOURCES } from '../state/types.js';
import { runFetch } from '../core/fetch.js';
import { useStoreInstance } from '../state/store.js';
import { beginFetch, invalidateAll, isCurrentFetch } from '../state/epochs.js';
import { reloadJobs } from './useJobLoader.js';

export function useFetcher() {
  const store = useStoreInstance();
  const { dispatch } = store;
  const abortRef = useRef<AbortController | null>(null);

  // Quitting mid-fetch must not leave sockets and retry timers keeping the
  // process alive.
  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchSources = useCallback(
    async (sources: Source[]) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      // Anything from a previous run that is still in flight is now stale: it
      // must neither write to the DB nor dispatch.
      const generation = beginFetch();
      const isCurrent = () => isCurrentFetch(generation);

      dispatch({ type: 'FETCH_START', sources });
      dispatch({ type: 'CLEAR_AI_FILTER' });

      await runFetch(sources, controller.signal, isCurrent, {
        onProgress: (source, count) => dispatch({ type: 'FETCH_PROGRESS', source, count }),
        onCancelled: (source) => dispatch({ type: 'FETCH_CANCELLED', source }),
        onDone: (source, count, complete) => {
          dispatch({ type: 'FETCH_DONE', source, count, complete });
          if (!complete) {
            dispatch({
              type: 'SET_STATUS',
              message: `${source}: stopped early after ${count} jobs — older listings kept`,
              statusType: 'warning',
            });
          }
        },
        onError: (source, error) => {
          dispatch({ type: 'FETCH_ERROR', source, error });
          dispatch({ type: 'SET_STATUS', message: `${source}: ${error}`, statusType: 'error' });
        },
      });

      // Reload even after Ctrl+S: sources that finished before the cancel
      // already wrote to the DB. Only a superseded or discarded run skips it.
      if (isCurrent()) {
        reloadJobs(store);
        dispatch({ type: 'FETCH_ALL_DONE' });
      }

      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    },
    [dispatch, store]
  );

  const fetchAll = useCallback(() => fetchSources(ALL_SOURCES), [fetchSources]);

  const fetchOne = useCallback(
    (source: Source) => fetchSources([source]),
    [fetchSources]
  );

  /**
   * Ctrl+S: abort, but let the run finish its bookkeeping so whatever already
   * landed is shown. `discard` (destructive actions) also invalidates the run
   * — and any AI run — so nothing in flight can write afterwards.
   */
  const cancelFetch = useCallback(
    (discard = false) => {
      if (discard) invalidateAll();
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
        dispatch({ type: 'FETCH_CANCELLED' });
      }
    },
    [dispatch]
  );

  return { fetchAll, fetchOne, cancelFetch };
}
