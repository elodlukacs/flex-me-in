import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { ALL_SOURCES } from '../state/types.js';

const KNOWN_SOURCES: string[] = ALL_SOURCES;

let db: Database.Database | null = null;
let dbPathOverride: string | null = null;

export function getDbPath(): string {
  if (dbPathOverride) return dbPathOverride;
  const dir = join(homedir(), '.flex-me-in');
  mkdirSync(dir, { recursive: true });
  return join(dir, 'jobs.db');
}

/**
 * Points the next `getDb()` at another file (or `:memory:`) and closes any open
 * handle. Tests only — the app always uses the default path. `null` restores it.
 */
export function setDbPathForTests(path: string | null): void {
  closeDb();
  dbPathOverride = path;
}

/**
 * Sort key: the upstream posting date when the feed provided one, otherwise
 * the moment we first saw the row. Feeds without dates used to be stamped with
 * `new Date()` on every fetch, which made stale postings look fresh forever.
 */
export const SORT_EXPR = "COALESCE(NULLIF(date_posted, ''), first_seen)";

export function getDb(): Database.Database {
  if (db) return db;
  const path = getDbPath();
  let conn: Database.Database | null = null;
  try {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    conn = new Database(path);
    conn.pragma('journal_mode = WAL');
    // This DB is a rebuildable cache; FULL fsync per transaction is pure latency.
    conn.pragma('synchronous = NORMAL');
    conn.pragma('busy_timeout = 5000');
    // SQLite's LOWER() and LIKE only fold ASCII, so "Zürich" never matched
    // "ZÜRICH". Search compares JS-lowercased text on both sides instead.
    conn.function('js_lower', { deterministic: true }, (value: unknown) =>
      typeof value === 'string' ? value.toLowerCase() : value
    );
    migrate(conn);
    conn.pragma('foreign_keys = ON');
    purgeRetiredSources(conn);
  } catch (err) {
    conn?.close();
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot open job database at ${path}: ${cause}`, { cause: err });
  }
  db = conn;
  return db;
}

function columnNames(conn: Database.Database, table: string): string[] {
  const cols = conn.pragma(`table_info(${table})`) as Array<{ name: string }>;
  return cols.map((c) => c.name);
}

function tableSql(conn: Database.Database, table: string): string | undefined {
  const row = conn
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table) as { sql?: string } | undefined;
  return row?.sql;
}

/**
 * Step 1 — baseline. Databases created before `user_version` was tracked are
 * all version 0 but carry whichever columns their app version added, so this
 * step detects what exists instead of assuming an empty file.
 */
function migrateBaseline(conn: Database.Database): void {
  const jobCols = columnNames(conn, 'jobs');
  const jobsExists = jobCols.length > 0;

  if (jobsExists && !jobCols.includes('description')) {
    conn.exec(`ALTER TABLE jobs ADD COLUMN description TEXT DEFAULT ''`);
  }
  if (jobsExists && !jobCols.includes('first_seen')) {
    conn.exec(`ALTER TABLE jobs ADD COLUMN first_seen TEXT DEFAULT ''`);
    // Backfill so existing rows keep a usable sort key.
    conn.exec(`UPDATE jobs SET first_seen = date_posted WHERE first_seen = '' OR first_seen IS NULL`);
  }

  const aiCols = columnNames(conn, 'ai_filtered_jobs');
  if (aiCols.length > 0 && !aiCols.includes('remote')) {
    conn.exec(`ALTER TABLE ai_filtered_jobs ADD COLUMN remote TEXT DEFAULT 'possible'`);
  }

  conn.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      url TEXT NOT NULL,
      source TEXT NOT NULL,
      date_posted TEXT NOT NULL DEFAULT '',
      first_seen TEXT NOT NULL DEFAULT '',
      status TEXT DEFAULT 'new',
      country TEXT DEFAULT '',
      work_type TEXT DEFAULT '',
      description TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS ai_filtered_jobs (
      job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      remote TEXT DEFAULT 'possible',
      filtered_at TEXT NOT NULL
    );
  `);

  // Pre-existing DBs have ai_filtered_jobs without the FK, so purging jobs
  // left orphan rows behind. Rebuild the table once to attach the cascade. A
  // leftover `_new` table from an interrupted run would make the CREATE fail.
  const aiSql = tableSql(conn, 'ai_filtered_jobs') ?? '';
  if (!/REFERENCES\s+jobs/i.test(aiSql)) {
    conn.exec(`
      DROP TABLE IF EXISTS ai_filtered_jobs_new;
      CREATE TABLE ai_filtered_jobs_new (
        job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
        remote TEXT DEFAULT 'possible',
        filtered_at TEXT NOT NULL
      );
      INSERT OR IGNORE INTO ai_filtered_jobs_new (job_id, remote, filtered_at)
        SELECT af.job_id, af.remote, af.filtered_at
        FROM ai_filtered_jobs af
        INNER JOIN jobs j ON j.id = af.job_id;
      DROP TABLE ai_filtered_jobs;
      ALTER TABLE ai_filtered_jobs_new RENAME TO ai_filtered_jobs;
    `);
  }

  conn.exec(`
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
    CREATE INDEX IF NOT EXISTS idx_jobs_country ON jobs(country);
    CREATE INDEX IF NOT EXISTS idx_jobs_work_type ON jobs(work_type);
    -- Every list query ends in this ORDER BY; without the index each keystroke
    -- was a full scan plus an external sort.
    CREATE INDEX IF NOT EXISTS idx_jobs_sort ON jobs(${SORT_EXPR} DESC);
    -- Unusable by construction: title/company are substring-matched, which no
    -- b-tree index can serve.
    DROP INDEX IF EXISTS idx_jobs_title_company;
    -- Superseded by idx_jobs_sort, which covers the COALESCE sort key.
    DROP INDEX IF EXISTS idx_jobs_date_posted;
  `);
}

/**
 * Step 2 — legacy-id lookup. Ids moved from a title+company hash to native
 * ids, so on upsert a touched (applied/ignored) row is matched by
 * (source, title, company) and re-keyed. Only touched rows are ever looked up,
 * hence the partial index: it stays tiny and the per-job probe is one seek.
 */
function migrateLegacyKeyIndex(conn: Database.Database): void {
  conn.exec(`
    CREATE INDEX IF NOT EXISTS idx_jobs_legacy_key
      ON jobs(source, lower(title), lower(company))
      WHERE status != 'new';
  `);
}

/**
 * Step 3 — fetch batches. `jobs.batch_at` is the start of the fetch run that
 * first stored the row (never updated); `source_batches` holds each source's
 * latest stored run. A row is "just in" when the two match, so every fetch
 * replaces the previous batch's markers. Existing rows get NULL: unmarked.
 */
function migrateBatches(conn: Database.Database): void {
  if (!columnNames(conn, 'jobs').includes('batch_at')) {
    conn.exec(`ALTER TABLE jobs ADD COLUMN batch_at TEXT`);
  }
  conn.exec(`
    CREATE TABLE IF NOT EXISTS source_batches (
      source TEXT PRIMARY KEY,
      started_at TEXT NOT NULL
    );
  `);
}

/** Append only: a step's position is its version number. */
const MIGRATIONS: Array<(conn: Database.Database) => void> = [
  migrateBaseline,
  migrateLegacyKeyIndex,
  migrateBatches,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

function migrate(conn: Database.Database): void {
  const current = conn.pragma('user_version', { simple: true }) as number;
  if (current >= MIGRATIONS.length) return;

  // Schema rebuilds must not trip FK enforcement midway. The pragma is a no-op
  // inside a transaction, so it is toggled around the steps, not within them.
  conn.pragma('foreign_keys = OFF');
  for (let version = current; version < MIGRATIONS.length; version++) {
    const step = MIGRATIONS[version]!;
    // One transaction per step: a crash leaves the DB at the last completed
    // version rather than half-way through one.
    conn.transaction(() => {
      step(conn);
      conn.pragma(`user_version = ${version + 1}`);
    })();
  }
}

/**
 * Rows left behind by sources the app no longer supports (arbeitnow,
 * hackernews, ...) still appeared in the `u` source cycle. Only
 * untouched rows are dropped — anything marked applied or ignored is kept as
 * history. Runs on every start (the source list changes without a schema
 * change) and only once FKs are on, so their AI rows cascade instead of being
 * orphaned.
 */
function purgeRetiredSources(conn: Database.Database): void {
  const placeholders = KNOWN_SOURCES.map(() => '?').join(',');
  conn
    .prepare(`DELETE FROM jobs WHERE status = 'new' AND source NOT IN (${placeholders})`)
    .run(...KNOWN_SOURCES);
}

/**
 * better-sqlite3 has no internal statement cache, so `db.prepare()` re-parses
 * and re-plans every call — including the ones that run inside the keypress
 * handler. Fixed SQL is prepared once and reused.
 */
const stmtCache = new Map<string, Database.Statement>();

export function prepared(sql: string): Database.Statement {
  const cached = stmtCache.get(sql);
  if (cached) return cached;
  const stmt = getDb().prepare(sql);
  stmtCache.set(sql, stmt);
  return stmt;
}

export function closeDb(): void {
  stmtCache.clear();
  if (db) {
    db.close();
    db = null;
  }
}
