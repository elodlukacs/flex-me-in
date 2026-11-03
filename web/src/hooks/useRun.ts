import { useCallback, useEffect, useRef, useState } from 'react';
import type { RunState } from '../../../src/server/contract.js';

interface RunLike {
  state: RunState;
}

interface UseRunOptions<T extends RunLike> {
  /** GET the current or last run. */
  read: () => Promise<T>;
  /** POST to start one (the server returns the running one if already going). */
  start: () => Promise<T>;
  /** Called once when a run this hook watched leaves 'running'. */
  onFinish: (status: T) => void;
  /** Off until the app is authenticated. */
  enabled: boolean;
}

export interface Run<T> {
  status: T | null;
  running: boolean;
  /** Starts a run, or attaches to the one in progress. Throws if the POST fails. */
  start: () => Promise<void>;
}

const POLL_MS = 1000;
const RETRY_MS = 3000;

/** Drives a server-side background run (refresh or AI) by polling its status. */
export function useRun<T extends RunLike>({ read, start, onFinish, enabled }: UseRunOptions<T>): Run<T> {
  const [status, setStatus] = useState<T | null>(null);
  const watching = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** False after unmount/disable, so a request still in flight can't restart the loop. */
  const active = useRef(false);
  const latest = useRef({ read, onFinish });
  latest.current = { read, onFinish };

  const apply = useCallback((next: T) => {
    setStatus(next);
    if (next.state === 'running') {
      watching.current = true;
      return true;
    }
    if (watching.current) {
      watching.current = false;
      latest.current.onFinish(next);
    }
    return false;
  }, []);

  const poll = useCallback(async (): Promise<void> => {
    const schedule = (delay: number) => {
      if (!active.current) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void poll(), delay);
    };
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    try {
      if (apply(await latest.current.read())) schedule(POLL_MS);
    } catch {
      if (watching.current) schedule(RETRY_MS);
    }
  }, [apply]);

  // Attach to a run that is already going (started elsewhere or before a reload).
  useEffect(() => {
    if (!enabled) return;
    active.current = true;
    void poll();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && watching.current) void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      active.current = false;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [enabled, poll]);

  const startRun = useCallback(async () => {
    if (watching.current) {
      void poll();
      return;
    }
    const next = await start();
    watching.current = true;
    if (apply(next) && active.current) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void poll(), POLL_MS);
    }
  }, [start, apply, poll]);

  return { status, running: status?.state === 'running', start: startRun };
}
