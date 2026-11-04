import type { UiState } from '../hooks/useUiState.js';
import { EmptyState } from './EmptyState.js';

interface ListEmptyProps {
  ui: UiState;
  aiOn: boolean;
  sourceLabel: string | null;
  error: string | null;
  onRetry: () => void;
  onRefresh: () => void;
  onClearSearch: () => void;
  onRunAi: () => void;
}

/** Says why the list is empty and offers the one thing to do about it. */
export function ListEmpty({ ui, aiOn, sourceLabel, error, onRetry, onRefresh, onClearSearch, onRunAi }: ListEmptyProps) {
  if (error) {
    return (
      <EmptyState
        title="Couldn’t load jobs"
        hint={error}
        action={<button type="button" className="btn btn-primary" onClick={onRetry}>Try again</button>}
      />
    );
  }
  const on = sourceLabel ? ` on ${sourceLabel}` : '';
  if (ui.q.trim()) {
    return (
      <EmptyState
        title={`No jobs match “${ui.q.trim()}”${on}`}
        hint="Search looks at the title, company and country."
        action={<button type="button" className="btn" onClick={onClearSearch}>Clear search</button>}
      />
    );
  }
  if (aiOn) {
    return (
      <EmptyState
        title={`No AI picks${on}`}
        hint="Run the AI filter to pick out the remote-friendly new jobs."
        action={<button type="button" className="btn btn-primary" onClick={onRunAi}>Run AI filter</button>}
      />
    );
  }
  switch (ui.status) {
    case 'saved':
      return <EmptyState title={`Nothing saved for later${on}`} hint="Tap Save on a job you want to come back to, say for a long application form." />;
    case 'applied':
      return <EmptyState title={`Nothing marked applied${on}`} hint="Tap Applied on a job once you’ve sent your application." />;
    case 'ignored':
      return <EmptyState title={`No ignored jobs${on}`} hint="Jobs you hide end up here, so you can restore them." />;
    default:
      return (
        <EmptyState
          title={ui.status === 'new' ? `No new jobs${on}` : `No jobs yet${on}`}
          hint="Pull down to refresh, or tap Refresh to fetch the job boards."
          action={<button type="button" className="btn btn-primary" onClick={onRefresh}>Refresh now</button>}
        />
      );
  }
}
