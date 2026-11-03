import type { Job } from '../state/types.js';
import type { FetchResult, RemoteOKJob } from './types.js';
import {
  httpJson,
  normalizeJob,
  formatUnixDate,
  parseDateOnly,
  determineWorkType,
  stripHtml,
} from './common.js';
import { generateJobId } from '../db/helpers.js';
import { isSeniorFrontend } from './relevance.js';
import { isNonEMEALocation } from './regions.js';

// The untagged feed is the newest 100 jobs across *all* categories, which in
// practice contains almost no frontend roles. `tags=front-end` is server-side
// filtered and returns the same page size, all of it relevant.
const API_URL = 'https://remoteok.com/api?tags=front-end';

export async function fetchRemoteOK(
  signal?: AbortSignal,
  onProgress?: (count: number) => void
): Promise<FetchResult> {
  const res = await httpJson<unknown>(API_URL, { signal });
  if (!res.ok) throw new Error(`RemoteOK returned ${res.status}`);
  if (!Array.isArray(res.body)) throw new Error('RemoteOK response shape changed (not an array)');

  // Element 0 of the feed is RemoteOK's legal notice, not a job; null entries
  // have also been seen.
  const rawJobs = (res.body as unknown[]).filter(
    (j): j is RemoteOKJob =>
      !!j && typeof j === 'object' && typeof (j as RemoteOKJob).position === 'string'
  );

  const jobs: Job[] = [];
  for (const raw of rawJobs) {
    if (!isSeniorFrontend(raw.position)) continue;

    // A scope list ("Europe, Americas", "USA Only"), not an address — keep it
    // verbatim; the last comma-segment of "Europe, Americas" is not a country.
    const location = typeof raw.location === 'string' ? raw.location.trim() : '';
    if (isNonEMEALocation(location)) continue;

    const url = raw.url || (raw.id ? `https://remoteok.com/remote-jobs/${raw.id}` : '');
    jobs.push(
      normalizeJob({
        id: generateJobId('remoteok', raw.id, {
          title: raw.position,
          company: raw.company,
        }),
        title: raw.position,
        company: raw.company || 'Unknown',
        url,
        source: 'remoteok',
        datePosted: raw.epoch ? formatUnixDate(raw.epoch) : parseDateOnly(raw.date),
        country: location,
        workType: determineWorkType(location, true, Array.isArray(raw.tags) ? raw.tags : []),
        description: stripHtml(raw.description ?? ''),
      })
    );
  }

  onProgress?.(jobs.length);
  return { jobs, complete: true, scanned: rawJobs.length };
}
