import { join } from 'path';
import { homedir } from 'os';

const DATA_DIR = join(homedir(), '.flex-me-in');

function firstLine(text: string): string {
  return text.split('\n')[0] ?? text;
}

/**
 * Turns a startup or render crash into a message a user can act on. The two
 * common ones are environmental: a better-sqlite3 binary built for another
 * Node version, and a data directory that can't be written.
 */
export function describeFatalError(err: unknown): string {
  const error = err instanceof Error ? err : new Error(String(err));
  const code = (error as NodeJS.ErrnoException).code ?? '';
  const message = firstLine(error.message);

  if (
    code === 'ERR_DLOPEN_FAILED' ||
    /NODE_MODULE_VERSION|better_sqlite3\.node|Could not locate the bindings file/.test(error.message)
  ) {
    return [
      `The better-sqlite3 native module could not be loaded under Node ${process.version}.`,
      'Rebuild it for this Node version:  npm rebuild better-sqlite3',
      `(${message})`,
    ].join('\n');
  }

  if (
    // EEXIST/ENOTDIR: ~/.flex-me-in exists but is a file.
    ['EACCES', 'EPERM', 'EROFS', 'ENOENT', 'ENOTDIR', 'EEXIST', 'ENOSPC'].includes(code) ||
    /^SQLITE_(CANTOPEN|READONLY|CORRUPT|NOTADB|IOERR)/.test(code) ||
    /unable to open database|file is not a database|readonly database/i.test(error.message)
  ) {
    return [
      `Cannot open the job database in ${DATA_DIR}.`,
      message,
      'Check that the directory exists and is writable (or delete a corrupt jobs.db to rebuild it).',
    ].join('\n');
  }

  return `flex-me-in crashed: ${message}\nDetails were written to ${join(DATA_DIR, 'error.log')}`;
}
