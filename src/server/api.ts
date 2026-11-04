import type { IncomingMessage, ServerResponse } from 'http';
import type { JobStatus, Source } from '../state/types.js';
import { ALL_SOURCES } from '../state/types.js';
import type {
  DescriptionResponse,
  HealthResponse,
  JobsResponse,
  ListedJob,
  MetaResponse,
} from './contract.js';
import {
  expireStaleJobs,
  getJobCounts,
  getJobDescription,
  getNewCountsBySource,
  jobExists,
  markJobSeen,
  queryJobs,
  updateJobStatus,
} from '../db/repository.js';
import { getApiKey } from '../api/deepseek.js';
import { MISSING_KEY_MESSAGE } from '../core/ai.js';
import { sourceLabels, sourceShortLabels } from '../utils/theme.js';
import { HttpError, readJsonBody, sendJson } from './http.js';
import { AiRunner, readLastRefreshAt, RefreshRunner } from './runs.js';

const STATUSES: readonly JobStatus[] = ['new', 'saved', 'applied', 'ignored'];

/**
 * The TUI expires stale rows on launch; a server can run for weeks between
 * fetches, so it re-expires on reads, at most this often.
 */
const EXPIRE_INTERVAL_MS = 60 * 60 * 1000;

function isSource(value: unknown): value is Source {
  return typeof value === 'string' && (ALL_SOURCES as string[]).includes(value);
}

function isStatus(value: unknown): value is JobStatus {
  return typeof value === 'string' && (STATUSES as string[]).includes(value);
}

function methodNotAllowed(allowed: string[]): never {
  throw new HttpError(405, 'Method not allowed', { Allow: allowed.join(', ') });
}

export interface ApiContext {
  authRequired: boolean;
  refresh: RefreshRunner;
  ai: AiRunner;
}

export function createApiContext(authRequired: boolean): ApiContext {
  const ai = new AiRunner();
  const refresh = new RefreshRunner(() => ai.onFetchStart());
  return { authRequired, refresh, ai };
}

let lastExpiredAt = 0;

function listJobs(params: URLSearchParams): JobsResponse {
  const source = params.get('source') || undefined;
  if (source !== undefined && !isSource(source)) {
    throw new HttpError(400, `Unknown source "${source}"`);
  }
  const status = params.get('status') || undefined;
  if (status !== undefined && !isStatus(status)) {
    throw new HttpError(400, `Unknown status "${status}"`);
  }

  if (Date.now() - lastExpiredAt > EXPIRE_INTERVAL_MS) {
    expireStaleJobs();
    lastExpiredAt = Date.now();
  }

  const jobs: ListedJob[] = queryJobs({
    source,
    status,
    text: params.get('q')?.trim() || undefined,
    aiOnly: params.get('ai') === '1',
  });
  return { jobs, counts: getJobCounts(), newBySource: getNewCountsBySource() };
}

function parseSources(body: unknown): Source[] {
  if (body === undefined || body === null) return ALL_SOURCES;
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Body must be an object');
  }
  const { sources } = body as { sources?: unknown };
  if (sources === undefined) return ALL_SOURCES;
  if (!Array.isArray(sources) || sources.length === 0 || !sources.every(isSource)) {
    throw new HttpError(400, `sources must be a non-empty array of: ${ALL_SOURCES.join(', ')}`);
  }
  return [...new Set(sources)];
}

/** Routes one /api request. Auth has already been checked. */
export async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  ctx: ApiContext
): Promise<void> {
  const method = req.method ?? 'GET';
  const path = url.pathname.replace(/\/+$/, '');

  if (path === '/api/health') {
    if (method !== 'GET') methodNotAllowed(['GET']);
    const body: HealthResponse = { ok: true, authRequired: ctx.authRequired };
    return sendJson(res, 200, body);
  }

  if (path === '/api/meta') {
    if (method !== 'GET') methodNotAllowed(['GET']);
    const body: MetaResponse = {
      sources: ALL_SOURCES.map((id) => ({
        id,
        label: sourceLabels[id] ?? id,
        short: sourceShortLabels[id] ?? id,
      })),
      lastRefreshAt: readLastRefreshAt(),
      aiConfigured: Boolean(getApiKey()),
    };
    return sendJson(res, 200, body);
  }

  if (path === '/api/jobs') {
    if (method !== 'GET') methodNotAllowed(['GET']);
    return sendJson(res, 200, listJobs(url.searchParams));
  }

  const jobMatch = path.match(/^\/api\/jobs\/([^/]+)(\/description|\/seen)?$/);
  if (jobMatch) {
    let id: string;
    try {
      id = decodeURIComponent(jobMatch[1]!);
    } catch {
      throw new HttpError(400, 'Malformed job id');
    }

    if (jobMatch[2] === '/seen') {
      if (method !== 'POST') methodNotAllowed(['POST']);
      await readJsonBody(req);
      if (!jobExists(id)) throw new HttpError(404, 'Job not found');
      markJobSeen(id);
      return sendJson(res, 200, { ok: true });
    }

    if (jobMatch[2]) {
      if (method !== 'GET') methodNotAllowed(['GET']);
      if (!jobExists(id)) throw new HttpError(404, 'Job not found');
      const body: DescriptionResponse = { description: getJobDescription(id) };
      return sendJson(res, 200, body);
    }

    if (method !== 'PATCH') methodNotAllowed(['PATCH']);
    const body = await readJsonBody(req);
    const status = (body as { status?: unknown } | undefined)?.status;
    if (!isStatus(status)) {
      throw new HttpError(400, `status must be one of: ${STATUSES.join(', ')}`);
    }
    if (!jobExists(id)) throw new HttpError(404, 'Job not found');
    updateJobStatus(id, status);
    return sendJson(res, 200, { ok: true });
  }

  if (path === '/api/refresh') {
    if (method === 'GET') return sendJson(res, 200, ctx.refresh.snapshot());
    if (method !== 'POST') methodNotAllowed(['GET', 'POST']);
    const sources = parseSources(await readJsonBody(req));
    const { started, status } = ctx.refresh.start(sources);
    return sendJson(res, started ? 202 : 200, status);
  }

  if (path === '/api/ai') {
    if (method === 'GET') return sendJson(res, 200, ctx.ai.snapshot());
    if (method !== 'POST') methodNotAllowed(['GET', 'POST']);
    // Drain any body so a client that sends `{}` isn't left mid-request.
    await readJsonBody(req);
    if (!getApiKey()) throw new HttpError(400, MISSING_KEY_MESSAGE);
    const { started, status } = ctx.ai.start();
    return sendJson(res, started ? 202 : 200, status);
  }

  throw new HttpError(404, 'Not found');
}
