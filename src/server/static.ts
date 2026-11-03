import type { IncomingMessage, ServerResponse } from 'http';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { extname, join, normalize, sep } from 'path';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  // Browsers accept a manifest served as JSON, but Chrome's installability
  // audit warns about anything but the registered type.
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

/**
 * Vite fingerprints everything under assets/, so a changed file gets a new
 * URL and the old one can be cached for good. Everything else keeps its name
 * across deploys and must be revalidated: a stale index.html points at assets
 * that no longer exist, and a stale sw.js never lets the update land.
 */
function cacheControl(relPath: string): string {
  return relPath.startsWith(`assets${sep}`)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
}

interface Resolved {
  path: string;
  rel: string;
  size: number;
  mtime: Date;
}

async function resolveFile(root: string, rel: string): Promise<Resolved | null> {
  const path = join(root, rel);
  // `normalize` collapses `..`; anything still outside the root is a traversal
  // attempt and is treated like a missing file.
  if (path !== root && !path.startsWith(root.endsWith(sep) ? root : root + sep)) return null;
  try {
    const info = await stat(path);
    if (!info.isFile()) return null;
    return { path, rel, size: info.size, mtime: info.mtime };
  } catch {
    return null;
  }
}

function send(req: IncomingMessage, res: ServerResponse, file: Resolved): void {
  const lastModified = file.mtime.toUTCString();
  const headers: Record<string, string | number> = {
    'Content-Type': CONTENT_TYPES[extname(file.path).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': cacheControl(file.rel),
    'Last-Modified': lastModified,
  };

  // Second-granularity, like the header itself. Lets `no-cache` files
  // revalidate with a 304 instead of a full download.
  const since = Date.parse(req.headers['if-modified-since'] ?? '');
  if (!Number.isNaN(since) && Math.floor(file.mtime.getTime() / 1000) <= Math.floor(since / 1000)) {
    res.writeHead(304, headers);
    res.end();
    return;
  }

  headers['Content-Length'] = file.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = createReadStream(file.path);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

function notFound(res: ServerResponse, message: string): void {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(message);
}

/**
 * Serves the PWA from `root`. Paths that name no file fall back to index.html
 * (client-side routes), except ones that look like files: a missing script
 * answered with HTML would be cached under its immutable URL and break the
 * app until the cache is cleared.
 */
export async function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  pathname: string
): Promise<void> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    notFound(res, 'Not found');
    return;
  }
  if (decoded.includes('\0')) {
    notFound(res, 'Not found');
    return;
  }

  const rel = normalize(decoded).replace(/^([/\\])+/, '');
  if (rel !== '' && rel !== '.') {
    const file = await resolveFile(root, rel);
    if (file) {
      send(req, res, file);
      return;
    }
    if (extname(rel) !== '' || rel.startsWith(`assets${sep}`)) {
      notFound(res, 'Not found');
      return;
    }
  }

  const index = await resolveFile(root, 'index.html');
  if (!index) {
    notFound(res, 'Web app not built: run `npm run build` (expected index.html in the web dir)');
    return;
  }
  send(req, res, index);
}
