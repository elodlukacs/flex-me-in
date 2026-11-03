import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiStatus, RefreshStatus } from '../../../src/server/contract.js';
import { api, errorMessage } from '../api.js';
import { showToast } from '../toasts.js';
import { useRun, type Run } from './useRun.js';

interface Options {
  enabled: boolean;
  aiConfigured: boolean;
  /** Reload jobs and meta after a run changed the data. */
  onDataChanged: () => void;
  /** Whether the AI picks toggle is already on (else the toast offers "Show"). */
  aiShown: boolean;
  onShowAi: () => void;
}

export interface BackgroundRuns {
  refresh: Run<RefreshStatus>;
  ai: Run<AiStatus>;
  showRefreshPanel: boolean;
  dismissRefreshPanel: () => void;
  startRefresh: () => void;
  startAi: () => void;
}

/** How long a clean refresh's ✓ chips stay up after it finishes. */
const LINGER_MS = 3000;

/** The fetch run and the AI run: start, attach, poll, and report when done. */
export function useBackgroundRuns({ enabled, aiConfigured, onDataChanged, aiShown, onShowAi }: Options): BackgroundRuns {
  const [panel, setPanel] = useState(false);
  const lingerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ onDataChanged, aiShown, onShowAi });
  latest.current = { onDataChanged, aiShown, onShowAi };

  const clearLinger = () => {
    if (lingerTimer.current) clearTimeout(lingerTimer.current);
    lingerTimer.current = null;
  };

  const refresh = useRun<RefreshStatus>({
    enabled,
    read: api.refreshStatus,
    start: useCallback(() => api.startRefresh(), []),
    onFinish: (s) => {
      latest.current.onDataChanged();
      const failed = s.state === 'error';
      const someFailed = s.sources.some((p) => p.state === 'error');
      showToast(s.summary || (failed ? 'Refresh failed' : 'Refresh finished'), {
        tone: failed ? 'error' : 'success',
        duration: 5000,
      });
      clearLinger();
      // Keep failed chips up so the error can be read; tidy away a clean run.
      if (!failed && !someFailed) lingerTimer.current = setTimeout(() => setPanel(false), LINGER_MS);
    },
  });

  const ai = useRun<AiStatus>({
    enabled: enabled && aiConfigured,
    read: api.aiStatus,
    start: api.startAi,
    onFinish: (s) => {
      latest.current.onDataChanged();
      if (s.state === 'error') {
        // A refresh aborts an AI run on purpose; that's not a failure.
        const superseded = /refresh started/i.test(s.message ?? '');
        showToast(
          superseded ? 'AI filter stopped for the refresh — run it again afterwards' : s.message || 'AI filter failed',
          { tone: superseded ? 'info' : 'error', duration: 6000 },
        );
        return;
      }
      if (!s.submitted) {
        showToast(s.message || 'No new jobs to classify');
        return;
      }
      const kept = s.kept ?? 0;
      const of = s.submitted ? ` of ${s.submitted}` : '';
      showToast(`AI kept ${kept}${of} jobs${s.message ? ` — ${s.message}` : ''}`, {
        tone: 'success',
        action: latest.current.aiShown || kept === 0 ? undefined : { label: 'Show', onClick: () => latest.current.onShowAi() },
      });
    },
  });

  // A run already going when the app opened: show its progress too.
  useEffect(() => {
    if (refresh.running) {
      clearLinger();
      setPanel(true);
    }
  }, [refresh.running]);

  useEffect(() => clearLinger, []);

  const startRefresh = useCallback(() => {
    if (!enabled) return;
    clearLinger();
    setPanel(true);
    refresh.start().catch((err: unknown) => {
      setPanel(false);
      showToast(`Couldn’t start a refresh: ${errorMessage(err)}`, { tone: 'error' });
      latest.current.onDataChanged();
    });
  }, [enabled, refresh]);

  const startAi = useCallback(() => {
    if (!enabled) return;
    if (ai.running) {
      showToast('The AI filter is already running');
      return;
    }
    ai.start().catch((err: unknown) => showToast(`Couldn’t start the AI filter: ${errorMessage(err)}`, { tone: 'error' }));
  }, [enabled, ai]);

  return {
    refresh,
    ai,
    showRefreshPanel: panel,
    dismissRefreshPanel: useCallback(() => {
      clearLinger();
      setPanel(false);
    }, []),
    startRefresh,
    startAi,
  };
}
