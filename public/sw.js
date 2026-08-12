const WORKER_VERSION = new URL(self.location.href).searchParams.get('v') || 'local';
const CACHE_NAME = `support-record-shell-${WORKER_VERSION}`;
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './app-icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(cacheApplicationShell().then(() => self.skipWaiting()));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

async function cacheApplicationShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(SHELL_FILES);

  // Vite adds hashed JavaScript and CSS filenames to index.html at build time.
  // Cache those critical files during the first install so the app can reopen
  // offline without requiring a second online page load.
  const indexResponse = await fetch('./index.html', { cache: 'no-store' });
  const indexHtml = await indexResponse.text();
  const assetPaths = Array.from(
    indexHtml.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g),
    (match) => match[1]
  );
  if (assetPaths.length > 0) {
    await cache.addAll([...new Set(assetPaths)]);
  }
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
