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

export interface WeWorkRemotelyItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
  region: string;
  country: string;
  type: string;
  category: string;
}

export interface HimalayasJob {
  title: string;
  companyName: string;
  applicationLink: string;
  pubDate: number;
  guid: string;
  locationRestrictions: string[];
  timezoneRestrictions: string[];
  categories: string[];
  employmentType: string;
  seniority: string[];
}

export interface HimalayasResponse {
  jobs: HimalayasJob[];
  offset: number;
  limit: number;
  totalCount: number;
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
}

export interface RemotiveResponse {
  'job-count': number;
  jobs: RemotiveJob[];
}

export interface ArbeitnowJob {
  slug: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  company_name: string;
  created_at: number;
}

export interface ArbeitnowResponse {
  data: ArbeitnowJob[];
  links: {
    next: string | null;
  };
  meta: {
    current_page: number;
    last_page: number;
  };
}

export interface LinkedInJob {
  trackingUrn: string;
  title: { text: string };
  companyDetails: {
    companyName: string;
  };
  jobPostingId: string;
  url: string;
  description: string;
  listedAt: number;
  jobDetailsModuleId: string;
  formattedLocation: string;
}

export interface IndeedJob {
  jobkey: string;
  jobtitle: string;
  company: string;
  date: string;
  url: string;
  snippet: string;
  formattedLocation: string;
  indeedApply: boolean;
}

export interface HackerNewsHiringItem {
  id: number;
  by: string;
  time: number;
  title: string;
  text: string;
  type: string;
  url?: string;
}
