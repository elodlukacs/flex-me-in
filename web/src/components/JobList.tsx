import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ListedJob } from '../../../src/server/contract.js';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';
import { Icon } from './Icon.js';
import { JobCard } from './JobCard.js';
import { SkeletonList } from './SkeletonList.js';

interface JobListProps {
  jobs: ListedJob[] | null;
  /** Changes when the filters change, to start again from the first page. */
  resetKey: string;
  leaving: ReadonlySet<string>;
  labelOf: (source: string) => string;
  now: number;
  /** Rendered instead of the list when `jobs` is empty. */
  empty: ReactNode;
  onRefresh: () => void;
  onToggleApplied: (job: ListedJob) => void;
  onToggleHidden: (job: ListedJob) => void;
}

const PULL_TEXT = {
  idle: 'Pull to refresh',
  pulling: 'Pull to refresh',
  armed: 'Release to refresh',
  refreshing: 'Refreshing…',
} as const;

/** Cards rendered up front; more are added as the end of the list nears. */
const PAGE = 40;

export function JobList({ jobs, resetKey, leaving, labelOf, now, empty, onRefresh, onToggleApplied, onToggleHidden }: JobListProps) {
  const area = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLLIElement>(null);
  const phase = usePullToRefresh(area, onRefresh);
  const [limit, setLimit] = useState(PAGE);
  const total = jobs?.length ?? 0;

  useEffect(() => setLimit(PAGE), [resetKey]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || limit >= total) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE);
      },
      { rootMargin: '1200px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [limit, total]);

  return (
    <div className="ptr" ref={area}>
      <div className={`ptr-indicator is-${phase}`} aria-hidden={phase === 'idle'}>
        <span className="ptr-icon">
          <Icon name="refresh" size={18} className={phase === 'refreshing' ? 'spin' : undefined} />
        </span>
        <span>{PULL_TEXT[phase]}</span>
      </div>
      <div className="ptr-content">
        {jobs === null ? (
          <SkeletonList />
        ) : jobs.length === 0 ? (
          empty
        ) : (
          <ul className="list">
            {jobs.slice(0, limit).map((job) => (
              <JobCard
                key={job.id}
                job={job}
                sourceLabel={labelOf(job.source)}
                now={now}
                leaving={leaving.has(job.id)}
                onToggleApplied={onToggleApplied}
                onToggleHidden={onToggleHidden}
              />
            ))}
            {limit < total && <li className="list-sentinel" ref={sentinel} aria-hidden="true" />}
          </ul>
        )}
      </div>
    </div>
  );
}
