const WORKER_VERSION = new URL(self.location.href).searchParams.get('v') || 'local';
const CACHE_NAME = `support-record-shell-${WORKER_VERSION}`;
const SHELL_FILES = [
  './',
  './index.html',
  './version.json',
  './asset-manifest.json',
  './manifest.webmanifest',
  './favicon.svg',
  './app-icon.svg',
];

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
  const manifest = manifestResponse.ok ? await manifestResponse.json() : { assets: [] };
  const assetPaths = Array.isArray(manifest.assets)
    ? manifest.assets.filter((path) => typeof path === 'string' && path.startsWith('./assets/'))
    : [];
  await cache.addAll([...new Set([...SHELL_FILES, ...assetPaths])]);
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => (
          await caches.match(request)
          || await caches.match('./index.html')
          || await caches.match('./')
        ))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
      return cached || network;
    })
  );
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
  const targetUrl = new URL(event.notification.data?.url || './', self.location.href).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.startsWith(self.location.origin));
      if (existing) {
        existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
