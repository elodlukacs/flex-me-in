import type { Job } from '../state/types.js';
import type { FetchResult, RemotiveJob } from './types.js';
import {
  httpJson,
  normalizeJob,
  determineWorkType,
  parseDateOnly,
  stripHtml,
} from './common.js';
import { generateJobId } from '../db/helpers.js';
import { isSeniorFrontend } from './relevance.js';
import { isNonEMEALocation } from './regions.js';

// `search` is server-side; the local title gate still runs because the search
// is fuzzy. limit is raised since most of the page is filtered away.
const API_URL =
  'https://remotive.com/api/remote-jobs?category=software-dev&search=frontend&limit=100';

export async function fetchRemotive(
  signal?: AbortSignal,
  onProgress?: (count: number) => void
): Promise<FetchResult> {
  const res = await httpJson<unknown>(API_URL, { signal });
  if (!res.ok) throw new Error(`Remotive returned ${res.status}`);

  const list = (res.body as { jobs?: unknown } | null | undefined)?.jobs;
  if (!Array.isArray(list)) throw new Error('Remotive response shape changed (no jobs array)');

  const jobs: Job[] = [];

  for (const raw of list as (RemotiveJob | null)[]) {
    if (!raw || typeof raw.title !== 'string') continue;
    if (!isSeniorFrontend(raw.title)) continue;

    // `candidate_required_location` is a *scope* ("EMEA", "USA Only",
    // "Worldwide"), not a country — storing the last comma-segment turned
    // "USA Only" into a country. Keep it verbatim, and drop scopes that
    // exclude EMEA outright.
    const location = raw.candidate_required_location ?? '';
    if (isNonEMEALocation(location)) continue;

    jobs.push(
      normalizeJob({
        id: generateJobId('remotive', raw.id, {
          title: raw.title,
          company: raw.company_name,
        }),
        title: raw.title,
        company: raw.company_name || 'Unknown',
        url: raw.url || '',
        source: 'remotive',
        datePosted: parseDateOnly(raw.publication_date),
        country: location,
        workType: determineWorkType(location, true, Array.isArray(raw.tags) ? raw.tags : []),
        description: stripHtml(raw.description ?? ''),
      })
    );
  }

  onProgress?.(jobs.length);
  return { jobs, complete: true, scanned: list.length };
}
