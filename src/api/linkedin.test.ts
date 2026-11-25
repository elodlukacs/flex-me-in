import { describe, it, expect } from 'vitest';
import { parseCards, parseJobDescription, postedAt, searchPlan, workplaceFromText } from './linkedin.js';

describe('postedAt', () => {
  const now = Date.parse('2026-10-23T07:02:30Z');

  it('turns minutes and hours into a UTC timestamp to the minute', () => {
    expect(postedAt('2026-10-23', '6 hours ago', now)).toBe('2026-10-23T01:02Z');
    expect(postedAt('2026-10-22', ' 22 hours ago ', now)).toBe('2026-10-22T09:02Z');
    expect(postedAt('2026-10-23', '1 hour ago', now)).toBe('2026-10-23T06:02Z');
    expect(postedAt('2026-10-23', '30 minutes ago', now)).toBe('2026-10-23T06:32Z');
    expect(postedAt('2026-10-23', 'Just now', now)).toBe('2026-10-23T07:02Z');
  });

  it('keeps the bare date once the text is in days or weeks', () => {
    expect(postedAt('2026-10-20', '3 days ago', now)).toBe('2026-10-20');
    expect(postedAt('2026-10-09', '2 weeks ago', now)).toBe('2026-10-09');
    expect(postedAt('', '', now)).toBe('');
  });

  it('is what parseCards stores for a fresh card', () => {
    const html =
      '<li><div data-entity-urn="urn:li:jobPosting:4011111111">' +
      '<h3 class="base-search-card__title">Senior Frontend Engineer</h3>' +
      '<time class="job-search-card__listdate--new" datetime="2026-10-23">\n  6 hours ago\n</time>' +
      '</div></li>';
    expect(parseCards(html, now).parsed[0]!.datePosted).toBe('2026-10-23T01:02Z');
  });
});

const card = (id: string, inner: string) =>
  `<li><div class="base-card" data-entity-urn="urn:li:jobPosting:${id}">${inner}</div></li>`;

const FIXTURE = [
  card(
    '4012345678',
    `<a class="base-card__full-link" href="https://de.linkedin.com/jobs/view/senior-frontend-4012345678?refId=abc&trackingId=x">
      <span class="sr-only">Senior Frontend Engineer</span></a>
     <div class="base-search-card__info">
       <h3 class="base-search-card__title">
         Senior Frontend Engineer &ndash; Growth
       </h3>
       <h4 class="base-search-card__subtitle">
         <a class="hidden-nested-link" href="https://www.linkedin.com/company/acme">Acme &amp; Co</a>
       </h4>
       <div class="base-search-card__metadata">
         <span class="job-search-card__location">Greater Paris Metropolitan Region</span>
         <time class="job-search-card__listdate" datetime="2026-10-20">3 days ago</time>
       </div>
     </div>`
  ),
  // No h3 title: falls back to the sr-only span; no URL: built from the id.
  card(
    '4099999999',
    `<span class="sr-only">Staff React Developer</span>
     <h4 class="base-search-card__subtitle">Globex</h4>`
  ),
  // Unreadable card: counted but not parsed.
  card('4000000001', '<div>nothing useful</div>'),
].join('\n');

describe('parseCards', () => {
  it('extracts every readable card', () => {
    const { cards, parsed } = parseCards(FIXTURE);
    expect(cards).toBe(3);
    expect(parsed).toHaveLength(2);

    expect(parsed[0]).toEqual({
      jobId: '4012345678',
      title: 'Senior Frontend Engineer – Growth',
      company: 'Acme & Co',
      location: 'Greater Paris Metropolitan Region',
      datePosted: '2026-10-20',
      url: 'https://www.linkedin.com/jobs/view/4012345678',
    });

    expect(parsed[1]).toMatchObject({
      jobId: '4099999999',
      title: 'Staff React Developer',
      company: 'Globex',
      location: '',
      datePosted: '',
      url: 'https://www.linkedin.com/jobs/view/4099999999',
    });
  });

  it('reports zero cards for an empty page', () => {
    expect(parseCards('')).toEqual({ cards: 0, parsed: [] });
  });
});

describe('parseJobDescription', () => {
  it('reads the description markup up to the Show more button', () => {
    const html =
      '<div class="description__text description__text--rich"><section class="show-more-less-html" data-max-lines="5">' +
      '<div class="show-more-less-html__markup show-more-less-html__markup--clamp-after-5\n  relative overflow-hidden">\n' +
      '<strong>Introduction<br><br></strong><strong>Cluj | Hybrid | Frontend/Product Engineer<br><br></strong>' +
      'At Impower, we&#39;re hiring.<ul><li>React</li></ul>\n        </div>\n\n    <button class="show-more-less-html__button">Show more</button>' +
      '</section></div>';
    const text = parseJobDescription(html);
    expect(text).toContain('Cluj | Hybrid | Frontend/Product Engineer');
    expect(text).toContain("we're hiring");
    expect(text).toContain('• React');
    expect(text).not.toContain('Show more');
  });

  it('is empty when the page has no description', () => {
    expect(parseJobDescription('<html><body>Sign in</body></html>')).toBe('');
  });
});

describe('workplaceFromText', () => {
  it('reads hybrid before the office and remote mentions hybrid posts also make', () => {
    expect(workplaceFromText('Cluj | Hybrid | Frontend Engineer')).toBe('hybrid');
    expect(
      workplaceFromText('Expected presence onsite in the Cluj-Napoca office for 3 days per week. Hybrid work.')
    ).toBe('hybrid');
    expect(workplaceFromText('2 days a week in the office, the rest remote')).toBe('hybrid');
  });

  it('reads onsite and fully remote', () => {
    expect(workplaceFromText('This is an on-site role in Cluj-Napoca')).toBe('onsite');
    expect(workplaceFromText('You will work from our Cluj office')).toBe('onsite');
    expect(workplaceFromText('We are a fully remote team')).toBe('remote');
    expect(workplaceFromText('Remote-first company')).toBe('remote');
  });

  // Lines from real postings in a 2026-11-18 Europe sample.
  it('reads French, German, Spanish and Italian postings', () => {
    expect(workplaceFromText("Télétravail hybride majoritaire, après une courte période d'intégration sur site")).toBe('hybrid');
    expect(workplaceFromText('• 2 jours de télétravail par semaine')).toBe('hybrid');
    expect(workplaceFromText('Le FLEX@SQLI, notre politique de télétravail de 1 à 3 jours/ semaine')).toBe('hybrid');
    expect(workplaceFromText('Modalidad híbrida, con disponibilidad para acudir presencialmente')).toBe('hybrid');
    expect(workplaceFromText('etwa durch mobiles Arbeiten oder Vertrauensarbeitszeit')).toBe('hybrid');
    expect(workplaceFromText('Standort: München (100 % vor Ort)')).toBe('onsite');
    expect(workplaceFromText("with willingness to work from Picnic's Amsterdam office-first environment")).toBe('onsite');
    expect(workplaceFromText('Remoto - Malaga\nModalidad: Remoto')).toBe('remote');
    expect(workplaceFromText('Posizione full remote')).toBe('remote');
    expect(workplaceFromText('100% Homeoffice möglich')).toBe('remote');
  });

  it('says nothing when the text says nothing', () => {
    expect(workplaceFromText('Senior Frontend Engineer. React, TypeScript.')).toBe('');
    expect(workplaceFromText('We value remote collaboration tools')).toBe('');
  });
});

describe('searchPlan', () => {
  it('searches Cluj-Napoca for every keyword over the past month', () => {
    const { local, europe } = searchPlan();
    expect(local.length).toBe(new Set(europe.map((s) => s.keywords)).size);
    expect(local.every((s) => s.local && s.geo.label === 'Cluj-Napoca' && s.range === 'r2592000')).toBe(true);
  });

  it('runs the freshest Europe-wide queries first', () => {
    const { europe } = searchPlan();
    expect(europe[0]).toMatchObject({ keywords: 'Senior Frontend Developer', range: 'r86400' });
    expect(europe.every((s) => s.geo.label === 'Europe')).toBe(true);
    const firstWeek = europe.findIndex((s) => s.range === 'r604800');
    expect(europe.slice(0, firstWeek).every((s) => s.range === 'r86400')).toBe(true);
  });

  it('slices by country over the past week only, without repeating a query', () => {
    const { europe, countries } = searchPlan();
    expect(countries.length).toBeGreaterThan(0);
    expect(countries.every((s) => s.geo.label !== 'Europe' && s.range === 'r604800')).toBe(true);
    const keys = [...europe, ...countries].map((s) => `${s.keywords}|${s.geo.geoId}|${s.range}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
