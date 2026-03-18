import type { Job } from '../state/types.js';
import type { IndeedJob } from './types.js';
import { fetchWithTimeout, normalizeJob, determineWorkType, extractCountry } from './common.js';
import { generateJobId } from '../db/helpers.js';

const INDEED_API = 'https://www.indeed.com/jobs';

export async function fetchIndeed(
  signal?: AbortSignal,
  onProgress?: (count: number) => void,
  keywords = 'senior frontend developer',
  location = 'Remote'
): Promise<Job[]> {
  const jobs: Job[] = [];
  
  const params = new URLSearchParams({
    q: keywords,
    l: location,
    fromage: '7',
    remotejob: 'remotedt',
  });

  const url = `${INDEED_API}?${params.toString()}`;

  try {
    const resp = await fetchWithTimeout(url, signal, 15000);
    if (!resp.ok) {
      throw new Error(`Indeed returned ${resp.status}`);
    }

    const html = await resp.text();
    
    const scriptMatches = html.match(/<script[^>]*id="mosaic-data"[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
    
    if (scriptMatches) {
      try {
        const jsonData = JSON.parse(scriptMatches[1]);
        const jobCards = jsonData?.metaAttributes?.mosaicServerJobResults?.components?.jobCardsModuleInterests?.jobCards 
          || jsonData?.jobCards 
          || [];
        
        for (const card of jobCards.slice(0, 25)) {
          const job = parseIndeedJob(card);
          if (job) jobs.push(job);
        }
      } catch (parseError) {
        console.error('Failed to parse Indeed JSON:', parseError);
      }
    }

    if (jobs.length === 0) {
      const jobMatches = html.match(/<li[^>]*class="[^"]*jobsearch-ResultsList-li[^"]*"[^>]*data-jk="([^"]*)"[^>]*>([\s\S]*?)<\/li>/g);
      if (jobMatches) {
        for (const match of jobMatches.slice(0, 25)) {
          const job = parseIndeedHtmlJob(match);
          if (job) jobs.push(job);
        }
      }
    }

    onProgress?.(jobs.length);
    
    if (jobs.length === 0) {
      throw new Error('No jobs found (Indeed may be blocking requests)');
    }
    
    return jobs;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    console.error('Indeed fetch error:', error);
    onProgress?.(0);
    throw new Error('Failed to fetch from Indeed (blocked or unavailable)');
  }
}

function parseIndeedJob(data: Record<string, unknown>): Job | null {
  try {
    const title = (data.jobTitle as string) || (data.title as string) || '';
    const company = (data.company as string) || (data.companyName as string) || 'Unknown';
    const jobKey = (data.jobkey as string) || (data.jobKey as string) || '';
    const url = `https://www.indeed.com/viewjob?jk=${jobKey}`;
    const datePosted = (data.date as string) || new Date().toISOString().split('T')[0]!;
    const location = (data.formattedLocation as string) || (data.location as string) || '';
    
    if (!title || !jobKey) return null;

    const workType = determineWorkType(location, true);

    return normalizeJob({
      id: generateJobId('indeed', title, company),
      title,
      company,
      url,
      source: 'indeed',
      datePosted,
      country: extractCountry(location),
      workType,
    });
  } catch {
    return null;
  }
}

function parseIndeedHtmlJob(html: string): Job | null {
  try {
    const jkMatch = html.match(/data-jk="([^"]+)"/);
    const titleMatch = html.match(/<h2[^>]*class="[^"]*jobTitle[^"]*"[^>]*>(.*?)<\/h2>/);
    const companyMatch = html.match(/<span[^>]*class="[^"]*companyName[^"]*"[^>]*>(.*?)<\/span>/);
    const locationMatch = html.match(/<div[^>]*class="[^"]*companyLocation[^"]*"[^>]*>(.*?)<\/div>/);
    const dateMatch = html.match(/<span[^>]*class="[^"]*date[^"]*"[^>]*>(.*?)<\/span>/);

    const jk = jkMatch?.[1] || '';
    const title = titleMatch?.[1]?.replace(/<[^>]*>/g, '').trim() || '';
    const company = companyMatch?.[1]?.replace(/<[^>]*>/g, '').trim() || 'Unknown';
    const location = locationMatch?.[1]?.replace(/<[^>]*>/g, '').trim() || '';
    const dateText = dateMatch?.[1] || '';

    if (!title || !jk) return null;

    let datePosted = new Date().toISOString().split('T')[0]!;
    if (dateText.includes('hour') || dateText.includes('Just')) {
      datePosted = new Date().toISOString().split('T')[0]!;
    } else if (dateText.includes('day')) {
      const days = parseInt(dateText.match(/\d+/)?.[0] || '0', 10);
      const d = new Date();
      d.setDate(d.getDate() - days);
      datePosted = d.toISOString().split('T')[0]!;
    }

    return normalizeJob({
      id: generateJobId('indeed', title, company),
      title,
      company,
      url: `https://www.indeed.com/viewjob?jk=${jk}`,
      source: 'indeed',
      datePosted,
      country: extractCountry(location),
      workType: determineWorkType(location, true),
    });
  } catch {
    return null;
  }
}
