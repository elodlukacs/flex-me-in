import { useEffect, useState } from 'react';
import type { JobStatus, Source } from '../../../src/server/contract.js';
import { storage } from '../storage.js';

export type StatusFilter = JobStatus | 'all';
export type SourceFilter = Source | 'all';

export interface UiState {
  source: SourceFilter;
  status: StatusFilter;
  q: string;
  ai: boolean;
}

const KEY = 'fe-hunt.ui';
const STATUSES: StatusFilter[] = ['new', 'applied', 'ignored', 'all'];

function load(): UiState {
  const saved = storage.getJson<UiState>(KEY) ?? {};
  return {
    // Unknown sources are dropped once meta arrives (see App).
    source: typeof saved.source === 'string' ? saved.source : 'all',
    status: STATUSES.includes(saved.status as StatusFilter) ? (saved.status as StatusFilter) : 'new',
    q: typeof saved.q === 'string' ? saved.q : '',
    ai: saved.ai === true,
  };
}

/** Selected source, status, search and AI toggle, remembered across launches. */
export function useUiState(): [UiState, (patch: Partial<UiState>) => void] {
  const [state, setState] = useState(load);
  useEffect(() => {
    storage.setJson(KEY, state);
  }, [state]);
  const update = (patch: Partial<UiState>) => setState((s) => ({ ...s, ...patch }));
  return [state, update];
}
