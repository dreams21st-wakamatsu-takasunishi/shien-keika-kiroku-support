import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { createMorningMeetingRealtime } from './morningMeetingRealtime';

const drain = async () => {
  for (let step = 0; step < 30; step += 1) await Promise.resolve();
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolveValue) => { resolve = resolveValue; });
  return { promise, resolve };
}

class FakeChannel {
  state = 'joining';
  online = true;
  socket = { isConnected: () => this.online };
  callback?: (status: string, error?: Error) => void;
  sends: Array<{ event: string; payload: Record<string, unknown> }> = [];
  tracks: Record<string, unknown>[] = [];
  sendResults: Array<Promise<string>> = [];
  trackResults: Array<Promise<string>> = [];
  teardownCount = 0;
  constructor(readonly topic: string) {}
  subscribe(callback: (status: string, error?: Error) => void) {
    this.callback = callback;
    return this;
  }
  emit(status: string, error?: Error) {
    this.state = status === 'SUBSCRIBED' ? 'joined' : status === 'CLOSED' ? 'closed' : 'errored';
    this.callback?.(status, error);
  }
  async send(message: { event: string; payload: Record<string, unknown> }) {
    assert.equal(this.state, 'joined', 'Never trigger SDK REST fallback');
    assert.equal(this.online, true);
    this.sends.push(message);
    return await (this.sendResults.shift() || Promise.resolve('ok'));
  }
  async track(activity: Record<string, unknown>) {
    this.tracks.push(activity);
    return await (this.trackResults.shift() || Promise.resolve('ok'));
  }
  teardown() { this.teardownCount += 1; }
}

class FakeClient {
  channels: FakeChannel[] = [];
  created: FakeChannel[] = [];
  configs: unknown[] = [];
  authCalls = 0;
  removeCalls = 0;
  removeWait?: Promise<void>;
  realtime = { setAuth: async () => { this.authCalls += 1; } };
  getChannels() { return this.channels; }
  channel(topic: string, config: unknown) {
    assert.ok(this.authCalls > 0, 'Authenticate before private join');
    const existing = this.channels.find((item) => item.topic === `realtime:${topic}`);
    if (existing) return existing;
    const next = new FakeChannel(`realtime:${topic}`);
    this.channels.push(next);
    this.created.push(next);
    this.configs.push(config);
    return next;
  }
  async removeChannel(channel: FakeChannel) {
    this.removeCalls += 1;
    channel.state = 'leaving';
    if (this.removeWait) await this.removeWait;
    this.channels = this.channels.filter((candidate) => candidate !== channel);
    channel.emit('CLOSED');
    return 'ok';
  }
}

function fixture(client = new FakeClient()) {
  const statuses: string[] = [];
  let connectedCount = 0;
  const service = createMorningMeetingRealtime(client as unknown as SupabaseClient, {
    topic: 'organization:test:morning-meeting:2026-09-07',
    sessionId: 'session-1',
    bindChannel: (_channel: RealtimeChannel) => undefined,
    onConnected: () => { connectedCount += 1; },
    onStatus: (status) => statuses.push(status),
  });
  return { client, service, statuses, connectedCount: () => connectedCount };
}

test('queues latest offline draft and presence, then sends after secure authenticated join', async () => {
  const context = fixture();
  context.service.start();
  context.service.send('content', { content: 'first' });
  context.service.send('content', { content: 'latest' });
  context.service.track({ editorName: 'staff' });
  await drain();
  const channel = context.client.created[0];
  assert.equal(channel.sends.length, 0);
  assert.deepEqual(context.client.configs[0], {
    config: { private: true, broadcast: { ack: true, self: false }, presence: { enabled: true, key: 'session-1' } },
  });
  channel.emit('SUBSCRIBED');
  await drain();
  assert.deepEqual(channel.sends.map((entry) => entry.payload.content), ['latest']);
  assert.deepEqual(channel.tracks, [{ editorName: 'staff' }]);
  assert.equal(context.connectedCount(), 1);
  context.service.stop();
  await drain();
});

test('failed ACK retries the newest superseding payload after reconnect', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const context = fixture();
  context.service.start();
  await drain();
  const first = context.client.created[0];
  first.emit('SUBSCRIBED');
  const ack = deferred<string>();
  first.sendResults.push(ack.promise);
  context.service.send('content', { content: 'old pending' });
  context.service.send('content', { content: 'new pending' });
  ack.resolve('timed out');
  await drain();
  assert.equal(context.statuses.at(-1), 'disconnected');
  t.mock.timers.tick(1000);
  await drain();
  const second = context.client.created[1];
  assert.ok(second);
  second.emit('SUBSCRIBED');
  await drain();
  assert.deepEqual(second.sends.map((entry) => entry.payload.content), ['new pending']);
  context.service.stop();
  await drain();
});

test('ACK of an older payload cannot discard a newer draft; targeted replies stay separate', async () => {
  const context = fixture();
  context.service.start();
  await drain();
  const channel = context.client.created[0];
  channel.emit('SUBSCRIBED');
  const ack = deferred<string>();
  channel.sendResults.push(ack.promise);
  context.service.send('content', { content: 'one' });
  context.service.send('content', { content: 'two' });
  context.service.send('snapshot', { targetSessionId: 'A', content: 'for A' });
  context.service.send('snapshot', { targetSessionId: 'B', content: 'for B' });
  ack.resolve('ok');
  await drain();
  assert.deepEqual(channel.sends.filter((entry) => entry.event === 'content').map((entry) => entry.payload.content), ['one', 'two']);
  assert.equal(channel.sends.filter((entry) => entry.event === 'snapshot').length, 2);
  context.service.stop();
  await drain();
});

test('late CLOSED and late ACK from a replaced channel cannot change the new connection', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const context = fixture();
  context.service.start();
  await drain();
  const first = context.client.created[0];
  first.emit('SUBSCRIBED');
  const ack = deferred<string>();
  first.sendResults.push(ack.promise);
  context.service.send('content', { content: 'retained' });
  first.emit('CHANNEL_ERROR');
  await drain();
  t.mock.timers.tick(1000);
  await drain();
  const second = context.client.created[1];
  second.emit('SUBSCRIBED');
  await drain();
  first.emit('CLOSED');
  ack.resolve('error');
  await drain();
  assert.equal(context.statuses.at(-1), 'connected');
  assert.equal(context.connectedCount(), 2);
  assert.deepEqual(second.sends.map((entry) => entry.payload.content), ['retained']);
  context.service.stop();
  await drain();
});

test('same-topic remount waits for prior cleanup rather than reusing its leaving channel', async () => {
  const client = new FakeClient();
  const first = fixture(client);
  first.service.start();
  await drain();
  client.created[0].emit('SUBSCRIBED');
  const removal = deferred<void>();
  client.removeWait = removal.promise;
  first.service.stop();
  const second = fixture(client);
  second.service.start();
  second.service.send('content', { content: 'new session' });
  await drain();
  assert.equal(client.created.length, 1);
  removal.resolve();
  await drain();
  assert.equal(client.created.length, 2);
  client.created[1].emit('SUBSCRIBED');
  await drain();
  assert.deepEqual(client.created[1].sends.map((entry) => entry.payload.content), ['new session']);
  second.service.stop();
  await drain();
});

test('failed presence retries and stop cancels retry, queue, and later callbacks', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const context = fixture();
  context.service.start();
  context.service.track({ editorName: 'staff' });
  await drain();
  const channel = context.client.created[0];
  channel.trackResults.push(Promise.resolve('error'));
  channel.emit('SUBSCRIBED');
  await drain();
  assert.equal(context.statuses.at(-1), 'disconnected');
  context.service.send('content', { content: 'not after stop' });
  context.service.stop();
  const statusCount = context.statuses.length;
  t.mock.timers.tick(30000);
  channel.emit('SUBSCRIBED');
  await drain();
  assert.equal(context.client.created.length, 1);
  assert.equal(context.statuses.length, statusCount);
  assert.equal(channel.sends.length, 0);
  assert.ok(channel.teardownCount > 0);
});

test('a stalled socket without SDK error callback recovers queued input after one retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const context = fixture();
  context.service.start();
  await drain();
  const first = context.client.created[0];
  first.emit('SUBSCRIBED');
  first.online = false;
  context.service.send('content', { content: 'queued during stall' });
  context.service.track({ editorName: 'staff' });
  await drain();
  assert.equal(first.sends.length, 0);
  assert.equal(context.statuses.at(-1), 'disconnected');
  t.mock.timers.tick(1000);
  await drain();
  const second = context.client.created[1];
  second.emit('SUBSCRIBED');
  await drain();
  assert.deepEqual(second.sends.map((entry) => entry.payload.content), ['queued during stall']);
  assert.deepEqual(second.tracks, [{ editorName: 'staff' }]);
  assert.equal(context.client.created.length, 2);
  context.service.stop();
  await drain();
});

test('receive guard becomes false when channel is replaced or service is stopped', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const client = new FakeClient();
  const guards: Array<() => boolean> = [];
  const service = createMorningMeetingRealtime(client as unknown as SupabaseClient, {
    topic: 'organization:test:morning-meeting:2026-09-07',
    sessionId: 'session-1',
    bindChannel: (_channel, isCurrent) => guards.push(isCurrent),
    onConnected: () => undefined,
    onStatus: () => undefined,
  });
  service.start();
  await drain();
  assert.equal(guards[0](), true);
  client.created[0].emit('CHANNEL_ERROR');
  assert.equal(guards[0](), false);
  await drain();
  t.mock.timers.tick(1000);
  await drain();
  assert.equal(guards[1](), true);
  service.stop();
  assert.equal(guards[1](), false);
  await drain();
});
