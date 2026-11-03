/**
 * EMEA location matching, shared by every source that returns a free-text
 * location. Extracted from the LinkedIn client so the sources cannot drift
 * apart on what counts as in-region.
 *
 * Two strengths of check:
 * - `isEMEALocation` (positive): the location must name an EMEA place. For
 *   worldwide boards whose location is a clean country name (Workable).
 * - `isNonEMEALocation` (negative only): drop a posting only when it is
 *   explicitly scoped elsewhere ("USA Only", "Americas only", "Remote, US").
 *   For sources already scoped to EMEA (LinkedIn's geoId searches), or whose
 *   location is a free-text scope (RemoteOK, Remotive, WWR) where a positive
 *   check would drop "Greater Paris Metropolitan Region" or "Worldwide".
 */

/**
 * Matched against whole comma/slash-delimited segments of the location string,
 * never as substrings — `'UK'` and `'Wales'` as substrings matched
 * "Ukraine"/"New South Wales".
 */
export const EMEA_NAMES = new Set(
  [
    'United Kingdom', 'UK', 'England', 'Scotland', 'Wales', 'Northern Ireland',
    'Ireland', 'Germany', 'France', 'Spain', 'Italy', 'Netherlands', 'Belgium',
    'Luxembourg', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Iceland',
    'Poland', 'Switzerland', 'Austria', 'Portugal', 'Greece', 'Cyprus', 'Malta',
    'Liechtenstein', 'Monaco', 'Andorra', 'San Marino',
    'Czechia', 'Czech Republic', 'Slovakia', 'Slovenia', 'Croatia', 'Serbia',
    'Bosnia and Herzegovina', 'Bosnia', 'Montenegro', 'North Macedonia',
    'Macedonia', 'Albania', 'Kosovo', 'Bulgaria', 'Romania', 'Hungary',
    'Moldova', 'Lithuania', 'Latvia', 'Estonia', 'Ukraine',
    'Georgia', 'Armenia', 'Azerbaijan', 'Turkey', 'Türkiye',
    'Israel', 'United Arab Emirates', 'UAE', 'Saudi Arabia', 'Qatar', 'Kuwait',
    'Bahrain', 'Oman', 'Jordan', 'Lebanon', 'Egypt',
    'South Africa', 'Nigeria', 'Kenya', 'Morocco', 'Algeria', 'Tunisia',
    'Ghana',
    // Alternate spellings and the small territories Himalayas lists.
    'The Netherlands', 'Holland', 'Deutschland', 'Great Britain',
    'United Kingdom of Great Britain and Northern Ireland', 'Republic of Ireland',
    'Bosnia & Herzegovina', 'Slovak Republic', 'Republic of Moldova',
    'Isle of Man', 'Jersey', 'Guernsey', 'Gibraltar', 'Faroe Islands',
    'Åland Islands', 'Aland Islands', 'Vatican City', 'Holy See (Vatican City State)',
    'Europe', 'European Union', 'EU', 'European Economic Area', 'EEA', 'EMEA',
    'Middle East', 'Africa', 'Remote',
    // Open to everyone, so open to EMEA.
    'Worldwide', 'Anywhere', 'Anywhere in the World', 'Global', 'Remote Worldwide',
  ].map((c) => c.toLowerCase())
);

/**
 * Words that pin a location outside EMEA. `us` is safe as a whole word here:
 * these are location strings, not prose.
 */
const NON_EMEA =
  /\b(united states|usa|us|canada|mexico|brazil|brasil|argentina|colombia|chile|peru|uruguay|costa rica|latam|latin america|americas|north america|south america|central america|india|pakistan|bangladesh|philippines|indonesia|vietnam|malaysia|thailand|korea|taiwan|hong kong|australia|new zealand|singapore|japan|china|apac|asia)\b|(?:^|[^a-z])u\.s\.?(?![a-z])/;

/**
 * Whole-word EMEA mentions inside free text, so a mixed scope like "Europe,
 * Americas" or "UK or US" is not dropped by the negative check. Omits names
 * that are also places elsewhere ("Georgia, US", "New South Wales", "New
 * Jersey") and the scope-less "Remote" / "Worldwide".
 */
const AMBIGUOUS = new Set([
  'georgia', 'wales', 'jersey', 'remote',
  // "US or Worldwide"-style scopes say nothing about EMEA on their own.
  'worldwide', 'anywhere', 'anywhere in the world', 'global', 'remote worldwide',
]);
const EMEA_MENTION = new RegExp(
  `(?:^|[^\\p{L}])(?:${[...EMEA_NAMES]
    .filter((n) => !AMBIGUOUS.has(n))
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})(?![\\p{L}])`,
  'u'
);

/**
 * True only when the location is explicitly scoped outside EMEA and names no
 * EMEA place at all. Empty / "Worldwide" / unknown places pass.
 */
export function isNonEMEALocation(location: string): boolean {
  if (!location) return false;
  const lower = location.toLowerCase();
  if (!NON_EMEA.test(lower)) return false;
  return !EMEA_MENTION.test(lower);
}

/** An empty location is treated as in-region: remote listings often omit it. */
export function isEMEALocation(location: string): boolean {
  if (!location || location.trim() === '') return true;
  if (isNonEMEALocation(location)) return false;
  return location
    .toLowerCase()
    .split(/[,/|•]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .some((segment) => EMEA_NAMES.has(segment));
}
