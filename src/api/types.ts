import type { Job } from '../state/types.js';

/**
 * What every source fetcher returns. `complete` is false when paging stopped
 * early (rate limit, block, a failed page): the caller then upserts the jobs
 * but must not purge the source's existing 'new' rows, since missing rows may
 * simply not have been reached.
 */
export interface FetchResult {
  jobs: Job[];
  complete: boolean;
  /**
   * Listings the feed returned before relevance/region filtering. Tells "the
   * feed had listings, none matched" (old rows may go) apart from "the feed
   * came back empty" (more likely broken; old rows stay).
   */
  scanned: number;
}

export type FetchFn = (
  signal?: AbortSignal,
  onProgress?: (count: number) => void
) => Promise<FetchResult>;

export interface RemoteOKJob {
  id: number;
  epoch: number;
  date: string;
  company: string;
  company_logo: string;
  position: string;
  tags: string[];
  description: string;
  location: string;
  original: boolean;
  url: string;
  apply_url: string;
  salary_min: number;
  salary_max: number;
}

export interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category: string;
  tags: string[];
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary: string;
  description?: string;
}

export interface RemotiveResponse {
  'job-count': number;
  jobs: RemotiveJob[];
}

export interface JobicyJob {
  id: string | number;
  url: string;
  jobSlug: string;
  jobTitle: string;
  companyName: string;
  jobGeo: string;
  jobLevel: string;
  jobType: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate: string;
}

export interface JobicyResponse {
  jobCount: number;
  jobs: JobicyJob[];
}

/** A job from himalayas.app/jobs/api/search (20 a page, page-numbered). */
export interface HimalayasJob {
  title: string;
  companyName: string;
  employmentType?: string;
  seniority?: string[];
  /** Countries the hire may live in; empty means worldwide. */
  locationRestrictions?: string[];
  description?: string;
  excerpt?: string;
  /** Unix seconds. */
  pubDate?: number;
  expiryDate?: number;
  applicationLink?: string;
  /** The job page URL; stable per posting. */
  guid: string;
}

export interface HimalayasResponse {
  jobs: HimalayasJob[];
  offset: number;
  limit: number;
  totalCount: number;
}

export interface WorkableLocation {
  countryName?: string;
  country?: string;
  city?: string;
}

export interface WorkableJob {
  id: string;
  title: string;
  description?: string;
  url?: string;
  created?: string;
  updated?: string;
  workplace?: string;
  employmentType?: string;
  company?: { title?: string };
  location?: WorkableLocation;
  locations?: WorkableLocation[];
}

export interface WorkableResponse {
  totalSize: number;
  nextPageToken?: string;
  jobs: WorkableJob[];
}

/** An offer from justjoin.it/api/candidate-api/offers. */
export interface JustJoinOffer {
  slug: string;
  title: string;
  companyName: string;
  experienceLevel: string;
  workplaceType: string;
  city?: string;
  locations?: { city: string; slug: string }[];
  category?: { key?: string };
  /** Despite the name, the latest refresh ("bump") of the offer. */
  publishedAt?: string;
  /** Despite the name, the original posting date; `sortBy=newest` orders by it. */
  lastPublishedAt?: string;
}

export interface JustJoinResponse {
  data: JustJoinOffer[];
  meta: {
    /** Offset of this page. */
    from: number;
    totalItems: number;
    /** On the last page `next.cursor` equals `totalItems`, not null. */
    next?: { cursor: number | null };
  };
}

/** The subset of an OpenAI-compatible chat completion that we read. */
export interface ChatCompletionResponse {
  choices?: {
    message?: { content?: string | null };
    finish_reason?: string;
  }[];
}
