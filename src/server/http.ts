import type { IncomingMessage, ServerResponse } from 'http';
import { createHash, timingSafeEqual } from 'crypto';

/** Request bodies are a status or a source list; anything bigger is abuse. */
export const MAX_BODY_BYTES = 16 * 1024;

/** An error whose message is safe to show the client, with its status code. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly headers: Record<string, string> = {}
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    // Job data changes under the client constantly; a cached list would show
    // statuses the user already changed.
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

/**
 * Reads and parses a JSON body. An empty body is `undefined`, so routes whose
 * body is optional need no special casing.
 */
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new HttpError(413, 'Request body too large');
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    // Content-Length can be absent (chunked) or lie, so count as we go.
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request body too large');
    chunks.push(buf);
  }

  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (text === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, 'Body is not valid JSON');
  }
}

/**
 * Compares in constant time. Hashing first gives both sides the same length,
 * so neither the content nor the length of the token leaks through timing.
 */
export function tokensMatch(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function bearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  const match = header?.match(/^Bearer\s+(\S+)\s*$/i);
  return match?.[1];
}

/** The hostname part of a Host header or an Origin URL, without port. */
export function hostnameOf(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value.includes('://') ? value : `http://${value}`).hostname;
  } catch {
    return undefined;
  }
}
