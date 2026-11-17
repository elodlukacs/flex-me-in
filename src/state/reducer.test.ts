import { describe, it, expect, vi } from 'vitest';
import type { AppState, Job } from './types.js';
import { createInitialState, reducer } from './reducer.js';

// The theme module reads and writes ~/.flex-me-in/config.json on import.
// vi.mock is hoisted above the imports.
vi.mock('../utils/theme.js', () => ({
  getActiveThemeId: () => 'one-dark',
  themeIds: ['one-dark'],
}));

function job(n: number, overrides: Partial<Job> = {}): Job {
  return {
    id: `job_${n}`,
    title: `Senior Frontend ${n}`,
    company: 'Acme',
    url: `https://example.com/${n}`,
    source: 'remoteok',
    datePosted: '2026-10-01',
    status: 'new',
    country: '',
    workType: '',
    ...overrides,
  };
}

function jobs(count: number): Job[] {
  return Array.from({ length: count }, (_, i) => job(i));
}

function stateWith(patch: Partial<AppState>): AppState {
  return { ...createInitialState(), ...patch };
}

describe('view clamping', () => {
  it('pulls page and selection back when the list shrinks under page 2', () => {
    let s = stateWith({ mainVisibleRows: 10, pageSize: 10 });
    s = reducer(s, { type: 'SET_JOBS', jobs: jobs(25) });
    s = reducer(s, { type: 'PAGE', direction: 'next' });
    s = reducer(s, { type: 'PAGE', direction: 'next' });
    expect(s.page).toBe(2);
    s = reducer(s, { type: 'NAVIGATE', direction: 'down' });
    s = reducer(s, { type: 'NAVIGATE', direction: 'down' });
    expect(s.selectedIndex).toBe(2);

    // 13 rows: page 2 no longer exists, page 1 holds 3 rows.
    s = reducer(s, { type: 'SET_JOBS', jobs: jobs(13) });
    expect(s.page).toBe(1);
    expect(s.selectedIndex).toBe(2);

    // 11 rows: page 1 holds a single row, so the cursor must sit on it.
    s = reducer(s, { type: 'SET_JOBS', jobs: jobs(11) });
    expect(s.page).toBe(1);
    expect(s.selectedIndex).toBe(0);
  });

  it('keeps the cursor on the same job when rows land mid-fetch', () => {
    let s = stateWith({ mainVisibleRows: 10, pageSize: 10 });
    s = reducer(s, { type: 'SET_JOBS', jobs: jobs(15) });
    for (let i = 0; i < 8; i++) s = reducer(s, { type: 'NAVIGATE', direction: 'down' });
    expect(s.jobs[s.selectedIndex]!.id).toBe('job_8');

    // Five newer jobs arrive on top: job_8 is now row 13, on page 1.
    const landed = [...Array.from({ length: 5 }, (_, i) => job(100 + i)), ...jobs(15)];
    s = reducer(s, { type: 'SET_JOBS', jobs: landed, keepSelection: true });
    expect([s.page, s.selectedIndex]).toEqual([1, 3]);

    // Without the flag (a filter change) the index stays put.
    s = reducer(s, { type: 'SET_JOBS', jobs: jobs(15) });
    expect([s.page, s.selectedIndex]).toEqual([1, 3]);
  });

  it('stays at the top when rows land and the cursor never moved', () => {
    let s = stateWith({ mainVisibleRows: 10, pageSize: 10 });
    s = reducer(s, { type: 'SET_JOBS', jobs: jobs(15) });
    const landed = [...Array.from({ length: 12 }, (_, i) => job(100 + i)), ...jobs(15)];
    s = reducer(s, { type: 'SET_JOBS', jobs: landed, keepSelection: true });
    expect([s.page, s.selectedIndex]).toEqual([0, 0]);
    expect(s.jobs[0]!.id).toBe('job_100');
  });

  it('keeps the index when the selected job is gone after a reload', () => {
    let s = stateWith({ mainVisibleRows: 10, pageSize: 10 });
    s = reducer(s, { type: 'SET_JOBS', jobs: jobs(15) });
    for (let i = 0; i < 3; i++) s = reducer(s, { type: 'NAVIGATE', direction: 'down' });
    const purged = jobs(15).filter((j) => j.id !== 'job_3');
    s = reducer(s, { type: 'SET_JOBS', jobs: purged, keepSelection: true });
    expect([s.page, s.selectedIndex]).toEqual([0, 3]);
    expect(s.jobs[s.selectedIndex]!.id).toBe('job_4');
  });

  it('clamps against the page slice, not the total, on resize', () => {
    let s = stateWith({ mainVisibleRows: 10, pageSize: 10 });
    s = reducer(s, { type: 'SET_JOBS', jobs: jobs(15) });
    s = reducer(s, { type: 'PAGE', direction: 'next' });
    for (let i = 0; i < 4; i++) s = reducer(s, { type: 'NAVIGATE', direction: 'down' });
    expect([s.page, s.selectedIndex]).toEqual([1, 4]);

    // Taller terminal: everything fits on page 0; index 4 is still valid.
    s = reducer(s, { type: 'SET_VISIBLE_ROWS', main: 20, ai: 10 });
    expect(s.page).toBe(0);
    expect(s.pageSize).toBe(20);
    expect(s.selectedIndex).toBe(4);

    // Shorter: 3 rows per page; page 0 holds only 3 rows.
    s = reducer(s, { type: 'SET_VISIBLE_ROWS', main: 3, ai: 10 });
    expect(s.selectedIndex).toBe(2);
  });

  it('clamps aiPage and aiSelectedIndex when the AI panel grows', () => {
    let s = stateWith({ aiVisibleRows: 5, aiJobs: jobs(12) });
    s = reducer(s, { type: 'AI_PAGE', direction: 'next' });
    s = reducer(s, { type: 'AI_PAGE', direction: 'next' });
    s = reducer(s, { type: 'AI_NAVIGATE', direction: 'down' });
    expect([s.aiPage, s.aiSelectedIndex]).toEqual([2, 1]);

    // 12 rows at 10 per page: page 2 is gone, page 1 has 2 rows.
    s = reducer(s, { type: 'SET_VISIBLE_ROWS', main: 20, ai: 10 });
    expect(s.aiPage).toBe(1);
    expect(s.aiSelectedIndex).toBe(1);

    s = reducer(s, { type: 'SET_VISIBLE_ROWS', main: 20, ai: 12 });
    expect(s.aiPage).toBe(0);
  });

  it('drops focus from an AI panel that becomes empty', () => {
    let s = stateWith({ aiJobs: jobs(3), aiFilterStatus: 'done' });
    s = reducer(s, { type: 'TOGGLE_PANEL_FOCUS' });
    expect(s.aiPanelFocused).toBe(true);
    s = reducer(s, { type: 'CLEAR_AI_FILTER' });
    expect(s.aiPanelFocused).toBe(false);
  });
});

describe('FETCH_ALL_DONE', () => {
  it('summarises only the sources of the current run', () => {
    let s = createInitialState();
    s = reducer(s, { type: 'FETCH_START', sources: ['remoteok', 'linkedin'] });
    s = reducer(s, { type: 'FETCH_ERROR', source: 'linkedin', error: 'boom' });
    s = reducer(s, { type: 'FETCH_DONE', source: 'remoteok', count: 4 });
    s = reducer(s, { type: 'FETCH_ALL_DONE' });
    expect(s.statusType).toBe('warning');
    expect(s.statusMessage).toContain('linkedin');

    // A single-source run must not repeat linkedin's stale error.
    s = reducer(s, { type: 'FETCH_START', sources: ['remotive'] });
    s = reducer(s, { type: 'FETCH_DONE', source: 'remotive', count: 7 });
    s = reducer(s, { type: 'FETCH_ALL_DONE' });
    expect(s.fetchStatus.linkedin.status).toBe('error');
    expect(s.statusType).toBe('success');
    expect(s.statusMessage).toBe('Fetch complete — 7 senior frontend roles');
    expect(s.isFetching).toBe(false);
  });

  it('reports sources that stopped early', () => {
    let s = createInitialState();
    s = reducer(s, { type: 'FETCH_START', sources: ['linkedin'] });
    s = reducer(s, { type: 'FETCH_DONE', source: 'linkedin', count: 25, complete: false });
    s = reducer(s, { type: 'FETCH_ALL_DONE' });
    expect(s.fetchStatus.linkedin.partial).toBe(true);
    expect(s.statusType).toBe('warning');
    expect(s.statusMessage).toBe('Fetched 25 roles — stopped early: linkedin');
  });
});

describe('HYDRATE', () => {
  it('is a no-op when no stored result joins to a job', () => {
    const s = createInitialState();
    const next = reducer(s, {
      type: 'HYDRATE',
      aiJobs: [],
      aiResults: [{ id: 'gone', remote: 'yes' }],
    });
    expect(next).toBe(s);
    expect(next.aiFilterStatus).toBe('idle');
  });

  it('loads the joined jobs and keeps remote flags only for them', () => {
    const next = reducer(createInitialState(), {
      type: 'HYDRATE',
      aiJobs: [job(1)],
      aiResults: [
        { id: 'job_1', remote: 'yes' },
        { id: 'gone', remote: 'no' },
      ],
    });
    expect(next.aiFilterStatus).toBe('done');
    expect(next.aiJobs.map((j) => j.id)).toEqual(['job_1']);
    expect([...next.aiRemoteMap.entries()]).toEqual([['job_1', 'yes']]);
  });
});

describe('AI confirmation', () => {
  it('arms a prompt with the counts and clears it on cancel', () => {
    let s = reducer(createInitialState(), { type: 'REQUEST_AI_FILTER', jobs: jobs(240), batches: 5 });
    expect(s.pendingAiFilter?.jobs).toHaveLength(240);
    expect(s.statusMessage).toContain('240 jobs');
    expect(s.statusMessage).toContain('5 batches');
    s = reducer(s, { type: 'CANCEL_AI_FILTER_REQUEST' });
    expect(s.pendingAiFilter).toBeNull();
    expect(s.statusMessage).toBe('Cancelled');
  });
});
