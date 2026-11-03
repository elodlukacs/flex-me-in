// Must stay the first import: it populates process.env before any other
// module is evaluated.
import '../utils/env.js';
import { describeFatalError } from '../utils/fatal.js';
import { logError } from '../utils/log.js';

/**
 * HTTP entry point: serves the PWA from dist/web and the JSON API under /api.
 * Settings come from the environment (or ~/.flex-me-in/.env): HOST, PORT,
 * FE_HUNT_TOKEN, FE_HUNT_WEB_DIR, DEEPSEEK_API_KEY.
 */
async function main() {
  // Loaded dynamically, as in the TUI entry, so a module that fails to load
  // lands in the catch below instead of as a raw Node stack trace.
  const { resolveConfig } = await import('./config.js');
  const { startServer } = await import('./app.js');

  const config = resolveConfig();
  const running = await startServer(config);
  process.stdout.write(
    `fe-hunt server listening on ${running.url}` +
      (config.token ? ' (token required)' : ' (no token: loopback only)') +
      '\n'
  );

  let signalled = false;
  const shutdown = (signal: NodeJS.Signals) => {
    // A second Ctrl+C means "now", not "wait for the grace period again".
    if (signalled) process.exit(1);
    signalled = true;
    process.stdout.write(`${signal}: shutting down\n`);
    running.close().then(
      () => process.exit(0),
      (err: unknown) => {
        logError('server: shutdown', err);
        process.exit(1);
      }
    );
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err: unknown) => {
  // A refused binding is a settings problem, not a crash: no stack trace.
  if (err instanceof Error && err.name === 'ConfigError') {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
  logError('server: fatal', err);
  process.stderr.write(describeFatalError(err) + '\n');
  process.exit(1);
});
