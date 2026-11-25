import type { AiJobResult, Job } from '../state/types.js';
import { couldMatch, filterJobsWithDeepseek, type AiFilterOutcome } from '../api/deepseek.js';
import { getStoredDetails, saveAiFilteredJobs } from '../db/repository.js';

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
 * The jobs worth sending to the model, each with its stored description: list
 * rows carry none, and the description is where "hybrid in Cluj" or "remote,
 * EU only" is actually written. Nothing is fetched; the descriptions come from
 * the DB. Jobs that cannot match (see `couldMatch`) are left out.
 */
export function prepareCandidates(jobs: Job[]): Job[] {
  const missing = jobs.filter((j) => j.description === undefined).map((j) => j.id);
  const stored = missing.length > 0 ? getStoredDetails(missing) : new Map<string, { description: string }>();
  return jobs
    .map((j) => {
      const description = stored.get(j.id)?.description;
      return description ? { ...j, description } : j;
    })
    .filter(couldMatch);
}

/**
 * Classifies `jobs` (after `prepareCandidates`) and replaces the stored AI
 * results with the verdicts: only senior frontend roles that are remote from
 * Romania or hybrid in Cluj-Napoca are stored.
 * Returns null, storing nothing, when the run was aborted or superseded
 * before it finished. Throws what `filterJobsWithDeepseek` throws.
 */
export async function classifyJobs(
  jobs: Job[],
  signal: AbortSignal,
  onProgress?: (batch: number, total: number) => void,
  isCurrent: () => boolean = () => true
): Promise<ClassifyOutcome | null> {
  const outcome = await filterJobsWithDeepseek(prepareCandidates(jobs), signal, onProgress);

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
