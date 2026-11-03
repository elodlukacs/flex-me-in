import type { Job } from '../state/types.js';
import type { FetchResult, JobicyJob } from './types.js';
import { httpJson, normalizeJob, parseDateOnly, stripHtml } from './common.js';
import { generateJobId } from '../db/helpers.js';
import { isSeniorFrontend } from './relevance.js';
import { logError } from '../utils/log.js';

// Remote-only board with server-side geo + tag filters and, unusually, a
// pre-labelled seniority field. `count` is honoured up to 100. The frontend
// tag misses some frontend titles, so the whole dev industry is read too and
// left to the title gate (verified 2026-11-03: +3 roles). `geo=emea` returns
// the same set as `geo=europe`.
const API_URLS = [
  'https://jobicy.com/api/v2/remote-jobs?count=100&geo=europe&tag=frontend',
  'https://jobicy.com/api/v2/remote-jobs?count=100&geo=europe&industry=dev',
] as const;

/**
 * Pure: response body -> relevant jobs. No role collapse here — Jobicy lists
 * each posting once with a stable native id, and swapping that for a
 * title+company id would orphan applied/ignored state.
 */
export function parseJobicy(body: unknown): { jobs: Job[]; scanned: number } {
  const list = (body as { jobs?: unknown } | null | undefined)?.jobs;
  if (!Array.isArray(list)) throw new Error('Jobicy response shape changed (no jobs array)');

  const jobs: Job[] = [];
  const seen = new Set<string>();

  for (const raw of list as (JobicyJob | null)[]) {
    if (!raw?.id || typeof raw.jobTitle !== 'string' || !raw.jobTitle) continue;
    const id = String(raw.id);
    if (seen.has(id)) continue;
    // The `tag` filter is loose — the same page returns backend, AI and
    // management roles — so the title gate still does the real work.
    if (!isSeniorFrontend(raw.jobTitle)) continue;
    seen.add(id);

    jobs.push(
      normalizeJob({
        id: generateJobId('jobicy', id, {
          title: raw.jobTitle,
          company: raw.companyName,
        }),
        title: raw.jobTitle,
        company: raw.companyName || 'Unknown',
        url: raw.url || `https://jobicy.com/jobs/${raw.jobSlug}`,
        source: 'jobicy',
        datePosted: parseDateOnly(raw.pubDate),
        // Already a region list, e.g. "Denmark, Portugal, UK" — keep verbatim.
        country: raw.jobGeo?.replace(/\s+/g, ' ').trim() ?? '',
        workType: 'remote',
        description: stripHtml(raw.jobDescription ?? raw.jobExcerpt ?? ''),
      })
    );
  }
  return { jobs, scanned: list.length };
}

export async function fetchJobicy(
  signal?: AbortSignal,
  onProgress?: (count: number) => void
): Promise<FetchResult> {
  const jobs: Job[] = [];
  const seen = new Set<string>();
  let scanned = 0;
  let failures = 0;
  let lastError: unknown;

  for (const url of API_URLS) {
    try {
      const res = await httpJson<unknown>(url, { signal });
      if (!res.ok) throw new Error(`Jobicy returned ${res.status}`);
      const page = parseJobicy(res.body);
      scanned += page.scanned;
      for (const job of page.jobs) {
        if (seen.has(job.id)) continue;
        seen.add(job.id);
        jobs.push(job);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      logError(`jobicy ${url}`, err);
      failures++;
      lastError = err;
    }
  }
  if (failures === API_URLS.length) throw lastError;

  onProgress?.(jobs.length);
  return { jobs, complete: failures === 0, scanned };
}
