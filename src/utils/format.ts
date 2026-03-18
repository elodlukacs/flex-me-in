import stringWidth from 'string-width';

export function truncate(str: string, maxLen: number): string {
  if (stringWidth(str) <= maxLen) return str;
  if (maxLen <= 3) return str.slice(0, maxLen);

  let result = '';
  let width = 0;
  for (const char of str) {
    const charW = stringWidth(char);
    if (width + charW > maxLen - 3) break;
    result += char;
    width += charW;
  }
  return result + '...';
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toISOString().split('T')[0]!;
  } catch {
    return dateStr;
  }
}

export function padRight(str: string, len: number): string {
  const w = stringWidth(str);
  if (w >= len) return str;
  return str + ' '.repeat(len - w);
}

export function padLeft(str: string, len: number): string {
  const w = stringWidth(str);
  if (w >= len) return str;
  return ' '.repeat(len - w) + str;
}
