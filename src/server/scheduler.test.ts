import { describe, it, expect } from 'vitest';
import { isRefreshDue } from './scheduler.js';

describe('isRefreshDue', () => {
  const H = 3_600_000;
  const now = Date.parse('2026-11-03T12:00:00Z');

  it('is due when nothing ever finished, or the timestamp is unreadable', () => {
    expect(isRefreshDue(undefined, 6 * H, now)).toBe(true);
    expect(isRefreshDue('garbage', 6 * H, now)).toBe(true);
  });

  it('waits a full interval after the last refresh, scheduled or manual', () => {
    expect(isRefreshDue('2026-11-03T07:00:00Z', 6 * H, now)).toBe(false);
    expect(isRefreshDue('2026-11-03T06:00:00Z', 6 * H, now)).toBe(true);
  });
});
