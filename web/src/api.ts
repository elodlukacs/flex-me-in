import type {
  AiStatus,
  DescriptionResponse,
  HealthResponse,
  JobStatus,
  JobsResponse,
  MetaResponse,
  RefreshStatus,
  Source,
  StatusUpdate,
} from '../../src/server/contract.js';
import { connectivity } from './connectivity.js';
import { storage } from './storage.js';

const TOKEN_KEY = 'fe-hunt.token';

export function getToken(): string | null {
  return storage.get(TOKEN_KEY);
}

export function setToken(token: string): void {
  storage.set(TOKEN_KEY, token);
}

export function clearToken(): void {
  storage.remove(TOKEN_KEY);
}

/** The server said 401: the token is missing or wrong. */
export class UnauthorizedError extends Error {
  constructor() {
    super('Access token required');
    this.name = 'UnauthorizedError';
  }
}

/** The server answered with a non-2xx status. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The request never reached the server (offline, DNS, server down). */
export class NetworkError extends Error {
  constructor() {
    super('Network unavailable');
    this.name = 'NetworkError';
  }
}

type UnauthorizedListener = () => void;
let onUnauthorized: UnauthorizedListener = () => undefined;

/** Called on every 401, so the app can go back to the token screen. */
export function setUnauthorizedHandler(listener: UnauthorizedListener): void {
  onUnauthorized = listener;
}

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  signal?: AbortSignal;
  /** Health is the one public route; it must not trigger the token screen. */
  public?: boolean;
}

async function request<T>(path: string, { method = 'GET', body, signal, public: isPublic }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      cache: 'no-store',
    });
  } catch (err) {
    if (isAbort(err)) throw err;
    connectivity.report(false);
    throw new NetworkError();
  }

  // The service worker answers from its cache when the network is down.
  connectivity.report(response.headers.get('X-From-Cache') !== '1');

  if (response.status === 401 && !isPublic) {
    onUnauthorized();
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`.trim();
    try {
      const data = (await response.json()) as { error?: unknown };
      if (typeof data.error === 'string' && data.error) message = data.error;
    } catch {
      // not JSON: keep the status line
    }
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as T;
}

export interface JobQuery {
  source: Source | 'all';
  status: JobStatus | 'all';
  q: string;
  ai: boolean;
}

export function jobsUrl({ source, status, q, ai }: JobQuery): string {
  const params = new URLSearchParams();
  if (source !== 'all') params.set('source', source);
  if (status !== 'all') params.set('status', status);
  const query = q.trim();
  if (query) params.set('q', query);
  if (ai) params.set('ai', '1');
  const qs = params.toString();
  return qs ? `/api/jobs?${qs}` : '/api/jobs';
}

export const api = {
  health: () => request<HealthResponse>('/api/health', { public: true }),
  meta: (signal?: AbortSignal) => request<MetaResponse>('/api/meta', { signal }),
  jobs: (query: JobQuery, signal?: AbortSignal) => request<JobsResponse>(jobsUrl(query), { signal }),
  description: (id: string, signal?: AbortSignal) =>
    request<DescriptionResponse>(`/api/jobs/${encodeURIComponent(id)}/description`, { signal }),
  setStatus: (id: string, status: JobStatus) =>
    request<{ ok: true }>(`/api/jobs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { status } satisfies StatusUpdate,
    }),
  refreshStatus: () => request<RefreshStatus>('/api/refresh'),
  startRefresh: (sources?: Source[]) =>
    request<RefreshStatus>('/api/refresh', { method: 'POST', body: sources ? { sources } : {} }),
  aiStatus: () => request<AiStatus>('/api/ai'),
  startAi: () => request<AiStatus>('/api/ai', { method: 'POST', body: {} }),
};

export function errorMessage(err: unknown): string {
  if (err instanceof NetworkError) return 'You appear to be offline';
  if (err instanceof Error) return err.message;
  return String(err);
}
