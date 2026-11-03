import type { SourceProgress } from '../../../src/server/contract.js';
import { Icon } from './Icon.js';

interface ProgressChipProps {
  progress: SourceProgress;
  label: string;
  selected: boolean;
  onSelect: () => void;
}

/** One source in the refresh progress row: spinner, ✓ + count, or ✗ (tap for the error). */
export function ProgressChip({ progress: p, label, selected, onSelect }: ProgressChipProps) {
  const busy = p.state === 'pending' || p.state === 'fetching';
  const failed = p.state === 'error';
  const body = (
    <>
      {busy && <span className={`dot-spinner${p.state === 'pending' ? ' is-pending' : ''}`} aria-hidden="true" />}
      {p.state === 'done' && <Icon name="check" size={14} />}
      {failed && <Icon name="x" size={14} />}
      <span>{label}</span>
      {(p.state === 'done' || (p.state === 'fetching' && p.count > 0)) && (
        <span className="progress-count">
          {p.count}
          {p.partial ? '+' : ''}
        </span>
      )}
    </>
  );
  const cls = `progress-chip is-${p.state}`;
  if (failed) {
    return (
      <button type="button" className={cls} aria-expanded={selected} onClick={onSelect} aria-label={`${label} failed, show error`}>
        {body}
      </button>
    );
  }
  const status = busy ? (p.state === 'pending' ? 'waiting' : 'fetching') : `${p.count} jobs${p.partial ? ', stopped early' : ''}`;
  return (
    <span className={cls} role="img" aria-label={`${label}: ${status}`}>
      {body}
    </span>
  );
}
