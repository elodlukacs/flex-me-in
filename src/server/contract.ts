/**
 * The HTTP API between the server (src/server) and the PWA (web/). Types only:
 * the PWA imports this file with `import type`, so nothing here may pull in
 * Node modules at runtime.
 *
 * All routes live under /api and speak JSON. When the server has a token
 * configured (FE_HUNT_TOKEN), every /api route except GET /api/health requires
 * `Authorization: Bearer <token>`; a missing or wrong token gets 401.
 * Errors are `{ "error": string }` with a 4xx/5xx status.
 */

import type { Job, JobCounts, JobStatus, RemoteStatus, Source } from '../state/types.js';

export type { Job, JobCounts, JobStatus, RemoteStatus, Source };

/** GET /api/health → 200, no auth. */
export interface HealthResponse {
  ok: true;
  /** Whether /api routes need a bearer token. */
  authRequired: boolean;
}

/** A job as listed: no description (fetched separately), plus the AI verdict. */
export interface ListedJob extends Omit<Job, 'description'> {
  /** The AI filter's remote verdict when the last AI run kept this job; absent otherwise. */
  ai?: RemoteStatus;
}

/**
 * GET /api/jobs
 *   ?source=<Source>          one source; omitted = all
 *   &status=new|applied|ignored   omitted = every status
 *   &q=<text>                 case-insensitive substring of title, company or country
 *   &ai=1                     only jobs the last AI run kept
 * Sorted newest first (same order as the TUI).
 */
export interface JobsResponse {
  jobs: ListedJob[];
  /** Over the whole database, ignoring the query's filters. */
  counts: JobCounts;
  /** Jobs per source over the whole database (status 'new' only), for tab badges. */
  newBySource: Partial<Record<Source, number>>;
}

/** GET /api/jobs/:id/description → the stored description (may be ''). 404 if the job is unknown. */
export interface DescriptionResponse {
  description: string;
}

/** PATCH /api/jobs/:id  body: StatusUpdate → 200 { ok: true }. 404 if unknown, 400 if the status is invalid. */
export interface StatusUpdate {
  status: JobStatus;
}

export type RunState = 'idle' | 'running' | 'done' | 'error';

export interface SourceProgress {
  source: Source;
  state: 'pending' | 'fetching' | 'done' | 'error';
  count: number;
  /** Done, but stopped early: rows kept, nothing purged. */
  partial?: boolean;
  error?: string;
}

/**
 * GET /api/refresh → the current or last fetch run.
 * POST /api/refresh  body: { sources?: Source[] } (omitted = all) → 202 with the
 *   new run's RefreshStatus. If a run is already going, 200 with that run instead
 *   (never two at once). Poll GET /api/refresh about once a second while running.
 */
export interface RefreshStatus {
  state: RunState;
  /** ISO time the run started / finished; absent before the first run. */
  startedAt?: string;
  finishedAt?: string;
  sources: SourceProgress[];
  /** One-line human summary when done, e.g. "128 roles — linkedin stopped early". */
  summary?: string;
}

/**
 * GET /api/ai → the current or last AI run.
 * POST /api/ai → 202, starts classifying every 'new' job (all sources). 200 with
 *   the running one if already going. 400 { error } when DEEPSEEK_API_KEY is unset.
 */
export interface AiStatus {
  state: RunState;
  configured: boolean;
  startedAt?: string;
  finishedAt?: string;
  batch?: number;
  totalBatches?: number;
  /** Jobs kept by the last finished run. */
  kept?: number;
  submitted?: number;
  /** Warning (partial run) or error text. */
  message?: string;
}

/** GET /api/meta → static-ish info for the UI. */
export interface MetaResponse {
  sources: { id: Source; label: string; short: string }[];
  /** ISO time of the last finished fetch run (persisted across restarts), if any. */
  lastRefreshAt?: string;
  aiConfigured: boolean;
}
