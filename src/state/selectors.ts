import type { AppState, Job } from './types.js';

export function selectPagedJobs(state: AppState): Job[] {
  const size = Math.max(1, state.mainVisibleRows);
  const start = state.page * size;
  return state.jobs.slice(start, start + size);
}

export function selectCurrentJob(state: AppState): Job | undefined {
  const pagedJobs = selectPagedJobs(state);
  return pagedJobs[state.selectedIndex];
}

export function selectPagedAiJobs(state: AppState): Job[] {
  const size = Math.max(1, state.aiVisibleRows);
  const start = state.aiPage * size;
  return state.aiJobs.slice(start, start + size);
}

export function selectCurrentAiJob(state: AppState): Job | undefined {
  const paged = selectPagedAiJobs(state);
  return paged[state.aiSelectedIndex];
}

/**
 * Resolved by id from the live lists, so the popup reflects status changes made
 * while it is open.
 */
export function selectPopupJob(state: AppState): Job | undefined {
  if (!state.popupJobId) return undefined;
  return (
    state.jobs.find((j) => j.id === state.popupJobId) ??
    state.aiJobs.find((j) => j.id === state.popupJobId)
  );
}
