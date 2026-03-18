import type { Job } from '../state/types.js';
import type { ArbeitnowResponse } from './types.js';
import { fetchWithTimeout, abortableDelay, normalizeJob, formatUnixDate, extractCountry } from './common.js';
import { generateJobId } from '../db/helpers.js';

const API_URL = 'https://www.arbeitnow.com/api/job-board-api';
const MAX_PAGES = 20;
const DELAY_MS = 1500;

export async function fetchArbeitnow(
  signal?: AbortSignal,
  onProgress?: (count: number) => void
): Promise<Job[]> {
  const allJobs: Job[] = [];
  let page = 1;

  for (let i = 0; i < MAX_PAGES; i++) {
    if (signal?.aborted) break;

    const url = `${API_URL}?page=${page}`;
    const resp = await fetchWithTimeout(url, signal);
    if (!resp.ok) throw new Error(`Arbeitnow returned ${resp.status}`);

    const data = (await resp.json()) as ArbeitnowResponse;
    if (!data.data || data.data.length === 0) break;

    for (const raw of data.data) {
      const country = extractCountry(raw.location) || 'Germany';
      allJobs.push(
        normalizeJob({
          id: generateJobId('arbeitnow', raw.title, raw.company_name),
          title: raw.title,
          company: raw.company_name || 'Unknown',
          url: raw.url || '',
          source: 'arbeitnow',
          datePosted: raw.created_at ? formatUnixDate(raw.created_at) : new Date().toISOString().split('T')[0]!,
          country,
          workType: raw.remote ? 'remote' : 'onsite',
          description: raw.description,
        })
      );
    }

    onProgress?.(allJobs.length);

    page++;
    if (page > (data.meta?.last_page ?? 1)) break;

    await abortableDelay(DELAY_MS, signal);
  }

  return allJobs;
}
