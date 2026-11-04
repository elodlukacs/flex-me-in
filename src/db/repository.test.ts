import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Job, FilterState } from '../state/types.js';
import { getDb, setDbPathForTests, SCHEMA_VERSION } from './database.js';
import {
  replaceSourceJobs,
  expireStaleJobs,
  getFilteredJobs,
  getJobDescription,
  updateJobStatus,
  saveAiFilteredJobs,
  getAiFilteredResults,
  getJobCounts,
  getNewCountsBySource,
  markJobSeen,
  getLastRefreshAt,
  setLastRefreshAt,
} from './repository.js';

const NO_FILTERS: FilterState = { status: '', workType: '', title: '', company: '', country: '' };

function job(id: string, overrides: Partial<Job> = {}): Job {
  return {
    id,
    title: `Senior Frontend ${id}`,
    company: 'Acme',
    url: `https://example.com/${id}`,
    source: 'remoteok',
    datePosted: '',
    status: 'new',
    country: '',
    workType: '',
    ...overrides,
  };
}

function row(id: string): Record<string, unknown> | undefined {
  return getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
}

function ids(): string[] {
  return (getDb().prepare('SELECT id FROM jobs ORDER BY id').all() as Array<{ id: string }>).map(
    (r) => r.id
  );
}

const tempDirs: string[] = [];

beforeEach(() => {
  setDbPathForTests(':memory:');
});

afterAll(() => {
  setDbPathForTests(null);
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('replaceSourceJobs', () => {
  it('keeps first_seen and description of new rows across a re-fetch', () => {
    replaceSourceJobs('remoteok', [job('a', { description: 'Original body' })], true);
    getDb().prepare(`UPDATE jobs SET first_seen = '2026-01-01' WHERE id = 'a'`).run();

    // Second fetch: dateless, no description (some feeds omit it).
    replaceSourceJobs('remoteok', [job('a', { title: 'Renamed' })], true);

    const r = row('a')!;
    expect(r.first_seen).toBe('2026-01-01');
    expect(r.title).toBe('Renamed');
    expect(getJobDescription('a')).toBe('Original body');
  });

  it('keeps an AI row for a job that is still listed', () => {
    replaceSourceJobs('remoteok', [job('a')], true);
    saveAiFilteredJobs([{ id: 'a', remote: 'yes' }]);
    replaceSourceJobs('remoteok', [job('a')], true);
    expect(getAiFilteredResults()).toEqual([{ id: 'a', remote: 'yes' }]);
  });

  it('does not purge on an incomplete fetch', () => {
    replaceSourceJobs('remoteok', [job('a'), job('b'), job('c')], true);
    replaceSourceJobs('remoteok', [job('a')], false);
    expect(ids()).toEqual(['a', 'b', 'c']);
  });

  it('purges only vanished new rows of that source on a complete fetch', () => {
    replaceSourceJobs('remoteok', [job('a'), job('b'), job('c')], true);
    replaceSourceJobs('remotive', [job('r', { source: 'remotive' })], true);
    updateJobStatus('c', 'applied');

    replaceSourceJobs('remoteok', [job('a'), job('d')], true);

    // b vanished and was untouched; c vanished but is applied; r is another source.
    expect(ids()).toEqual(['a', 'c', 'd', 'r']);
  });

  it('clears a source whose full listing matched nothing', () => {
    replaceSourceJobs('remoteok', [job('a'), job('b')], true);
    replaceSourceJobs('remoteok', [], true);
    expect(ids()).toEqual([]);
  });

  it('keeps a precise posting time when a later fetch only has the same day', () => {
    replaceSourceJobs('remoteok', [job('a', { datePosted: '2026-10-23T01:02Z' })], true);
    replaceSourceJobs('remoteok', [job('a', { datePosted: '2026-10-23' })], true);
    expect(row('a')!.date_posted).toBe('2026-10-23T01:02Z');

    replaceSourceJobs('remoteok', [job('a', { datePosted: '2026-10-25' })], true);
    expect(row('a')!.date_posted).toBe('2026-10-25');
  });
});

describe('New = the latest fetch', () => {
  const NEW: FilterState = { ...NO_FILTERS, status: 'new' };
  const newIds = () => getFilteredJobs(NEW).map((j) => j.id).sort();

  it('only the rows first stored by each source\'s latest fetch are New', () => {
    replaceSourceJobs('remoteok', [job('a'), job('b')], false, '2026-11-03T06:00:00.000Z');
    expect(newIds()).toEqual(['a', 'b']);

    // Next run: 'a' and 'b' are still listed, 'c' is new. Only 'c' is New;
    // 'a' and 'b' stay untriaged but have no status.
    replaceSourceJobs('remoteok', [job('a'), job('b'), job('c')], false, '2026-11-03T12:00:00.000Z');
    expect(newIds()).toEqual(['c']);
    expect(getJobCounts()).toEqual({ total: 3, new: 1, saved: 0, applied: 0, ignored: 0 });
    expect(getFilteredJobs(NO_FILTERS).find((j) => j.id === 'a')).not.toHaveProperty('fresh');

    // A run that brings nothing new leaves nothing New.
    replaceSourceJobs('remoteok', [job('a')], false, '2026-11-03T18:00:00.000Z');
    expect(newIds()).toEqual([]);
  });

  it('keeps each source\'s batch apart and leaves triaged rows alone', () => {
    replaceSourceJobs('remoteok', [job('a'), job('b')], false, '2026-11-03T06:00:00.000Z');
    updateJobStatus('b', 'applied');
    replaceSourceJobs('jobicy', [job('j', { source: 'jobicy' })], false, '2026-11-03T12:00:00.000Z');
    replaceSourceJobs('remoteok', [job('a'), job('b')], false, '2026-11-03T12:00:00.000Z');
    expect(newIds()).toEqual(['j']);
    expect(getNewCountsBySource()).toEqual({ jobicy: 1 });
    expect(getJobCounts()).toEqual({ total: 3, new: 1, saved: 0, applied: 1, ignored: 0 });
  });

  it('opening a New job takes the label away', () => {
    replaceSourceJobs('remoteok', [job('a'), job('b')], false, '2026-11-03T06:00:00.000Z');
    markJobSeen('a');
    expect(newIds()).toEqual(['b']);
    expect(getJobCounts().new).toBe(1);
    expect(getNewCountsBySource()).toEqual({ remoteok: 1 });
  });

  it('treats every untriaged row of a source with no recorded fetch as New', () => {
    replaceSourceJobs('remoteok', [job('a')], false, '2026-11-03T06:00:00.000Z');
    getDb().exec('DELETE FROM source_batches');
    expect(newIds()).toEqual(['a']);
  });
});

describe('seen, saved and the last refresh', () => {
  it('keeps the first open time and lists the job as seen', () => {
    replaceSourceJobs('remoteok', [job('a'), job('b')], false);
    markJobSeen('a');
    const first = row('a')!.seen_at;
    markJobSeen('a');
    expect(row('a')!.seen_at).toBe(first);
    const listed = getFilteredJobs(NO_FILTERS);
    expect(listed.find((j) => j.id === 'a')?.seen).toBe(true);
    expect(listed.find((j) => j.id === 'b')).not.toHaveProperty('seen');
  });

  it('counts saved jobs, and a complete fetch never purges them', () => {
    replaceSourceJobs('remoteok', [job('a'), job('b')], false);
    updateJobStatus('a', 'saved');
    expect(getJobCounts()).toEqual({ total: 2, new: 1, saved: 1, applied: 0, ignored: 0 });
    replaceSourceJobs('remoteok', [], true);
    expect(ids()).toEqual(['a']);
  });

  it('stores the last refresh time', () => {
    expect(getLastRefreshAt()).toBeUndefined();
    setLastRefreshAt('2026-11-04T07:21:00.000Z');
    setLastRefreshAt('2026-11-04T08:00:00.000Z');
    expect(getLastRefreshAt()).toBe('2026-11-04T08:00:00.000Z');
  });
});

describe('expireStaleJobs', () => {
  it('drops untriaged rows older than the cutoff, by posting date or first sighting', () => {
    replaceSourceJobs(
      'remoteok',
      [
        job('old', { datePosted: '2026-09-01' }),
        job('fresh', { datePosted: '2026-10-20' }),
        job('stamp', { datePosted: '2026-10-23T01:02Z' }),
        job('undated'),
        job('kept', { datePosted: '2026-05-01' }),
      ],
      true
    );
    getDb().prepare(`UPDATE jobs SET first_seen = '2026-05-02' WHERE id = 'undated'`).run();
    updateJobStatus('kept', 'applied');

    expect(expireStaleJobs(new Date(2026, 9, 23))).toBe(2);
    expect(ids()).toEqual(['fresh', 'kept', 'stamp']);
  });
});

describe('legacy id re-keying', () => {
  it('moves an applied row to the new native id, keeping its status', () => {
    replaceSourceJobs('remoteok', [job('legacy_hash', { title: 'Senior React Dev' })], true);
    updateJobStatus('legacy_hash', 'applied');
    getDb().prepare(`UPDATE jobs SET first_seen = '2025-12-01' WHERE id = 'legacy_hash'`).run();
    saveAiFilteredJobs([{ id: 'legacy_hash', remote: 'yes' }]);

    replaceSourceJobs('remoteok', [job('native_42', { title: 'senior react dev' })], true);

    expect(row('legacy_hash')).toBeUndefined();
    const r = row('native_42')!;
    expect(r.status).toBe('applied');
    expect(r.first_seen).toBe('2025-12-01');
    expect(ids()).toEqual(['native_42']);
  });

  it('leaves untouched rows and live postings of the same fetch alone', () => {
    replaceSourceJobs('remoteok', [job('old_new', { title: 'Same' })], true);
    replaceSourceJobs('remoteok', [job('p1', { title: 'Twin' })], true);
    updateJobStatus('p1', 'ignored');

    // Two openings share a title: p1 is listed itself, so p2 must not take it.
    replaceSourceJobs(
      'remoteok',
      [job('fresh', { title: 'Same' }), job('p1', { title: 'Twin' }), job('p2', { title: 'Twin' })],
      true
    );

    expect(row('p1')!.status).toBe('ignored');
    expect(row('p2')!.status).toBe('new');
    // A `new` legacy row is not adopted; the purge drops it instead.
    expect(row('old_new')).toBeUndefined();
    expect(row('fresh')!.status).toBe('new');
  });
});

describe('saveAiFilteredJobs', () => {
  it('skips unknown ids instead of failing the whole save', () => {
    replaceSourceJobs('remoteok', [job('a'), job('b')], true);
    let saved = 0;
    expect(() => {
      saved = saveAiFilteredJobs([
        { id: 'a', remote: 'yes' },
        { id: 'ghost', remote: 'no' },
        { id: 'b', remote: 'possible' },
      ]);
    }).not.toThrow();
    expect(saved).toBe(2);
    expect(getAiFilteredResults().map((r) => r.id).sort()).toEqual(['a', 'b']);
  });
});

describe('search', () => {
  beforeEach(() => {
    replaceSourceJobs(
      'remoteok',
      [
        job('pct', { title: 'Frontend 100% remote' }),
        job('plain', { title: 'Frontend 100 remote' }),
        job('under', { title: 'react_native lead' }),
        job('reactx', { title: 'reactXnative lead' }),
        job('zurich', { title: 'Senior Dev', country: 'ZÜRICH' }),
        job('krakow', { title: 'Senior Dev', company: 'ŁÓDŹ Soft' }),
      ],
      true
    );
  });

  const search = (f: Partial<FilterState>) =>
    getFilteredJobs({ ...NO_FILTERS, ...f })
      .map((j) => j.id)
      .sort();

  it('treats % and _ literally', () => {
    expect(search({ title: '100%' })).toEqual(['pct']);
    expect(search({ title: 'react_native' })).toEqual(['under']);
  });

  it('treats a backslash literally', () => {
    expect(search({ title: '\\' })).toEqual([]);
  });

  it('matches non-ASCII case-insensitively', () => {
    expect(search({ country: 'zürich' })).toEqual(['zurich']);
    expect(search({ company: 'łódź' })).toEqual(['krakow']);
  });
});

describe('migration', () => {
  function legacyDbPath(): string {
    const dir = mkdtempSync(join(tmpdir(), 'fe-hunt-db-'));
    tempDirs.push(dir);
    return join(dir, 'jobs.db');
  }

  it('upgrades a version-0 DB built with the pre-versioning schema', () => {
    const path = legacyDbPath();
    const legacy = new Database(path);
    // What the previous initSchema produced: no user_version, FK attached.
    legacy.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, company TEXT NOT NULL,
        url TEXT NOT NULL, source TEXT NOT NULL,
        date_posted TEXT NOT NULL DEFAULT '', first_seen TEXT NOT NULL DEFAULT '',
        status TEXT DEFAULT 'new', country TEXT DEFAULT '', work_type TEXT DEFAULT '',
        description TEXT DEFAULT ''
      );
      CREATE TABLE ai_filtered_jobs (
        job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
        remote TEXT DEFAULT 'possible', filtered_at TEXT NOT NULL
      );
      INSERT INTO jobs (id, title, company, url, source, first_seen, status)
        VALUES ('keep', 'T', 'C', 'u', 'remoteok', '2026-01-01', 'applied'),
               ('retired', 'T', 'C', 'u', 'arbeitnow', '2026-01-01', 'new'),
               ('retired_applied', 'T', 'C', 'u', 'arbeitnow', '2026-01-01', 'applied');
      INSERT INTO ai_filtered_jobs VALUES ('retired', 'yes', 'x'), ('keep', 'no', 'x');
    `);
    expect(legacy.pragma('user_version', { simple: true })).toBe(0);
    legacy.close();

    setDbPathForTests(path);
    const db = getDb();

    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    expect(ids()).toEqual(['keep', 'retired_applied']);
    expect(row('keep')!.status).toBe('applied');
    // The retired row's AI entry cascaded with it rather than being orphaned.
    expect(getAiFilteredResults()).toEqual([{ id: 'keep', remote: 'no' }]);
    const indexes = (db.pragma('index_list(jobs)') as Array<{ name: string }>).map((i) => i.name);
    expect(indexes).toContain('idx_jobs_legacy_key');
  });

  it('upgrades an older DB missing columns and the AI foreign key', () => {
    const path = legacyDbPath();
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, company TEXT NOT NULL,
        url TEXT NOT NULL, source TEXT NOT NULL, date_posted TEXT NOT NULL,
        status TEXT DEFAULT 'new', country TEXT DEFAULT '', work_type TEXT DEFAULT ''
      );
      CREATE TABLE ai_filtered_jobs (job_id TEXT PRIMARY KEY, filtered_at TEXT NOT NULL);
      INSERT INTO jobs (id, title, company, url, source, date_posted, status)
        VALUES ('a', 'T', 'C', 'u', 'remoteok', '2026-02-02', 'ignored');
      INSERT INTO ai_filtered_jobs VALUES ('a', 'x'), ('orphan', 'x');
    `);
    legacy.close();

    setDbPathForTests(path);
    const db = getDb();

    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    expect(row('a')!.first_seen).toBe('2026-02-02');
    expect(row('a')!.description).toBe('');
    expect(getAiFilteredResults()).toEqual([{ id: 'a', remote: 'possible' }]);
    const aiSql = (
      db.prepare(`SELECT sql FROM sqlite_master WHERE name = 'ai_filtered_jobs'`).get() as {
        sql: string;
      }
    ).sql;
    expect(aiSql).toMatch(/REFERENCES\s+jobs/i);

    // Re-opening an up-to-date DB runs no steps and keeps the data.
    setDbPathForTests(path);
    expect(getDb().pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    expect(row('a')!.status).toBe('ignored');
  });

  it('reports the path when the DB cannot be opened', () => {
    setDbPathForTests('/nonexistent-root-dir/\0/jobs.db');
    expect(() => getDb()).toThrow(/Cannot open job database at/);
  });
});
