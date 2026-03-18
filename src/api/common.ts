import type { Job, JobStatus, Source } from '../state/types.js';

export async function fetchWithTimeout(
  url: string,
  signal?: AbortSignal,
  timeoutMs = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();

  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeout);
      throw new DOMException('Aborted', 'AbortError');
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      },
    });
    return resp;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
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
    signal?.addEventListener('abort', onAbort);
  });
}

export function normalizeJob(partial: {
  id: string;
  title: string;
  company: string;
  url: string;
  source: Source;
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

export function formatUnixDate(epoch: number): string {
  if (!epoch) return new Date().toISOString().split('T')[0]!;
  return new Date(epoch * 1000).toISOString().split('T')[0]!;
}

export function extractCountry(location: string): string {
  if (!location) return '';
  const parts = location.split(',').map((s) => s.trim());
  return parts[parts.length - 1] ?? '';
}

export function determineWorkType(
  location: string,
  remote?: boolean,
  tags?: string[]
): string {
  const combined = [location, ...(tags ?? [])].join(' ').toLowerCase();
  if (combined.includes('hybrid')) return 'hybrid';
  if (
    combined.includes('onsite') ||
    combined.includes('on-site') ||
    combined.includes('in-person') ||
    combined.includes('office')
  )
    return 'onsite';
  if (remote || combined.includes('remote')) return 'remote';
  return '';
}
