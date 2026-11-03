import type { Job } from '../state/types.js';
import type { FetchResult, JustJoinOffer, JustJoinResponse } from './types.js';
import { httpJson, normalizeJob, abortableDelay, parseDateOnly } from './common.js';
import { generateJobId } from '../db/helpers.js';
import { isSeniorFrontend } from './relevance.js';
import { logError } from '../utils/log.js';

// The site's own same-origin proxy (its `cpApiUrl`). api.justjoin.it/v2 has
// answered every unauthenticated request with an nginx 503 since 2026-08.
const API_URL = 'https://justjoin.it/api/candidate-api/offers';
/** JustJoin.IT's category slug for JavaScript (their frontend bucket). */
const JAVASCRIPT_CATEGORY = 'javascript';
const PER_PAGE = 50;
const MAX_PAGES = 10;
const DELAY_MS = 400;
const MAX_JOBS = 300;

function buildUrl(from: number): string {
  // Arrays go as repeated bare keys: the `categories[]=` form is silently
  // ignored and returns the whole unfiltered board with a 200.
  const params = new URLSearchParams({
    categories: JAVASCRIPT_CATEGORY,
    experienceLevels: 'senior',
    remoteWorkOptions: 'remote',
    sortBy: 'newest',
    orderBy: 'descending',
    itemsCount: String(PER_PAGE),
    from: String(from),
  });
  return `${API_URL}?${params.toString()}`;
}

export interface JustJoinPage {
  offers: JustJoinOffer[];
  /** Offset of the next page, or undefined on the last one. */
  nextFrom?: number;
}

/** Pure: one response body -> its offers and where the next page starts. */
export function parseJustJoinPage(body: unknown): JustJoinPage {
  const page = body as Partial<JustJoinResponse> | null | undefined;
  if (!Array.isArray(page?.data)) throw new Error('JustJoin.IT response shape changed (no data array)');
  const offers = page.data.filter((o): o is JustJoinOffer => !!o && typeof o === 'object');

  // A filter the API stopped recognising doesn't error, it widens the feed to
  // every category; catch that instead of ingesting the whole board.
  if (offers.some((o) => o.category?.key && o.category.key !== JAVASCRIPT_CATEGORY)) {
    throw new Error('JustJoin.IT ignored the category filter (API params changed)');
  }

  const from = typeof page.meta?.from === 'number' ? page.meta.from : 0;
  const total = page.meta?.totalItems;
  // `next.cursor` is not null on the last page (it equals totalItems), so
  // the end is decided by the count.
  const end = from + page.data.length;
  const nextFrom = typeof total === 'number' && end < total && page.data.length > 0 ? end : undefined;
  return { offers, nextFrom };
}

async function fetchPage(from: number, signal?: AbortSignal): Promise<JustJoinPage> {
  const res = await httpJson<unknown>(buildUrl(from), {
    signal,
    headers: { Accept: 'application/json' },
  });
  // Retries (incl. Retry-After on 429) are exhausted by this point.
  if (!res.ok) throw new Error(`JustJoin.IT returned ${res.status}`);
  return parseJustJoinPage(res.body);
}

export async function fetchJustJoinIT(
  signal?: AbortSignal,
  onProgress?: (count: number) => void
): Promise<FetchResult> {
  const jobs: Job[] = [];
  const seen = new Set<string>();
  let complete = true;
  let scanned = 0;
  let from: number | undefined = 0;

  for (let page = 0; from !== undefined; page++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    // A cap that ends paging leaves offers unread: never purge on that.
    if (page >= MAX_PAGES || jobs.length >= MAX_JOBS) {
      complete = false;
      break;
    }
    if (page > 0) await abortableDelay(DELAY_MS, signal);

    let result: JustJoinPage;
    try {
      result = await fetchPage(from, signal);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      // Page 1 failing (even a 429) is the source failing: surface it rather
      // than reporting "0 jobs". A later page only makes the result partial.
      if (page === 0) throw err;
      logError(`justjoinit from=${from}`, err);
      complete = false;
      break;
    }

    if (result.offers.length === 0) break;
    scanned += result.offers.length;

    for (const offer of result.offers) {
      if (jobs.length >= MAX_JOBS) {
        complete = false;
        break;
      }
      if (!offer.slug || typeof offer.title !== 'string' || !offer.title) continue;
      // Strict remote-only: the API filter has returned hybrid offers with a
      // remote option before, so enforce it here too.
      if (offer.workplaceType !== 'remote') continue;
      if (seen.has(offer.slug)) continue;
      // The category + experience params already mean senior frontend, so a
      // bare "Senior Software Engineer" still counts; the gate drops the
      // backend/mobile titles the category leaks.
      if (!isSeniorFrontend(offer.title, { assumeFrontend: true, assumeSenior: true })) {
        continue;
      }
      seen.add(offer.slug);

      jobs.push(
        normalizeJob({
          id: generateJobId('justjoinit', offer.slug, {
            title: offer.title,
            company: offer.companyName ?? 'Unknown',
          }),
          title: offer.title,
          company: offer.companyName || 'Unknown',
          url: `https://justjoin.it/job-offer/${offer.slug}`,
          source: 'justjoinit',
          // `publishedAt` moves on every refresh; `lastPublishedAt` is the
          // original posting date.
          datePosted: parseDateOnly(offer.lastPublishedAt || offer.publishedAt || ''),
          // No longer Poland-only (e.g. Valencia), so the city stays as given.
          country: offer.city || offer.locations?.[0]?.city || '',
          workType: 'remote',
        })
      );
    }

    onProgress?.(jobs.length);
    from = result.nextFrom;
  }

  return { jobs, complete, scanned };
}
