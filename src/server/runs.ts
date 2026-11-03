import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { Source } from '../state/types.js';
import type { AiStatus, RefreshStatus, SourceProgress } from './contract.js';
import { runFetch } from '../core/fetch.js';
import { classifyJobs, MISSING_KEY_MESSAGE, partialRunWarning } from '../core/ai.js';
import { getApiKey } from '../api/deepseek.js';
import { getFilteredJobs } from '../db/repository.js';
import { beginAiFilter, beginFetch, isCurrentAiFilter, isCurrentFetch } from '../state/epochs.js';
import { logError } from '../utils/log.js';

/**
 * The server's long-running jobs. Each runner holds at most one run, kept in
 * memory: a restart forgets progress, which is fine because a restart also
 * aborts the run. Only the time of the last finished fetch outlives it.
 */

function statePath(): string {
  return join(homedir(), '.flex-me-in', 'server-state.json');
}

export function readLastRefreshAt(): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(statePath(), 'utf8')) as { lastRefreshAt?: unknown };
    return typeof parsed.lastRefreshAt === 'string' ? parsed.lastRefreshAt : undefined;
  } catch {
    // Missing or corrupt: the UI just shows "never refreshed".
    return undefined;
  }
}

function writeLastRefreshAt(iso: string): void {
  const path = statePath();
  try {
    mkdirSync(join(homedir(), '.flex-me-in'), { recursive: true, mode: 0o700 });
    // Write-then-rename, so a crash mid-write can't leave a truncated file.
    writeFileSync(`${path}.tmp`, JSON.stringify({ lastRefreshAt: iso }) + '\n');
    renameSync(`${path}.tmp`, path);
  } catch (err) {
    logError('server: save last refresh time', err);
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** The one-line outcome, worded like the TUI's status bar. */
export function summarize(sources: SourceProgress[]): string {
  const added = sources.filter((s) => s.state === 'done').reduce((sum, s) => sum + s.count, 0);
  const problems: string[] = [];
  const failed = sources.filter((s) => s.state === 'error');
  const partial = sources.filter((s) => s.state === 'done' && s.partial);
  if (failed.length > 0) problems.push(`${failed.map((s) => s.source).join(', ')} failed`);
  if (partial.length > 0) problems.push(`${partial.map((s) => s.source).join(', ')} stopped early`);
  const head = plural(added, 'role');
  return problems.length > 0 ? `${head} — ${problems.join('; ')}` : head;
}

export class RefreshRunner {
  private status: RefreshStatus = { state: 'idle', sources: [] };
  private controller: AbortController | null = null;
  private running: Promise<void> | null = null;

  /** `onStart` runs before any fetcher, e.g. to stop an AI run. */
  constructor(private readonly onStart: () => void = () => {}) {}

  snapshot(): RefreshStatus {
    return structuredClone(this.status);
  }

  /** Starts a run unless one is going; either way returns the run's status. */
  start(sources: Source[]): { started: boolean; status: RefreshStatus } {
    if (this.running) return { started: false, status: this.snapshot() };

    this.onStart();
    const controller = new AbortController();
    this.controller = controller;
    // Shares the TUI's epochs: a new fetch invalidates any AI run in flight.
    const generation = beginFetch();

    // Fetchers all start at once, so there is no queue to show as 'pending'.
    this.status = {
      state: 'running',
      startedAt: new Date().toISOString(),
      sources: sources.map((source) => ({ source, state: 'fetching', count: 0 })),
    };
    this.running = this.execute(sources, controller.signal, () => isCurrentFetch(generation)).finally(
      () => {
        this.running = null;
        this.controller = null;
      }
    );
    return { started: true, status: this.snapshot() };
  }

  private update(source: Source, patch: Partial<SourceProgress>): void {
    const entry = this.status.sources.find((s) => s.source === source);
    if (entry) Object.assign(entry, patch);
  }

  private async execute(sources: Source[], signal: AbortSignal, isCurrent: () => boolean) {
    try {
      await runFetch(sources, signal, isCurrent, {
        onProgress: (source, count) => this.update(source, { count }),
        onDone: (source, count, complete) =>
          this.update(source, { state: 'done', count, ...(!complete && { partial: true }) }),
        onCancelled: (source) => this.update(source, { state: 'error', error: 'Cancelled' }),
        onError: (source, error) => this.update(source, { state: 'error', error }),
      });
      // A superseded run (shutdown) gets no callbacks; don't leave it spinning.
      for (const s of this.status.sources) {
        if (s.state === 'fetching' || s.state === 'pending') {
          Object.assign(s, { state: 'error', error: 'Cancelled' });
        }
      }
      const finishedAt = new Date().toISOString();
      this.status.state = 'done';
      this.status.finishedAt = finishedAt;
      this.status.summary = summarize(this.status.sources);
      if (isCurrent()) writeLastRefreshAt(finishedAt);
    } catch (err) {
      // runFetch handles per-source failures itself; this is the database.
      logError('server: refresh', err);
      this.status.state = 'error';
      this.status.finishedAt = new Date().toISOString();
      this.status.summary = err instanceof Error ? err.message : 'Refresh failed';
    }
  }

  abort(): void {
    this.controller?.abort();
  }

  /** Resolves once the current run (if any) has finished its bookkeeping. */
  settled(): Promise<void> {
    return this.running ?? Promise.resolve();
  }
}

export class AiRunner {
  private status: Omit<AiStatus, 'configured'> = { state: 'idle' };
  private controller: AbortController | null = null;
  private running: Promise<void> | null = null;
  private abortReason = 'Cancelled';

  snapshot(): AiStatus {
    // Read live: the key can be added to the env file without a run.
    return { ...structuredClone(this.status), configured: Boolean(getApiKey()) };
  }

  /**
   * Classifies every 'new' job, over all sources. The TUI classifies the list
   * on screen; the PWA has no single "list on screen", and the untriaged set
   * is what the AI view is for. Throws when no API key is configured.
   */
  start(): { started: boolean; status: AiStatus } {
    if (this.running) return { started: false, status: this.snapshot() };
    if (!getApiKey()) throw new Error(MISSING_KEY_MESSAGE);

    const jobs = getFilteredJobs(
      { status: 'new', workType: '', title: '', company: '', country: '' },
      'all'
    );
    const startedAt = new Date().toISOString();
    if (jobs.length === 0) {
      // Nothing to send; leave the stored results alone, as the TUI does.
      this.status = {
        state: 'done',
        startedAt,
        finishedAt: startedAt,
        submitted: 0,
        kept: 0,
        message: 'No new jobs to classify',
      };
      return { started: true, status: this.snapshot() };
    }

    const controller = new AbortController();
    this.controller = controller;
    this.abortReason = 'Cancelled';
    const generation = beginAiFilter();
    this.status = { state: 'running', startedAt, submitted: jobs.length };
    this.running = this.execute(jobs, controller.signal, () => isCurrentAiFilter(generation)).finally(
      () => {
        this.running = null;
        this.controller = null;
      }
    );
    return { started: true, status: this.snapshot() };
  }

  private async execute(
    jobs: Parameters<typeof classifyJobs>[0],
    signal: AbortSignal,
    isCurrent: () => boolean
  ) {
    try {
      const outcome = await classifyJobs(
        jobs,
        signal,
        (batch, totalBatches) => {
          if (isCurrent()) Object.assign(this.status, { batch, totalBatches });
        },
        isCurrent
      );
      this.status.finishedAt = new Date().toISOString();
      if (!outcome) {
        Object.assign(this.status, { state: 'error', message: this.abortReason });
        return;
      }
      Object.assign(this.status, {
        state: 'done',
        kept: outcome.saved,
        message: partialRunWarning(outcome),
      });
    } catch (err) {
      this.status.finishedAt = new Date().toISOString();
      if (err instanceof Error && err.name === 'AbortError') {
        Object.assign(this.status, { state: 'error', message: this.abortReason });
        return;
      }
      logError('server: ai filter', err);
      Object.assign(this.status, {
        state: 'error',
        message: err instanceof Error ? err.message : 'AI filter failed',
      });
    }
  }

  /**
   * A fetch is starting. It clears the stored results, so a finished run's
   * "kept" no longer describes anything, and a running one would classify
   * rows the fetch may purge: stop it, as the TUI's epochs do.
   */
  onFetchStart(): void {
    if (this.running) {
      this.abort('Stopped: a refresh started');
    } else if (this.status.state !== 'idle') {
      this.status = { state: 'idle' };
    }
  }

  abort(reason = 'Cancelled'): void {
    this.abortReason = reason;
    this.controller?.abort();
  }

  settled(): Promise<void> {
    return this.running ?? Promise.resolve();
  }
}
