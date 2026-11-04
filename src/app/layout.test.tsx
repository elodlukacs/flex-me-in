import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'ink';
import stringWidth from 'string-width';
import { Store, StoreContext } from '../state/store.js';
import { createInitialState } from '../state/reducer.js';
import type { AppState, Job } from '../state/types.js';
import { selectLayout } from '../hooks/useLayout.js';
import { AppContent } from './AppContent.js';

const STATUS = 'STATUS-MARKER all good';

function mkJobs(n: number): Job[] {
  return Array.from({ length: n }, (_, i) => ({
    id: 'id' + i,
    title: 'Senior Frontend Engineer ' + i,
    company: 'Acme Corp',
    url: 'https://x.test/' + i,
    source: i % 2 ? 'weworkremotely' : 'justjoinit',
    datePosted: '2026-10-01',
    status: 'new',
    country: 'Germany',
    workType: 'remote',
  }));
}

type Patch = (s: AppState) => void;

const longDescription =
  'Intro line\n\nApply here: https://boards.greenhouse.io/acmecorporation/jobs/1234567890?gh_src=abcdefghijklmnopqrstuvwxyz&utm_source=linkedin\n' +
  '高级前端工程师职位描述'.repeat(12) +
  '\n' +
  Array.from({ length: 60 }, (_, i) => 'line ' + i).join('\n');

const scenarios: Record<string, Patch> = {
  base: () => {},
  popup: (s) => {
    s.showJobPopup = true;
    s.popupJobId = 'id0';
    s.popupDescription = longDescription;
  },
  help: (s) => {
    s.showHelp = true;
  },
  helpWithErrors: (s) => {
    s.showHelp = true;
    for (const src of ['linkedin', 'workable', 'remoteok', 'jobicy'] as const) {
      s.fetchStatus[src] = { source: src, status: 'error', count: 0, error: 'HTTP 429 Too Many Requests '.repeat(6) };
    }
  },
  themePicker: (s) => {
    s.showThemePicker = true;
    s.themePickerIndex = 15;
  },
  aiDone: (s) => {
    s.aiFilterStatus = 'done';
    s.aiJobs = mkJobs(30);
    s.aiRemoteMap = new Map(s.aiJobs.map((j) => [j.id, 'yes']));
  },
  aiFiltering: (s) => {
    s.aiFilterStatus = 'filtering';
  },
  aiErrorWithPopup: (s) => {
    s.aiFilterStatus = 'error';
    s.aiError = 'Set DEEPSEEK_API_KEY '.repeat(10);
    s.showJobPopup = true;
    s.popupJobId = 'id1';
    s.popupDescription = longDescription;
  },
  chromeStack: (s) => {
    s.filters = { ...s.filters, title: 'react '.repeat(30), company: 'acme', country: 'germany' };
    s.inputMode = 'title';
    s.inputValue = 'typescript '.repeat(20);
    s.snackbar = { visible: true, message: 'Opening ' + 'https://example.com/very/long/path'.repeat(6) };
    s.aiFilterStatus = 'done';
    s.aiJobs = mkJobs(5);
    s.aiRemoteMap = new Map();
  },
  longStatus: (s) => {
    s.statusMessage = STATUS + ' — Delete ALL jobs including applied/ignored? y to confirm, any other key to cancel';
    s.statusType = 'warning';
    s.jobCounts = { total: 12345, new: 8900, saved: 100, applied: 120, ignored: 3000 };
  },
};

function render(width: number, height: number, patch: Patch): string[] {
  const state = createInitialState();
  state.terminalWidth = width;
  state.terminalHeight = height;
  state.jobs = mkJobs(80);
  state.statusMessage = STATUS;
  state.fetchStatus.remoteok.count = 123;
  state.fetchStatus.linkedin.count = 4567;
  state.fetchStatus.workable.count = 78;
  state.fetchStatus.jobicy.status = 'fetching';
  patch(state);

  const store = new Store(state);
  // Mirror what useLayout publishes, so paging matches the rendered budget.
  const { mainTableRows, aiContentRows } = selectLayout(store.getState());
  store.dispatch({ type: 'SET_VISIBLE_ROWS', main: mainTableRows, ai: aiContentRows });

  const out = renderToString(
    <StoreContext.Provider value={store}>
      <AppContent />
    </StoreContext.Provider>,
    { columns: width }
  );
  return out.split('\n').map((l) => l.replace(/\x1b\[[0-9;]*m/g, ''));
}

describe.each([
  [80, 24],
  [100, 30],
  [120, 40],
])('layout at %ix%i', (width, height) => {
  it.each(Object.keys(scenarios))('%s fills the screen exactly', (name) => {
    const lines = render(width, height, scenarios[name]!);

    expect(lines).toHaveLength(height);
    expect(lines[height - 1]).toContain('STATUS-MARKER');
    for (const line of lines) expect(stringWidth(line)).toBeLessThanOrEqual(width);
    // The title bar stays on top: nothing overdraws it.
    expect(lines[0]).toContain('flex-me-in');
  });
});

describe('layout details', () => {
  it('shows a cursor glyph on the selected row', () => {
    const lines = render(80, 24, scenarios.base!);
    expect(lines.filter((l) => l.startsWith('▶'))).toHaveLength(1);
  });

  it('keeps a cursor in the unfocused panel', () => {
    const lines = render(100, 30, scenarios.aiDone!);
    expect(lines.filter((l) => l.includes('▶'))).toHaveLength(2);
  });

  it('separates the Remote and Date headers', () => {
    const lines = render(120, 40, scenarios.aiDone!);
    expect(lines.some((l) => l.includes('RemoteDate'))).toBe(false);
  });

  it.each([
    [80, 24],
    [100, 30],
  ])('lists per-source errors in the help overlay at %ix%i', (w, h) => {
    const lines = render(w, h, scenarios.helpWithErrors!);
    expect(lines.some((l) => /LI\s+HTTP 429/.test(l))).toBe(true);
    // Every binding group is still on screen alongside the errors.
    for (const group of ['Navigate', 'Job', 'Fetch', 'AI', 'Filter', 'App', 'Source errors']) {
      expect(lines.some((l) => l.includes(group))).toBe(true);
    }
  });

  it('marks a partial fetch in the progress row', () => {
    const lines = render(80, 24, (s) => {
      s.fetchStatus.remotive = { source: 'remotive', status: 'done', count: 3, partial: true };
    });
    expect(lines.some((l) => l.includes('⚠ REM(3)'))).toBe(true);
  });

  it.each([
    [80, 24],
    [120, 30],
  ])('shows status badges and the Romania-time refresh stamp at %ix%i', (w, h) => {
    const lines = render(w, h, (s) => {
      s.lastRefreshAt = '2026-11-04T07:21:00Z';
      s.jobs[0] = { ...s.jobs[0]!, fresh: true };
      s.jobs[1] = { ...s.jobs[1]!, status: 'saved' };
      s.jobs[2] = { ...s.jobs[2]!, status: 'applied' };
      s.jobs[3] = { ...s.jobs[3]!, status: 'ignored' };
      s.jobs[4] = { ...s.jobs[4]!, seen: true };
    });
    const wide = w >= 110;
    for (const label of wide ? ['SAVED', 'APPLIED', 'IGNORED'] : ['SAVE', 'APPL', 'IGN']) {
      expect(lines.some((l) => l.includes(` ${label} `))).toBe(true);
    }
    // New is the ● marker, only on the fresh, unopened row 0; no NEW badge.
    // Titles are cut at 80 columns, so rows are found by position under the header.
    const header = lines.findIndex((l) => l.includes('Status') && l.includes('Title'));
    const row = (i: number) => lines[header + 1 + i]!;
    expect(row(0)).toMatch(/^.●/);
    for (let i = 1; i < 6; i++) expect(row(i)).not.toContain('●');
    expect(lines.some((l) => l.includes(' NEW '))).toBe(false);
    // 07:21 UTC is 09:21 in Bucharest (EET, UTC+2, in November).
    expect(lines[0]).toContain('Wed 4 Nov, 09:21 RO');
    for (const l of lines) expect(stringWidth(l)).toBeLessThanOrEqual(w);
  });

  it('keeps the confirm prompt readable over the counts', () => {
    const lines = render(100, 30, scenarios.longStatus!);
    expect(lines[29]).toContain('y to confirm');
  });
});
