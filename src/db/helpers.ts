import { createHash } from 'crypto';

export function generateJobId(source: string, title: string, company: string): string {
  const hash = createHash('sha256')
    .update(`${source}:${title}:${company}`)
    .digest('hex')
    .slice(0, 16);
  return `${source}_${hash}`;
}
