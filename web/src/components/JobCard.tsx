import { memo, useRef, useState, type MouseEvent } from 'react';
import type { ListedJob, RemoteStatus } from '../../../src/server/contract.js';
import { useSwipe } from '../hooks/useSwipe.js';
import { formatAge } from '../time.js';
import { Icon } from './Icon.js';
import { JobDetails } from './JobDetails.js';

interface JobCardProps {
  job: ListedJob;
  sourceLabel: string;
  now: number;
  leaving: boolean;
  onToggleApplied: (job: ListedJob) => void;
  onToggleHidden: (job: ListedJob) => void;
}

const AI_LABEL: Record<RemoteStatus, string> = {
  yes: 'AI: remote',
  possible: 'AI: maybe remote',
  no: 'AI: not remote',
};

function location(job: ListedJob): string {
  const work = job.workType ? job.workType[0].toUpperCase() + job.workType.slice(1) : '';
  return [job.country, work].filter(Boolean).join(' · ');
}

export const JobCard = memo(function JobCard({ job, sourceLabel, now, leaving, onToggleApplied, onToggleHidden }: JobCardProps) {
  const [expanded, setExpanded] = useState(false);
  const card = useRef<HTMLElement>(null);
  const justSwiped = useSwipe(card, {
    onSwipeLeft: () => onToggleHidden(job),
    onSwipeRight: () => onToggleApplied(job),
  });

  const applied = job.status === 'applied';
  const hidden = job.status === 'ignored';
  // Only untriaged jobs: once acted on, "just in" is no longer news.
  const fresh = !!job.fresh && job.status === 'new';
  const detailsId = `details-${job.id}`;
  const loc = location(job);

  const onLinkClick = (e: MouseEvent) => {
    if (justSwiped.current) e.preventDefault();
  };

  return (
    <li className={`card-wrap${leaving ? ' is-leaving' : ''}`} aria-hidden={leaving || undefined}>
      <div className="card-clip">
        <div className="swipe-bg" aria-hidden="true">
          <span className="swipe-bg-right">
            <Icon name="check" /> {applied ? 'Not applied' : 'Applied'}
          </span>
          <span className="swipe-bg-left">
            {hidden ? 'Restore' : 'Hide'} <Icon name="x" />
          </span>
        </div>
        <article
          className={`card${applied ? ' is-applied' : ''}${hidden ? ' is-hidden' : ''}${fresh ? ' is-fresh' : ''}`}
          ref={card}
        >
          <a className="card-link" href={job.url} target="_blank" rel="noopener noreferrer" onClick={onLinkClick}>
            <div className="card-tags">
              {fresh && (
                <span className="tag tag-fresh">
                  <span className="fresh-dot" aria-hidden="true" />
                  Just in
                </span>
              )}
              <span className="tag tag-source">{sourceLabel}</span>
              {job.datePosted && <span className="card-age">{formatAge(job.datePosted, now)}</span>}
              {job.ai && <span className={`tag tag-ai is-${job.ai}`}>{AI_LABEL[job.ai]}</span>}
              {applied && <span className="tag tag-applied">Applied</span>}
              {hidden && <span className="tag tag-hidden">Ignored</span>}
              <Icon name="external" size={16} className="card-ext" />
            </div>
            <h2 className="card-title">{job.title}</h2>
            <p className="card-company">{job.company || 'Unknown company'}</p>
            {loc && <p className="card-loc">{loc}</p>}
          </a>
          <div className="card-actions">
            <button
              type="button"
              className={`action${applied ? ' is-on' : ''}`}
              aria-pressed={applied}
              onClick={() => onToggleApplied(job)}
            >
              <Icon name="check" size={18} />
              <span>Applied</span>
            </button>
            <button type="button" className="action" onClick={() => onToggleHidden(job)}>
              <Icon name={hidden ? 'undo' : 'x'} size={18} />
              <span>{hidden ? 'Restore' : 'Hide'}</span>
            </button>
            <button
              type="button"
              className="action"
              aria-expanded={expanded}
              aria-controls={expanded ? detailsId : undefined}
              onClick={() => setExpanded((x) => !x)}
            >
              <Icon name="chevron-down" size={18} className={expanded ? 'flip' : undefined} />
              <span>Details</span>
            </button>
          </div>
          {expanded && <JobDetails id={job.id} domId={detailsId} />}
        </article>
      </div>
    </li>
  );
});
