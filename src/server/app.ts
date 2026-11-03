import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import type { AddressInfo } from 'net';
import { resolve } from 'path';
import { closeDb, getDb } from '../db/database.js';
import { invalidateAll } from '../state/epochs.js';
import { logError, redact } from '../utils/log.js';
import { assertSafeBinding, isLoopbackHost, type ServerConfig } from './config.js';
import { bearerToken, hostnameOf, HttpError, sendJson, tokensMatch } from './http.js';
import { createApiContext, handleApi, type ApiContext } from './api.js';
import { serveStatic } from './static.js';
import { startScheduler } from './scheduler.js';

/** How long shutdown waits for runs to settle before closing the DB anyway. */
const SHUTDOWN_GRACE_MS = 5000;

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

export interface RunningServer {
  server: Server;
  ctx: ApiContext;
  /** e.g. http://127.0.0.1:8787 */
  url: string;
  port: number;
  /** Aborts runs, stops accepting connections and closes the database. */
  close(): Promise<void>;
}

/**
 * Without a token the only thing keeping other parties out is the loopback
 * bind, and a browser can still be made to reach it: any page the user visits
 * can POST to 127.0.0.1 (CSRF), and a DNS-rebinding page can even read the
 * answers. So in that mode the Host must be a loopback name, and a request
 * carrying an Origin must come from one too (the Vite dev server included).
 * With a token neither applies: browsers never attach it on their own.
 */
function checkLocalOnly(req: IncomingMessage): void {
  const host = hostnameOf(req.headers.host);
  if (!host || !isLoopbackHost(host)) {
    throw new HttpError(403, 'Host not allowed; set FE_HUNT_TOKEN to serve other hosts');
  }
  const origin = req.headers.origin;
  if (origin !== undefined) {
    const originHost = hostnameOf(origin);
    if (!originHost || !isLoopbackHost(originHost)) {
      throw new HttpError(403, 'Cross-origin request refused');
    }
  }
}

function checkAuth(req: IncomingMessage, token: string): void {
  const given = bearerToken(req);
  if (!given || !tokensMatch(given, token)) {
    throw new HttpError(401, 'Missing or invalid token', { 'WWW-Authenticate': 'Bearer' });
  }
}

function reportError(context: string, err: unknown): void {
  logError(context, err);
  // The log file is inside the container's volume; stderr is what
  // `docker logs` shows.
  const text = err instanceof Error ? err.message : String(err);
  process.stderr.write(redact(`[${new Date().toISOString()}] ${context}: ${text}\n`));
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  config: ServerConfig,
  webDir: string,
  ctx: ApiContext
): Promise<void> {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);

  const url = new URL(req.url ?? '/', 'http://localhost');
  const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/');

  try {
    if (isApi) {
      if (!config.token) checkLocalOnly(req);
      else if (url.pathname !== '/api/health') checkAuth(req, config.token);
      await handleApi(req, res, url, ctx);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      throw new HttpError(405, 'Method not allowed', { Allow: 'GET, HEAD' });
    }
    // The page itself carries no secrets (the token lives in the client), but
    // a rebinding page could still frame or fetch it in no-token mode.
    if (!config.token) checkLocalOnly(req);
    await serveStatic(req, res, webDir, url.pathname);
  } catch (err) {
    if (res.headersSent) {
      reportError(`server: ${req.method} ${url.pathname}`, err);
      res.destroy();
      return;
    }
    if (err instanceof HttpError) {
      sendJson(res, err.status, { error: err.message }, err.headers);
      return;
    }
    reportError(`server: ${req.method} ${url.pathname}`, err);
    sendJson(res, 500, { error: 'Internal server error' });
  }
}

/**
 * Opens the database and starts listening. Rejects, without listening, on an
 * unsafe binding (see `assertSafeBinding`) or a database that won't open.
 */
export async function startServer(config: ServerConfig): Promise<RunningServer> {
  assertSafeBinding(config);
  // Open (and migrate) up front, so a broken native build or an unwritable
  // data dir fails at start rather than on the first request.
  getDb();

  const webDir = resolve(config.webDir);
  const ctx = createApiContext(Boolean(config.token));
  const server = createServer((req, res) => {
    void handle(req, res, config, webDir, ctx);
  });
  // Slow-loris protection: a phone on a flaky network still sends a request
  // within seconds.
  server.headersTimeout = 20_000;
  server.requestTimeout = 30_000;

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(config.port, config.host, () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });
  server.on('error', (err) => reportError('server', err));

  const scheduler = config.refreshIntervalMs
    ? startScheduler(ctx.refresh, config.refreshIntervalMs)
    : undefined;

  const { port } = server.address() as AddressInfo;
  const displayHost = config.host.includes(':') ? `[${config.host}]` : config.host;

  let closing: Promise<void> | null = null;
  const close = () => {
    closing ??= (async () => {
      // Invalidate first: an aborted run that is past its last await would
      // otherwise still write to a database that is about to close.
      scheduler?.stop();
      invalidateAll();
      ctx.refresh.abort();
      ctx.ai.abort('Server shutting down');
      const stopped = new Promise<void>((done) => server.close(() => done()));
      server.closeIdleConnections();
      const grace = new Promise<void>((done) => setTimeout(done, SHUTDOWN_GRACE_MS).unref());
      await Promise.race([Promise.all([ctx.refresh.settled(), ctx.ai.settled()]), grace]);
      server.closeAllConnections();
      await Promise.race([stopped, grace]);
      closeDb();
    })();
    return closing;
  };

  return { server, ctx, url: `http://${displayHost}:${port}`, port, close };
}
