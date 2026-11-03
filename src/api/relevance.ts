/**
 * Title-level relevance gate: keep ONLY senior frontend developer roles and
 * their varieties ("Senior React Developer", "Sr. Front-End Engineer",
 * "Lead Vue Developer", "Staff Frontend Engineer", ...).
 *
 * Applied per source at ingest time, so irrelevant postings never reach the DB.
 * Every list below is a plain phrase list — edit these, not the logic.
 */

/** Lowercase, collapse punctuation to spaces, pad so ' phrase ' matching works. */
function normalize(title: string): string {
  const cleaned = title
    // Fold accents first: "Sénior" / "Expérimenté" otherwise split into
    // "s nior" / "exp riment" and matched nothing.
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return ` ${cleaned} `;
}

function has(normalized: string, phrases: readonly string[]): boolean {
  return phrases.some((p) => normalized.includes(` ${p} `));
}

/** Seniority signal, including the EMEA boards' local words (accents folded). */
const SENIOR = [
  'senior', 'sr', 'snr', 'lead', 'leader', 'staff', 'principal', 'expert',
  'iii', 'iv', 'architect',
  // fr / de / pl / es / it / pt / nl
  'experimente', 'experimentee', 'confirme', 'confirmee',
  'erfahren', 'erfahrene', 'erfahrener',
  'starszy', 'starsza',
  'experimentado', 'experimentada', 'esperto', 'esperta', 'experiente',
  'ervaren',
] as const;

/** Explicit frontend signal — strong enough to override a domain conflict. */
const STRONG_FRONTEND = [
  'frontend', 'front end', 'fronted',
  'react', 'reactjs', 'react js',
  'vue', 'vuejs', 'vue js',
  'angular', 'angularjs',
  'svelte', 'sveltekit', 'svelte kit',
  'next js', 'nextjs', 'nuxt', 'nuxtjs', 'remix', 'astro', 'ember',
] as const;

/**
 * A language that is usually, not always, frontend. Beats a business area
 * ("Senior TypeScript Engineer, Growth") but loses to another engineering
 * domain: "Senior Backend Developer (Node.js / TypeScript)" is backend.
 */
const LANGUAGE_FRONTEND = ['javascript', 'typescript'] as const;

/** Weaker frontend signal — counts on its own, but loses to a domain conflict. */
const WEAK_FRONTEND = ['ui', 'web', 'webdev', 'css', 'html'] as const;

/** Below senior. Never relevant, whatever else the title says. */
const JUNIOR = [
  'junior', 'jr', 'entry level', 'intern', 'internship', 'trainee', 'graduate',
  'apprentice', 'working student', 'student',
] as const;

/**
 * Mid-level. Excluded unless a SENIOR word is also present: "Mid/Senior
 * Frontend Developer" and "Medior/Senior" postings are open to seniors.
 */
const MID = ['mid', 'mid level', 'midlevel', 'medior'] as const;

/**
 * A role noun for something that is not frontend engineering. Always fatal,
 * even next to "Frontend": "Frontend Engineering Manager" manages, and a
 * "Senior Product Designer" designs.
 */
const ROLE_EXCLUDE = [
  'designer', 'design system engineer', 'ux researcher', 'copywriter', 'writer',
  'recruiter', 'recruitment', 'sourcer', 'account executive', 'helpdesk',
  'analyst', 'accountant', 'teacher', 'tutor', 'instructor', 'manager',
  'director', 'head', 'vp', 'cto', 'cio', 'ceo', 'coo', 'founder',
  'scrum master', 'agile coach', 'product owner', 'project manager',
  'consultant', 'evangelist', 'advocate',
  // adjacent engineering discipline that is frequently titled "React"
  'react native',
] as const;

/**
 * A business area. Fatal on its own ("Growth Marketing Lead"), but a team
 * name when the title also carries a STRONG_FRONTEND signal: "Senior Frontend
 * Engineer, Growth" and "Senior Frontend Developer (People Platform)" are
 * exactly the roles we want.
 */
const AREA_EXCLUDE = [
  'talent', 'sales', 'marketing', 'seo', 'growth', 'content', 'community',
  'support', 'customer success', 'finance', 'hr', 'people', 'business',
  'management',
] as const;

/**
 * Another engineering domain. Excluded unless the title also carries a
 * STRONG_FRONTEND signal (so "Senior Fullstack Engineer (React)" survives
 * while "Senior Java Engineer" does not).
 */
const DOMAIN_EXCLUDE = [
  'backend', 'back end', 'devops', 'sre', 'site reliability', 'platform',
  'infrastructure', 'cloud', 'network', 'sysadmin', 'database', 'dba',
  'data engineer', 'data scientist', 'data science', 'analytics',
  'machine learning', 'ml', 'ai', 'nlp', 'computer vision',
  'qa', 'quality assurance', 'sdet', 'tester',
  'mobile', 'android', 'ios', 'flutter', 'kotlin', 'swift',
  'node', 'nodejs', 'node js', 'nestjs', 'nest js',
  'php', 'laravel', 'symfony', 'wordpress', 'drupal', 'magento', 'shopify',
  'java', 'spring', 'net', 'c#', 'dotnet',
  'python', 'django', 'flask', 'ruby', 'rails', 'golang', 'rust', 'scala',
  'elixir', 'erlang', 'perl', 'c++', 'embedded', 'firmware', 'hardware',
  'unity', 'unreal', 'game', 'gamedev',
  'security', 'pentest', 'blockchain', 'solidity', 'web3',
  'salesforce', 'sap', 'servicenow', 'dynamics', 'odoo',
] as const;

export interface RelevanceOptions {
  /**
   * The source already guarantees a frontend category server-side (e.g.
   * JustJoin.IT `categories[]=1`), so a title without an explicit framework
   * name is still a frontend role.
   */
  assumeFrontend?: boolean;
  /** The source already guarantees seniority server-side. */
  assumeSenior?: boolean;
}

/** True when `title` reads as a senior frontend developer role. */
export function isSeniorFrontend(title: string, opts: RelevanceOptions = {}): boolean {
  if (!title) return false;
  const n = normalize(title);

  if (has(n, JUNIOR) || has(n, ROLE_EXCLUDE)) return false;

  const senior = has(n, SENIOR);
  if (!senior && has(n, MID)) return false;

  const strong = has(n, STRONG_FRONTEND);
  if (!strong && has(n, DOMAIN_EXCLUDE)) return false;
  const language = has(n, LANGUAGE_FRONTEND);
  if (!strong && !language && has(n, AREA_EXCLUDE)) return false;

  const isFrontend = strong || language || has(n, WEAK_FRONTEND) || !!opts.assumeFrontend;
  if (!isFrontend) return false;

  return senior || !!opts.assumeSenior;
}
