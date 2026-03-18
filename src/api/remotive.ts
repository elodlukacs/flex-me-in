import type { Job } from '../state/types.js';
import type { RemotiveResponse } from './types.js';
import { fetchWithTimeout, normalizeJob, determineWorkType, extractCountry } from './common.js';
import { generateJobId } from '../db/helpers.js';

const API_URL = 'https://remotive.com/api/remote-jobs?category=software-dev&limit=50';

function parseDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split('T')[0]!;
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]!;
  } catch { /* ignore */ }
  return new Date().toISOString().split('T')[0]!;
}

export async function fetchRemotive(
  signal?: AbortSignal,
  onProgress?: (count: number) => void
): Promise<Job[]> {
  const resp = await fetchWithTimeout(API_URL, signal);
  if (!resp.ok) throw new Error(`Remotive returned ${resp.status}`);

  const data = (await resp.json()) as RemotiveResponse;
  const jobs: Job[] = [];

  for (const raw of data.jobs ?? []) {
    const location = raw.candidate_required_location ?? '';
    jobs.push(
      normalizeJob({
        id: generateJobId('remotive', raw.title, raw.company_name),
        title: raw.title,
        company: raw.company_name || 'Unknown',
        url: raw.url || '',
        source: 'remotive',
        datePosted: parseDate(raw.publication_date),
        country: extractCountry(location),
        workType: determineWorkType(location, true, raw.tags),
      })
    );
  }

  onProgress?.(jobs.length);
  return jobs;
}
