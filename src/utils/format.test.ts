import { describe, it, expect } from 'vitest';
import stringWidth from 'string-width';
import { truncate, padRight, wrapText, formatPosted } from './format.js';

describe('formatPosted', () => {
  const now = Date.parse('2026-10-23T07:02:00Z');

  it('shows bare dates as they are', () => {
    expect(formatPosted('2026-10-20', now)).toBe('2026-10-20');
    expect(formatPosted('', now)).toBe('-');
  });

  it('shows a timestamp under a day old as an age', () => {
    expect(formatPosted('2026-10-23T06:50Z', now)).toBe('12m ago');
    expect(formatPosted('2026-10-23T01:02Z', now)).toBe('6h ago');
    expect(formatPosted('2026-10-22T09:02Z', now)).toBe('22h ago');
  });

  it('shows an older timestamp as a local date that fits the column', () => {
    const out = formatPosted('2026-10-20T12:00Z', now);
    expect(out).toMatch(/^2026-10-2\d$/);
    expect(out.length).toBeLessThanOrEqual(10);
  });
});

const hasLoneSurrogate = (s: string) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

describe('truncate', () => {
  it('leaves strings that fit alone', () => {
    expect(truncate('React', 10)).toBe('React');
    expect(truncate('高级', 4)).toBe('高级');
  });

  it('cuts ASCII with an ellipsis', () => {
    expect(truncate('Senior Frontend Engineer', 10)).toBe('Senior ...');
  });

  it.each([
    '❤️❤️❤️❤️ Senior Frontend Engineer',
    '👩‍💻 Senior Frontend 👍🏽 Engineer',
    '🇩🇪🇩🇪 Senior Frontend Engineer Berlin',
    '高级前端工程师职位描述高级前端工程师',
  ])('measures emoji and CJK by display width: %s', (title) => {
    for (const max of [4, 7, 12, 13]) {
      const cut = truncate(title, max);
      expect(stringWidth(cut)).toBeLessThanOrEqual(max);
      expect(stringWidth(padRight(cut, max))).toBe(max);
      expect(hasLoneSurrogate(cut)).toBe(false);
    }
  });

  it('never splits a ZWJ sequence or flag', () => {
    expect(truncate('👩‍💻👩‍💻👩‍💻 dev', 7)).toBe('👩‍💻👩‍💻...');
    expect(truncate('🇩🇪🇩🇪🇩🇪 x', 7)).toBe('🇩🇪🇩🇪...');
  });

  it('handles a short maxLen without an ellipsis or lone surrogates', () => {
    expect(truncate('Senior', 3)).toBe('Sen');
    expect(truncate('😀😀😀', 3)).toBe('😀');
    expect(truncate('😀😀😀', 1)).toBe('');
    expect(truncate('anything', 0)).toBe('');
    expect(hasLoneSurrogate(truncate('😀abc', 1))).toBe(false);
  });
});

describe('wrapText', () => {
  it('keeps short lines and blank lines as they are', () => {
    expect(wrapText('one\n\ntwo', 10)).toEqual(['one', '', 'two']);
  });

  it('wraps on spaces', () => {
    expect(wrapText('the quick brown fox jumps', 10)).toEqual(['the quick', 'brown fox', 'jumps']);
  });

  it('fills a line to exactly the width', () => {
    expect(wrapText('abcde fghij', 11)).toEqual(['abcde fghij']);
    expect(wrapText('abcde fghij', 10)).toEqual(['abcde', 'fghij']);
    expect(wrapText('abcdefghij', 10)).toEqual(['abcdefghij']);
  });

  it('hard-breaks a URL longer than the line', () => {
    const url = 'https://boards.greenhouse.io/acme/jobs/1234567890?gh_src=abcdef';
    const lines = wrapText(`Apply: ${url} today`, 20);
    for (const l of lines) expect(stringWidth(l)).toBeLessThanOrEqual(20);
    expect(lines.join('')).toContain(url.slice(0, 20));
    expect(lines.join('').replace(/\s/g, '')).toBe(`Apply:${url}today`);
  });

  it('breaks unspaced CJK by display width', () => {
    const text = '高级前端工程师职位描述';
    const lines = wrapText(text, 7);
    for (const l of lines) expect(stringWidth(l)).toBeLessThanOrEqual(7);
    expect(lines.join('')).toBe(text);
    expect(lines[0]).toBe('高级前');
  });

  it('never splits an emoji cluster when hard-breaking', () => {
    const lines = wrapText('👩‍💻'.repeat(5), 4);
    expect(lines).toEqual(['👩‍💻👩‍💻', '👩‍💻👩‍💻', '👩‍💻']);
  });
});
