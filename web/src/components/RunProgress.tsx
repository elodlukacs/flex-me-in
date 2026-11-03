import { useState } from 'react';
import type { AiStatus, MetaResponse, RefreshStatus } from '../../../src/server/contract.js';
import { Icon } from './Icon.js';
import { ProgressChip } from './ProgressChip.js';

interface RunProgressProps {
  refresh: RefreshStatus | null;
  /** Show the refresh panel (running, or finished and not yet dismissed). */
  showRefresh: boolean;
  ai: AiStatus | null;
  sources: MetaResponse['sources'];
  onDismiss: () => void;
}

/** Compact live progress for a refresh (per source) and the AI run (per batch). */
export function RunProgress({ refresh, showRefresh, ai, sources, onDismiss }: RunProgressProps) {
  const [openError, setOpenError] = useState<string | null>(null);
  const labelOf = (id: string) => sources.find((s) => s.id === id)?.short ?? id;
  const aiRunning = ai?.state === 'running';
  if (!(showRefresh && refresh) && !aiRunning) return null;

  const running = refresh?.state === 'running';
  const done = refresh?.sources.filter((s) => s.state === 'done' || s.state === 'error').length ?? 0;
  const errorItem = refresh?.sources.find((s) => s.source === openError && s.state === 'error');

  return (
    <section className="progress" aria-label="Background tasks">
      {showRefresh && refresh && (
        <div className="progress-block">
          <div className="progress-head">
            <span className="progress-title">
              {running ? `Refreshing ${done}/${refresh.sources.length}` : refresh.state === 'error' ? 'Refresh failed' : 'Refresh finished'}
            </span>
            {!running && (
              <button type="button" className="icon-btn icon-btn-sm" aria-label="Dismiss refresh progress" onClick={onDismiss}>
                <Icon name="x" size={16} />
              </button>
            )}
          </div>
          <div className="progress-chips">
            {refresh.sources.map((p) => (
              <ProgressChip
                key={p.source}
                progress={p}
                label={labelOf(p.source)}
                selected={openError === p.source}
                onSelect={() => setOpenError((s) => (s === p.source ? null : p.source))}
              />
            ))}
          </div>
          {errorItem && (
            <p className="progress-error" role="status">
              <strong>{labelOf(errorItem.source)}:</strong> {errorItem.error || 'Unknown error'}
            </p>
          )}
        </div>
      )}
      {aiRunning && ai && (
        <div className="progress-block">
          <div className="progress-head">
            <span className="progress-title">
              <span className="dot-spinner" aria-hidden="true" /> AI filter
              {ai.batch && ai.totalBatches ? ` · batch ${ai.batch}/${ai.totalBatches}` : ' · starting'}
            </span>
          </div>
          <div
            className="progress-bar"
            role="progressbar"
            aria-label="AI filter progress"
            aria-valuemin={0}
            aria-valuemax={ai.totalBatches ?? 1}
            aria-valuenow={Math.max(0, (ai.batch ?? 1) - 1)}
          >
            <span style={{ width: `${ai.totalBatches ? (Math.max(0, (ai.batch ?? 1) - 0.5) / ai.totalBatches) * 100 : 5}%` }} />
          </div>
        </div>
      )}
    </section>
  );
}
