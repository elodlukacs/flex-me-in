import type { TabCounts } from '../../../src/server/contract.js';
import type { StatusFilter } from '../hooks/useUiState.js';

interface StatusTabsProps {
  selected: StatusFilter;
  /** For the active source, search and AI filter: each number is what that tab lists. */
  counts: TabCounts | null;
  onSelect: (status: StatusFilter) => void;
}

const TABS: { id: StatusFilter; label: string; count: keyof TabCounts }[] = [
  { id: 'new', label: 'New', count: 'new' },
  { id: 'backlog', label: 'Backlog', count: 'backlog' },
  { id: 'saved', label: 'Saved', count: 'saved' },
  { id: 'applied', label: 'Applied', count: 'applied' },
  { id: 'ignored', label: 'Ignored', count: 'ignored' },
  { id: 'all', label: 'All', count: 'total' },
];

/** Segmented status control, pinned to the bottom where the thumb is. */
export function StatusTabs({ selected, counts, onSelect }: StatusTabsProps) {
  return (
    <nav className="tabbar" aria-label="Job status">
      <div className="segmented" role="group">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className="segment"
            aria-pressed={selected === t.id}
            onClick={() => {
              if (selected === t.id) window.scrollTo({ top: 0, behavior: 'smooth' });
              else onSelect(t.id);
            }}
          >
            <span className="segment-label">{t.label}</span>
            <span className="segment-count">{counts ? (counts[t.count] ?? 0) : '–'}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
