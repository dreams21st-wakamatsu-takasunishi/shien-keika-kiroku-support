const WORKER_VERSION = new URL(self.location.href).searchParams.get('v') || 'local';
const APP_SCOPE = new URL(self.registration.scope);
const LEGACY_CACHE_PREFIX = 'support-record-shell-';
const CACHE_PREFIX = `${LEGACY_CACHE_PREFIX}${encodeURIComponent(APP_SCOPE.pathname)}:`;
const CACHE_NAME = `${CACHE_PREFIX}${WORKER_VERSION}`;
// Keep two previous releases for tabs that have not accepted the update yet.
const RETAINED_CACHE_COUNT = 3;
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './app-icon.svg',
];

function isAppUrl(url) {
  return url.origin === APP_SCOPE.origin && url.pathname.startsWith(APP_SCOPE.pathname);
}

function isStaticAsset(url) {
  return !url.search && (
    url.pathname.startsWith(`${APP_SCOPE.pathname}assets/`)
    || SHELL_FILES.some((path) => new URL(path, APP_SCOPE).pathname === url.pathname)
  );
}

async function matchAppCache(request, includePrevious = false) {
  try {
    const current = await caches.open(CACHE_NAME);
    const cached = await current.match(request);
    if (cached || !includePrevious) return cached;
    const keys = await caches.keys();
    // Legacy cache names were not scoped. Read exact asset URLs for compatibility,
    // but never delete those caches because they could belong to another app.
    for (const key of keys.reverse()) {
      if (key === CACHE_NAME || !key.startsWith(LEGACY_CACHE_PREFIX)) continue;
      if (!key.startsWith(CACHE_PREFIX) && key.includes(':')) continue;
      const previous = await (await caches.open(key)).match(request);
      if (previous) return previous;
    }
  } catch {
    // Unavailable/full browser storage must not prevent online use.
  }
  return undefined;
}

async function fetchStaticAsset(request) {
  const cached = await matchAppCache(request, true);
  if (cached) return cached; // Hashed assets do not need background re-fetches.
  const response = await fetch(request);
  if (response.ok) {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    } catch {
      // Serve the network response even if saving the optional cache failed.
    }
  }
  return response;
}

self.addEventListener('install', (event) => {
  // A new worker waits until the user accepts the update. This keeps the old
  // cache available to tabs that are still running the previous application.
  event.waitUntil(cacheApplicationShell());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

async function cacheApplicationShell() {
  const cache = await caches.open(CACHE_NAME);
  const manifestResponse = await fetch('./asset-manifest.json', { cache: 'no-store' });
  if (!manifestResponse.ok) throw new Error('Application asset manifest is unavailable.');
  const manifest = await manifestResponse.json();
  const assetPaths = Array.isArray(manifest.assets)
    ? manifest.assets.filter((path) => {
      if (typeof path !== 'string' || !path.startsWith('./assets/')) return false;
      const url = new URL(path, APP_SCOPE);
      return isAppUrl(url) && isStaticAsset(url);
    })
    : [];
  await cache.addAll([...new Set([...SHELL_FILES, ...assetPaths])]);
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        const previous = keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME);
        return Promise.all(previous.slice(0, Math.max(0, previous.length - (RETAINED_CACHE_COUNT - 1)))
          .map((key) => caches.delete(key)));
      })
      .catch(() => undefined)
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!isAppUrl(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        // The installed shell stays version-consistent; do not overwrite it with
        // a newer HTML response while other tabs still use the old worker.
        .catch(async () => (
          await matchAppCache(new URL('./index.html', APP_SCOPE).href)
          || await matchAppCache(new URL('./', APP_SCOPE).href)
          || Response.error()
        ))
    );
    return;
  }

  // In particular, version.json?checkedAt=... must never accumulate in cache.
  // API responses and data exports are not application-shell assets either.
  if (!isStaticAsset(url)) return;
  event.respondWith(fetchStaticAsset(request).catch(() => Response.error()));
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || '支援経過記録サポート';
  const options = {
    body: payload.body || '新しいお知らせがあります。',
    icon: './app-icon.svg',
    badge: './app-icon.svg',
    tag: payload.tag || 'support-announcement',
    data: { url: payload.url || './' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let targetUrl = APP_SCOPE;
  try {
    const candidate = new URL(event.notification.data?.url || './', APP_SCOPE);
    if (isAppUrl(candidate)) targetUrl = candidate;
  } catch { /* Ignore malformed notification URLs. */ }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => isAppUrl(new URL(client.url)));
      if (existing) {
        // Focus without reloading: a notification must not discard an open draft.
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl.href);
    })
  );
});
