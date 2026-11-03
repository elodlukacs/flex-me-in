/**
 * Monotonic generation counters shared by the fetch and AI-filter hooks.
 *
 * An aborted async run keeps executing until its next await resolves, so
 * without a generation check a superseded fetch could still write to the DB and
 * dispatch over a newer one, and a finished AI filter could re-insert rows for
 * jobs a fetch had just purged.
 */
let fetchGeneration = 0;
let aiGeneration = 0;

/** Starts a new fetch run; also invalidates any in-flight AI filter. */
export function beginFetch(): number {
  aiGeneration++;
  return ++fetchGeneration;
}

export function isCurrentFetch(generation: number): boolean {
  return generation === fetchGeneration;
}

export function beginAiFilter(): number {
  return ++aiGeneration;
}

export function isCurrentAiFilter(generation: number): boolean {
  return generation === aiGeneration;
}

/**
 * Invalidates every in-flight fetch and AI run without starting a new one.
 * For destructive actions (clear all): an abort alone still lets a run that
 * is past its last await write to the DB afterwards.
 */
export function invalidateAll(): void {
  fetchGeneration++;
  aiGeneration++;
}
