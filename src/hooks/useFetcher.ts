import { useRef, useCallback } from 'react';
import type { Source, Job } from '../state/types.js';
import { ALL_SOURCES } from '../state/types.js';
import { fetchRemoteOK } from '../api/remoteok.js';
import { fetchWeWorkRemotely } from '../api/weworkremotely.js';
import { fetchHimalayas } from '../api/himalayas.js';
import { fetchRemotive } from '../api/remotive.js';
import { fetchArbeitnow } from '../api/arbeitnow.js';
import { fetchLinkedIn } from '../api/linkedin.js';
import { fetchIndeed } from '../api/indeed.js';
import { fetchHackerNews } from '../api/hackernews.js';
import { upsertJobs, getFilteredJobs, saveAiFilteredJobs } from '../db/repository.js';
import { useAppState } from '../state/context.js';

type FetchFn = (signal?: AbortSignal, onProgress?: (count: number) => void) => Promise<Job[]>;

const fetcherMap: Record<Source, FetchFn> = {
  remoteok: fetchRemoteOK,
  weworkremotely: fetchWeWorkRemotely,
  himalayas: fetchHimalayas,
  remotive: fetchRemotive,
  arbeitnow: fetchArbeitnow,
  linkedin: fetchLinkedIn as FetchFn,
  indeed: fetchIndeed as FetchFn,
  hackernews: fetchHackerNews,
};

export function useFetcher() {
  const { state, dispatch } = useAppState();
  const abortRef = useRef<AbortController | null>(null);
  const filtersRef = useRef(state.filters);
  const sourceFilterRef = useRef(state.sourceFilter);
  filtersRef.current = state.filters;
  sourceFilterRef.current = state.sourceFilter;

  const fetchSources = useCallback(
    async (sources: Source[]) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      dispatch({ type: 'FETCH_START', sources });
      dispatch({ type: 'CLEAR_AI_FILTER' });
      saveAiFilteredJobs([]);

      const promises = sources.map(async (source) => {
        try {
          const fetcher = fetcherMap[source];
          const jobs = await fetcher(controller.signal, (count: number) => {
            dispatch({ type: 'FETCH_PROGRESS', source, count });
          });

          if (jobs.length > 0) {
            upsertJobs(jobs);
          }

          dispatch({ type: 'FETCH_DONE', source, count: jobs.length });
          return jobs.length;
        } catch (err: unknown) {
          if (err instanceof Error && err.name === 'AbortError') {
            dispatch({ type: 'FETCH_CANCELLED', source });
            return 0;
          }
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          dispatch({ type: 'FETCH_ERROR', source, error: errMsg });
          dispatch({ type: 'SET_STATUS', message: `${source}: ${errMsg}`, statusType: 'error' });
          return 0;
        }
      });

      await Promise.allSettled(promises);

      if (!controller.signal.aborted) {
        const jobs = getFilteredJobs(filtersRef.current, sourceFilterRef.current);
        dispatch({ type: 'SET_JOBS', jobs });
        dispatch({ type: 'FETCH_ALL_DONE' });
      }

      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    },
    [dispatch]
  );

  const fetchAll = useCallback(() => fetchSources(ALL_SOURCES), [fetchSources]);

  const fetchOne = useCallback(
    (source: Source) => fetchSources([source]),
    [fetchSources]
  );

  const cancelFetch = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      dispatch({ type: 'FETCH_CANCELLED' });
    }
  }, [dispatch]);

  return { fetchAll, fetchOne, cancelFetch };
}
