import { XMLParser } from 'fast-xml-parser';
import type { Job } from '../state/types.js';
import type { FetchResult } from './types.js';
import {
  httpText,
  normalizeJob,
  determineWorkType,
  parseDateOnly,
  stripHtml,
  decodeHTMLEntities,
} from './common.js';
import { generateJobId } from '../db/helpers.js';
import { isSeniorFrontend } from './relevance.js';
import { isNonEMEALocation } from './regions.js';
import { logError } from '../utils/log.js';

// The front-end category feed (/categories/remote-front-end-programming-jobs.rss)
// is still mostly miscategorised junk (re-checked 2026-11-03). The all-jobs
// feed stops at the newest 100 items across every category, so the full-stack
// feed is read too — that is where WWR files most React roles. The title gate
// does the filtering for both.
const RSS_URLS = [
  'https://weworkremotely.com/remote-jobs.rss',
  'https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss',
] as const;

/** RSS nodes are `string` normally, `{'#text': ...}` when they carry attributes. */
function text(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (typeof node === 'object' && '#text' in (node as Record<string, unknown>)) {
    return String((node as Record<string, unknown>)['#text'] ?? '');
  }
  return '';
}

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

interface RssItem {
  title?: unknown;
  link?: unknown;
  description?: unknown;
  pubDate?: unknown;
  guid?: unknown;
  region?: unknown;
  country?: unknown;
  type?: unknown;
  category?: unknown;
}

/**
 * Pure: RSS text -> relevant jobs. Throws when the document is not an RSS
 * channel at all, so a changed feed is an error rather than "0 jobs".
 */
export function parseWwrFeed(xml: string): { jobs: Job[]; scanned: number } {
  // processEntities decodes the XML-level &amp;/&lt;. The default caps (1000
  // total expansions / 100k expanded chars) are billion-laughs guards sized for
  // small documents — this feed is ~800 KB of entity-heavy HTML descriptions
  // and needs several thousand, so raise them to bounds this feed cannot
  // exceed.
  const parser = new XMLParser({
    ignoreAttributes: false,
    processEntities: {
      enabled: true,
      maxTotalExpansions: 200_000,
      maxExpandedLength: 8_000_000,
    },
  });
  const parsed = parser.parse(xml) as { rss?: { channel?: { item?: unknown } } } | undefined;
  const channel = parsed?.rss?.channel;
  if (!channel || typeof channel !== 'object') {
    throw new Error('WeWorkRemotely response shape changed (no RSS channel)');
  }

  const raw = channel.item;
  const items = (Array.isArray(raw) ? raw : raw ? [raw] : []) as (RssItem | null)[];
  const jobs: Job[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    // Titles arrive with HTML entities the XML pass leaves alone
    // (&#8217; / &#8211; / &nbsp;), which otherwise showed literally.
    const { title, company } = parseTitle(decodeHTMLEntities(text(item.title)));
    if (!title || !company) continue;
    if (!isSeniorFrontend(title)) continue;

    const country = text(item.country) || text(item.region);
    // "USA Only" / "Americas Only" region scopes; the positive check would
    // also drop "Anywhere in the World".
    if (isNonEMEALocation([text(item.region), text(item.country)].join(', '))) continue;

    const workType = determineWorkType(
      [text(item.type), text(item.category), text(item.title)].filter(Boolean).join(' '),
      true
    );

    jobs.push(
      normalizeJob({
        id: generateJobId('weworkremotely', text(item.guid) || text(item.link), {
          title,
          company,
        }),
        title,
        company,
        url: text(item.link),
        source: 'weworkremotely',
        datePosted: parseDateOnly(text(item.pubDate)),
        country,
        workType,
        // The feed's description is raw HTML.
        description: stripHtml(text(item.description)),
      })
    );
  }
  return { jobs, scanned: items.length };
}

export async function fetchWeWorkRemotely(
  signal?: AbortSignal,
  onProgress?: (count: number) => void
): Promise<FetchResult> {
  const jobs: Job[] = [];
  const seen = new Set<string>();
  let scanned = 0;
  let failures = 0;
  let lastError: unknown;

  for (const url of RSS_URLS) {
    try {
      const res = await httpText(url, { signal });
      if (!res.ok) throw new Error(`WeWorkRemotely returned ${res.status}`);
      const feed = parseWwrFeed(res.body ?? '');
      scanned += feed.scanned;
      // A posting in both feeds has the same guid, hence the same id.
      for (const job of feed.jobs) {
        if (seen.has(job.id)) continue;
        seen.add(job.id);
        jobs.push(job);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      logError(`weworkremotely ${url}`, err);
      failures++;
      lastError = err;
    }
  }
  if (failures === RSS_URLS.length) throw lastError;

  onProgress?.(jobs.length);
  return { jobs, complete: failures === 0, scanned };
}
