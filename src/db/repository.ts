import type { Job, JobStatus, FilterState, AiJobResult, RemoteStatus, Source, SourceFilter } from '../state/types.js';
import { getDb } from './database.js';

export function upsertJobs(jobs: Job[]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO jobs (id, title, company, url, source, date_posted, status, country, work_type, description)
    VALUES (@id, @title, @company, @url, @source, @datePosted,
      COALESCE((SELECT status FROM jobs WHERE id = @id AND status != 'new'), @status),
      @country, @workType, @description)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      company = excluded.company,
      url = excluded.url,
      date_posted = excluded.date_posted,
      status = COALESCE((SELECT status FROM jobs WHERE id = excluded.id AND status != 'new'), excluded.status),
      country = excluded.country,
      work_type = excluded.work_type,
      description = excluded.description
  `);

  const insertMany = db.transaction((jobs: Job[]) => {
    for (const job of jobs) {
      stmt.run({
        id: job.id,
        title: job.title,
        company: job.company,
        url: job.url,
        source: job.source,
        datePosted: job.datePosted,
        status: job.status,
        country: job.country,
        workType: job.workType,
        description: job.description ?? '',
      });
    }
  });

  insertMany(jobs);
}

export function getFilteredJobs(filters: FilterState, sourceFilter?: SourceFilter): Job[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: Record<string, string> = {};

  // Apply source filter if not 'all'
  if (sourceFilter && sourceFilter !== 'all') {
    conditions.push('source = @sourceFilter');
    params.sourceFilter = sourceFilter;
  }

  if (filters.status) {
    conditions.push('status = @status');
    params.status = filters.status;
  }
  if (filters.source) {
    conditions.push('source = @source');
    params.source = filters.source;
  }
  if (filters.workType) {
    conditions.push('work_type = @workType');
    params.workType = filters.workType;
  }
  if (filters.title) {
    conditions.push('LOWER(title) LIKE @title');
    params.title = `%${filters.title.toLowerCase()}%`;
  }
  if (filters.company) {
    conditions.push('LOWER(company) LIKE @company');
    params.company = `%${filters.company.toLowerCase()}%`;
  }
  if (filters.country) {
    conditions.push('LOWER(country) LIKE @country');
    params.country = `%${filters.country.toLowerCase()}%`;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT id, title, company, url, source, date_posted, status, country, work_type, description FROM jobs ${where} ORDER BY date_posted DESC`;

  const rows = db.prepare(sql).all(params) as Array<{
    id: string;
    title: string;
    company: string;
    url: string;
    source: string;
    date_posted: string;
    status: string;
    country: string;
    work_type: string;
    description: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    company: row.company,
    url: row.url,
    source: row.source as Source,
    datePosted: row.date_posted,
    status: row.status as JobStatus,
    country: row.country,
    workType: row.work_type,
    description: row.description || undefined,
  }));
}

export function updateJobStatus(id: string, status: JobStatus): void {
  const db = getDb();
  db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run(status, id);
}

export function clearAllJobs(): void {
  const db = getDb();
  db.prepare('DELETE FROM jobs').run();
}

export function getJobCounts(): { total: number; new: number; applied: number; ignored: number } {
  const db = getDb();
  const rows = db.prepare('SELECT status, COUNT(*) as count FROM jobs GROUP BY status').all() as Array<{
    status: string;
    count: number;
  }>;

  const counts = { total: 0, new: 0, applied: 0, ignored: 0 };
  for (const row of rows) {
    counts.total += row.count;
    if (row.status === 'new') counts.new = row.count;
    else if (row.status === 'applied') counts.applied = row.count;
    else if (row.status === 'ignored') counts.ignored = row.count;
  }
  return counts;
}

const ALLOWED_DISTINCT_COLUMNS = new Set(['status', 'source', 'work_type']);

export function getDistinctValues(column: 'status' | 'source' | 'work_type'): string[] {
  if (!ALLOWED_DISTINCT_COLUMNS.has(column)) {
    throw new Error(`Invalid column for getDistinctValues: ${column}`);
  }
  const db = getDb();
  const rows = db.prepare(`SELECT DISTINCT ${column} FROM jobs WHERE ${column} != '' ORDER BY ${column}`).all() as Array<Record<string, string>>;
  return rows.map((r) => r[column]!);
}

export function saveAiFilteredJobs(results: AiJobResult[]): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare('DELETE FROM ai_filtered_jobs').run();
    const stmt = db.prepare('INSERT OR IGNORE INTO ai_filtered_jobs (job_id, remote, filtered_at) VALUES (?, ?, ?)');
    for (const r of results) {
      stmt.run(r.id, r.remote, now);
    }
  })();
}

export function getAiFilteredResults(): AiJobResult[] {
  const db = getDb();
  const rows = db.prepare('SELECT job_id, remote FROM ai_filtered_jobs').all() as Array<{ job_id: string; remote: string }>;
  return rows.map((r) => ({ id: r.job_id, remote: (r.remote || 'possible') as RemoteStatus }));
}

export function getAiFilteredJobs(): Job[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT j.id, j.title, j.company, j.url, j.source, j.date_posted, j.status, j.country, j.work_type, j.description
    FROM jobs j INNER JOIN ai_filtered_jobs af ON j.id = af.job_id
    ORDER BY j.date_posted DESC
  `).all() as Array<{
    id: string; title: string; company: string; url: string;
    source: string; date_posted: string; status: string; country: string; work_type: string; description: string;
  }>;
  return rows.map((row) => ({
    id: row.id, title: row.title, company: row.company, url: row.url,
    source: row.source as Source, datePosted: row.date_posted, status: row.status as import('../state/types.js').JobStatus,
    country: row.country, workType: row.work_type, description: row.description || undefined,
  }));
}
