import type { Source } from '../state/types.js';
import type { FetchFn } from '../api/types.js';
import { fetchRemoteOK } from '../api/remoteok.js';
import { fetchWeWorkRemotely } from '../api/weworkremotely.js';
import { fetchRemotive } from '../api/remotive.js';
import { fetchLinkedIn } from '../api/linkedin.js';
import { fetchJustJoinIT } from '../api/justjoinit.js';
import { fetchWorkable } from '../api/workable.js';
import { fetchJobicy } from '../api/jobicy.js';
import { fetchHimalayas } from '../api/himalayas.js';
import { expireStaleJobs, replaceSourceJobs, saveAiFilteredJobs } from '../db/repository.js';
import { logError } from '../utils/log.js';

/**
 * Fetch orchestration shared by the TUI (useFetcher) and the HTTP server, so
 * both write to the database by exactly the same rules. Nothing here knows
 * about React or HTTP: callers observe a run through callbacks.
 */

export const fetcherMap: Record<Source, FetchFn> = {
  remoteok: fetchRemoteOK,
  weworkremotely: fetchWeWorkRemotely,
  remotive: fetchRemotive,
  linkedin: fetchLinkedIn,
  justjoinit: fetchJustJoinIT,
  workable: fetchWorkable,
  jobicy: fetchJobicy,
  himalayas: fetchHimalayas,
};

export interface SourceFetchResult {
  /** Jobs the fetcher returned (and stored). */
  count: number;
  /** False when paging stopped early: rows were upserted, nothing purged. */
  complete: boolean;
  /** The signal fired while the fetcher ran; whatever it had was kept. */
  aborted: boolean;
}

/**
 * Fetches one source and writes it to the database. Returns null, having
 * written nothing, when `isCurrent` says the run was superseded while the
 * request was in flight. Throws whatever the fetcher throws.
 */
export async function fetchSourceInto(
  source: Source,
  signal: AbortSignal,
  onProgress?: (count: number) => void,
  isCurrent: () => boolean = () => true,
  /** The run's start: rows first stored now are marked as its batch. */
  batchAt: string = new Date().toISOString()
): Promise<SourceFetchResult | null> {
  const { jobs, complete, scanned } = await fetcherMap[source](signal, onProgress);

  if (!isCurrent()) return null;

  // A fetcher that stops paging on abort may hand back what it had. Keep
  // those rows, but never treat them as the full listing: that would purge
  // everything it didn't reach.
  const aborted = signal.aborted;
  // Purge only a full listing from a feed that returned something: an empty
  // feed is more likely broken, but "listings, none matched" must clear the
  // source's old rows.
  const purge = complete && !aborted && scanned > 0;
  // A source that returned nothing keeps its previous "just in" batch.
  if (jobs.length > 0 || purge) {
    replaceSourceJobs(source, jobs, purge, batchAt);
  }
  return { count: jobs.length, complete, aborted };
}

/** Per-source events of a run. None fire once `isCurrent` turns false. */
export interface FetchRunCallbacks {
  onProgress?: (source: Source, count: number) => void;
  onDone?: (source: Source, count: number, complete: boolean) => void;
  onCancelled?: (source: Source) => void;
  onError?: (source: Source, message: string) => void;
}

/**
 * Fetches `sources` concurrently. Clears the stored AI results first: they
 * describe the previous listing, whose rows this run may purge. Expires stale
 * rows once every source has settled, unless the run was superseded.
 *
 * Never throws; per-source failures go to `onError` (and the error log).
 */
export async function runFetch(
  sources: Source[],
  signal: AbortSignal,
  isCurrent: () => boolean,
  callbacks: FetchRunCallbacks = {}
): Promise<void> {
  const { onProgress, onDone, onCancelled, onError } = callbacks;
  saveAiFilteredJobs([]);
  const batchAt = new Date().toISOString();

  const promises = sources.map(async (source) => {
    try {
      const result = await fetchSourceInto(
        source,
        signal,
        (count) => {
          if (isCurrent()) onProgress?.(source, count);
        },
        isCurrent,
        batchAt
      );
      if (!result) return;
      if (result.aborted) {
        onCancelled?.(source);
        return;
      }
      onDone?.(source, result.count, result.complete);
    } catch (err: unknown) {
      if (!isCurrent()) return;

      if (err instanceof Error && err.name === 'AbortError') {
        onCancelled?.(source);
        return;
      }
      // A TimeoutError is a failure, not a cancellation — it used to be
      // reported as "Fetch cancelled".
      logError(`fetch ${source}`, err);
      onError?.(source, err instanceof Error ? err.message : 'Unknown error');
    }
  });

  await Promise.allSettled(promises);

  // Expire even after a cancel: sources that finished before it already
  // wrote. Only a superseded or discarded run skips it.
  if (isCurrent()) expireStaleJobs();
}
