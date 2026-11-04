import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { request } from 'http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Job, Source } from '../state/types.js';
import type { FetchResult } from '../api/types.js';
import type {
  AiStatus,
  DescriptionResponse,
  HealthResponse,
  JobsResponse,
  MetaResponse,
  RefreshStatus,
} from './contract.js';

/**
 * Fetchers are stubbed so no test touches the network. Each one waits on
 * `stub.gate`, letting a test hold a refresh open while it probes the API.
 */
const stub = vi.hoisted(() => {
  const state = {
    gate: Promise.resolve() as Promise<void>,
    aiGate: Promise.resolve() as Promise<void>,
    calls: [] as string[],
    make(source: string, exportName: string) {
      return {
        [exportName]: async (signal?: AbortSignal): Promise<FetchResult> => {
          state.calls.push(source);
          await new Promise<void>((resolve, reject) => {
            signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            );
            void state.gate.then(resolve);
          });
          const job = {
            id: `${source}_fetched`,
            title: `Senior React Engineer at ${source}`,
            company: 'Fetched Co',
            url: `https://example.com/${source}`,
            source,
            datePosted: new Date().toISOString().slice(0, 10),
            status: 'new',
            country: 'Remote',
            workType: '',
          };
          return { jobs: [job as Job], complete: source !== 'linkedin', scanned: 1 };
        },
      };
    },
  };
  return state;
});

vi.mock('../api/remoteok.js', () => stub.make('remoteok', 'fetchRemoteOK'));
vi.mock('../api/weworkremotely.js', () => stub.make('weworkremotely', 'fetchWeWorkRemotely'));
vi.mock('../api/remotive.js', () => stub.make('remotive', 'fetchRemotive'));
vi.mock('../api/linkedin.js', () => stub.make('linkedin', 'fetchLinkedIn'));
vi.mock('../api/justjoinit.js', () => stub.make('justjoinit', 'fetchJustJoinIT'));
vi.mock('../api/workable.js', () => stub.make('workable', 'fetchWorkable'));
vi.mock('../api/jobicy.js', () => stub.make('jobicy', 'fetchJobicy'));
vi.mock('../api/himalayas.js', () => stub.make('himalayas', 'fetchHimalayas'));

// The classifier is stubbed too (no paid requests); getApiKey stays real so
// tests control "configured" through the environment.
vi.mock('../api/deepseek.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/deepseek.js')>()),
  filterJobsWithDeepseek: async (
    jobs: Job[],
    signal?: AbortSignal,
    onProgress?: (batch: number, total: number) => void
  ) => {
    onProgress?.(1, 2);
    await new Promise<void>((resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      void stub.aiGate.then(resolve);
    });
    // An id nobody submitted must not be stored.
    const results = [...jobs.map((j) => ({ id: j.id, remote: 'yes' as const })), { id: 'ghost', remote: 'no' as const }];
    return { results, failedBatches: 0, totalBatches: 2 };
  },
}));

const { setDbPathForTests } = await import('../db/database.js');
const { clearAllJobs, replaceSourceJobs, saveAiFilteredJobs, updateJobStatus, getFilteredJobs } =
  await import('../db/repository.js');
const { startServer } = await import('./app.js');
const { resolveConfig, isLoopbackHost } = await import('./config.js');
type Running = Awaited<ReturnType<typeof startServer>>;

const TOKEN = 'test-token-0123456789';
const realHome = process.env.HOME;
const realKey = process.env.DEEPSEEK_API_KEY;
let tmp: string;
let webDir: string;
let secured: Running;
let open: Running;

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function job(id: string, overrides: Partial<Job> = {}): Job {
  return {
    id,
    title: `Senior Frontend ${id}`,
    company: 'Acme',
    url: `https://example.com/${id}`,
    source: 'remoteok',
    datePosted: daysAgo(1),
    status: 'new',
    country: '',
    workType: '',
    ...overrides,
  };
}

function seed(): void {
  clearAllJobs();
  replaceSourceJobs(
    'remoteok',
    [
      job('ro_1', { title: 'Senior Vue Developer', datePosted: daysAgo(3), description: 'Vue all day' }),
      job('ro_2', { company: 'Zürich Labs', datePosted: daysAgo(1) }),
    ],
    false
  );
  replaceSourceJobs('linkedin', [job('li_1', { source: 'linkedin', country: 'Poland', datePosted: daysAgo(2) })], false);
  updateJobStatus('ro_1', 'applied');
  saveAiFilteredJobs([{ id: 'ro_2', remote: 'yes' }]);
}

interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/** Plain node:http, so tests can send headers (Host) and paths fetch would rewrite. */
function raw(
  server: Running,
  path: string,
  { method = 'GET', headers = {}, body }: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port: server.port, path, method, headers },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => (text += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
      }
    );
    req.on('error', reject);
    req.end(body);
  });
}

async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; token?: string | null } = {}
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = {};
  const token = init.token === undefined ? TOKEN : init.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: string | undefined;
  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.body);
  }
  const res = await raw(secured, path, { method: init.method, headers, body });
  return { status: res.status, body: JSON.parse(res.body) as T };
}

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'fe-hunt-server-'));
  // The error log and server-state.json live under HOME.
  process.env.HOME = tmp;
  delete process.env.DEEPSEEK_API_KEY;
  setDbPathForTests(join(tmp, 'jobs.db'));

  webDir = join(tmp, 'web');
  mkdirSync(join(webDir, 'assets'), { recursive: true });
  writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>fe-hunt</title>');
  writeFileSync(join(webDir, 'sw.js'), 'self.addEventListener("fetch", () => {});');
  writeFileSync(join(webDir, 'manifest.webmanifest'), '{"name":"fe-hunt"}');
  writeFileSync(join(webDir, 'assets', 'index-abc123.js'), 'console.log(1);');
  writeFileSync(join(tmp, 'secret.txt'), 'outside the web root');

  secured = await startServer({ host: '127.0.0.1', port: 0, token: TOKEN, webDir });
  open = await startServer({ host: '127.0.0.1', port: 0, webDir });
});

afterAll(async () => {
  await secured.close();
  await open.close();
  setDbPathForTests(null);
  process.env.HOME = realHome;
  if (realKey !== undefined) process.env.DEEPSEEK_API_KEY = realKey;
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  stub.gate = Promise.resolve();
  stub.aiGate = Promise.resolve();
  delete process.env.DEEPSEEK_API_KEY;
  stub.calls.length = 0;
  seed();
});

describe('auth', () => {
  it('leaves health open and reports that a token is required', async () => {
    const res = await api<HealthResponse>('/api/health', { token: null });
    expect(res).toEqual({ status: 200, body: { ok: true, authRequired: true } });
  });

  it('rejects a missing or wrong token with 401', async () => {
    const missing = await raw(secured, '/api/jobs');
    expect(missing.status).toBe(401);
    expect(missing.headers['www-authenticate']).toBe('Bearer');
    expect(JSON.parse(missing.body)).toEqual({ error: expect.any(String) });
    expect((await api('/api/jobs', { token: 'nope' })).status).toBe(401);
    expect((await api('/api/meta', { token: `${TOKEN}x` })).status).toBe(401);
  });

  it('accepts the right token', async () => {
    expect((await api('/api/jobs')).status).toBe(200);
  });
});

describe('binding', () => {
  it('refuses to start on a non-loopback host without a token', async () => {
    await expect(startServer({ host: '0.0.0.0', port: 0, webDir })).rejects.toThrow(
      /FE_HUNT_TOKEN/
    );
    expect(() => resolveConfig({ HOST: '0.0.0.0' })).toThrow(/Refusing to listen/);
  });

  it('allows a non-loopback host with a token, and loopback without one', () => {
    expect(resolveConfig({ HOST: '0.0.0.0', FE_HUNT_TOKEN: 't', PORT: '9000' })).toMatchObject({
      host: '0.0.0.0',
      port: 9000,
      token: 't',
    });
    expect(resolveConfig({})).toMatchObject({ host: '127.0.0.1', port: 8787, token: undefined });
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
    expect(isLoopbackHost('127.0.0.2')).toBe(true);
    expect(isLoopbackHost('192.168.1.10')).toBe(false);
  });

  it('without a token, refuses foreign Host and Origin headers', async () => {
    const ok = await raw(open, '/api/health');
    expect(JSON.parse(ok.body)).toEqual({ ok: true, authRequired: false });
    expect((await raw(open, '/api/jobs', { headers: { Origin: 'http://localhost:5173' } })).status).toBe(200);
    expect((await raw(open, '/api/jobs', { headers: { Host: 'evil.example:8787' } })).status).toBe(403);
    const csrf = await raw(open, '/api/ai', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    });
    expect(csrf.status).toBe(403);
  });
});

describe('GET /api/jobs', () => {
  it('lists everything newest first, without descriptions, with counts', async () => {
    const { status, body } = await api<JobsResponse>('/api/jobs');
    expect(status).toBe(200);
    expect(body.jobs.map((j) => j.id)).toEqual(['ro_2', 'li_1', 'ro_1']);
    expect(body.jobs[2]).not.toHaveProperty('description');
    expect(body.counts).toEqual({ total: 3, new: 2, saved: 0, applied: 1, ignored: 0 });
    expect(body.newBySource).toEqual({ remoteok: 1, linkedin: 1 });
  });

  it('filters by source and status', async () => {
    const bySource = await api<JobsResponse>('/api/jobs?source=linkedin');
    expect(bySource.body.jobs.map((j) => j.id)).toEqual(['li_1']);
    const byStatus = await api<JobsResponse>('/api/jobs?status=applied');
    expect(byStatus.body.jobs.map((j) => j.id)).toEqual(['ro_1']);
    // Counts ignore the query's filters.
    expect(byStatus.body.counts.total).toBe(3);
  });

  it('matches q against title, company or country, case-insensitively', async () => {
    const ids = async (q: string) =>
      (await api<JobsResponse>(`/api/jobs?q=${encodeURIComponent(q)}`)).body.jobs.map((j) => j.id);
    expect(await ids('vue')).toEqual(['ro_1']);
    expect(await ids('ZÜRICH')).toEqual(['ro_2']);
    expect(await ids('poland')).toEqual(['li_1']);
    expect(await ids('100%')).toEqual([]);
  });

  it('joins the AI verdict, and ai=1 keeps only AI-kept jobs', async () => {
    const all = await api<JobsResponse>('/api/jobs');
    expect(all.body.jobs.find((j) => j.id === 'ro_2')?.ai).toBe('yes');
    expect(all.body.jobs.find((j) => j.id === 'li_1')).not.toHaveProperty('ai');
    const kept = await api<JobsResponse>('/api/jobs?ai=1');
    expect(kept.body.jobs.map((j) => j.id)).toEqual(['ro_2']);
  });

  it('rejects unknown filter values', async () => {
    expect((await api('/api/jobs?source=monster')).status).toBe(400);
    expect((await api('/api/jobs?status=maybe')).status).toBe(400);
  });

  it('answers 405 to other methods', async () => {
    expect((await api('/api/jobs', { method: 'POST' })).status).toBe(405);
  });
});

describe('job routes', () => {
  it('PATCH changes the status', async () => {
    const res = await api('/api/jobs/li_1', { method: 'PATCH', body: { status: 'ignored' } });
    expect(res).toEqual({ status: 200, body: { ok: true } });
    const ignored = getFilteredJobs(
      { status: 'ignored', workType: '', title: '', company: '', country: '' },
      'all'
    );
    expect(ignored.map((j) => j.id)).toEqual(['li_1']);
  });

  it('PATCH saves a job for later', async () => {
    expect((await api('/api/jobs/li_1', { method: 'PATCH', body: { status: 'saved' } })).status).toBe(200);
    const saved = await api<JobsResponse>('/api/jobs?status=saved');
    expect(saved.body.jobs.map((j) => j.id)).toEqual(['li_1']);
    expect(saved.body.counts.saved).toBe(1);
  });

  it('POST /seen marks a job opened, 404 for an unknown one', async () => {
    const before = await api<JobsResponse>('/api/jobs');
    expect(before.body.jobs.find((j) => j.id === 'li_1')).not.toHaveProperty('seen');
    expect(await api('/api/jobs/li_1/seen', { method: 'POST', body: {} })).toEqual({ status: 200, body: { ok: true } });
    const after = await api<JobsResponse>('/api/jobs');
    expect(after.body.jobs.find((j) => j.id === 'li_1')?.seen).toBe(true);
    expect((await api('/api/jobs/nope/seen', { method: 'POST', body: {} })).status).toBe(404);
    expect((await api('/api/jobs/li_1/seen')).status).toBe(405);
  });

  it('PATCH answers 400 for a bad status and 404 for an unknown job', async () => {
    expect((await api('/api/jobs/li_1', { method: 'PATCH', body: { status: 'done' } })).status).toBe(400);
    expect((await api('/api/jobs/li_1', { method: 'PATCH', body: 'nope' })).status).toBe(400);
    expect((await api('/api/jobs/nope', { method: 'PATCH', body: { status: 'new' } })).status).toBe(404);
  });

  it('returns the description, or 404 for an unknown job', async () => {
    const found = await api<DescriptionResponse>('/api/jobs/ro_1/description');
    expect(found).toEqual({ status: 200, body: { description: 'Vue all day' } });
    const empty = await api<DescriptionResponse>('/api/jobs/li_1/description');
    expect(empty.body).toEqual({ description: '' });
    expect((await api('/api/jobs/missing/description')).status).toBe(404);
  });

  it('rejects oversized bodies', async () => {
    const res = await api('/api/jobs/li_1', {
      method: 'PATCH',
      body: { status: 'new', pad: 'x'.repeat(20_000) },
    });
    expect(res.status).toBe(413);
  });
});

async function waitForRefresh(): Promise<RefreshStatus> {
  for (let i = 0; i < 100; i++) {
    const { body } = await api<RefreshStatus>('/api/refresh');
    if (body.state !== 'running') return body;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('refresh never finished');
}

describe('refresh', () => {
  it('runs one fetch at a time and reports per-source progress', async () => {
    let release!: () => void;
    stub.gate = new Promise<void>((r) => (release = r));

    const first = await api<RefreshStatus>('/api/refresh', {
      method: 'POST',
      body: { sources: ['remoteok', 'linkedin'] },
    });
    expect(first.status).toBe(202);
    expect(first.body.state).toBe('running');
    expect(first.body.sources.map((s) => s.source)).toEqual(['remoteok', 'linkedin']);

    const second = await api<RefreshStatus>('/api/refresh', { method: 'POST' });
    expect(second.status).toBe(200);
    expect(second.body.startedAt).toBe(first.body.startedAt);
    // The second request did not start any fetcher.
    expect(stub.calls.sort()).toEqual(['linkedin', 'remoteok']);

    // A fetch clears the previous AI results, as the TUI does.
    expect((await api<JobsResponse>('/api/jobs?ai=1')).body.jobs).toEqual([]);

    release();
    const done = await waitForRefresh();
    expect(done.state).toBe('done');
    expect(done.finishedAt).toBeDefined();
    expect(done.sources).toEqual([
      { source: 'remoteok', state: 'done', count: 1 },
      { source: 'linkedin', state: 'done', count: 1, partial: true },
    ]);
    expect(done.summary).toBe('2 roles — linkedin stopped early');

    // remoteok's listing was complete, so its unlisted untriaged row was
    // purged; the applied one stays. linkedin stopped early: nothing purged.
    const ids = (await api<JobsResponse>('/api/jobs')).body.jobs.map((j) => j.id).sort();
    expect(ids).toEqual(['li_1', 'linkedin_fetched', 'remoteok_fetched', 'ro_1']);

    const meta = await api<MetaResponse>('/api/meta');
    expect(meta.body.lastRefreshAt).toBe(done.finishedAt);
  });

  it('rejects unknown sources', async () => {
    const res = await api('/api/refresh', { method: 'POST', body: { sources: ['monster'] } });
    expect(res.status).toBe(400);
    expect(stub.calls).toEqual([]);
  });
});

describe('meta and AI', () => {
  it('describes the sources', async () => {
    const { body } = await api<MetaResponse>('/api/meta');
    expect(body.aiConfigured).toBe(false);
    expect(body.sources).toHaveLength(8);
    expect(body.sources[0]).toEqual({ id: 'remoteok', label: 'RemoteOK', short: 'RO' });
  });

  it('refuses to start an AI run without a key', async () => {
    const res = await api<{ error: string }>('/api/ai', { method: 'POST' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/DEEPSEEK_API_KEY/);
    const status = await api<AiStatus>('/api/ai');
    expect(status.body).toEqual({ state: 'idle', configured: false });
  });

  it('answers unknown API paths with a JSON 404', async () => {
    const res = await api<{ error: string }>('/api/nope');
    expect(res).toEqual({ status: 404, body: { error: 'Not found' } });
  });
});

async function waitForAi(): Promise<AiStatus> {
  for (let i = 0; i < 100; i++) {
    const { body } = await api<AiStatus>('/api/ai');
    if (body.state !== 'running') return body;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('AI run never finished');
}

describe('AI runs', () => {
  it('classifies every new job, one run at a time, with batch progress', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test-key-123456';
    let release!: () => void;
    stub.aiGate = new Promise<void>((r) => (release = r));

    const first = await api<AiStatus>('/api/ai', { method: 'POST' });
    expect(first.status).toBe(202);
    expect(first.body).toMatchObject({ state: 'running', configured: true, submitted: 2 });
    const second = await api<AiStatus>('/api/ai', { method: 'POST' });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ state: 'running', batch: 1, totalBatches: 2 });

    release();
    const done = await waitForAi();
    expect(done).toMatchObject({ state: 'done', kept: 2, submitted: 2 });
    const kept = await api<JobsResponse>('/api/jobs?ai=1');
    expect(kept.body.jobs.map((j) => j.id)).toEqual(['ro_2', 'li_1']);
  });

  it('is stopped by a refresh, which clears the results', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test-key-123456';
    stub.aiGate = new Promise<void>(() => {});

    expect((await api('/api/ai', { method: 'POST' })).status).toBe(202);
    expect((await api('/api/refresh', { method: 'POST', body: { sources: ['jobicy'] } })).status).toBe(202);

    const ai = await waitForAi();
    expect(ai).toMatchObject({ state: 'error', message: 'Stopped: a refresh started' });
    await waitForRefresh();
    expect((await api<JobsResponse>('/api/jobs?ai=1')).body.jobs).toEqual([]);
  });
});

describe('static files', () => {
  it('serves index.html and sw.js uncached, hashed assets immutable', async () => {
    const index = await raw(secured, '/');
    expect(index.status).toBe(200);
    expect(index.headers['content-type']).toMatch(/^text\/html/);
    expect(index.headers['cache-control']).toBe('no-cache');

    const sw = await raw(secured, '/sw.js');
    expect(sw.headers['content-type']).toMatch(/^text\/javascript/);
    expect(sw.headers['cache-control']).toBe('no-cache');

    const asset = await raw(secured, '/assets/index-abc123.js');
    expect(asset.body).toBe('console.log(1);');
    expect(asset.headers['cache-control']).toMatch(/immutable/);
  });

  it('serves the manifest with its registered type', async () => {
    const res = await raw(secured, '/manifest.webmanifest');
    expect(res.headers['content-type']).toMatch(/^application\/manifest\+json/);
  });

  it('falls back to index.html for app routes, but not for missing files', async () => {
    const route = await raw(secured, '/jobs/ro_1');
    expect(route.status).toBe(200);
    expect(route.body).toContain('<title>fe-hunt</title>');
    expect((await raw(secured, '/assets/missing.js')).status).toBe(404);
    expect((await raw(secured, '/favicon.ico')).status).toBe(404);
  });

  it('does not serve files outside the web root', async () => {
    const res = await raw(secured, '/..%2fsecret.txt');
    expect(res.status).toBe(404);
    expect(res.body).not.toContain('outside the web root');
  });

  it('revalidates with 304', async () => {
    const first = await raw(secured, '/');
    const again = await raw(secured, '/', {
      headers: { 'If-Modified-Since': String(first.headers['last-modified']) },
    });
    expect(again.status).toBe(304);
  });
});
