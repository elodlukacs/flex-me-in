import type { Job, JobStatus, Source } from '../state/types.js';
import { generateJobId } from '../db/helpers.js';

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/** Timer expiry, as distinct from the user aborting the fetch. */
export class TimeoutError extends Error {
  constructor(url: string, ms: number) {
    super(`Request timed out after ${ms}ms: ${url}`);
    this.name = 'TimeoutError';
  }
}

export interface HttpOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Default GET. */
  method?: 'GET' | 'POST';
  /** Request body, already serialised (callers set their own Content-Type). */
  body?: string;
  /** Retries for 429 / 5xx / network errors. Default 2. */
  retries?: number;
  /** Base backoff in ms; doubles per attempt. `Retry-After` wins when present. */
  backoffMs?: number;
}

export interface HttpResult<T> {
  ok: boolean;
  status: number;
  body?: T;
  /** Response text for a failed request, trimmed — for error messages. */
  errorBody?: string;
}

/** 408/409/425/429 are "try again later"; every 5xx is the server's fault. */
function isRetryable(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function retryAfterMs(resp: Response): number | undefined {
  const header = resp.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

/**
 * One request attempt. The timeout covers the *body* read too — a server that
 * sends headers and then stalls would otherwise hang forever.
 */
async function attempt<T>(
  url: string,
  parse: 'text' | 'json',
  opts: HttpOptions
): Promise<{ resp: Response; result: HttpResult<T> }> {
  const timeoutMs = opts.timeoutMs ?? 30000;
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();

  if (opts.signal) {
    if (opts.signal.aborted) {
      clearTimeout(timer);
      throw new DOMException('Aborted', 'AbortError');
    }
    opts.signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const resp = await fetch(url, {
      method: opts.method ?? 'GET',
      body: opts.body,
      signal: controller.signal,
      headers: { 'User-Agent': DEFAULT_UA, ...opts.headers },
    });

    if (!resp.ok) {
      const errorBody = await resp.text().catch(() => '');
      return {
        resp,
        result: { ok: false, status: resp.status, errorBody: errorBody.slice(0, 300) },
      };
    }

    const body = (parse === 'json' ? await resp.json() : await resp.text()) as T;
    return { resp, result: { ok: true, status: resp.status, body } };
  } catch (err) {
    // A timer-driven abort must not look like user cancellation.
    if (timedOut) throw new TimeoutError(url, timeoutMs);
    throw err;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

async function http<T>(
  url: string,
  parse: 'text' | 'json',
  opts: HttpOptions = {}
): Promise<HttpResult<T>> {
  const retries = opts.retries ?? 2;
  const backoffMs = opts.backoffMs ?? 1000;

  let last: HttpResult<T> = { ok: false, status: 0 };

  for (let i = 0; i <= retries; i++) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
      const { resp, result } = await attempt<T>(url, parse, opts);
      if (result.ok || !isRetryable(result.status) || i === retries) return result;
      last = result;
      const wait = retryAfterMs(resp) ?? backoffMs * 2 ** i;
      await abortableDelay(Math.min(wait, 30000), opts.signal);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (i === retries) throw err;
      await abortableDelay(backoffMs * 2 ** i, opts.signal);
    }
  }

  return last;
}

export function httpText(url: string, opts?: HttpOptions): Promise<HttpResult<string>> {
  return http<string>(url, 'text', opts);
}

export function httpJson<T>(url: string, opts?: HttpOptions): Promise<HttpResult<T>> {
  return http<T>(url, 'json', opts);
}

/**
 * The named entities feeds actually emit. Anything rarer stays literal, which
 * is visible but harmless.
 */
const NAMED_ENTITIES: Record<string, string> = {
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  // A plain space: the UI wraps and pads text itself.
  nbsp: ' ',
  mdash: '\u2014',
  ndash: '\u2013',
  rsquo: '\u2019',
  lsquo: '\u2018',
  rdquo: '\u201D',
  ldquo: '\u201C',
  hellip: '\u2026',
  copy: '\u00A9',
  reg: '\u00AE',
  trade: '\u2122',
  euro: '\u20AC',
  bull: '\u2022',
  middot: '\u00B7',
};

const NAMED_ENTITY_RE = new RegExp(`&(${Object.keys(NAMED_ENTITIES).join('|')});`, 'g');

export function decodeHTMLEntities(str: string): string {
  if (!str) return '';
  return (
    str
      // Numeric refs first; `String.fromCodePoint` so astral chars survive.
      .replace(/&#(\d+);/g, (_, n: string) => safeCodePoint(parseInt(n, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, n: string) => safeCodePoint(parseInt(n, 16)))
      .replace(NAMED_ENTITY_RE, (_, name: string) => NAMED_ENTITIES[name] ?? '')
      // `&amp;` LAST, else `&amp;lt;` would decode twice.
      .replace(/&amp;/g, '&')
  );
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/** Feeds hand us HTML in description fields; the popup renders plain text. */
export function stripHtml(html: string): string {
  if (!html) return '';
  return decodeHTMLEntities(
    html
      .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n')
      // `\b`, or `<link ...>` would also become a bullet.
      .replace(/<\s*li\b[^>]*>/gi, '• ')
      .replace(/<[^>]*>/g, '')
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function normalizeJob(partial: {
  id: string;
  title: string;
  company: string;
  url: string;
  source: Source;
  /** Empty string when the feed carries no date — never fabricate today. */
  datePosted: string;
  country?: string;
  workType?: string;
  description?: string;
}): Job {
  return {
    id: partial.id,
    title: partial.title.trim(),
    company: partial.company.trim(),
    url: partial.url,
    source: partial.source,
    datePosted: partial.datePosted,
    status: 'new' as JobStatus,
    country: partial.country?.trim() ?? '',
    workType: partial.workType?.trim() ?? '',
    description: partial.description?.trim() || undefined,
  };
}

/**
 * Collapse the same role posted once per country into a single row, merging the
 * countries. Workable fans one posting out across every hiring location (one
 * role appeared 6× as NL/PL/FR/DE/UK/BE), which would otherwise fill the
 * screen and split the applied/ignored status across duplicates.
 *
 * The surviving row's id is derived from the role key (title+company) rather
 * than from any one member's native id: cursor paging returns a slightly
 * different window each run, so a member-derived id would change whenever the
 * chosen duplicate fell out of the window — orphaning applied/ignored state.
 * For a collapsed row the identity is the role, not the country variant.
 */
export function collapseByRole(jobs: Job[]): Job[] {
  const groups = new Map<string, Job[]>();
  for (const job of jobs) {
    const key = `${job.title.trim().toLowerCase()}|${job.company.trim().toLowerCase()}`;
    const existing = groups.get(key);
    if (existing) existing.push(job);
    else groups.set(key, [job]);
  }

  return [...groups.entries()].map(([key, group]) => {
    const rep = [...group].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0]!;
    const countries = [...new Set(group.map((g) => g.country).filter(Boolean))].sort();
    const dates = group.map((g) => g.datePosted).filter(Boolean).sort();
    return {
      ...rep,
      id: generateJobId(rep.source, `role:${key}`),
      country: countries.join(', '),
      // Freshest of the duplicates.
      datePosted: dates[dates.length - 1] ?? '',
      description: group.find((g) => g.description)?.description,
    };
  });
}

/** '' when the epoch is missing — the DB falls back to first_seen. */
export function formatUnixDate(epoch: number): string {
  if (!epoch) return '';
  const d = new Date(epoch * 1000);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0]!;
}

/** '' when unparseable — the DB falls back to first_seen. */
export function parseDateOnly(value: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0]!;
}

export function determineWorkType(
  location: string,
  remote?: boolean,
  tags?: string[]
): string {
  const combined = [location, ...(tags ?? [])].join(' ').toLowerCase();
  if (combined.includes('hybrid')) return 'hybrid';
  // An explicit remote flag from the feed outranks an incidental "office"
  // mention in the location/tags blob.
  if (remote) return 'remote';
  if (
    combined.includes('onsite') ||
    combined.includes('on-site') ||
    combined.includes('in-person') ||
    combined.includes('office')
  ) {
    return 'onsite';
  }
  if (combined.includes('remote')) return 'remote';
  return '';
}
