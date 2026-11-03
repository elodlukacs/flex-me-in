/* fe-hunt service worker (hand-written, no build step of its own).
 *
 * The Vite build stamps BUILD and SHELL_ASSETS (see web/vite.config.ts), so
 * every deploy gets a new cache name and the page sees a waiting worker.
 *
 * - App shell (index.html, hashed /assets/*, icons, manifest): precached.
 *   Navigations are network-first so a new deploy is picked up when online.
 * - GET /api/jobs and /api/meta: network-first with a timeout, falling back to
 *   the last good response (marked with an `X-From-Cache: 1` header).
 * - Everything else under /api (POST/PATCH, refresh/AI status, health,
 *   descriptions) goes straight to the network and is never cached.
 */

const BUILD = /*BUILD*/'dev';
const SHELL_ASSETS = /*ASSETS*/[];

const SHELL_CACHE = `fe-hunt-shell-${BUILD}`;
const API_CACHE = 'fe-hunt-api-v1';
const KEEP = new Set([SHELL_CACHE, API_CACHE]);

const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  ...SHELL_ASSETS,
];

/** How long to wait for the network before answering an API GET from cache. */
const API_TIMEOUT_MS = 6000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith('fe-hunt-') && !KEEP.has(n)).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    if (url.pathname === '/api/jobs' || url.pathname === '/api/meta') {
      event.respondWith(networkFirstApi(event, request));
    }
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(navigation(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function navigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put('/', response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match('/', { cacheName: SHELL_CACHE });
    return cached || Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  // Hashed build assets never change, so they are safe to keep.
  if (response.ok && new URL(request.url).pathname.startsWith('/assets/')) {
    const cache = await caches.open(SHELL_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstApi(event, request) {
  const cache = await caches.open(API_CACHE);
  const network = fetch(request).then(async (response) => {
    if (response.ok) await cache.put(request, response.clone());
    return response;
  });
  // A late network answer still refreshes the cache for next time.
  event.waitUntil(network.catch(() => undefined));

  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, API_TIMEOUT_MS, null);
  });
  try {
    const response = await Promise.race([network, timeout]);
    if (response) return response;
  } catch {
    // offline: fall through to the cache
  } finally {
    clearTimeout(timer);
  }

  const cached = await cache.match(request);
  if (!cached) return network;
  const headers = new Headers(cached.headers);
  headers.set('X-From-Cache', '1');
  return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
}
