import { describe, it, expect } from 'vitest';
import { isSeniorFrontend } from './relevance.js';

describe('isSeniorFrontend', () => {
  it.each([
    'Senior Frontend Engineer, Growth',
    'Senior Frontend Engineer - Content Platform',
    'Senior Frontend Engineer (Support Tools)',
    'Senior Software Engineer, Frontend - Marketing',
    'Senior Frontend Developer (People Platform)',
    'Mid/Senior Frontend Developer',
    'Sr. React Developer',
    'Staff Front-End Engineer',
    'Senior Fullstack Engineer (React)',
    'Senior Frontend Engineer (Headless CMS)',
    // Accents are folded, and the EMEA boards' own seniority words count.
    'Desarrollador Frontend Sénior',
    'Développeur Angular - Expérimenté (H/F)',
    'Développeur React Confirmé',
    'Starszy Programista Angular',
    'Erfahrener Frontend-Entwickler (m/w/d)',
    'Senior TypeScript Engineer, Growth',
  ])('keeps %s', (title) => {
    expect(isSeniorFrontend(title)).toBe(true);
  });

  it.each([
    'Growth Marketing Manager',
    'Senior Product Designer',
    'Junior Frontend Developer',
    'Frontend Engineering Manager',
    'Mid Frontend Developer',
    'Senior Java Engineer',
    'Senior React Native Developer',
    'Senior Content Marketing Lead',
    'Head of Frontend',
    'Frontend Developer',
    // TypeScript/JavaScript alone lose to an explicit backend domain.
    'Senior Backend Developer (Node.js / TypeScript)',
    'Senior Software Engineer - Node.js/TypeScript',
    'Senior JavaScript Engineer (Node.js)',
  ])('drops %s', (title) => {
    expect(isSeniorFrontend(title)).toBe(false);
  });

  it('honours source-level guarantees', () => {
    expect(isSeniorFrontend('Software Engineer', { assumeFrontend: true, assumeSenior: true })).toBe(true);
    // A title that says mid still loses, even when the source claims senior.
    expect(isSeniorFrontend('Mid Software Engineer', { assumeFrontend: true, assumeSenior: true })).toBe(false);
  });
});
