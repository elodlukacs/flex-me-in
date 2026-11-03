import { useEffect, useRef } from 'react';
import type { MetaResponse, Source } from '../../../src/server/contract.js';
import type { SourceFilter } from '../hooks/useUiState.js';

interface SourceChipsProps {
  sources: MetaResponse['sources'];
  newBySource: Partial<Record<Source, number>>;
  selected: SourceFilter;
  onSelect: (source: SourceFilter) => void;
}

/** Horizontally scrolling source filter; badges count *new* jobs per board. */
export function SourceChips({ sources, newBySource, selected, onSelect }: SourceChipsProps) {
  const row = useRef<HTMLDivElement>(null);
  const total = Object.values(newBySource).reduce((a, b) => a + (b ?? 0), 0);
  const items: { id: SourceFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: total },
    ...sources.map((s) => ({ id: s.id, label: s.label, count: newBySource[s.id] ?? 0 })),
  ];

  // Keep the selected chip in view (e.g. restored from a previous session).
  // Re-run when badges change width; scroll only the row, never the page.
  useEffect(() => {
    const r = row.current;
    const el = r?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!r || !el) return;
    const margin = 16;
    const a = el.getBoundingClientRect();
    const b = r.getBoundingClientRect();
    if (a.left < b.left + margin) r.scrollLeft += a.left - b.left - margin;
    else if (a.right > b.right - margin) r.scrollLeft += a.right - b.right + margin;
  }, [selected, sources.length, total]);

  return (
    <div className="chips" ref={row} role="group" aria-label="Job board">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="chip"
          aria-pressed={selected === item.id}
          onClick={() => onSelect(item.id)}
        >
          <span>{item.label}</span>
          {item.count > 0 && (
            <span className="chip-count" aria-label={`${item.count} new`}>
              {item.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
