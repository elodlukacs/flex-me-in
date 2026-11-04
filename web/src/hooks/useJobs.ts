import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JobStatus, JobsResponse, ListedJob } from '../../../src/server/contract.js';
import { api, errorMessage, isAbort, jobsUrl, type JobQuery } from '../api.js';
import { storage } from '../storage.js';

const LAST_KEY = 'fe-hunt.lastJobs';

interface Snapshot {
  url: string;
  data: JobsResponse;
}

export interface JobsState {
  data: JobsResponse | null;
  /** A request is in flight (data may still be showing from before). */
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Local (optimistic) status change; also adjusts the badge counts. */
  setLocalStatus: (id: string, status: JobStatus) => void;
  /** Local "opened" mark; the server is told separately. */
  setLocalSeen: (id: string) => void;
}

function adjust(data: JobsResponse, job: ListedJob, next: JobStatus): JobsResponse {
  const prev = job.status;
  if (prev === next) return data;
  // Only a fresh, never-opened untriaged job counts as New; others are in `total` only.
  const counted = (s: JobStatus) => (s === 'new' && !(job.fresh && !job.seen) ? null : s);
  const from = counted(prev);
  const to = counted(next);
  // `?? 0`: snapshots cached before the Saved status have no `saved` count.
  const counts = { ...data.counts };
  if (from) counts[from] = Math.max(0, (counts[from] ?? 0) - 1);
  if (to) counts[to] = (counts[to] ?? 0) + 1;
  const newBySource = { ...data.newBySource };
  const n = newBySource[job.source] ?? 0;
  if (from === 'new') newBySource[job.source] = Math.max(0, n - 1);
  if (to === 'new') newBySource[job.source] = n + 1;
  return {
    jobs: data.jobs.map((j) => (j.id === job.id ? { ...j, status: next } : j)),
    counts,
    newBySource,
  };
}

/**
 * The job list for the current filters. The last list is kept in
 * localStorage so a cold start paints immediately while the network catches up.
 */
export function useJobs(query: JobQuery, enabled: boolean): JobsState {
  const url = jobsUrl(query);
  const [data, setData] = useState<JobsResponse | null>(() => {
    const last = storage.getJson<Snapshot>(LAST_KEY);
    return last?.url === url && last.data ? last.data : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const shownUrl = useRef<string | null>(data ? url : null);

  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    // A different filter: drop the old list so skeletons show instead of wrong rows.
    if (shownUrl.current !== url) setData(null);
    api
      .jobs(queryRef.current, controller.signal)
      .then((res) => {
        shownUrl.current = url;
        setData(res);
        setLoading(false);
        storage.setJson(LAST_KEY, { url, data: res } satisfies Snapshot);
      })
      .catch((err: unknown) => {
        if (isAbort(err)) return;
        setError(errorMessage(err));
        setLoading(false);
      });
    return () => controller.abort();
  }, [url, nonce, enabled]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const setLocalStatus = useCallback((id: string, status: JobStatus) => {
    setData((d) => {
      const job = d?.jobs.find((j) => j.id === id);
      return d && job ? adjust(d, job, status) : d;
    });
  }, []);

  // Opening a New job takes the label away, so the counts drop with it. The
  // card itself stays until the next load.
  const setLocalSeen = useCallback((id: string) => {
    setData((d) => {
      const job = d?.jobs.find((j) => j.id === id);
      if (!d || !job || job.seen) return d;
      const wasNew = job.status === 'new' && !!job.fresh;
      const counts = wasNew ? { ...d.counts, new: Math.max(0, d.counts.new - 1) } : d.counts;
      const newBySource = { ...d.newBySource };
      if (wasNew) newBySource[job.source] = Math.max(0, (newBySource[job.source] ?? 0) - 1);
      return {
        ...d,
        counts,
        newBySource,
        jobs: d.jobs.map((j) => (j.id === id ? { ...j, seen: true as const } : j)),
      };
    });
  }, []);

  return useMemo(
    () => ({ data, loading, error, reload, setLocalStatus, setLocalSeen }),
    [data, loading, error, reload, setLocalStatus, setLocalSeen],
  );
}
