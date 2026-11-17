import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JobStatus, JobsResponse, ListedJob } from '../../../src/server/contract.js';
import { api, errorMessage, isAbort, jobsUrl, type JobQuery } from '../api.js';
import { storage } from '../storage.js';

// v2: counts follow the filters (`bySource`, `newTotal`, `counts.backlog`).
const LAST_KEY = 'fe-hunt.lastJobs.v2';

interface Snapshot {
  url: string;
  data: JobsResponse;
}

/** A listed job, plus what only this client knows about it. */
type LocalJob = ListedJob & {
  /** Opened since the last load, while the server still counted it as New. */
  openedHere?: true;
};

type LocalData = Omit<JobsResponse, 'jobs'> & { jobs: LocalJob[] };

export interface JobsState {
  data: JobsResponse | null;
  /** A request is in flight (data may still be showing from before). */
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Local (optimistic) status change; also adjusts the tab and chip counts. */
  setLocalStatus: (id: string, status: JobStatus) => void;
  /** Local "opened" mark; the server is told separately. */
  setLocalSeen: (id: string) => void;
  /**
   * Wrap a write to the server. A list response that was requested before the
   * write settled is thrown away and re-requested, so it can't undo the
   * optimistic change.
   */
  track: <T>(write: Promise<T>) => Promise<T>;
}

type Bucket = 'new' | 'backlog' | 'saved' | 'applied' | 'ignored';

/** The status tab a job is counted under, as the server decided at the last load. */
function bucketOf(job: LocalJob, status: JobStatus): Bucket {
  if (status !== 'new') return status;
  return job.fresh && (!job.seen || job.openedHere) ? 'new' : 'backlog';
}

function adjust(data: LocalData, job: LocalJob, next: JobStatus, tab: JobQuery['status']): LocalData {
  const prev = job.status;
  if (prev === next) return data;
  const from = bucketOf(job, prev);
  // Once triaged, an opened job comes back as Backlog, not New.
  const moved: LocalJob = { ...job, status: next, openedHere: undefined };
  const to = bucketOf(moved, next);

  // `?? 0`: responses cached before a field existed don't have it.
  const counts = { ...data.counts };
  counts[from] = Math.max(0, (counts[from] ?? 0) - 1);
  counts[to] = (counts[to] ?? 0) + 1;

  // The chips count the selected tab's jobs per board.
  const bySource = { ...data.bySource };
  const n = bySource[job.source] ?? 0;
  if (tab !== 'all' && from !== to) {
    if (from === tab) bySource[job.source] = Math.max(0, n - 1);
    if (to === tab) bySource[job.source] = n + 1;
  }

  let newTotal = data.newTotal ?? 0;
  if (from === 'new') newTotal = Math.max(0, newTotal - 1);
  if (to === 'new') newTotal += 1;

  return {
    jobs: data.jobs.map((j) => (j.id === job.id ? moved : j)),
    counts,
    bySource,
    newTotal,
  };
}

/**
 * The job list for the current filters. The last list is kept in
 * localStorage so a cold start paints immediately while the network catches up.
 */
export function useJobs(query: JobQuery, enabled: boolean): JobsState {
  const url = jobsUrl(query);
  const [data, setData] = useState<LocalData | null>(() => {
    const last = storage.getJson<Snapshot>(LAST_KEY);
    return last?.url === url && last.data ? last.data : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const shownUrl = useRef<string | null>(data ? url : null);

  const queryRef = useRef(query);
  queryRef.current = query;

  // Writes in flight, a counter that moves whenever one starts or settles, and
  // whether a list response was dropped while a write was still out.
  const writes = useRef({ pending: 0, epoch: 0, dropped: false });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const w = writes.current;
    const epoch = w.epoch;
    w.dropped = false;
    setLoading(true);
    setError(null);
    // A different filter: drop the old list so skeletons show instead of wrong rows.
    if (shownUrl.current !== url) setData(null);
    api
      .jobs(queryRef.current, controller.signal)
      .then((res) => {
        if (w.epoch !== epoch) {
          // Read before a write landed: it would roll the optimistic change back.
          if (w.pending === 0) setNonce((n) => n + 1);
          else w.dropped = true;
          return;
        }
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

  const track = useCallback(<T,>(write: Promise<T>): Promise<T> => {
    const w = writes.current;
    w.pending += 1;
    w.epoch += 1;
    const settle = () => {
      w.pending -= 1;
      w.epoch += 1;
      if (w.pending === 0 && w.dropped) {
        w.dropped = false;
        setNonce((n) => n + 1);
      }
    };
    write.then(settle, settle);
    return write;
  }, []);

  const setLocalStatus = useCallback((id: string, status: JobStatus) => {
    setData((d) => {
      const job = d?.jobs.find((j) => j.id === id);
      return d && job ? adjust(d, job, status, queryRef.current.status) : d;
    });
  }, []);

  // The card greys out but stays where it is, and so do the counts: the tab
  // number keeps matching the cards under it. The next load moves the job to
  // Backlog and drops New by one.
  const setLocalSeen = useCallback((id: string) => {
    setData((d) => {
      const job = d?.jobs.find((j) => j.id === id);
      if (!d || !job || job.seen) return d;
      const opened: LocalJob = { ...job, seen: true };
      if (bucketOf(job, job.status) === 'new') opened.openedHere = true;
      return { ...d, jobs: d.jobs.map((j) => (j.id === id ? opened : j)) };
    });
  }, []);

  return useMemo(
    () => ({ data, loading, error, reload, setLocalStatus, setLocalSeen, track }),
    [data, loading, error, reload, setLocalStatus, setLocalSeen, track],
  );
}
