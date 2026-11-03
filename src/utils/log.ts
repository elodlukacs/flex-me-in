import { appendFileSync, mkdirSync, renameSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/** Above this the current log is rotated to `error.log.1` (one generation kept). */
const MAX_LOG_BYTES = 1024 * 1024;

/**
 * Ink owns stdout/stderr: any console.* write tears the rendered frame. All
 * diagnostics go to a file instead, surfaced in the UI via SET_STATUS.
 */
export function getLogPath(): string {
  const dir = join(homedir(), '.flex-me-in');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return join(dir, 'error.log');
}

/**
 * Error messages and response bodies can echo request headers back. The log
 * is plain text in the home directory, so credentials are scrubbed before
 * anything is written.
 */
export function redact(text: string): string {
  let out = text;
  const secret = process.env.DEEPSEEK_API_KEY;
  if (secret && secret.length >= 8) out = out.split(secret).join('[redacted]');
  return out
    .replace(/(authorization["']?\s*[:=]\s*["']?)[^"'\n,}]+/gi, '$1[redacted]')
    .replace(/\bBearer\s+[\w.~+/-]+=*/g, 'Bearer [redacted]')
    .replace(/\bsk-[\w-]{8,}/g, '[redacted]');
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`;
  return String(error);
}

/** Keeps the log bounded without ever losing the most recent entries. */
function rotateIfLarge(path: string): void {
  try {
    if (statSync(path).size > MAX_LOG_BYTES) renameSync(path, `${path}.1`);
  } catch {
    // Missing file: nothing to rotate.
  }
}

export function logError(context: string, error: unknown): void {
  try {
    const path = getLogPath();
    rotateIfLarge(path);
    // `mode` only applies when the file is created; the log can contain
    // response bodies, so it is private to the user.
    appendFileSync(
      path,
      redact(`${new Date().toISOString()} [${context}] ${describe(error)}\n`),
      { mode: 0o600 }
    );
  } catch {
    // Logging must never break a fetch.
  }
}
