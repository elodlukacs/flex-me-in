import type {
  Job,
  JobStatus,
  FilterState,
  AiJobResult,
  JobCounts,
  RemoteStatus,
  Source,
  SourceFilter,
} from '../state/types.js';
import { getDb, prepared, SORT_EXPR } from './database.js';

/**
 * List columns deliberately exclude `description`: it holds whole job posts
 * (raw HTML from some feeds) and is only ever read by the popup and the AI
 * filter, so selecting it made every filter keystroke re-materialise megabytes
 * to render ~40 rows. Use `getJobDescription(id)` on demand.
 */
const LIST_FIELDS = [
  'id', 'title', 'company', 'url', 'source', 'date_posted', 'first_seen', 'status', 'country', 'work_type',
];

/**
 * SQL for "`table`'s row came in with its source's latest stored fetch" (see
 * `migrateBatches`). A source with no recorded fetch yet counts every row, so
 * a DB from before batches still shows its untriaged jobs as New until the
 * first refresh.
 */
function freshExpr(table: string): string {
  const latest = `(SELECT sb.started_at FROM source_batches sb WHERE sb.source = ${table}.source)`;
  return `(${latest} IS NULL OR ${table}.batch_at = ${latest})`;
}

/**
 * SQL for "`table`'s untriaged row is New": from its source's latest fetch and
 * never opened. Opening a job, or a later fetch, takes the label away; the
 * row then has no status until the user gives it one.
 */
function isNewExpr(table: string): string {
  return `(${table}.status = 'new' AND ${freshExpr(table)} AND ${table}.seen_at IS NULL)`;
}

/**
 * The list columns of `table` (a name or alias), plus `seen` (opened at least
 * once) and `fresh` (see `isNewExpr` for what makes a job New).
 */
function listColumns(table: string): string {
  const cols = LIST_FIELDS.map((c) => `${table}.${c}`).join(', ');
  return `${cols}, ${table}.seen_at IS NOT NULL AS seen, ${freshExpr(table)} AS fresh`;
}

interface JobRow {
  id: string;
  title: string;
  company: string;
  url: string;
  source: string;
  date_posted: string;
  first_seen: string;
  status: string;
  country: string;
  work_type: string;
  /** SQLite boolean; NULL when the source has no recorded batch. */
  fresh: number | null;
  seen: number;
}

function rowToJob(row: JobRow): Job {
  const job: Job = {
    id: row.id,
    title: row.title,
    company: row.company,
    url: row.url,
    source: row.source as Source,
    // Fall back to first_seen so rows from dateless feeds still show something.
    datePosted: row.date_posted || row.first_seen,
    status: row.status as JobStatus,
    country: row.country,
    workType: row.work_type,
  };
  if (row.fresh) job.fresh = true;
  if (row.seen) job.seen = true;
  return job;
}

const UPSERT_SQL = `
  INSERT INTO jobs (id, title, company, url, source, date_posted, first_seen, status, country, work_type, description, batch_at)
  VALUES (@id, @title, @company, @url, @source, @datePosted, @now, @status, @country, @workType, @description, @batchAt)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    company = excluded.company,
    url = excluded.url,
    date_posted = CASE
      -- Never let a dateless re-fetch erase a real upstream date.
      WHEN NULLIF(excluded.date_posted, '') IS NULL THEN jobs.date_posted
      -- A LinkedIn posting fetched as "6 hours ago" is stored to the minute;
      -- the next day it reads "1 day ago" and only yields the date. Keep the
      -- precise value while the day agrees.
      WHEN length(jobs.date_posted) > 10
        AND substr(jobs.date_posted, 1, 10) = substr(excluded.date_posted, 1, 10)
        THEN jobs.date_posted
      ELSE excluded.date_posted
    END,
    -- first_seen and batch_at are set once, at insert.
    country = excluded.country,
    work_type = excluded.work_type,
    -- Sources that omit descriptions must not blank an existing one.
    description = COALESCE(NULLIF(excluded.description, ''), jobs.description)
`;

/**
 * A touched (applied/ignored) row with the same (source, title, company) under
 * another id. `status != 'new'` is spelled exactly as in the partial index
 * `idx_jobs_legacy_key` so the planner can use it.
 */
const LEGACY_LOOKUP_SQL = `
  SELECT id FROM jobs
  WHERE source = ? AND lower(title) = lower(?) AND lower(company) = lower(?)
    AND status != 'new' AND id != ?
`;

/**
 * Ids switched from a title+company hash to native ids without a migration, so
 * jobs the user had already applied to or ignored came back as fresh `new`
 * duplicates. When an incoming job has no row yet, adopt a touched row with
 * the same (source, title, company) by moving it to the new id: the upsert
 * that follows then hits ON CONFLICT and keeps its status and first_seen.
 *
 * Rows whose id the same fetch also returned are live postings in their own
 * right (two openings with one title), not legacy keys, and are left alone.
 */
function rekeyLegacyRow(job: Job, fetchedIds: Set<string>): void {
  if (prepared('SELECT 1 FROM jobs WHERE id = ?').get(job.id)) return;
  const candidates = prepared(LEGACY_LOOKUP_SQL).all(
    job.source,
    job.title,
    job.company,
    job.id
  ) as Array<{ id: string }>;
  const legacy = candidates.find((c) => !fetchedIds.has(c.id));
  if (!legacy) return;
  // The FK has no ON UPDATE action, so a referencing AI row would block the
  // re-key. A fetch clears AI results at its start anyway.
  prepared('DELETE FROM ai_filtered_jobs WHERE job_id = ?').run(legacy.id);
  prepared('UPDATE jobs SET id = ? WHERE id = ?').run(job.id, legacy.id);
}

function upsertJobsInTransaction(jobs: Job[], batchAt: string): void {
  const stmt = prepared(UPSERT_SQL);
  const now = new Date().toISOString().split('T')[0]!;
  const fetchedIds = new Set(jobs.map((j) => j.id));
  for (const job of jobs) {
    rekeyLegacyRow(job, fetchedIds);
    stmt.run({
      id: job.id,
      title: job.title,
      company: job.company,
      url: job.url,
      source: job.source,
      datePosted: job.datePosted || '',
      now,
      status: job.status,
      country: job.country,
      workType: job.workType,
      description: job.description ?? '',
      batchAt,
    });
  }
}

/**
 * Upsert one source's fetch and — only when `purge` says it is the full
 * listing — drop the untouched rows it no longer lists, as one transaction.
 *
 * Upserting first matters: the old delete-then-insert removed every `new` row
 * before re-inserting it, so ON CONFLICT never fired for them — first_seen
 * reset on every fetch, the date/description COALESCE rules were dead, and
 * their AI rows cascaded away. An incomplete fetch (rate limited, a failed
 * page) must not purge: missing rows may simply not have been reached. The
 * caller also withholds `purge` when the feed itself came back empty, which is
 * far more likely broken than empty; a feed that had listings but none that
 * matched does purge, or stale rows from it would linger forever.
 *
 * `batchAt` (the run's start, shared by its sources) stamps rows inserted now
 * and becomes the source's latest batch, so only they show as "just in".
 */
export function replaceSourceJobs(
  source: Source,
  jobs: Job[],
  purge: boolean,
  batchAt: string = new Date().toISOString()
): void {
  const db = getDb();
  db.transaction(() => {
    upsertJobsInTransaction(jobs, batchAt);
    prepared(
      `INSERT INTO source_batches (source, started_at) VALUES (?, ?)
         ON CONFLICT(source) DO UPDATE SET started_at = excluded.started_at`
    ).run(source, batchAt);
    if (purge) {
      prepared(
        `DELETE FROM jobs WHERE source = ? AND status = 'new'
           AND id NOT IN (SELECT value FROM json_each(?))`
      ).run(source, JSON.stringify(jobs.map((j) => j.id)));
    }
  })();
}

/** Untriaged jobs posted (or, undated, first seen) longer ago than this are dropped. */
export const STALE_AFTER_DAYS = 30;

function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Remove 'new' jobs older than STALE_AFTER_DAYS. A source only purges a job it
 * stopped listing on a complete fetch, so a failing or dried-up source used to
 * keep months-old rows in the list as if they were current. Applied/ignored
 * rows are the user's record and never expire.
 */
export function expireStaleJobs(now: Date = new Date()): number {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - STALE_AFTER_DAYS);
  return prepared(`DELETE FROM jobs WHERE status = 'new' AND ${SORT_EXPR} < ?`).run(
    localDate(cutoff)
  ).changes;
}

/**
 * `%x%` pattern that matches the input literally: `%`, `_` and `\` are LIKE
 * metacharacters and are escaped (paired with `ESCAPE '\'` in the SQL).
 * Lowercased in JS because SQLite only folds ASCII; the column side goes
 * through `js_lower()`, registered in `getDb()`, for the same reason. A
 * leading-wildcard LIKE can't use an index either way, so this costs nothing.
 */
function containsPattern(input: string): string {
  return `%${input.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function getFilteredJobs(filters: FilterState, sourceFilter?: SourceFilter): Job[] {
  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (sourceFilter && sourceFilter !== 'all') {
    conditions.push('source = @source');
    params.source = sourceFilter;
  }
  if (filters.status) {
    conditions.push('status = @status');
    // New means "from the latest fetch", not merely untriaged.
    if (filters.status === 'new') conditions.push(isNewExpr('jobs'));
    params.status = filters.status;
  }
  if (filters.workType) {
    conditions.push('work_type = @workType');
    params.workType = filters.workType;
  }
  if (filters.title) {
    conditions.push(`js_lower(title) LIKE @title ESCAPE '\\'`);
    params.title = containsPattern(filters.title);
  }
  if (filters.company) {
    conditions.push(`js_lower(company) LIKE @company ESCAPE '\\'`);
    params.company = containsPattern(filters.company);
  }
  if (filters.country) {
    conditions.push(`js_lower(country) LIKE @country ESCAPE '\\'`);
    params.country = containsPattern(filters.country);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT ${listColumns('jobs')} FROM jobs ${where} ORDER BY ${SORT_EXPR} DESC`;

  // The SQL text varies with the active filter set, but there are only a
  // handful of combinations, so the cache still pays off.
  const rows = prepared(sql).all(params) as JobRow[];
  return rows.map(rowToJob);
}

export function getJobDescription(id: string): string {
  const row = prepared('SELECT description FROM jobs WHERE id = ?').get(id) as
    | { description: string }
    | undefined;
  return row?.description ?? '';
}

export function updateJobStatus(id: string, status: JobStatus): void {
  prepared('UPDATE jobs SET status = ? WHERE id = ?').run(status, id);
}

/** Records the first time a job was opened; later opens keep that time. */
export function markJobSeen(id: string): void {
  prepared(`UPDATE jobs SET seen_at = ? WHERE id = ? AND seen_at IS NULL`).run(
    new Date().toISOString(),
    id
  );
}

const LAST_REFRESH_KEY = 'last_refresh_at';

/** ISO end of the last fetch run that wrote to this DB, if any. */
export function getLastRefreshAt(): string | undefined {
  const row = prepared('SELECT value FROM app_state WHERE key = ?').get(LAST_REFRESH_KEY) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setLastRefreshAt(iso: string): void {
  prepared(
    `INSERT INTO app_state (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(LAST_REFRESH_KEY, iso);
}

export function clearAllJobs(): void {
  const db = getDb();
  db.transaction(() => {
    // ON DELETE CASCADE clears ai_filtered_jobs, but be explicit so the
    // intent survives a schema change.
    prepared('DELETE FROM ai_filtered_jobs').run();
    prepared('DELETE FROM jobs').run();
  })();
}

export function getJobCounts(): JobCounts {
  // Untriaged rows from earlier fetches count towards the total only.
  const rows = prepared(
    `SELECT CASE WHEN status = 'new' AND NOT ${isNewExpr('jobs')} THEN '' ELSE status END AS status,
            COUNT(*) as count
       FROM jobs GROUP BY 1`
  ).all() as Array<{
    status: string;
    count: number;
  }>;

  const counts = { total: 0, new: 0, saved: 0, applied: 0, ignored: 0 };
  for (const row of rows) {
    counts.total += row.count;
    if (row.status === 'new') counts.new = row.count;
    else if (row.status === 'saved') counts.saved = row.count;
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
  const rows = prepared(
    `SELECT DISTINCT ${column} FROM jobs WHERE ${column} != '' ORDER BY ${column}`
  ).all() as Array<Record<string, string>>;
  return rows.map((r) => r[column]!);
}

/**
 * Replaces the stored AI results. Ids with no `jobs` row are skipped rather
 * than inserted: `INSERT OR IGNORE` does not suppress FK violations, so one
 * unknown id (say, purged by a fetch mid-filter) used to roll back the whole
 * save. Returns how many rows were stored.
 */
export function saveAiFilteredJobs(results: AiJobResult[]): number {
  const db = getDb();
  const now = new Date().toISOString();
  return db.transaction(() => {
    prepared('DELETE FROM ai_filtered_jobs').run();
    const stmt = prepared(
      `INSERT OR IGNORE INTO ai_filtered_jobs (job_id, remote, filtered_at)
         SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM jobs WHERE id = ?)`
    );
    let saved = 0;
    for (const r of results) {
      saved += stmt.run(r.id, r.remote, now, r.id).changes;
    }
    return saved;
  })();
}

export function getAiFilteredResults(): AiJobResult[] {
  const rows = prepared('SELECT job_id, remote FROM ai_filtered_jobs').all() as Array<{
    job_id: string;
    remote: string;
  }>;
  return rows.map((r) => ({ id: r.job_id, remote: (r.remote || 'possible') as RemoteStatus }));
}

export function getAiFilteredJobs(): Job[] {
  const rows = prepared(`
    SELECT ${listColumns('j')}
    FROM jobs j INNER JOIN ai_filtered_jobs af ON j.id = af.job_id
    ORDER BY ${SORT_EXPR.replace(/date_posted/g, 'j.date_posted').replace(/first_seen/g, 'j.first_seen')} DESC
  `).all() as JobRow[];
  return rows.map(rowToJob);
}

/** The HTTP API's list query: every field optional, all combined with AND. */
export interface JobQuery {
  source?: Source;
  status?: JobStatus;
  /** Case-insensitive substring of title, company or country. */
  text?: string;
  /** Only jobs the last AI run kept. */
  aiOnly?: boolean;
}

/** A listed job plus the AI verdict, when the last AI run kept it. */
export type JobWithVerdict = Job & { ai?: RemoteStatus };

/**
 * Like `getFilteredJobs`, but with one search box over title, company and
 * country (the PWA has no room for three) and the AI verdict joined in, so a
 * client never has to merge two lists itself.
 */
export function queryJobs(query: JobQuery): JobWithVerdict[] {
  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (query.source) {
    conditions.push('j.source = @source');
    params.source = query.source;
  }
  if (query.status) {
    conditions.push('j.status = @status');
    if (query.status === 'new') conditions.push(isNewExpr('j'));
    params.status = query.status;
  }
  if (query.text) {
    conditions.push(
      `(js_lower(j.title) LIKE @text ESCAPE '\\'
        OR js_lower(j.company) LIKE @text ESCAPE '\\'
        OR js_lower(j.country) LIKE @text ESCAPE '\\')`
    );
    params.text = containsPattern(query.text);
  }

  const join = query.aiOnly ? 'INNER JOIN' : 'LEFT JOIN';
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sort = SORT_EXPR.replace(/date_posted/g, 'j.date_posted').replace(/first_seen/g, 'j.first_seen');
  const rows = prepared(
    `SELECT ${listColumns('j')}, af.remote AS ai_remote
       FROM jobs j ${join} ai_filtered_jobs af ON af.job_id = j.id
       ${where}
       ORDER BY ${sort} DESC`
  ).all(params) as Array<JobRow & { ai_remote: string | null }>;

  return rows.map((r) => {
    const job: JobWithVerdict = rowToJob(r);
    // Same fallback as getAiFilteredResults: rows from before the column
    // existed have no verdict.
    if (r.ai_remote !== null) job.ai = (r.ai_remote || 'possible') as RemoteStatus;
    return job;
  });
}

/** New jobs (see `isNewExpr`) per source, for tab badges. Sources with none are absent. */
export function getNewCountsBySource(): Partial<Record<Source, number>> {
  const rows = prepared(
    `SELECT source, COUNT(*) AS count FROM jobs WHERE ${isNewExpr('jobs')} GROUP BY source`
  ).all() as Array<{ source: Source; count: number }>;
  const counts: Partial<Record<Source, number>> = {};
  for (const r of rows) counts[r.source] = r.count;
  return counts;
}

export function jobExists(id: string): boolean {
  return prepared('SELECT 1 FROM jobs WHERE id = ?').get(id) !== undefined;
}
