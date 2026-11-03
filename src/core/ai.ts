import type { AiJobResult, Job } from '../state/types.js';
import { filterJobsWithDeepseek, type AiFilterOutcome } from '../api/deepseek.js';
import { saveAiFilteredJobs } from '../db/repository.js';

/**
 * AI classification shared by the TUI (useAiFilter) and the HTTP server.
 * Callers own cancellation and generation checks; this owns what gets stored.
 */

export const MISSING_KEY_MESSAGE =
  'Set DEEPSEEK_API_KEY (in ~/.flex-me-in/.env or the environment)';

export interface ClassifyOutcome extends AiFilterOutcome {
  /** Rows actually stored: results for jobs purged mid-run are skipped. */
  saved: number;
}

/**
 * Classifies `jobs` and replaces the stored AI results with the verdicts.
 * Returns null, storing nothing, when the run was aborted or superseded
 * before it finished. Throws what `filterJobsWithDeepseek` throws.
 */
export async function classifyJobs(
  jobs: Job[],
  signal: AbortSignal,
  onProgress?: (batch: number, total: number) => void,
  isCurrent: () => boolean = () => true
): Promise<ClassifyOutcome | null> {
  const outcome = await filterJobsWithDeepseek(jobs, signal, onProgress);

  // A fetch started mid-run invalidates it: its jobs may already be purged,
  // so writing results back would resurrect dead ids.
  if (signal.aborted || !isCurrent()) return null;

  // The client promises ids from the submitted set; enforce it here too, so a
  // regression there can't store or show jobs nobody asked about.
  const submittedIds = new Set(jobs.map((j) => j.id));
  const results: AiJobResult[] = outcome.results.filter((r) => submittedIds.has(r.id));

  const saved = saveAiFilteredJobs(results);
  return { ...outcome, results, saved };
}

/** The warning for a run that kept some batches but lost others, if any. */
export function partialRunWarning(outcome: AiFilterOutcome): string | undefined {
  if (outcome.failedBatches === 0) return undefined;
  return outcome.stoppedReason
    ? `AI filter stopped after batch ${outcome.totalBatches - outcome.failedBatches}: ${outcome.stoppedReason} — results are partial`
    : `AI filter: ${outcome.failedBatches}/${outcome.totalBatches} batches failed — results are partial (see ~/.flex-me-in/error.log)`;
}
