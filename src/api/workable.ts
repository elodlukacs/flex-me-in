import type { Job } from '../state/types.js';
import type { FetchResult, WorkableJob } from './types.js';
import {
  httpJson,
  normalizeJob,
  parseDateOnly,
  stripHtml,
  abortableDelay,
  collapseByRole,
} from './common.js';
import { generateJobId } from '../db/helpers.js';
import { isSeniorFrontend } from './relevance.js';
import { isEMEALocation } from './regions.js';
import { logError } from '../utils/log.js';

// Workable's cross-company meta board. `query` + `workplace` are server-side;
// paging is cursor-based via nextPageToken (page/offset params are ignored).
const API_URL = 'https://jobs.workable.com/api/v1/jobs';
/**
 * The search is token-based: `frontend` misses "Front End" and many "React"
 * titles, so each query adds roles the others don't (verified 2026-11-03).
 */
const QUERIES = ['frontend', 'front end', 'react'] as const;
/** 20 rows a page; `frontend` alone is ~660 rows, so this reads every page. */
const MAX_PAGES_PER_QUERY = 50;
/** ~100 requests a run across the queries; 300ms drew 429s. */
const DELAY_MS = 1000;
/** Distinct roles (title|company), not raw rows — see fetchWorkable. */
const MAX_JOBS = 400;

/** Every country the posting lists — one role is often posted US + several EU. */
function jobCountries(job: WorkableJob): string[] {
  const all = [job.location, ...(Array.isArray(job.locations) ? job.locations : [])]
    .map((l) => l?.countryName || l?.country || '')
    .filter(Boolean);
  return [...new Set(all)];
}

function roleKey(job: Job): string {
  return `${job.title.trim().toLowerCase()}|${job.company.trim().toLowerCase()}`;
}

export interface WorkablePage {
  jobs: Job[];
  /** Rows on the page before filtering. */
  scanned: number;
  nextPageToken?: string;
}

/** Pure: one response page -> relevant, in-region jobs (not yet collapsed). */
export function parseWorkablePage(body: unknown): WorkablePage {
  const list = (body as { jobs?: unknown } | null | undefined)?.jobs;
  if (!Array.isArray(list)) throw new Error('Workable response shape changed (no jobs array)');
  const token = (body as { nextPageToken?: unknown }).nextPageToken;

  const jobs: Job[] = [];
  for (const raw of list as (WorkableJob | null)[]) {
    if (!raw?.id || typeof raw.title !== 'string' || !raw.title) continue;
    if (!isSeniorFrontend(raw.title)) continue;

    // The board is worldwide; this tool is EMEA-focused. No country at all
    // passes, as for every source: remote listings often omit it.
    const countries = jobCountries(raw);
    const inRegion = countries.filter((c) => isEMEALocation(c));
    if (countries.length > 0 && inRegion.length === 0) continue;
    const country = inRegion.join(', ');

    jobs.push(
      normalizeJob({
        id: generateJobId('workable', raw.id, {
          title: raw.title,
          company: raw.company?.title ?? '',
        }),
        title: raw.title,
        company: raw.company?.title || 'Unknown',
        url: raw.url || '',
        source: 'workable',
        datePosted: parseDateOnly(raw.created ?? raw.updated ?? ''),
        country,
        // Guaranteed by workplace=remote.
        workType: 'remote',
        description: stripHtml(raw.description ?? ''),
      })
    );
  }
  return {
    jobs,
    scanned: list.length,
    nextPageToken: typeof token === 'string' && token ? token : undefined,
  };
}

export async function fetchWorkable(
  signal?: AbortSignal,
  onProgress?: (count: number) => void
): Promise<FetchResult> {
  const jobs: Job[] = [];
  const seen = new Set<string>();
  // The cap counts roles, not rows: one posting fans out once per hiring
  // country, so counting rows stopped paging after a handful of roles.
  const roles = new Set<string>();
  let complete = true;
  let scanned = 0;
  let requests = 0;

  queries: for (const query of QUERIES) {
    let pageToken: string | undefined;
    for (let page = 0; ; page++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      // A cap that ends paging leaves rows unread: never purge on that.
      if (page >= MAX_PAGES_PER_QUERY || roles.size >= MAX_JOBS) {
        complete = false;
        break;
      }
      if (requests > 0) await abortableDelay(DELAY_MS, signal);
      requests++;

      const params = new URLSearchParams({ query, workplace: 'remote' });
      if (pageToken) params.set('pageToken', pageToken);

      let parsed: WorkablePage;
      try {
        const res = await httpJson<unknown>(`${API_URL}?${params.toString()}`, { signal });
        if (!res.ok) throw new Error(`Workable returned ${res.status}`);
        parsed = parseWorkablePage(res.body);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err;
        // The very first request failing is the source failing; anything
        // later just means the caller must not purge rows we never reached.
        // Either way the next query would get the same answer (a 429 is
        // host-wide), so stop rather than hammer it.
        if (requests === 1) throw err;
        logError(`workable "${query}" page ${page}`, err);
        complete = false;
        break queries;
      }

      scanned += parsed.scanned;
      for (const job of parsed.jobs) {
        if (seen.has(job.id)) continue;
        const key = roleKey(job);
        if (!roles.has(key) && roles.size >= MAX_JOBS) continue;
        seen.add(job.id);
        roles.add(key);
        jobs.push(job);
      }

      onProgress?.(roles.size);

      pageToken = parsed.nextPageToken;
      if (!pageToken) break;
    }
  }

  // One posting is listed once per hiring country; merge them into one row.
  const collapsed = collapseByRole(jobs);
  onProgress?.(collapsed.length);
  return { jobs: collapsed, complete, scanned };
}
