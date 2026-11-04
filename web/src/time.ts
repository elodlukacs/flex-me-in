const DAY = 86_400_000;

const ROMANIA_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Bucharest',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "Wed 4 Nov, 09:21 RO": always Romania time, whatever the phone's zone. '' if unparseable. */
export function formatRomaniaTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${ROMANIA_TIME.format(d)} RO`;
}
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses `datePosted`: a bare YYYY-MM-DD is that *local* day (midnight), a
 * timestamp like 2026-10-23T01:02Z is an instant. Returns null if unparseable.
 */
export function parsePosted(value: string): { time: number; dateOnly: boolean } | null {
  if (!value) return null;
  const m = DATE_ONLY.exec(value);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : { time: d.getTime(), dateOnly: true };
  }
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : { time: t, dateOnly: false };
}

function startOfLocalDay(time: number): number {
  const d = new Date(time);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function shortDate(time: number, now: number): string {
  const d = new Date(time);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' });
}

/** "now", "35m ago", "6h ago", "today", "3d ago", or a short date past a month. */
export function formatAge(value: string, now: number = Date.now()): string {
  const parsed = parsePosted(value);
  if (!parsed) return value.slice(0, 10);
  const { time, dateOnly } = parsed;
  if (dateOnly) {
    const days = Math.round((startOfLocalDay(now) - time) / DAY);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 31) return `${days}d ago`;
    return shortDate(time, now);
  }
  const diff = Math.max(0, now - time);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 31) return `${days}d ago`;
  return shortDate(time, now);
}

/** For "Updated 5 min ago". */
export function formatSince(iso: string | undefined, now: number = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const minutes = Math.floor(Math.max(0, now - t) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return shortDate(t, now);
}

/** Later of two ISO times (either may be missing). */
export function latestIso(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}
