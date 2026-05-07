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
