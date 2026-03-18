import type { Job } from '../state/types.js';
import type { RemoteOKJob } from './types.js';
import { fetchWithTimeout, normalizeJob, formatUnixDate, determineWorkType, extractCountry } from './common.js';
import { generateJobId } from '../db/helpers.js';

const API_URL = 'https://remoteok.com/api';

export async function fetchRemoteOK(
  signal?: AbortSignal,
  onProgress?: (count: number) => void
): Promise<Job[]> {
  const resp = await fetchWithTimeout(API_URL, signal);
  if (!resp.ok) throw new Error(`RemoteOK returned ${resp.status}`);

  const data = (await resp.json()) as RemoteOKJob[];
  const rawJobs = Array.isArray(data) ? data.filter((j) => j.position) : [];

  const jobs: Job[] = [];
  for (const raw of rawJobs) {
    const url = raw.url || (raw.id ? `https://remoteok.com/remote-jobs/${raw.id}` : '');
    jobs.push(
      normalizeJob({
        id: generateJobId('remoteok', raw.position, raw.company),
        title: raw.position,
        company: raw.company || 'Unknown',
        url,
        source: 'remoteok',
        datePosted: raw.epoch ? formatUnixDate(raw.epoch) : (raw.date || new Date().toISOString().split('T')[0]!),
        country: extractCountry(raw.location),
        workType: determineWorkType(raw.location, true, raw.tags),
        description: raw.description,
      })
    );
  }

  onProgress?.(jobs.length);
  return jobs;
}
