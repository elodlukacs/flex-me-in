import type { Job } from '../state/types.js';
import {
  fetchWithTimeout,
  normalizeJob,
  determineWorkType,
  abortableDelay,
  decodeHTMLEntities,
} from './common.js';
import { generateJobId } from '../db/helpers.js';

const LINKEDIN_JOBS_API = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
const MAX_PAGES = 10;
const JOBS_PER_PAGE = 25;
const DELAY_MS = 800;
const MAX_JOBS = 80;
const MAX_EMPTY_PAGES = 2;

const EMEA_COUNTRIES = [
  'United Kingdom', 'UK', 'England', 'Scotland', 'Wales', 'Ireland',
  'Germany', 'France', 'Spain', 'Italy', 'Netherlands', 'Belgium',
  'Sweden', 'Norway', 'Denmark', 'Finland', 'Poland', 'Switzerland',
  'Austria', 'Ireland', 'Portugal', 'Greece', 'Czech', 'Czechia', 'Romania', 'Hungary',
  'Israel', 'UAE', 'United Arab Emirates', 'Saudi Arabia', 'Egypt', 'South Africa',
  'Nigeria', 'Kenya', 'Morocco', 'Algeria', 'Tunisia', 'Turkey',
  'Europe', 'EMEA', 'Middle East', 'Africa',
];

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

const ALL_GEO_SEARCHES: GeoSearch[] = [
  { label: 'Worldwide', geoId: '92000000' },
];

function isEMEAJob(location: string): boolean {
  if (!location || location.trim() === '') return true;
  const lower = location.toLowerCase();
  if (
    lower.includes('united states') || lower.includes('usa') ||
    lower.includes('canada') || lower.includes('mexico') ||
    lower.includes('brazil') || lower.includes('argentina') ||
    lower.includes('colombia') || lower.includes('chile') ||
    lower.includes('america')
  ) {
    return false;
  }
  return EMEA_COUNTRIES.some((c) => lower.includes(c.toLowerCase()));
}

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

function parseCards(
  html: string,
  emeaFilter: boolean,
  seenIds: Set<string>,
  jobs: Job[],
  cap: number
): number {
  const cardRegex =
    /<(?:div|li)[^>]*data-entity-urn="urn:li:jobPosting:(\d+)"[^>]*>([\s\S]*?)(?=<(?:div|li)[^>]*data-entity-urn="urn:li:jobPosting:|$)/g;

  let match;
  let added = 0;
  while ((match = cardRegex.exec(html)) !== null) {
    if (jobs.length >= cap) break;

    const jobId = match[1]!;
    const cardHtml = match[2] ?? '';
    if (seenIds.has(jobId)) continue;

    let title = '';
    const titleMatch = cardHtml.match(
      /<h3[^>]*class="[^"]*base-search-card__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/
    );
    if (titleMatch?.[1]) {
      title = decodeHTMLEntities(titleMatch[1].replace(/<[^>]*>/g, '')).trim();
    }
    if (!title) {
      const srTitleMatch = cardHtml.match(
        /<span[^>]*class="[^"]*sr-only[^"]*"[^>]*>([\s\S]*?)<\/span>/
      );
      if (srTitleMatch?.[1]) {
        title = decodeHTMLEntities(srTitleMatch[1].replace(/<[^>]*>/g, '')).trim();
      }
    }
    if (!title || title.length < 3) continue;

    const companyMatch =
      cardHtml.match(/<a[^>]*class="[^"]*hidden-nested-link[^"]*"[^>]*>([\s\S]*?)<\/a>/) ||
      cardHtml.match(/<h4[^>]*class="[^"]*base-search-card__subtitle[^"]*"[^>]*>([\s\S]*?)<\/h4>/);
    const company = companyMatch?.[1]
      ? decodeHTMLEntities(companyMatch[1].replace(/<[^>]*>/g, '')).trim()
      : 'Unknown';

    const locationMatch = cardHtml.match(
      /<span[^>]*class="[^"]*job-search-card__location[^"]*"[^>]*>([\s\S]*?)<\/span>/
    );
    const jobLocation = locationMatch?.[1]
      ? decodeHTMLEntities(locationMatch[1].replace(/<[^>]*>/g, '')).trim()
      : '';

    const dateMatch = cardHtml.match(
      /<time[^>]*class="[^"]*job-search-card__listdate[^"]*"[^>]*datetime="([^"]+)"/
    );
    const datePosted =
      dateMatch?.[1]?.split('T')[0] || new Date().toISOString().split('T')[0]!;

    const urlMatch = cardHtml.match(
      /href="(https:\/\/[^"]*linkedin\.com\/jobs\/view\/[^"]+)"/
    );
    let jobUrl = urlMatch?.[1] || `https://www.linkedin.com/jobs/view/${jobId}`;
    if (jobUrl.includes('?')) jobUrl = jobUrl.split('?')[0]!;

    if (emeaFilter && !isEMEAJob(jobLocation)) continue;

    seenIds.add(jobId);
    jobs.push(
      normalizeJob({
        id: generateJobId('linkedin', title, company),
        title,
        company,
        url: jobUrl,
        source: 'linkedin',
        datePosted,
        country: jobLocation,
        workType: determineWorkType(jobLocation, jobLocation.toLowerCase().includes('remote')),
      })
    );
    added++;
  }
  return added;
}

async function fetchSearch(
  keywords: string,
  geo: GeoSearch,
  tpr: string,
  emeaFilter: boolean,
  seenIds: Set<string>,
  jobs: Job[],
  signal: AbortSignal | undefined,
  onProgress?: (count: number) => void
): Promise<void> {
  let emptyPages = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    if (signal?.aborted) return;
    if (jobs.length >= MAX_JOBS) return;

    const url = buildUrl({ keywords, geoId: geo.geoId, start: page * JOBS_PER_PAGE, tpr });

    try {
      const resp = await fetchWithTimeout(url, signal, 30000, buildHeaders());
      if (!resp.ok) {
        if (resp.status === 429 || resp.status === 403) return;
        throw new Error(`LinkedIn returned ${resp.status}`);
      }
      const html = await resp.text();
      const added = parseCards(html, emeaFilter, seenIds, jobs, MAX_JOBS);
      onProgress?.(jobs.length);

      if (added === 0) {
        emptyPages++;
        if (emptyPages >= MAX_EMPTY_PAGES) return;
      } else {
        emptyPages = 0;
      }

      if (page < MAX_PAGES - 1) await abortableDelay(DELAY_MS, signal);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      console.error(`LinkedIn fetch error (${geo.label} p${page} tpr=${tpr}):`, error);
      return;
    }
  }
}

export async function fetchLinkedIn(
  signal?: AbortSignal,
  onProgress?: (count: number) => void,
  keywords = 'Frontend',
  _location = 'Remote',
  region: 'emea' | 'all' = 'emea'
): Promise<Job[]> {
  const jobs: Job[] = [];
  const seenIds = new Set<string>();
  const isEmeaFilter = region === 'emea';
  const searches = isEmeaFilter ? EMEA_GEO_SEARCHES : ALL_GEO_SEARCHES;

  // First pass: last 24h, sorted by date.
  for (const geo of searches) {
    if (signal?.aborted) break;
    if (jobs.length >= MAX_JOBS) break;
    await fetchSearch(keywords, geo, 'r86400', isEmeaFilter, seenIds, jobs, signal, onProgress);
  }

  // Fallback: if 24h was thin, widen to last week (still date-sorted).
  if (jobs.length < 10) {
    for (const geo of searches) {
      if (signal?.aborted) break;
      if (jobs.length >= MAX_JOBS) break;
      await fetchSearch(keywords, geo, 'r604800', isEmeaFilter, seenIds, jobs, signal, onProgress);
    }
  }

  if (jobs.length === 0) {
    throw new Error('No jobs found (LinkedIn may be blocking requests)');
  }
  return jobs;
}
