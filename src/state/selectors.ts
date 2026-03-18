import type { AppState, Job } from './types.js';

export function selectPagedJobs(state: AppState): Job[] {
  const start = state.page * state.pageSize;
  return state.jobs.slice(start, start + state.pageSize);
}

export function selectTotalPages(state: AppState): number {
  return Math.max(1, Math.ceil(state.jobs.length / state.pageSize));
}

export function selectCurrentJob(state: AppState): Job | undefined {
  const pagedJobs = selectPagedJobs(state);
  return pagedJobs[state.selectedIndex];
}

export function selectHasActiveFilters(state: AppState): boolean {
  const f = state.filters;
  return !!(f.status || f.source || f.workType || f.title || f.company || f.country);
}

export function selectAiFilteredJobs(state: AppState): Job[] {
  return state.aiJobs;
}

export function selectPagedAiJobs(state: AppState): Job[] {
  const pageSize = state.aiVisibleRows;
  const start = state.aiPage * pageSize;
  return state.aiJobs.slice(start, start + pageSize);
}

export function selectAiTotalPages(state: AppState): number {
  const pageSize = state.aiVisibleRows;
  return Math.max(1, Math.ceil(state.aiJobs.length / pageSize));
}

export function selectCurrentAiJob(state: AppState): Job | undefined {
  const paged = selectPagedAiJobs(state);
  return paged[state.aiSelectedIndex];
}
