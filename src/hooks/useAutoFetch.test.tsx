import React from 'react';
import { EventEmitter } from 'events';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, Text } from 'ink';
import { Store, StoreContext } from '../state/store.js';
import { createInitialState } from '../state/reducer.js';
import { isRomania } from '../components/jobs/JobTable.js';
import { useAutoFetch } from './useAutoFetch.js';

const HOUR = 3_600_000;

function fakeStdout(): NodeJS.WriteStream {
  const out = new EventEmitter() as unknown as NodeJS.WriteStream & { columns: number; rows: number };
  out.columns = 80;
  out.rows = 24;
  out.write = () => true;
  return out;
}

function Probe({ fetchAll }: { fetchAll: () => void }) {
  useAutoFetch(fetchAll);
  return <Text>probe</Text>;
}

/** `lastRefreshAgoMs` undefined: the DB has never been fetched into. */
function mount(fetchAll: () => void, lastRefreshAgoMs?: number) {
  const state = createInitialState();
  if (lastRefreshAgoMs !== undefined) {
    state.lastRefreshAt = new Date(Date.now() - lastRefreshAgoMs).toISOString();
  }
  const store = new Store(state);
  const app = render(
    <StoreContext.Provider value={store}>
      <Probe fetchAll={fetchAll} />
    </StoreContext.Provider>,
    { stdout: fakeStdout(), patchConsole: false, exitOnCtrlC: false }
  );
  return { store, app };
}

describe('useAutoFetch', () => {
  afterEach(() => vi.useRealTimers());

  it('fetches right after launch when the last fetch is over two hours old', async () => {
    vi.useFakeTimers();
    const fetchAll = vi.fn();
    // The reported case: fetched at 09:17, app opened at 11:41, still waiting at 13:27.
    const { app } = mount(fetchAll, 4 * HOUR);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchAll).toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it('fetches right after launch when nothing was ever fetched', async () => {
    vi.useFakeTimers();
    const fetchAll = vi.fn();
    const { app } = mount(fetchAll);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchAll).toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it('counts two hours from the last fetch, not from launch', async () => {
    vi.useFakeTimers();
    const fetchAll = vi.fn();
    const { app } = mount(fetchAll, HOUR + 30 * 60_000);
    await vi.advanceTimersByTimeAsync(29 * 60_000);
    expect(fetchAll).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchAll).toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it('keeps fetching every two hours', async () => {
    vi.useFakeTimers();
    const fetchAll = vi.fn();
    const { app } = mount(fetchAll, 0);
    await vi.advanceTimersByTimeAsync(6 * HOUR + 60_000);
    expect(fetchAll).toHaveBeenCalledTimes(3);
    app.unmount();
  });

  it('a manual fetch restarts the two-hour wait', async () => {
    vi.useFakeTimers();
    const fetchAll = vi.fn();
    const { store, app } = mount(fetchAll, 0);
    await vi.advanceTimersByTimeAsync(HOUR);
    store.dispatch({ type: 'FETCH_START', sources: ['linkedin'] });
    store.dispatch({ type: 'FETCH_ALL_DONE' });
    await vi.advanceTimersByTimeAsync(HOUR + 60_000);
    expect(fetchAll).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(fetchAll).toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it('skips while a fetch is already running', async () => {
    vi.useFakeTimers();
    const fetchAll = vi.fn();
    const { store, app } = mount(fetchAll, 0);
    await vi.advanceTimersByTimeAsync(HOUR);
    store.dispatch({ type: 'FETCH_START', sources: ['linkedin'] });
    await vi.advanceTimersByTimeAsync(3 * HOUR);
    expect(fetchAll).not.toHaveBeenCalled();
    app.unmount();
  });
});

describe('isRomania', () => {
  it('matches Romanian locations only', () => {
    expect(isRomania('Cluj-Napoca, Cluj, Romania')).toBe(true);
    expect(isRomania('România')).toBe(true);
    expect(isRomania('romania')).toBe(true);
    expect(isRomania('Germany')).toBe(false);
    expect(isRomania('')).toBe(false);
    expect(isRomania(undefined)).toBe(false);
  });
});
