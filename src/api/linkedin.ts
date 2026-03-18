import type { Job } from '../state/types.js';
import { fetchWithTimeout, normalizeJob, determineWorkType, abortableDelay } from './common.js';
import { generateJobId } from '../db/helpers.js';

const LINKEDIN_JOBS_API = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
const MAX_PAGES = 10;
const JOBS_PER_PAGE = 10;
const DELAY_MS = 800;

const EMEA_COUNTRIES = [
  'United Kingdom', 'UK', 'England', 'Scotland', 'Wales', 'Ireland',
  'Germany', 'France', 'Spain', 'Italy', 'Netherlands', 'Belgium',
  'Sweden', 'Norway', 'Denmark', 'Finland', 'Poland', 'Switzerland',
  'Austria', 'Ireland', 'Portugal', 'Greece', 'Czech', 'Czechia', 'Romania', 'Hungary',
  'Israel', 'UAE', 'United Arab Emirates', 'Saudi Arabia', 'Egypt', 'South Africa',
  'Nigeria', 'Kenya', 'Morocco', 'Algeria', 'Tunisia', 'Turkey',
  'Europe', 'EMEA', 'Middle East', 'Africa',
];

const EMEA_SEARCH_TERMS = [
  'Remote',
  'Europe',
  'Germany',
  'UK',
  'United Kingdom',
  'France',
  'Spain',
  'Italy',
  'Netherlands',
  'Poland',
  'Portugal',
  'Romania',
  'Sweden',
];

function isEMEAJob(location: string): boolean {
  // If no location specified, include it (could be remote-friendly)
  if (!location || location.trim() === '') return true;
  
  const lower = location.toLowerCase();
  
  // Check for explicit non-EMEA (Americas)
  if (lower.includes('united states') || lower.includes('usa') || 
      lower.includes('canada') || lower.includes('mexico') ||
      lower.includes('brazil') || lower.includes('argentina') ||
      lower.includes('colombia') || lower.includes('chile') ||
      lower.includes('america')) {
    return false;
  }
  
  // Check for EMEA countries
  return EMEA_COUNTRIES.some(c => lower.includes(c.toLowerCase()));
}

export async function fetchLinkedIn(
  signal?: AbortSignal,
  onProgress?: (count: number) => void,
  keywords = 'Frontend',
  location = 'Remote',
  region: 'emea' | 'all' = 'emea'
): Promise<Job[]> {
  const jobs: Job[] = [];
  const isEmeaFilter = region === 'emea';
  const seenIds = new Set<string>();
  
  // Use multiple search terms for more results
  const searchTerms = isEmeaFilter ? EMEA_SEARCH_TERMS : ['Remote'];
  
  for (const searchTerm of searchTerms) {
    if (signal?.aborted) break;
    if (jobs.length >= 60) break;
    
    for (let page = 0; page < MAX_PAGES; page++) {
      if (signal?.aborted) break;
      if (jobs.length >= 60) break;
      
      const params = new URLSearchParams({
        keywords,
        location: searchTerm,
        f_TPR: 'r86400',
        f_WT: '2',
        start: String(page * JOBS_PER_PAGE),
      });

      const url = `${LINKEDIN_JOBS_API}?${params.toString()}`;
      
      try {
        const resp = await fetchWithTimeout(url, signal);
        if (!resp.ok) {
          if (resp.status === 429) break;
          throw new Error(`LinkedIn returned ${resp.status}`);
        }

        const html = await resp.text();
        
        const cardRegex = /<div[^>]*class="[^"]*base-search-card[^"]*"[^>]*data-entity-urn="urn:li:jobPosting:(\d+)"[^>]*>([\s\S]*?)<\/div>\s*<\/li>/g;
        
        let match;
        let pageJobsCount = 0;
        while ((match = cardRegex.exec(html)) !== null) {
          const cardHtml = match[2];
          const jobId = match[1];
          
          if (!cardHtml) continue;
          
          const titleMatch = cardHtml.match(/<h3[^>]*class="[^"]*base-search-card__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/);
          let title = titleMatch?.[1]?.replace(/<[^>]*>/g, '').trim() || '';
          
          if (!title) {
            const srTitleMatch = cardHtml.match(/<span[^>]*class="sr-only"[^>]*>([\s\S]*?)<\/span>/);
            title = srTitleMatch?.[1]?.trim() || '';
          }
          
          const companyMatch = cardHtml.match(/<a[^>]*class="hidden-nested-link"[^>]*>([^<]+)<\/a>/);
          const company = companyMatch?.[1]?.trim() || 'Unknown';
          
          const locationMatch = cardHtml.match(/<span[^>]*class="job-search-card__location"[^>]*>([\s\S]*?)<\/span>/);
          const jobLocation = locationMatch?.[1]?.replace(/<[^>]*>/g, '').trim() || '';
          
          const dateMatch = cardHtml.match(/<time[^>]*class="job-search-card__listdate[^"]*"[^>]*datetime="([^"]+)"[^>]*>/);
          const datePosted = dateMatch?.[1]?.split('T')[0] || new Date().toISOString().split('T')[0]!;
          
          const urlMatch = cardHtml.match(/href="(https:\/\/[^"]+linkedin\.com\/jobs\/view\/[^"]+)"/);
          let jobUrl = urlMatch?.[1] || `https://www.linkedin.com/jobs/view/${jobId}`;
          
          // Clean up LinkedIn URL - remove tracking parameters
          if (jobUrl.includes('?')) {
            const baseUrl = jobUrl.split('?')[0];
            jobUrl = baseUrl;
          }
          
          if (!title || title.length < 3) continue;
          
          // Skip duplicates
          const jobKey = `${title}-${company}`;
          if (seenIds.has(jobKey)) continue;
          seenIds.add(jobKey);
          
          // Filter by EMEA if requested
          if (isEmeaFilter && !isEMEAJob(jobLocation)) continue;
          
          jobs.push(
            normalizeJob({
              id: generateJobId('linkedin', title, company),
              title,
              company,
              url: jobUrl,
              source: 'linkedin',
              datePosted,
              country: jobLocation,
              workType: determineWorkType(jobLocation, jobLocation.toLowerCase().includes('remote')),
            })
          );
          pageJobsCount++;
        }

        onProgress?.(jobs.length);
        
        if (pageJobsCount === 0) break;
        
        if (page < MAX_PAGES - 1) {
          await abortableDelay(DELAY_MS, signal);
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error;
        console.error('LinkedIn fetch error on page', page, error);
        break;
      }
    }
  }
  
  if (jobs.length === 0) {
    throw new Error('No jobs found (LinkedIn may be blocking requests)');
  }
  
  return jobs;
}
