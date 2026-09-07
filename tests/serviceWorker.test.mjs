import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const scope = 'https://example.test/support/';
const prefix = 'support-record-shell-%2Fsupport%2F:';
const currentCache = `${prefix}v4`;

function fixture() {
  const handlers = new Map();
  const stores = new Map();
  const deleted = [];
  const network = [];
  const added = [];
  const windows = [];
  const opened = [];
  let failStorage = false;
  let fetchResponse = async () => new Response('network');
  const keyOf = (request) => new URL(typeof request === 'string' ? request : request.url, scope).href;
  const storeFor = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  };
  const cacheStorage = {
    keys: async () => [...stores.keys()],
    delete: async (name) => { deleted.push(name); return stores.delete(name); },
    open: async (name) => {
      if (failStorage) throw new Error('storage unavailable');
      const store = storeFor(name);
      return {
        match: async (request) => store.get(keyOf(request))?.clone(),
        put: async (request, response) => { store.set(keyOf(request), response); },
        addAll: async (paths) => { added.push(...paths); },
      };
    },
  };
  vm.runInNewContext(source, {
    URL, Response, console,
    caches: cacheStorage,
    fetch: async (request, options) => { network.push(keyOf(request)); return fetchResponse(request, options); },
    self: {
      location: new URL(`${scope}sw.js?v=v4`),
      registration: { scope, showNotification: async () => {} },
      clients: {
        claim: async () => {},
        matchAll: async () => windows,
        openWindow: async (url) => { opened.push(url); },
      },
      addEventListener: (name, callback) => handlers.set(name, callback),
      skipWaiting: async () => {},
    },
  }, { filename: 'public/sw.js' });
  return {
    stores, deleted, network, added, windows, opened,
    failStorage: () => { failStorage = true; },
    setFetch: (callback) => { fetchResponse = callback; },
    put: (name, path, content) => { storeFor(name).set(keyOf(path), new Response(content)); },
    request: async (path, mode = 'cors', method = 'GET') => {
      let response;
      handlers.get('fetch')({
        request: { url: keyOf(path), method, mode },
        respondWith: (value) => { response = value; },
      });
      return response;
    },
    event: async (type, properties = {}) => {
      const promises = [];
      handlers.get(type)({ ...properties, waitUntil: (promise) => promises.push(promise) });
      await Promise.all(promises);
    },
  };
}

test('activation removes only this app cache and retains the two previous releases', async () => {
  const f = fixture();
  const names = ['other-app-cache', 'support-record-shell-legacy',
    'support-record-shell-%2Fanother%2F:v1', ...['v1', 'v2', 'v3', 'v4'].map((v) => prefix + v)];
  names.forEach((name) => f.put(name, './index.html', name));
  await f.event('activate');
  assert.deepEqual(f.deleted, [prefix + 'v1']);
  assert.equal(f.stores.has('other-app-cache'), true);
  assert.equal(f.stores.has(prefix + 'v2'), true);
});

test('a cached hashed asset is served offline without starting any background fetch', async () => {
  const f = fixture();
  f.put(currentCache, './assets/pdf-abc.js', 'cached PDF');
  f.setFetch(async () => { throw new Error('offline'); });
  const response = await f.request('./assets/pdf-abc.js');
  assert.equal(await response.text(), 'cached PDF');
  assert.deepEqual(f.network, []);
});

test('a tab running the previous release can load its old lazy chunk', async () => {
  const f = fixture();
  f.put(prefix + 'v3', './assets/pdf-old.js', 'previous PDF');
  f.setFetch(async () => new Response('not found', { status: 404 }));
  assert.equal(await (await f.request('./assets/pdf-old.js')).text(), 'previous PDF');
  assert.equal(f.network.length, 0);
});

test('legacy caches are read by exact URL without deleting them', async () => {
  const f = fixture();
  f.put('support-record-shell-old', './assets/old.js', 'legacy');
  assert.equal(await (await f.request('./assets/old.js')).text(), 'legacy');
  assert.equal(f.deleted.length, 0);
});

test('storage failure still serves an available online asset', async () => {
  const f = fixture();
  f.failStorage();
  assert.equal(await (await f.request('./assets/app.js')).text(), 'network');
});

test('offline cache miss returns a failed response without detached rejected promises', async () => {
  const f = fixture();
  f.setFetch(async () => { throw new Error('offline'); });
  const response = await f.request('./assets/missing.js');
  assert.equal(response.type, 'error');
});

test('version checks, API data, other apps and writes bypass the shell cache', async () => {
  const f = fixture();
  for (const url of ['./version.json?checkedAt=123', './asset-manifest.json', './api/records',
    'https://example.test/other/assets/file.js', 'https://supabase.example.test/rest/v1/records']) {
    assert.equal(await f.request(url), undefined);
  }
  assert.equal(await f.request('./assets/file.js', 'cors', 'POST'), undefined);
  assert.equal(f.network.length, 0);
  assert.equal(f.stores.size, 0);
});

test('offline navigation falls back to the current coherent shell', async () => {
  const f = fixture();
  f.put(prefix + 'v3', './index.html', 'old HTML');
  f.put(currentCache, './index.html', 'current HTML');
  f.setFetch(async () => { throw new Error('offline'); });
  assert.equal(await (await f.request('./?screen=records', 'navigate')).text(), 'current HTML');
});

test('online navigation does not overwrite the installed shell with a different release', async () => {
  const f = fixture();
  f.put(currentCache, './index.html', 'installed HTML');
  f.setFetch(async () => new Response('new HTML'));
  assert.equal(await (await f.request('./', 'navigate')).text(), 'new HTML');
  assert.equal(await f.stores.get(currentCache).get(scope + 'index.html').clone().text(), 'installed HTML');
});

test('failed asset-manifest fetch prevents installation of an incomplete update', async () => {
  const f = fixture();
  f.setFetch(async () => new Response('unavailable', { status: 503 }));
  await assert.rejects(f.event('install'), /manifest is unavailable/);
  assert.equal(f.added.length, 0);
});

test('install caches only shell assets and the validated manifest asset paths', async () => {
  const f = fixture();
  f.setFetch(async () => Response.json({ assets: [
    './assets/app-abc.js', './assets/app-abc.js', 'https://external.test/private',
    './assets/../../outside.js', './api/children', './assets/bad.js?query=1',
  ] }));
  await f.event('install');
  assert.equal(f.added.filter((path) => path === './assets/app-abc.js').length, 1);
  assert.equal(f.added.includes('./api/children'), false);
  assert.equal(f.added.includes('./assets/../../outside.js'), false);
  assert.equal(f.added.includes('./version.json'), false);
  assert.equal(f.added.includes('./assets/bad.js?query=1'), false);
});

test('notification focuses this app without navigating or discarding an existing draft', async () => {
  const f = fixture();
  let focused = 0;
  let navigated = 0;
  f.windows.push({ url: 'https://example.test/other/', focus: () => assert.fail('wrong app') });
  f.windows.push({ url: scope, focus: async () => { focused++; }, navigate: () => { navigated++; } });
  await f.event('notificationclick', { notification: { close() {}, data: { url: scope } } });
  assert.equal(focused, 1);
  assert.equal(navigated, 0);
  assert.deepEqual(f.opened, []);
});

test('notification opens only this app even when its payload contains an external URL', async () => {
  const f = fixture();
  await f.event('notificationclick', { notification: { close() {}, data: { url: 'https://external.test/' } } });
  assert.deepEqual(f.opened, [scope]);
});
