import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

let db: Database.Database | null = null;

export function getDbPath(): string {
  const dir = join(homedir(), '.flex-me-in');
  mkdirSync(dir, { recursive: true });
  return join(dir, 'jobs.db');
}

export function getDb(): Database.Database {
  if (db) return db;
  db = new Database(getDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

function initSchema(db: Database.Database): void {
  // Migrate: add remote column if missing
  const cols = db.pragma('table_info(ai_filtered_jobs)') as Array<{ name: string }>;
  if (cols.length > 0 && !cols.some((c) => c.name === 'remote')) {
    db.exec(`ALTER TABLE ai_filtered_jobs ADD COLUMN remote TEXT DEFAULT 'possible'`);
  }

  // Migrate: add description column if missing
  const jobCols = db.pragma('table_info(jobs)') as Array<{ name: string }>;
  if (jobCols.length > 0 && !jobCols.some((c) => c.name === 'description')) {
    db.exec(`ALTER TABLE jobs ADD COLUMN description TEXT DEFAULT ''`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      url TEXT NOT NULL,
      source TEXT NOT NULL,
      date_posted TEXT NOT NULL,
      status TEXT DEFAULT 'new',
      country TEXT DEFAULT '',
      work_type TEXT DEFAULT '',
      description TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
    CREATE INDEX IF NOT EXISTS idx_jobs_title_company ON jobs(title, company);
    CREATE INDEX IF NOT EXISTS idx_jobs_country ON jobs(country);
    CREATE INDEX IF NOT EXISTS idx_jobs_work_type ON jobs(work_type);

    CREATE TABLE IF NOT EXISTS ai_filtered_jobs (
      job_id TEXT PRIMARY KEY,
      remote TEXT DEFAULT 'possible',
      filtered_at TEXT NOT NULL
    );
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
