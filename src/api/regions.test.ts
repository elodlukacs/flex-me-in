import { describe, it, expect } from 'vitest';
import { isEMEALocation, isNonEMEALocation } from './regions.js';

describe('isNonEMEALocation (negative-only check)', () => {
  it.each([
    'Greater Paris Metropolitan Region',
    'Greater London',
    'Amsterdam Area',
    'Türkiye',
    'Worldwide',
    'Anywhere in the World',
    '',
    'Europe, Americas',
    'UK or US',
    'Berlin, Germany',
  ])('passes %s', (loc) => {
    expect(isNonEMEALocation(loc)).toBe(false);
  });

  it.each([
    'Remote, US',
    'USA Only',
    'US only',
    'Americas only',
    'United States',
    'Atlanta, Georgia, United States',
    'Toronto, Canada',
    'LATAM',
    'Sydney, New South Wales, Australia',
    'Remote (U.S.)',
  ])('rejects %s', (loc) => {
    expect(isNonEMEALocation(loc)).toBe(true);
  });
});

describe('isEMEALocation (positive check)', () => {
  it.each([
    'Germany', 'Türkiye', 'North Macedonia', 'Armenia', 'Albania', 'Bosnia', '',
    'The Netherlands', 'Deutschland', 'Bosnia & Herzegovina', 'Isle of Man',
    'Worldwide', 'Anywhere',
  ])(
    'passes %s',
    (loc) => {
      expect(isEMEALocation(loc)).toBe(true);
    }
  );

  it.each([
    'United States', 'Ukraine Avenue, US', 'New South Wales', 'Brazil', 'Somewhere',
    // Open-to-all words don't rescue a scope pinned elsewhere.
    'US, Worldwide', 'New Jersey, US',
  ])(
    'rejects %s',
    (loc) => {
      expect(isEMEALocation(loc)).toBe(false);
    }
  );
});
