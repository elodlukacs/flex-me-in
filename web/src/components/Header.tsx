import type { ReactNode } from 'react';
import { Icon } from './Icon.js';

interface HeaderProps {
  updatedLine: string;
  /** "12 new" when the latest fetch brought jobs you haven't triaged; null hides it. */
  freshLine?: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  menu: ReactNode;
  children?: ReactNode;
}

/** Sticky top bar: name, freshness, the big Refresh button; filters go in `children`. */
export function Header({ updatedLine, freshLine, refreshing, onRefresh, menu, children }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-top">
        <div className="brand">
          <h1 className="brand-name">fe-hunt</h1>
          <p className="brand-updated" aria-live="polite">
            {updatedLine}
          </p>
          {freshLine && (
            <p className="brand-fresh">
              <span className="fresh-dot" aria-hidden="true" />
              {freshLine}
            </p>
          )}
        </div>
        <button
          type="button"
          className={`btn btn-primary refresh-btn${refreshing ? ' is-busy' : ''}`}
          onClick={onRefresh}
          aria-label={refreshing ? 'Refreshing job boards' : 'Refresh job boards'}
        >
          <Icon name="refresh" className={refreshing ? 'spin' : undefined} />
          <span>{refreshing ? 'Refreshing' : 'Refresh'}</span>
        </button>
        {menu}
      </div>
      {children}
    </header>
  );
}
