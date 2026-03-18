import type { Job } from '../state/types.js';
import { fetchWithTimeout, normalizeJob, determineWorkType } from './common.js';
import { generateJobId } from '../db/helpers.js';
import { XMLParser } from 'fast-xml-parser';

const RSS_URL = 'https://weworkremotely.com/remote-jobs.rss';

function parseTitle(fullTitle: string): { title: string; company: string } {
  const parts = fullTitle.split(':');
  if (parts.length >= 2) {
    return {
      company: parts[0]!.trim(),
      title: parts.slice(1).join(':').trim(),
    };
  }
  const atMatch = fullTitle.match(/(.+)\s+at\s+(.+)/);
  if (atMatch) {
    return { title: atMatch[1]!.trim(), company: atMatch[2]!.trim() };
  }
  return { title: fullTitle, company: 'Unknown' };
}

function parseRSSDate(pubDate: string): string {
  if (!pubDate) return new Date().toISOString().split('T')[0]!;
  try {
    const d = new Date(pubDate);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]!;
  } catch { /* ignore */ }
  return new Date().toISOString().split('T')[0]!;
}

export async function fetchWeWorkRemotely(
  signal?: AbortSignal,
  onProgress?: (count: number) => void
): Promise<Job[]> {
  const resp = await fetchWithTimeout(RSS_URL, signal);
  if (!resp.ok) throw new Error(`WeWorkRemotely returned ${resp.status}`);

  const xml = await resp.text();
  const parser = new XMLParser({ ignoreAttributes: false, processEntities: false });
  const parsed = parser.parse(xml);

  const items: any[] = parsed?.rss?.channel?.item ?? [];
  const jobs: Job[] = [];

  for (const item of items) {
    const { title, company } = parseTitle(item.title ?? '');
    if (!title || !company) continue;

    const country = item.country || item.region || '';
    const workType = determineWorkType(
      [item.type, item.category, item.title].filter(Boolean).join(' '),
      true
    );

    jobs.push(
      normalizeJob({
        id: generateJobId('weworkremotely', title, company),
        title,
        company,
        url: item.link ?? '',
        source: 'weworkremotely',
        datePosted: parseRSSDate(item.pubDate ?? ''),
        country,
        workType,
        description: item.description,
      })
    );
  }

  onProgress?.(jobs.length);
  return jobs;
}
