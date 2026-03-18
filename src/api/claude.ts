import Anthropic from '@anthropic-ai/sdk';
import type { Job, AiJobResult } from '../state/types.js';

const BATCH_SIZE = 100;

export function getApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY;
}

export async function filterJobsWithClaude(
  jobs: Job[],
  signal?: AbortSignal
): Promise<AiJobResult[]> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Set ANTHROPIC_API_KEY env var to use AI filtering');

  const client = new Anthropic({ apiKey });
  const allResults: AiJobResult[] = [];

  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const batch = jobs.slice(i, i + BATCH_SIZE);
    const jobSummaries = batch.map((j) => ({
      id: j.id,
      title: j.title,
      company: j.company,
      source: j.source,
      country: j.country,
      workType: j.workType,
    }));

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `You are a job relevance classifier. Given this list of job postings, return ONLY the jobs relevant for a Senior Frontend Developer (JavaScript, TypeScript, React, Vue, Angular, Next.js, CSS, HTML, Web).

Include: senior/lead/staff/principal frontend, UI, or web developer roles.
Exclude: backend-only, DevOps, mobile-native-only, data, ML, design-only, or unrelated roles.

For each matching job, also assess whether it is remote-friendly:
- "yes" = explicitly remote or the source/description strongly implies remote work
- "possible" = not clear, could be remote or hybrid
- "no" = clearly on-site or office-only

Return a JSON array of objects with "id" and "remote" fields, nothing else.
Example: [{"id":"abc","remote":"yes"},{"id":"def","remote":"possible"}]
If none match, return: []

Jobs:
${JSON.stringify(jobSummaries)}`,
        },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    try {
      // Strip markdown code fences if present
      const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '').trim();
      const results = JSON.parse(cleaned) as AiJobResult[];
      if (Array.isArray(results)) {
        allResults.push(...results.map((r) => ({
          id: r.id,
          remote: (['yes', 'no', 'possible'].includes(r.remote) ? r.remote : 'possible') as AiJobResult['remote'],
        })));
      }
    } catch {
      // Skip failed batch but continue processing remaining batches
      console.error(`Failed to parse AI response for batch ${Math.floor(i / BATCH_SIZE) + 1}, skipping`);
    }
  }

  return allResults;
}
