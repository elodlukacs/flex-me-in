import type { Job } from '../state/types.js';
import type { HimalayasResponse, HimalayasJob } from './types.js';
import { fetchWithTimeout, abortableDelay, normalizeJob, formatUnixDate } from './common.js';
import { generateJobId } from '../db/helpers.js';

const API_URL = 'https://himalayas.app/jobs/api';
const PAGE_LIMIT = 20;
const MAX_PAGES = 5;
const DELAY_MS = 1000;

function extractCountryFromRestrictions(restrictions: string[]): string {
  if (!restrictions || restrictions.length === 0) return '';
  return restrictions[0] ?? '';
}

function determineWorkType(job: HimalayasJob): string {
  const emp = (job.employmentType ?? '').toLowerCase();
  if (emp.includes('hybrid')) return 'hybrid';
  if (emp.includes('onsite') || emp.includes('on-site')) return 'onsite';
  return 'remote';
}

export async function fetchHimalayas(
  signal?: AbortSignal,
  onProgress?: (count: number) => void
): Promise<Job[]> {
  const allJobs: Job[] = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    if (signal?.aborted) break;

    const url = `${API_URL}?limit=${PAGE_LIMIT}&offset=${offset}`;
    const resp = await fetchWithTimeout(url, signal);
    if (!resp.ok) throw new Error(`Himalayas returned ${resp.status}`);

    const data = (await resp.json()) as HimalayasResponse;
    if (!data.jobs || data.jobs.length === 0) break;

    for (const raw of data.jobs) {
      allJobs.push(
        normalizeJob({
          id: generateJobId('himalayas', raw.title, raw.companyName),
          title: raw.title,
          company: raw.companyName || 'Unknown',
          url: raw.applicationLink || '',
          source: 'himalayas',
          datePosted: raw.pubDate ? formatUnixDate(raw.pubDate) : new Date().toISOString().split('T')[0]!,
          country: extractCountryFromRestrictions(raw.locationRestrictions),
          workType: determineWorkType(raw),
        })
      );
    }

    onProgress?.(allJobs.length);

    offset += data.jobs.length;
    if (offset >= data.totalCount) break;

    await abortableDelay(DELAY_MS, signal);
  }

  return allJobs;
}
