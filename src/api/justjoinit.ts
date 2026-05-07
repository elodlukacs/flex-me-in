import type { Job } from '../state/types.js';
import { fetchWithTimeout, normalizeJob, abortableDelay } from './common.js';
import { generateJobId } from '../db/helpers.js';

const API_URL = 'https://api.justjoin.it/v2/user-panel/offers';
const PER_PAGE = 50;
const MAX_PAGES = 4;
const DELAY_MS = 400;
const MAX_JOBS = 80;

interface JJOffer {
  slug: string;
  title: string;
  companyName: string;
  experienceLevel: string;
  workplaceType: string;
  city?: string;
  multilocation?: { city: string; slug: string }[];
  publishedAt?: string;
  lastPublishedAt?: string;
}

interface JJResponse {
  data: JJOffer[];
  meta: {
    page: number;
    totalPages: number;
    nextPage: number | null;
  };
}

function offerToCountry(offer: JJOffer): string {
  // JustJoin.IT is Poland-centric; nearly all offers list Polish cities.
  // For 'remote' workplaceType the city is largely informational.
  if (offer.workplaceType === 'remote') return offer.city ? `${offer.city}, Poland` : 'Poland';
  return offer.city || '';
}

export async function fetchJustJoinIT(
  signal?: AbortSignal,
  onProgress?: (count: number) => void
): Promise<Job[]> {
  const jobs: Job[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= MAX_PAGES; page++) {
    if (signal?.aborted) break;
    if (jobs.length >= MAX_JOBS) break;

    const params = new URLSearchParams();
    params.append('categories[]', '1'); // JavaScript / Frontend
    params.append('experienceLevel[]', 'senior');
    params.append('workplaces[]', 'remote');
    params.set('perPage', String(PER_PAGE));
    params.set('page', String(page));
    params.set('sortBy', 'newest');

    const url = `${API_URL}?${params.toString()}`;
    const resp = await fetchWithTimeout(url, signal, 30000, {
      Accept: 'application/json',
      Version: '2',
      Referer: 'https://justjoin.it/',
    });

    if (!resp.ok) {
      if (resp.status === 429) break;
      throw new Error(`JustJoin.IT returned ${resp.status}`);
    }

    const body = (await resp.json()) as JJResponse;
    if (!body.data || body.data.length === 0) break;

    for (const offer of body.data) {
      if (jobs.length >= MAX_JOBS) break;
      if (!offer.slug || !offer.title) continue;
      // Strict remote-only: API filter is permissive (returns hybrid-with-
      // remote-option too), so enforce here.
      if (offer.workplaceType !== 'remote') continue;
      if (seen.has(offer.slug)) continue;
      seen.add(offer.slug);

      const datePosted =
        (offer.publishedAt || offer.lastPublishedAt || '').split('T')[0] ||
        new Date().toISOString().split('T')[0]!;

      jobs.push(
        normalizeJob({
          id: generateJobId('justjoinit', offer.title, offer.companyName ?? 'Unknown'),
          title: offer.title,
          company: offer.companyName || 'Unknown',
          url: `https://justjoin.it/job-offer/${offer.slug}`,
          source: 'justjoinit',
          datePosted,
          country: offerToCountry(offer),
          workType: offer.workplaceType === 'office' ? 'onsite' : offer.workplaceType,
        })
      );
    }

    onProgress?.(jobs.length);

    if (body.meta?.nextPage == null) break;
    if (page < MAX_PAGES) await abortableDelay(DELAY_MS, signal);
  }

  return jobs;
}
