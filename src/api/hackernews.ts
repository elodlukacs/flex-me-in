import type { Job } from '../state/types.js';
import type { HackerNewsHiringItem } from './types.js';
import { fetchWithTimeout, normalizeJob, determineWorkType, abortableDelay } from './common.js';
import { generateJobId } from '../db/helpers.js';

const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';
const HN_JOBS_PATTERN = /^(?=.*?(?:frontend|front-end|react|vue|angular|javascript|typescript|web developer|ui developer))(?=.*?(?:hiring|Remote|remote|work from anywhere|team is looking|position|job|opening|role)).*$/i;
const HN_HTML_LINK = /<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g;

interface HNItem {
  id: number;
  by: string;
  time: number;
  title: string;
  text?: string;
  type: string;
  url?: string;
  kids?: number[];
}

export async function fetchHackerNews(
  signal?: AbortSignal,
  onProgress?: (count: number) => void
): Promise<Job[]> {
  const jobs: Job[] = [];
  
  try {
    const topStoriesResp = await fetchWithTimeout(`${HN_API_BASE}/topstories.json`, signal);
    if (!topStoriesResp.ok) throw new Error(`HN API returned ${topStoriesResp.status}`);
    
    const topStoryIds = (await topStoriesResp.json()) as number[];
    const hiringIds = topStoryIds.slice(0, 100);

    const oneMonthAgo = Date.now() / 1000 - 30 * 24 * 60 * 60;

    const itemPromises = hiringIds.slice(0, 30).map(async (id) => {
      try {
        const resp = await fetchWithTimeout(`${HN_API_BASE}/item/${id}.json`, signal, 5000);
        if (!resp.ok) return null;
        return (await resp.json()) as HNItem | null;
      } catch {
        return null;
      }
    });

    const items = await Promise.all(itemPromises);

    for (const item of items) {
      if (!item || item.type !== 'job') continue;
      
      const itemDate = new Date(item.time * 1000);
      if (item.time < oneMonthAgo) continue;

      if (item.text) {
        const jobLines = item.text.split('\n').filter(line => {
          const trimmed = line.trim();
          if (!trimmed) return false;
          if (trimmed.startsWith('##') || trimmed.startsWith('#')) return false;
          if (trimmed.length < 20) return false;
          return true;
        });

        for (const line of jobLines) {
          const job = parseHackerNewsLine(item, line);
          if (job) jobs.push(job);
        }
      }
    }

    if (jobs.length === 0) {
      const askHNBulkResp = await fetchWithTimeout(`${HN_API_BASE}/item/45438503.json`, signal);
      if (askHNBulkResp.ok) {
        const askHNData = (await askHNBulkResp.json()) as HNItem;
        if (askHNData?.kids) {
          const kids = askHNData.kids.slice(0, 20);
          for (const kidId of kids) {
            try {
              const resp = await fetchWithTimeout(`${HN_API_BASE}/item/${kidId}.json`, signal, 5000);
              if (!resp.ok) continue;
              const kid = (await resp.json()) as HNItem;
              
              if (kid?.text && HN_JOBS_PATTERN.test(kid.text)) {
                const jobLines = kid.text.split('\n').filter(line => line.trim().length > 20);
                for (const line of jobLines) {
                  const job = parseHackerNewsLine(kid, line);
                  if (job) jobs.push(job);
                }
              }
              
              await abortableDelay(100, signal);
            } catch {}
          }
        }
      }
    }

    onProgress?.(jobs.length);
    
    if (jobs.length === 0) {
      throw new Error('No jobs found from Hacker News');
    }
    
    return jobs;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    console.error('HackerNews fetch error:', error);
    onProgress?.(0);
    throw new Error('Failed to fetch from Hacker News');
  }
}

function parseHackerNewsLine(item: HNItem, line: string): Job | null {
  try {
    const trimmed = line.trim();
    if (trimmed.length < 20) return null;

    let url = '';
    let title = trimmed;

    const linkMatch = trimmed.match(HN_HTML_LINK);
    if (linkMatch) {
      url = linkMatch[1];
      title = linkMatch[2].replace(/<[^>]*>/g, '').trim();
    } else {
      const urlMatch = trimmed.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        url = urlMatch[1];
        title = trimmed.replace(url, '').trim();
      }
    }

    title = title.replace(/<[^>]*>/g, '').trim();
    if (title.length < 5) return null;

    // Clean up URL - remove tracking parameters
    let cleanUrl = url || item.url || '';
    if (cleanUrl.includes('?')) {
      cleanUrl = cleanUrl.split('?')[0]!;
    }

    const company = extractCompanyFromTitle(title);
    const workType = determineWorkType(trimmed, trimmed.toLowerCase().includes('remote'));
    const country = extractCountry(trimmed);

    return normalizeJob({
      id: generateJobId('hackernews', title, company || 'Unknown'),
      title,
      company: company || 'Unknown',
      url: cleanUrl,
      source: 'hackernews',
      datePosted: new Date(item.time * 1000).toISOString().split('T')[0]!,
      country,
      workType,
    });
  } catch {
    return null;
  }
}

function extractCompanyFromTitle(title: string): string {
  const patterns = [
    /at\s+([A-Z][A-Za-z\s&]+?)(?:\s+[-|]|\s+(?:Remote|Hiring|Job|Position|Software|Engineer|Developer|Team|$))/i,
    /^-?\s*([A-Z][A-Za-z\s&]+?)\s+is\s+(?:hiring|looking)/i,
    /^([A-Z][A-Za-z\s&]+?)\s*[-|]\s*/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match && match[1]) {
      const company = match[1].trim();
      if (company.length > 2 && company.length < 40) {
        return company;
      }
    }
  }

  return '';
}

function extractCountry(text: string): string {
  const countries = [
    'United States', 'US', 'USA', 'UK', 'England', 'Scotland', 'Wales',
    'Germany', 'France', 'Spain', 'Italy', 'Netherlands', 'Poland', 'Sweden',
    'Canada', 'Australia', 'New Zealand', 'Japan', 'Singapore', 'India',
    'Brazil', 'Argentina', 'Mexico', 'Worldwide', 'EU', 'EMEA', 'APAC',
  ];

  for (const country of countries) {
    if (text.toLowerCase().includes(country.toLowerCase())) {
      return country;
    }
  }

  return '';
}
