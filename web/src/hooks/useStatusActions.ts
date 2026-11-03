import { useCallback, useEffect, useRef, useState } from 'react';
import type { JobStatus, ListedJob } from '../../../src/server/contract.js';
import { api, errorMessage } from '../api.js';
import { showToast } from '../toasts.js';
import type { JobsState } from './useJobs.js';
import type { StatusFilter } from './useUiState.js';

/** Matches the card's CSS collapse transition. */
const LEAVE_MS = 280;

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export interface StatusActions {
  /** Jobs to render: the ones matching the status filter, plus any just toggled in place. */
  visible: (jobs: ListedJob[]) => ListedJob[];
  leaving: ReadonlySet<string>;
  toggleApplied: (job: ListedJob) => void;
  toggleHidden: (job: ListedJob) => void;
}

/**
 * Optimistic status changes. Applied toggles in place (the card stays even if
 * it no longer matches the tab, so it can be toggled back). Hide/Restore
 * animates the card out when it leaves the tab, with an Undo toast. A failed
 * PATCH rolls back.
 */
export function useStatusActions(jobs: JobsState, filter: StatusFilter, resetKey: string): StatusActions {
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  const [keep, setKeep] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const ctx = useRef({ jobs, filter });
  ctx.current = { jobs, filter };

  useEffect(() => setKeep(new Set()), [resetKey]);

  const withId = (set: ReadonlySet<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };

  const change = useCallback((job: ListedJob, next: JobStatus, leaveIfFiltered: boolean) => {
    const { jobs: state, filter: tab } = ctx.current;
    const prev = job.status;
    const id = job.id;
    const leave = leaveIfFiltered && tab !== 'all' && next !== tab;

    const pending = timers.current.get(id);
    if (pending) clearTimeout(pending);
    if (leave) {
      setKeep((s) => withId(s, id, false));
      setLeaving((s) => withId(s, id, true));
      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id);
          ctx.current.jobs.setLocalStatus(id, next);
          setLeaving((s) => withId(s, id, false));
        }, LEAVE_MS),
      );
    } else {
      timers.current.delete(id);
      setLeaving((s) => withId(s, id, false));
      if (tab !== 'all') setKeep((s) => withId(s, id, true));
      state.setLocalStatus(id, next);
    }

    api.setStatus(id, next).catch((err: unknown) => {
      const t = timers.current.get(id);
      if (t) clearTimeout(t);
      timers.current.delete(id);
      setLeaving((s) => withId(s, id, false));
      ctx.current.jobs.setLocalStatus(id, prev);
      showToast(`Couldn’t update “${truncate(job.title, 40)}”: ${errorMessage(err)}`, { tone: 'error' });
    });

    return prev;
  }, []);

  const toggleApplied = useCallback(
    (job: ListedJob) => {
      change(job, job.status === 'applied' ? 'new' : 'applied', false);
    },
    [change],
  );

  const toggleHidden = useCallback(
    (job: ListedJob) => {
      const hiding = job.status !== 'ignored';
      const prev = change(job, hiding ? 'ignored' : 'new', true);
      showToast(hiding ? `Hidden “${truncate(job.title, 32)}”` : `Restored “${truncate(job.title, 32)}”`, {
        action: {
          label: 'Undo',
          onClick: () => change({ ...job, status: hiding ? 'ignored' : 'new' }, prev, false),
        },
      });
    },
    [change],
  );

  const visible = useCallback(
    (list: ListedJob[]) => (filter === 'all' ? list : list.filter((j) => j.status === filter || keep.has(j.id) || leaving.has(j.id))),
    [filter, keep, leaving],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach(clearTimeout);
  }, []);

  return { visible, leaving, toggleApplied, toggleHidden };
}
