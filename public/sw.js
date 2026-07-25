const CACHE_NAME = 'support-record-shell-v2';
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './app-icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(cacheApplicationShell().then(() => self.skipWaiting()));
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
