import type { Job } from '../state/types.js';
import type { FetchResult } from './types.js';
import {
  httpText,
  normalizeJob,
  determineWorkType,
  abortableDelay,
  decodeHTMLEntities,
  parseDateOnly,
} from './common.js';
import { generateJobId } from '../db/helpers.js';
import { isSeniorFrontend } from './relevance.js';
import { isNonEMEALocation } from './regions.js';
import { logError } from '../utils/log.js';

const LINKEDIN_JOBS_API = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
/**
 * The guest search changes shape without notice (verified 2026-11-03, same
 * day): sometimes 25 cards a page with a hard stop at 100 per query,
 * sometimes 10 a page with no stop at all. So paging follows the cards
 * actually returned, each query is capped by cards read, and the per-country
 * slices — only useful under the 100-card stop — run only when it is seen.
 *
 * Each keyword below surfaced 12–38 relevant postings the others missed in a
 * 7-day Europe search; "Senior TypeScript" was mostly backend and is left out.
 */
const KEYWORDS = [
  'Senior Frontend Developer',
  'Senior Frontend Engineer',
  'Senior React Developer',
  'Senior Angular Developer',
  'Senior Vue Developer',
  'Senior Front End',
  'Senior UI Engineer',
] as const;
/** The per-country slices only run the broad keywords: the rest is long tail. */
const COUNTRY_KEYWORDS: readonly string[] = KEYWORDS.slice(0, 2);
const FRESH_RANGE = 'r86400';
const WEEK_RANGE = 'r604800';
/** Where the 25-a-page variant stops serving cards. */
const CEILING_CARDS = 100;
const MAX_CARDS_PER_QUERY = 250;
const DELAY_MS = 800;
const MAX_JOBS = 600;
/** Hard ceiling on requests per fetch, so a bad day can't hammer LinkedIn. */
const MAX_REQUESTS = 200;
/** Consecutive pages with no relevant card end a query: it has drifted off-topic. */
const MAX_EMPTY_PAGES = 2;

// LinkedIn geoIds — far more reliable than free-text location strings.
type GeoSearch = { label: string; geoId: string };

const EMEA_GEO_SEARCHES: GeoSearch[] = [
  { label: 'Europe', geoId: '91000000' },
  { label: 'European Economic Area', geoId: '100506914' },
  { label: 'United Kingdom', geoId: '101165590' },
  { label: 'Germany', geoId: '101282230' },
  { label: 'France', geoId: '105015875' },
  { label: 'Spain', geoId: '105646813' },
  { label: 'Italy', geoId: '103350119' },
  { label: 'Netherlands', geoId: '102890719' },
  { label: 'Poland', geoId: '105072130' },
  { label: 'Portugal', geoId: '100364837' },
  { label: 'Sweden', geoId: '105117694' },
  { label: 'Ireland', geoId: '104738515' },
];

function buildHeaders(): Record<string, string> {
  return {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Referer: 'https://www.linkedin.com/jobs/search/',
  };
}

function buildUrl(opts: {
  keywords: string;
  geoId: string;
  start: number;
  tpr: string; // r86400, r604800, etc
}): string {
  const params = new URLSearchParams({
    keywords: opts.keywords,
    geoId: opts.geoId,
    f_TPR: opts.tpr,
    f_WT: '2', // remote
    sortBy: 'DD', // date descending — freshest first
    start: String(opts.start),
  });
  return `${LINKEDIN_JOBS_API}?${params.toString()}`;
}

export interface LinkedInCard {
  jobId: string;
  title: string;
  company: string;
  location: string;
  datePosted: string;
  url: string;
}

export interface ParsedCards {
  /** Cards the card regex matched. 0 means the result list has ended. */
  cards: number;
  /** Cards a title could be read from — none while cards > 0 means broken markup. */
  parsed: LinkedInCard[];
}

function cleanText(fragment: string): string {
  return decodeHTMLEntities(fragment.replace(/<[^>]*>/g, '')).trim();
}

const RELATIVE_MS: Record<string, number> = { second: 1_000, minute: 60_000, hour: 3_600_000 };

/**
 * The card's `datetime` is a bare UTC date, so a job posted at 01:00 local
 * time read as yesterday, and today's postings could not sort above last
 * night's. Its text ("6 hours ago") is finer: under a day old, derive a UTC
 * timestamp to the minute from it; older than that, the date is as precise
 * as the text.
 */
export function postedAt(datetime: string, label: string, now: number = Date.now()): string {
  const rel = label.match(/(\d+)\s*(second|minute|hour)s?\s+ago/i);
  const ageMs = rel
    ? Number(rel[1]) * RELATIVE_MS[rel[2]!.toLowerCase()]!
    : /just now|moments? ago/i.test(label)
      ? 0
      : null;
  if (ageMs === null) return parseDateOnly(datetime);
  return new Date(now - ageMs).toISOString().slice(0, 16) + 'Z';
}

/** Pure: one search-results HTML fragment -> the cards it contains. */
export function parseCards(html: string, now: number = Date.now()): ParsedCards {
  const cardRegex =
    /<(?:div|li)[^>]*data-entity-urn="urn:li:jobPosting:(\d+)"[^>]*>([\s\S]*?)(?=<(?:div|li)[^>]*data-entity-urn="urn:li:jobPosting:|$)/g;

  const result: ParsedCards = { cards: 0, parsed: [] };
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    result.cards++;
    const jobId = match[1]!;
    const cardHtml = match[2] ?? '';

    let title = '';
    const titleMatch = cardHtml.match(
      /<h3[^>]*class="[^"]*base-search-card__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/
    );
    if (titleMatch?.[1]) title = cleanText(titleMatch[1]);
    if (!title) {
      const srTitleMatch = cardHtml.match(
        /<span[^>]*class="[^"]*sr-only[^"]*"[^>]*>([\s\S]*?)<\/span>/
      );
      if (srTitleMatch?.[1]) title = cleanText(srTitleMatch[1]);
    }
    if (!title || title.length < 3) continue;

    const companyMatch =
      cardHtml.match(/<a[^>]*class="[^"]*hidden-nested-link[^"]*"[^>]*>([\s\S]*?)<\/a>/) ||
      cardHtml.match(/<h4[^>]*class="[^"]*base-search-card__subtitle[^"]*"[^>]*>([\s\S]*?)<\/h4>/);
    const company = (companyMatch?.[1] && cleanText(companyMatch[1])) || 'Unknown';

    const locationMatch = cardHtml.match(
      /<span[^>]*class="[^"]*job-search-card__location[^"]*"[^>]*>([\s\S]*?)<\/span>/
    );
    const location = locationMatch?.[1] ? cleanText(locationMatch[1]) : '';

    const dateMatch = cardHtml.match(
      /<time[^>]*class="[^"]*job-search-card__listdate[^"]*"[^>]*datetime="([^"]+)"[^>]*>([\s\S]*?)<\/time>/
    );

    const urlMatch = cardHtml.match(/href="(https:\/\/[^"]*linkedin\.com\/jobs\/view\/[^"]+)"/);
    const url = (urlMatch?.[1] || `https://www.linkedin.com/jobs/view/${jobId}`).split('?')[0]!;

    result.parsed.push({
      jobId,
      title,
      company,
      location,
      datePosted: postedAt(dateMatch?.[1] ?? '', dateMatch?.[2] ?? '', now),
      url,
    });
  }
  return result;
}

function cardToJob(card: LinkedInCard): Job {
  return normalizeJob({
    // The numeric posting id is stable across title edits and unique per
    // posting, unlike a title+company hash.
    id: generateJobId('linkedin', card.jobId, { title: card.title, company: card.company }),
    title: card.title,
    company: card.company,
    url: card.url,
    source: 'linkedin',
    datePosted: card.datePosted,
    country: card.location,
    // Every search pins f_WT=2, so these results are remote by
    // construction — the location string is the office city and on its own
    // left workType empty, which made the `w` filter useless.
    workType: determineWorkType(card.location, true),
  });
}

/** Shared across geo searches: a block applies to the whole host, not one geo. */
interface FetchState {
  blocked: boolean;
  /** A page failed or paging was cut short: the result is partial. */
  incomplete: boolean;
  requests: number;
  cards: number;
  titled: number;
}

interface SearchSpec {
  keywords: string;
  geo: GeoSearch;
  /** f_TPR window: FRESH_RANGE or WEEK_RANGE. */
  range: string;
}

interface SearchOutcome {
  /** Cards read across the query's pages. */
  read: number;
  /** Ran dry at exactly the 100-card stop: there is probably more to slice. */
  hitCeiling: boolean;
}

/** Pages one search. */
async function fetchSearch(
  { keywords, geo, range }: SearchSpec,
  seenIds: Set<string>,
  jobs: Job[],
  shared: FetchState,
  signal: AbortSignal | undefined,
  onProgress?: (count: number) => void
): Promise<SearchOutcome> {
  let emptyPages = 0;
  let read = 0;
  const outcome = (hitCeiling = false): SearchOutcome => ({ read, hitCeiling });

  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (shared.blocked) return outcome();
    // A cap that ends paging leaves postings unread: never purge on that.
    if (read >= MAX_CARDS_PER_QUERY || jobs.length >= MAX_JOBS || shared.requests >= MAX_REQUESTS) {
      shared.incomplete = true;
      return outcome();
    }

    // Spacing goes before every request but the first — including the first
    // page of the next query.
    if (shared.requests > 0) await abortableDelay(DELAY_MS, signal);
    shared.requests++;

    const url = buildUrl({ keywords, geoId: geo.geoId, start: read, tpr: range });

    try {
      const res = await httpText(url, { signal, headers: buildHeaders(), retries: 1 });
      if (!res.ok) {
        // Rate-limited or blocked: every remaining query would get the same
        // answer, so stop the whole source instead of hammering it.
        if (res.status === 429 || res.status === 403) {
          shared.blocked = true;
          shared.incomplete = true;
          return outcome();
        }
        throw new Error(`LinkedIn returned ${res.status}`);
      }

      const { cards, parsed } = parseCards(res.body ?? '');
      shared.cards += cards;
      shared.titled += parsed.length;
      // No cards at all: past the last result page (or the 100-card stop).
      if (cards === 0) return outcome(read === CEILING_CARDS);
      read += cards;

      // Relevant cards, already-seen ones included: overlapping queries make
      // all-duplicate pages common, and counting those as empty ended a
      // query before it reached anything new.
      let relevant = 0;
      for (const card of parsed) {
        if (!isSeniorFrontend(card.title)) continue;
        // The geoId search already scopes to EMEA, and LinkedIn's location is
        // often a metro area ("Greater Paris Metropolitan Region") no country
        // list matches, so only drop postings explicitly placed elsewhere.
        if (isNonEMEALocation(card.location)) continue;
        relevant++;
        if (seenIds.has(card.jobId)) continue;
        if (jobs.length >= MAX_JOBS) {
          shared.incomplete = true;
          break;
        }
        seenIds.add(card.jobId);
        jobs.push(cardToJob(card));
      }
      onProgress?.(jobs.length);

      if (relevant === 0) {
        emptyPages++;
        if (emptyPages >= MAX_EMPTY_PAGES) return outcome();
      } else {
        emptyPages = 0;
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      logError(`linkedin "${keywords}" ${geo.label} ${range} start=${read}`, error);
      shared.incomplete = true;
      return outcome();
    }
  }
}

export interface SearchPlan {
  /** Every keyword across Europe: past 24 h first, then the past 7 days. */
  europe: SearchSpec[];
  /**
   * The broad keywords per country, past 7 days. Only run when a broad
   * Europe query hit the 100-card stop: each slice has its own 100, so it
   * reaches postings the Europe-wide query cut off.
   */
  countries: SearchSpec[];
}

/**
 * Freshest and broadest first, so a request cap or a block costs the long
 * tail, not today's postings.
 */
export function searchPlan(): SearchPlan {
  const [europeGeo, ...countryGeos] = EMEA_GEO_SEARCHES;
  const europe: SearchSpec[] = [];
  for (const range of [FRESH_RANGE, WEEK_RANGE]) {
    for (const keywords of KEYWORDS) europe.push({ keywords, geo: europeGeo!, range });
  }
  const countries: SearchSpec[] = [];
  for (const geo of countryGeos) {
    for (const keywords of COUNTRY_KEYWORDS) countries.push({ keywords, geo, range: WEEK_RANGE });
  }
  return { europe, countries };
}

export async function fetchLinkedIn(
  signal?: AbortSignal,
  onProgress?: (count: number) => void
): Promise<FetchResult> {
  const jobs: Job[] = [];
  const seenIds = new Set<string>();
  const shared: FetchState = { blocked: false, incomplete: false, requests: 0, cards: 0, titled: 0 };
  const plan = searchPlan();

  const run = async (specs: SearchSpec[], onOutcome?: (spec: SearchSpec, o: SearchOutcome) => void) => {
    for (const spec of specs) {
      if (shared.blocked) return;
      if (jobs.length >= MAX_JOBS || shared.requests >= MAX_REQUESTS) {
        shared.incomplete = true;
        return;
      }
      const o = await fetchSearch(spec, seenIds, jobs, shared, signal, onProgress);
      onOutcome?.(spec, o);
    }
  };

  let ceilingSeen = false;
  await run(plan.europe, (spec, o) => {
    if (spec.range === WEEK_RANGE && COUNTRY_KEYWORDS.includes(spec.keywords) && o.hitCeiling) {
      ceilingSeen = true;
    }
  });
  if (ceilingSeen) await run(plan.countries);

  // Listings were read and none matched: a real, complete "nothing new", so
  // the caller may clear this source's old rows.
  if (jobs.length === 0 && !shared.incomplete && shared.titled > 0) {
    return { jobs, complete: true, scanned: shared.cards };
  }

  if (jobs.length === 0) {
    // Distinguish the ways this ends up empty — the old message always
    // blamed blocking.
    if (shared.blocked) throw new Error('LinkedIn is rate-limiting or blocking requests');
    if (shared.cards > 0 && shared.titled === 0) {
      throw new Error(`LinkedIn card markup changed — parser needs updating (${shared.cards} cards, 0 parsed)`);
    }
    if (shared.incomplete) throw new Error('LinkedIn requests failed (see error log)');
    if (shared.cards === 0) throw new Error('LinkedIn returned no job cards');
    throw new Error('No senior frontend roles matched on LinkedIn');
  }
  return { jobs, complete: !shared.incomplete, scanned: shared.cards };
}
