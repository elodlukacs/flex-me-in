import { createHash } from 'crypto';

/**
 * Stable per-posting id. Always prefer the source's own native id (slug, RSS
 * guid, numeric job id): hashing title+company collapses distinct postings that
 * share a title, and re-mints the id — orphaning applied/ignored state —
 * whenever a company edits the title.
 *
 * `fallback` is used only for sources with no native id.
 */
export function generateJobId(
  source: string,
  nativeId: string | number | null | undefined,
  fallback?: { title: string; company: string }
): string {
  const key =
    nativeId != null && String(nativeId).trim() !== ''
      ? `id:${nativeId}`
      : `fallback:${fallback?.title ?? ''}:${fallback?.company ?? ''}`;

  const hash = createHash('sha256')
    .update(`${source}:${key}`)
    .digest('hex')
    .slice(0, 16);
  return `${source}_${hash}`;
}
