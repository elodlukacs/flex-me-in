import { useEffect, useRef, useState } from 'react';
import { useDebounced } from '../hooks/useDebounced.js';
import { Icon } from './Icon.js';

interface SearchBarProps {
  query: string;
  onQuery: (q: string) => void;
  /** Hidden when the AI isn't configured on the server. */
  showAi: boolean;
  ai: boolean;
  onAi: (on: boolean) => void;
}

export function SearchBar({ query, onQuery, showAi, ai, onAi }: SearchBarProps) {
  const [text, setText] = useState(query);
  const debounced = useDebounced(text, 300);

  const latest = useRef({ query, onQuery });
  latest.current = { query, onQuery };
  useEffect(() => {
    if (debounced !== latest.current.query) latest.current.onQuery(debounced);
  }, [debounced]);

  // External reset (e.g. "Clear search" in the empty state).
  useEffect(() => {
    setText((t) => (t.trim() === query.trim() ? t : query));
  }, [query]);

  return (
    <div className="filter-row">
      <form className="search" role="search" onSubmit={(e) => {
        e.preventDefault();
        onQuery(text);
        (document.activeElement as HTMLElement | null)?.blur();
      }}>
        <Icon name="search" className="search-icon" />
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          placeholder="Search jobs"
          aria-label="Search jobs"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {text && (
          <button
            type="button"
            className="search-clear"
            aria-label="Clear search"
            onClick={() => {
              setText('');
              onQuery('');
            }}
          >
            <Icon name="x" size={16} />
          </button>
        )}
      </form>
      {showAi && (
        <button type="button" className="toggle" aria-pressed={ai} onClick={() => onAi(!ai)}>
          <Icon name="sparkle" size={18} />
          <span>AI picks</span>
        </button>
      )}
    </div>
  );
}
