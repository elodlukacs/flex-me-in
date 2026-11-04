import stringWidth from 'string-width';

const ASCII = /^[\x20-\x7E]*$/;
const ELLIPSIS = '...';

/**
 * Splits on user-perceived characters. Iterating code points split ZWJ
 * sequences, flags and skin-tone modifiers apart, so a cut could land inside
 * one and each half was measured (and drawn) as its own glyph.
 */
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function graphemes(str: string): string[] {
  return Array.from(segmenter.segment(str), (s) => s.segment);
}

/**
 * Terminal column width. `stringWidth` walks the string grapheme by grapheme
 * and consults Unicode tables; job titles are overwhelmingly printable ASCII,
 * where the width is just the length. This runs for every cell of every row of
 * every frame.
 */
export function textWidth(str: string): number {
  return ASCII.test(str) ? str.length : stringWidth(str);
}

/** Longest grapheme-aligned prefix of `str` that is at most `max` columns wide. */
function takeWidth(str: string, max: number): string {
  let result = '';
  let w = 0;
  for (const g of graphemes(str)) {
    const gw = stringWidth(g);
    if (w + gw > max) break;
    result += g;
    w += gw;
  }
  return result;
}

/** Cuts `str` to at most `maxLen` columns, marking the cut with `...`. */
export function truncate(str: string, maxLen: number): string {
  if (maxLen <= 0) return '';
  if (textWidth(str) <= maxLen) return str;
  // No room for an ellipsis; still never split a grapheme (or a surrogate pair).
  if (maxLen <= ELLIPSIS.length) return takeWidth(str, maxLen);
  if (ASCII.test(str)) return str.slice(0, maxLen - ELLIPSIS.length) + ELLIPSIS;
  return takeWidth(str, maxLen - ELLIPSIS.length) + ELLIPSIS;
}

/**
 * A posting date for display, at most 10 columns. Most sources store a bare
 * YYYY-MM-DD, shown as is. LinkedIn postings under a day old carry a UTC
 * timestamp ("…T01:02Z"): shown as an age while under a day, then as the
 * *local* date, since the UTC date put a 01:00 posting on the day before.
 */
export function formatPosted(value: string, now: number = Date.now()): string {
  if (!value) return '-';
  if (value.length <= 10) return value;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return value.slice(0, 10);
  const minutes = Math.max(0, Math.floor((now - t) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`;
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function padRight(str: string, len: number): string {
  const w = textWidth(str);
  if (w >= len) return str;
  return str + ' '.repeat(len - w);
}

/**
 * Word-wraps `str` to lines of at most `maxWidth` columns. Tokens wider than a
 * line (URLs, unspaced CJK) are hard-broken on grapheme boundaries: left to
 * Ink, they were re-wrapped after we had counted lines, so the popup's scroll
 * range no longer matched what was on screen.
 */
export function wrapText(str: string, maxWidth: number): string[] {
  const max = Math.max(1, Math.floor(maxWidth));
  const out: string[] = [];

  for (const rawLine of str.replace(/\r\n?/g, '\n').replace(/\t/g, '  ').split('\n')) {
    const lineText = rawLine.trimEnd();
    if (textWidth(lineText) <= max) {
      out.push(lineText);
      continue;
    }

    let line = '';
    let lineW = 0;
    const flush = () => {
      out.push(line);
      line = '';
      lineW = 0;
    };

    for (const word of lineText.split(' ')) {
      const wordW = textWidth(word);
      const sep = lineW > 0 ? 1 : 0;
      if (lineW + sep + wordW <= max) {
        line += (sep ? ' ' : '') + word;
        lineW += sep + wordW;
        continue;
      }
      if (lineW > 0) flush();
      if (wordW <= max) {
        line = word;
        lineW = wordW;
        continue;
      }
      for (const g of graphemes(word)) {
        const gw = stringWidth(g);
        if (lineW + gw > max && lineW > 0) flush();
        line += g;
        lineW += gw;
      }
    }
    if (lineW > 0) out.push(line);
  }
  return out;
}

const ROMANIA_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Bucharest',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "Wed 4 Nov, 09:21 RO": always Romania time, whatever the machine's zone. '' if unparseable. */
export function formatRomaniaTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${ROMANIA_TIME.format(d)} RO`;
}
