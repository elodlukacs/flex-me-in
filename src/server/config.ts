import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

export interface ServerConfig {
  host: string;
  port: number;
  /** Bearer token for /api; undefined means no auth (loopback only). */
  token?: string;
  /** The PWA's build output, served as static files. */
  webDir: string;
  /** Fetch every source this often; undefined or 0 disables the schedule. */
  refreshIntervalMs?: number;
}

export const DEFAULT_PORT = 8787;
export const DEFAULT_HOST = '127.0.0.1';
/** FE_HUNT_REFRESH_HOURS default. 0 turns scheduled refreshes off. */
export const DEFAULT_REFRESH_HOURS = 6;

/** Thrown for settings the server must not start with. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Hostnames that only the local machine can reach. `localhost` counts: it can
 * in theory resolve elsewhere, but only by the user's own hosts file.
 */
export function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    h === 'localhost' ||
    h === '::1' ||
    /^127(\.\d{1,3}){3}$/.test(h) ||
    /^::ffff:127(\.\d{1,3}){3}$/.test(h)
  );
}

/**
 * The bundled server lives at dist/server.js next to dist/web; run from
 * source (tsx) it is src/server/index.ts, two levels below the repo root.
 */
function defaultWebDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, 'web'), join(here, '..', '..', 'dist', 'web')];
  return candidates.find((dir) => existsSync(join(dir, 'index.html'))) ?? candidates[0]!;
}

/**
 * Reads the server settings from the environment. Refuses a network-facing
 * bind without a token: the API exposes the job database and spends the
 * user's DeepSeek balance, so "anyone on the LAN" is not an acceptable default.
 */
export function resolveConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const host = env.HOST?.trim() || DEFAULT_HOST;

  const rawPort = env.PORT?.trim();
  const port = rawPort ? Number(rawPort) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new ConfigError(`PORT must be an integer between 0 and 65535, got "${rawPort}"`);
  }

  const token = env.FE_HUNT_TOKEN?.trim() || undefined;
  const webDir = env.FE_HUNT_WEB_DIR ? resolve(env.FE_HUNT_WEB_DIR) : defaultWebDir();

  const rawHours = env.FE_HUNT_REFRESH_HOURS?.trim();
  const hours = rawHours ? Number(rawHours) : DEFAULT_REFRESH_HOURS;
  // Under an hour would hammer LinkedIn for postings that barely change.
  if (!Number.isFinite(hours) || (hours !== 0 && hours < 1)) {
    throw new ConfigError(`FE_HUNT_REFRESH_HOURS must be 0 (off) or at least 1, got "${rawHours}"`);
  }
  const refreshIntervalMs = hours > 0 ? hours * 3_600_000 : undefined;

  const config: ServerConfig = { host, port, token, webDir, refreshIntervalMs };
  assertSafeBinding(config);
  return config;
}

export function assertSafeBinding({ host, token }: Pick<ServerConfig, 'host' | 'token'>): void {
  if (!token && !isLoopbackHost(host)) {
    throw new ConfigError(
      `Refusing to listen on ${host} without FE_HUNT_TOKEN: anyone who can reach this ` +
        `address could read your jobs and spend your DeepSeek balance. Set FE_HUNT_TOKEN ` +
        `to a long random string (e.g. \`openssl rand -hex 32\`), or bind to 127.0.0.1.`
    );
  }
}
