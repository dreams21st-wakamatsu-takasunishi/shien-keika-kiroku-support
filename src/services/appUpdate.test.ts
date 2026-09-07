import assert from 'node:assert/strict';
import test from 'node:test';
import { AppUpdateController, AppUpdateSnapshot } from './appUpdate';

class Events extends EventTarget {
  listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (!listener) return;
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    super.addEventListener(type, listener);
  }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (!listener) return;
    this.listeners.get(type)?.delete(listener);
    super.removeEventListener(type, listener);
  }
  count(type: string) { return this.listeners.get(type)?.size || 0; }
  emit(type: string) { this.dispatchEvent(new Event(type)); }
}

class Worker extends Events {
  state = 'installing';
  messages: unknown[] = [];
  constructor(public scriptURL = 'https://example.test/app/sw.js?v=v2') { super(); }
  postMessage(message: unknown) { this.messages.push(message); }
}

function fixture() {
  const registration = Object.assign(new Events(), {
    waiting: null as Worker | null,
    installing: null as Worker | null,
    update: async () => { updates++; },
  });
  const serviceWorker = Object.assign(new Events(), {
    getRegistration: async () => registration as unknown as ServiceWorkerRegistration,
  });
  const snapshots: AppUpdateSnapshot[] = [];
  const timers = new Map<number, () => void>();
  let timerId = 0;
  let reloads = 0;
  let updates = 0;
  let fetches = 0;
  let fetchVersion = async (): Promise<string | undefined> => 'v2';
  const makeController = () => new AppUpdateController({
    version: 'v1', serviceWorker,
    fetchVersion: () => { fetches++; return fetchVersion(); },
    reload: () => { reloads++; },
    onChange: (snapshot) => snapshots.push(snapshot),
    schedule: (callback) => { timers.set(++timerId, callback); return timerId; },
    cancelSchedule: (id) => { timers.delete(id); },
  });
  const controller = makeController();
  return {
    controller, makeController, registration, serviceWorker, snapshots, timers,
    setFetch: (callback: typeof fetchVersion) => { fetchVersion = callback; },
    get reloads() { return reloads; },
    get fetches() { return fetches; },
    get updates() { return updates; },
  };
}

test('background version checks and controller changes never reload an editing tab', async () => {
  const f = fixture();
  await f.controller.start();
  assert.equal(await f.controller.check(), true);
  f.serviceWorker.emit('controllerchange');
  assert.equal(f.snapshots.at(-1)?.state, 'available');
  assert.equal(f.reloads, 0);
  assert.equal(f.updates, 1);
  f.controller.dispose();
});

test('focus and visibility checks share one in-flight request', async () => {
  const f = fixture();
  let finish!: (value: string) => void;
  f.setFetch(() => new Promise((resolve) => { finish = resolve; }));
  const first = f.controller.check();
  const second = f.controller.check();
  assert.equal(first, second);
  finish('v1');
  assert.equal(await first, false);
  assert.equal(f.fetches, 1);
  assert.equal(f.snapshots.at(-1)?.state, 'idle');
  f.controller.dispose();
});

test('late version result cannot change state or reload after disposal', async () => {
  const f = fixture();
  let finish!: (value: string) => void;
  f.setFetch(() => new Promise((resolve) => { finish = resolve; }));
  const pending = f.controller.refresh();
  f.controller.dispose();
  const count = f.snapshots.length;
  finish('v2');
  await pending;
  assert.equal(f.snapshots.length, count);
  assert.equal(f.reloads, 0);
  assert.equal(f.serviceWorker.count('controllerchange'), 0);
});

test('strict-mode remount removes registration and installing-worker listeners', async () => {
  const f = fixture();
  const worker = new Worker();
  f.registration.installing = worker;
  await f.controller.start();
  assert.equal(worker.count('statechange'), 1);
  f.controller.dispose();
  assert.equal(worker.count('statechange'), 0);
  assert.equal(f.registration.count('updatefound'), 0);
  const next = f.makeController();
  await next.start();
  assert.equal(worker.count('statechange'), 1);
  assert.equal(f.registration.count('updatefound'), 1);
  assert.equal(f.serviceWorker.count('controllerchange'), 1);
  next.dispose();
});

test('replacing an installing worker removes the previous listener', async () => {
  const f = fixture();
  const old = new Worker();
  f.registration.installing = old;
  await f.controller.start();
  const next = new Worker();
  f.registration.installing = next;
  f.registration.emit('updatefound');
  assert.equal(old.count('statechange'), 0);
  f.registration.waiting = next;
  next.state = 'installed';
  next.emit('statechange');
  assert.equal(f.snapshots.at(-1)?.availableVersion, 'v2');
  assert.equal(next.messages.length, 0);
  f.controller.dispose();
});

test('manual update reloads once and cancels its fallback timer', async () => {
  const f = fixture();
  const worker = new Worker();
  f.registration.waiting = worker;
  await f.controller.start();
  f.controller.apply();
  f.controller.apply();
  assert.equal(worker.messages.length, 1);
  assert.equal(f.timers.size, 1);
  const delayedReload = [...f.timers.values()][0];
  f.serviceWorker.emit('controllerchange');
  delayedReload();
  f.serviceWorker.emit('controllerchange');
  assert.equal(f.reloads, 1);
  assert.equal(f.timers.size, 0);
  assert.equal(f.snapshots.at(-1)?.state, 'idle');
  f.controller.dispose();
});

test('unmount cancels a pending manual-update fallback', async () => {
  const f = fixture();
  f.registration.waiting = new Worker();
  await f.controller.start();
  f.controller.apply();
  const callback = [...f.timers.values()][0];
  f.controller.dispose();
  callback();
  assert.equal(f.reloads, 0);
  assert.equal(f.timers.size, 0);
});

test('known update remains available during temporary network failure', async () => {
  const f = fixture();
  await f.controller.check();
  f.setFetch(async () => { throw new Error('offline'); });
  assert.equal(await f.controller.check(), true);
  assert.equal(f.snapshots.at(-1)?.state, 'available');
  assert.equal(f.reloads, 0);
  f.controller.dispose();
});

test('manual refresh works without a service-worker registration', async () => {
  const f = fixture();
  f.serviceWorker.getRegistration = async () => undefined;
  f.setFetch(async () => 'v1');
  await f.controller.refresh();
  assert.equal(f.reloads, 1);
  assert.equal(f.timers.size, 0);
  f.controller.dispose();
});

test('a waiting worker with the running version is not automatically activated', async () => {
  const f = fixture();
  const worker = new Worker('https://example.test/app/sw.js?v=v1');
  f.registration.waiting = worker;
  f.setFetch(async () => 'v1');
  await f.controller.start();
  assert.equal(await f.controller.check(), false);
  assert.equal(worker.messages.length, 0);
  f.controller.dispose();
});
