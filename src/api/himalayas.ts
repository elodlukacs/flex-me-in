import type { Job } from '../state/types.js';
import type { FetchResult, HimalayasJob } from './types.js';
import { abortableDelay, formatUnixDate, httpJson, normalizeJob, stripHtml } from './common.js';
import { generateJobId } from '../db/helpers.js';
import { isSeniorFrontend } from './relevance.js';
import { isEMEALocation } from './regions.js';
import { logError } from '../utils/log.js';

// The *search* endpoint, not the unfiltered browse feed (/jobs/api) this
// source was once dropped for. `q` and `seniority` are server-side; results
// are relevance-ordered, 20 a page, page-numbered (no cursor). ~1,800 hits for
// q=frontend&seniority=Senior on 2026-11-03, the first pages all frontend.
const API_URL = 'https://himalayas.app/jobs/api/search';
const PER_PAGE = 20;
const MAX_PAGES = 40;
const DELAY_MS = 500;
const MAX_JOBS = 300;
/** Relevance-ordered: pages with no relevant title mean the tail has drifted. */
const MAX_EMPTY_PAGES = 2;
/** Older postings would only be expired by the DB on the same run. */
const MAX_AGE_DAYS = 30;

const SENIOR_LEVELS = new Set(['senior', 'lead', 'staff', 'principal']);

function buildUrl(page: number): string {
  const params = new URLSearchParams({ q: 'frontend', seniority: 'Senior', page: String(page) });
  return `${API_URL}?${params.toString()}`;
}

export interface HimalayasPage {
  jobs: Job[];
  /** Rows before filtering. */
  scanned: number;
  /** Rows whose title passed the relevance gate, whatever their region. */
  relevant: number;
  totalCount?: number;
}

/** Pure: one response page -> relevant, EMEA-eligible, recent jobs. */
export function parseHimalayasPage(body: unknown, now: number = Date.now()): HimalayasPage {
  const page = body as { jobs?: unknown; totalCount?: unknown } | null | undefined;
  if (!Array.isArray(page?.jobs)) throw new Error('Himalayas response shape changed (no jobs array)');
  const cutoff = now / 1000 - MAX_AGE_DAYS * 86_400;

  const jobs: Job[] = [];
  let relevant = 0;
  for (const raw of page.jobs as (HimalayasJob | null)[]) {
    if (!raw?.guid || typeof raw.title !== 'string' || !raw.title) continue;

    // The board's own level label is applied server-side; it lets a title
    // without "Senior" ("Software Engineer Frontend - React") through.
    const senior = (raw.seniority ?? []).some((s) => SENIOR_LEVELS.has(String(s).toLowerCase()));
    if (!isSeniorFrontend(raw.title, { assumeSenior: senior })) continue;
    relevant++;

    if (raw.expiryDate && raw.expiryDate < now / 1000) continue;
    if (raw.pubDate && raw.pubDate < cutoff) continue;

    // Empty restrictions = hire from anywhere.
    const restrictions = Array.isArray(raw.locationRestrictions) ? raw.locationRestrictions : [];
    const inRegion = restrictions.filter((c) => typeof c === 'string' && isEMEALocation(c));
    if (restrictions.length > 0 && inRegion.length === 0) continue;

    jobs.push(
      normalizeJob({
        id: generateJobId('himalayas', raw.guid, { title: raw.title, company: raw.companyName }),
        title: raw.title,
        company: raw.companyName || 'Unknown',
        url: raw.guid,
        source: 'himalayas',
        datePosted: raw.pubDate ? formatUnixDate(raw.pubDate) : '',
        country: restrictions.length === 0 ? 'Worldwide' : inRegion.join(', '),
        // Himalayas only lists remote roles.
        workType: 'remote',
        description: stripHtml(raw.description ?? raw.excerpt ?? ''),
      })
    );
  }
  return {
    jobs,
    scanned: page.jobs.length,
    relevant,
    totalCount: typeof page.totalCount === 'number' ? page.totalCount : undefined,
  };
}

export async function fetchHimalayas(
  signal?: AbortSignal,
  onProgress?: (count: number) => void
): Promise<FetchResult> {
  const jobs: Job[] = [];
  const seen = new Set<string>();
  let complete = true;
  let scanned = 0;
  let emptyPages = 0;

  for (let page = 1; ; page++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    // A cap that ends paging leaves rows unread: never purge on that.
    if (page > MAX_PAGES || jobs.length >= MAX_JOBS) {
      complete = false;
      break;
    }
    if (page > 1) await abortableDelay(DELAY_MS, signal);

    let parsed: HimalayasPage;
    try {
      const res = await httpJson<unknown>(buildUrl(page), {
        signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`Himalayas returned ${res.status}`);
      parsed = parseHimalayasPage(res.body);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (page === 1) throw err;
      logError(`himalayas page ${page}`, err);
      complete = false;
      break;
    }

    scanned += parsed.scanned;
    for (const job of parsed.jobs) {
      if (seen.has(job.id)) continue;
      seen.add(job.id);
      jobs.push(job);
    }
    onProgress?.(jobs.length);

    // A short page is the last one.
    if (parsed.scanned < PER_PAGE) break;
    if (parsed.totalCount !== undefined && page * PER_PAGE >= parsed.totalCount) break;
    // The results are relevance-ordered, so a run of pages without a single
    // senior-frontend title is the end of the useful part. That is a judged
    // stop, not a cap: what follows is off-topic, so purging is safe.
    if (parsed.relevant === 0) {
      emptyPages++;
      if (emptyPages >= MAX_EMPTY_PAGES) break;
    } else {
      emptyPages = 0;
    }
  }

  return { jobs, complete, scanned };
}
