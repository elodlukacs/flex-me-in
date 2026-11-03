#!/usr/bin/env node
// Must stay the first import: it populates process.env before any other
// module is evaluated.
import './utils/env.js';
import React from 'react';
import { withFullScreen } from 'fullscreen-ink';
import { describeFatalError } from './utils/fatal.js';
import { logError } from './utils/log.js';

const LEAVE_ALT_SCREEN = '\x1b[?1049l';

let inAltScreen = false;
let closeDb: (() => void) | null = null;

async function main() {
  // Loaded dynamically so that a module failing to load lands in the catch
  // below instead of as a raw Node stack trace.
  const db = await import('./db/database.js');
  closeDb = db.closeDb;
  const { App } = await import('./app/App.js');

  // Open (and migrate) the database before taking over the screen: a missing
  // native build or an unwritable data dir then fails with a readable message
  // on the normal terminal.
  db.getDb();

  const ink = withFullScreen(<App />);
  inAltScreen = true;
  await ink.start();
  await ink.waitUntilExit();
  // fullscreen-ink leaves the alternate screen itself on a clean exit only.
  inAltScreen = false;
}

main().then(
  () => {
    closeDb?.();
    // A quit during a fetch otherwise leaves Node waiting on open sockets and
    // retry timers.
    process.exit(0);
  },
  (err: unknown) => {
    try {
      closeDb?.();
    } catch {
      // Already failing; the original error is the one worth reporting.
    }
    if (inAltScreen) process.stdout.write(LEAVE_ALT_SCREEN);
    logError('fatal', err);
    process.stderr.write(describeFatalError(err) + '\n');
    process.exit(1);
  }
);
