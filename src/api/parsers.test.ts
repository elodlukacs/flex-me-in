import { describe, it, expect } from 'vitest';
import { parseWwrFeed } from './weworkremotely.js';
import { parseJobicy } from './jobicy.js';
import { parseWorkablePage } from './workable.js';
import { parseHimalayasPage } from './himalayas.js';
import { parseJustJoinPage } from './justjoinit.js';

describe('parseJustJoinPage', () => {
  const offer = (slug: string, key = 'javascript') => ({
    slug,
    title: 'Senior Frontend Developer',
    companyName: 'Acme',
    experienceLevel: 'senior',
    workplaceType: 'remote',
    city: 'Valencia',
    category: { key, parentKey: null },
    publishedAt: '2026-10-23T08:00:00Z',
    lastPublishedAt: '2026-09-23T08:00:00Z',
  });

  it('pages by offset and stops at totalItems (next.cursor is not null on the last page)', () => {
    const first = parseJustJoinPage({
      data: [offer('a'), offer('b')],
      meta: { from: 0, totalItems: 3, next: { cursor: 2 } },
    });
    expect(first.offers).toHaveLength(2);
    expect(first.nextFrom).toBe(2);

    const last = parseJustJoinPage({
      data: [offer('c')],
      meta: { from: 2, totalItems: 3, next: { cursor: 3 } },
    });
    expect(last.nextFrom).toBeUndefined();
  });

  it('refuses a page the category filter was not applied to', () => {
    expect(() =>
      parseJustJoinPage({ data: [offer('a'), offer('b', 'java')], meta: { from: 0, totalItems: 2 } })
    ).toThrow(/ignored the category filter/);
  });

  it('throws a clear error when the shape changes', () => {
    expect(() => parseJustJoinPage({ offers: [] })).toThrow('JustJoin.IT response shape changed');
  });
});

describe('parseWwrFeed', () => {
  const item = (title: string, region: string, guid: string) => `
    <item>
      <title>${title}</title>
      <region>${region}</region>
      <country>${region}</country>
      <type>Full-Time</type>
      <category>Front-End Programming</category>
      <description>&lt;p&gt;Build things&amp;nbsp;fast&lt;/p&gt;</description>
      <pubDate>Mon, 20 Oct 2026 10:00:00 +0000</pubDate>
      <guid>${guid}</guid>
      <link>https://weworkremotely.com/remote-jobs/${guid}</link>
    </item>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0"><channel><title>WWR</title>
      ${item('Acme&#8217;s Lab: Senior Frontend Engineer &amp;#8211; React&amp;nbsp;UI', 'Anywhere in the World', 'acme-1')}
      ${item('Globex: Senior Frontend Engineer', 'USA Only', 'globex-1')}
      ${item('Initech: Senior Backend Engineer', 'Anywhere in the World', 'initech-1')}
    </channel></rss>`;

  it('keeps relevant in-region items with decoded text', () => {
    const { jobs, scanned } = parseWwrFeed(xml);
    expect(jobs).toHaveLength(1);
    // Counted before filtering: "none matched" must differ from "feed empty".
    expect(scanned).toBe(3);
    const [job] = jobs;
    expect(job).toMatchObject({
      source: 'weworkremotely',
      company: 'Acme’s Lab',
      title: 'Senior Frontend Engineer – React UI',
      url: 'https://weworkremotely.com/remote-jobs/acme-1',
      datePosted: '2026-10-20',
      country: 'Anywhere in the World',
      workType: 'remote',
      description: 'Build things fast',
    });
    expect(job!.id).toMatch(/^weworkremotely_[0-9a-f]{16}$/);
  });

  it('throws on a document that is not an RSS channel', () => {
    expect(() => parseWwrFeed('<html><body>Blocked</body></html>')).toThrow(/shape changed/);
  });
});

describe('parseJobicy', () => {
  const raw = (id: number, jobTitle: string) => ({
    id,
    url: `https://jobicy.com/jobs/${id}`,
    jobSlug: `slug-${id}`,
    jobTitle,
    companyName: 'Acme',
    jobGeo: 'Denmark,  Portugal, UK',
    jobLevel: 'Senior',
    jobType: 'full-time',
    jobDescription: '<p>Hello</p>',
    pubDate: '2026-10-20 08:00:00',
  });

  it('keeps native ids and does not collapse same-title postings', () => {
    const { jobs, scanned } = parseJobicy({
      jobCount: 4,
      jobs: [
        raw(1, 'Senior Frontend Engineer'),
        raw(2, 'Senior Frontend Engineer'),
        raw(1, 'Senior Frontend Engineer'),
        raw(3, 'Senior Backend Engineer'),
        null,
      ],
    });
    expect(jobs).toHaveLength(2);
    expect(scanned).toBe(5);
    expect(new Set(jobs.map((j) => j.id)).size).toBe(2);
    expect(jobs[0]).toMatchObject({
      source: 'jobicy',
      country: 'Denmark, Portugal, UK',
      workType: 'remote',
      datePosted: '2026-10-20',
      description: 'Hello',
    });
  });

  it('throws a clear error when the shape changes', () => {
    expect(() => parseJobicy({ data: [] })).toThrow('Jobicy response shape changed');
    expect(() => parseJobicy(null)).toThrow('Jobicy response shape changed');
  });
});

describe('parseWorkablePage', () => {
  const raw = (id: string, title: string, country: string) => ({
    id,
    title,
    url: `https://jobs.workable.com/view/${id}`,
    created: '2026-10-19T12:00:00Z',
    company: { title: 'Acme' },
    location: { countryName: country },
    description: '<p>Desc</p>',
  });

  it('keeps relevant EMEA jobs and returns the cursor', () => {
    const page = parseWorkablePage({
      totalSize: 4,
      nextPageToken: 'next-1',
      jobs: [
        raw('a', 'Senior Frontend Engineer', 'Netherlands'),
        raw('b', 'Senior Frontend Engineer', 'United States'),
        raw('c', 'Senior Java Engineer', 'Germany'),
        { id: 'd', title: 'Senior React Developer', locations: [{ country: 'Poland' }] },
      ],
    });
    expect(page.nextPageToken).toBe('next-1');
    expect(page.jobs.map((j) => j.country)).toEqual(['Netherlands', 'Poland']);
    expect(page.jobs[0]).toMatchObject({
      source: 'workable',
      company: 'Acme',
      datePosted: '2026-10-19',
      workType: 'remote',
      description: 'Desc',
    });
    expect(page.jobs[1]!.company).toBe('Unknown');
  });

  it('keeps a role whose primary country is outside EMEA when it also lists an EMEA one', () => {
    const page = parseWorkablePage({
      jobs: [
        {
          ...raw('e', 'Senior Frontend Engineer', 'United States'),
          locations: [{ countryName: 'United States' }, { countryName: 'Germany' }, { countryName: 'Spain' }],
        },
        { ...raw('f', 'Senior Frontend Engineer', 'Canada'), locations: [{ countryName: 'Brazil' }] },
      ],
    });
    expect(page.jobs.map((j) => j.country)).toEqual(['Germany, Spain']);
  });

  it('treats an empty token as the last page', () => {
    expect(parseWorkablePage({ jobs: [], nextPageToken: '' }).nextPageToken).toBeUndefined();
  });

  it('throws a clear error when the shape changes', () => {
    expect(() => parseWorkablePage({ results: [] })).toThrow('Workable response shape changed');
  });
});

describe('parseHimalayasPage', () => {
  const NOW = Date.parse('2026-11-03T12:00:00Z');
  const day = 86_400;
  const raw = (guid: string, title: string, restrictions: string[], extra: Record<string, unknown> = {}) => ({
    guid: `https://himalayas.app/companies/acme/jobs/${guid}`,
    title,
    companyName: 'Acme',
    seniority: ['Senior'],
    locationRestrictions: restrictions,
    description: '<p>Desc</p>',
    pubDate: NOW / 1000 - day,
    expiryDate: NOW / 1000 + 30 * day,
    ...extra,
  });

  it('keeps relevant jobs open to EMEA and lists only the EMEA countries', () => {
    const page = parseHimalayasPage(
      {
        totalCount: 6,
        jobs: [
          raw('a', 'Senior Frontend Engineer', ['Germany', 'United States', 'Isle of Man']),
          raw('b', 'Senior Frontend Engineer', ['India']),
          raw('c', 'Senior Java Engineer', []),
          // The board's own seniority label covers a title without one.
          raw('d', 'Software Engineer Frontend - React', []),
          raw('e', 'Senior React Developer', ['Spain'], { pubDate: NOW / 1000 - 45 * day }),
          raw('f', 'Senior Vue Developer', ['Spain'], { expiryDate: NOW / 1000 - day }),
        ],
      },
      NOW
    );
    expect(page.scanned).toBe(6);
    // a, b, d, e, f pass the title gate; b is out of region, e too old, f expired.
    expect(page.relevant).toBe(5);
    expect(page.jobs.map((j) => j.country)).toEqual(['Germany, Isle of Man', 'Worldwide']);
    expect(page.jobs[0]).toMatchObject({
      source: 'himalayas',
      url: 'https://himalayas.app/companies/acme/jobs/a',
      datePosted: '2026-11-02',
      workType: 'remote',
      description: 'Desc',
    });
  });

  it('does not assume seniority without the board label', () => {
    const page = parseHimalayasPage(
      { jobs: [raw('a', 'Frontend Developer', [], { seniority: ['Mid-level'] })] },
      NOW
    );
    expect(page.jobs).toHaveLength(0);
  });

  it('throws a clear error when the shape changes', () => {
    expect(() => parseHimalayasPage({})).toThrow('Himalayas response shape changed');
  });
});
