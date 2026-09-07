import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

interface MorningMeetingRealtimeOptions {
  topic: string;
  sessionId: string;
  bindChannel: (channel: RealtimeChannel, isCurrent: () => boolean) => void;
  onConnected: () => void;
  onStatus: (status: ConnectionStatus, error?: string) => void;
}

interface PendingBroadcast {
  event: string;
  payload: Record<string, unknown>;
}

// Supabase reuses channels by topic. Wait for a previous instance's leave ACK
// before asking for the same topic again (including React remounts).
const topicOperations = new WeakMap<SupabaseClient, Map<string, Promise<void>>>();

function serializeTopic(client: SupabaseClient, topic: string, operation: () => Promise<void>) {
  let topics = topicOperations.get(client);
  if (!topics) {
    topics = new Map();
    topicOperations.set(client, topics);
  }
  const previous = topics.get(topic) || Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  topics.set(topic, next);
  void next.then(() => {
    if (topics.get(topic) === next) topics.delete(topic);
  }, () => {
    if (topics.get(topic) === next) topics.delete(topic);
  });
  return next;
}

function connectionErrorMessage(error?: Error) {
  if (/permission|unauthorized|authorization|forbidden|policy|denied/i.test(error?.message || '')) {
    return '共同編集への接続が許可されませんでした。設定を確認しながら再接続します。';
  }
  return '共同編集の接続が途切れました。自動で再接続します。';
}

export function createMorningMeetingRealtime(
  client: SupabaseClient,
  options: MorningMeetingRealtimeOptions,
) {
  let running = false;
  let generation = 0;
  let channel: RealtimeChannel | null = null;
  let connected = false;
  let retryAttempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let latestActivity: Record<string, unknown> | undefined;
  let activityVersion = 0;
  let trackedVersion = -1;
  let trackInFlight = false;
  const pending = new Map<string, PendingBroadcast>();
  const inFlight = new Map<string, PendingBroadcast>();

  const isCurrent = (candidate: RealtimeChannel, candidateGeneration: number) =>
    running && channel === candidate && generation === candidateGeneration;

  const canSend = (candidate: RealtimeChannel) =>
    running && connected && candidate.state === 'joined' && candidate.socket.isConnected();

  const closeChannel = async (candidate: RealtimeChannel) => {
    try {
      await client.removeChannel(candidate);
    } catch {
      // Teardown below also stops SDK rejoin timers after a failed leave.
    } finally {
      candidate.teardown();
    }
  };

  const queueClose = (candidate: RealtimeChannel) => {
    void serializeTopic(client, options.topic, () => closeChannel(candidate)).catch(() => undefined);
  };

  const scheduleRetry = (message: string) => {
    if (!running) return;
    connected = false;
    options.onStatus('disconnected', message);
    if (retryTimer !== undefined) return;
    // Invalidate callbacks before unsubscribe: an old CLOSED must never alter
    // a replacement channel or accept an ACK for its pending payload.
    generation += 1;
    const previous = channel;
    channel = null;
    inFlight.clear();
    trackInFlight = false;
    trackedVersion = -1;
    if (previous) queueClose(previous);
    const delay = Math.min(15000, 1000 * 2 ** Math.min(retryAttempt, 4));
    retryAttempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      connect();
    }, delay);
  };

  const flushTrack = () => {
    const activeChannel = channel;
    if (activeChannel && connected && !canSend(activeChannel)) {
      scheduleRetry(connectionErrorMessage());
      return;
    }
    if (!activeChannel || !canSend(activeChannel) || !latestActivity || trackInFlight
      || trackedVersion === activityVersion) return;
    const activeGeneration = generation;
    const version = activityVersion;
    const activity = latestActivity;
    trackInFlight = true;
    void activeChannel.track(activity, { timeout: 5000 }).then((result) => {
      if (!isCurrent(activeChannel, activeGeneration)) return;
      trackInFlight = false;
      if (result !== 'ok') {
        scheduleRetry('共同編集者の表示を同期できませんでした。再接続します。');
        return;
      }
      trackedVersion = version;
      retryAttempt = 0;
      flushTrack();
    }).catch(() => {
      if (isCurrent(activeChannel, activeGeneration)) {
        trackInFlight = false;
        scheduleRetry('共同編集者の表示を同期できませんでした。再接続します。');
      }
    });
  };

  const flushBroadcasts = () => {
    const activeChannel = channel;
    if (activeChannel && connected && !canSend(activeChannel)) {
      scheduleRetry(connectionErrorMessage());
      return;
    }
    if (!activeChannel || !canSend(activeChannel)) return;
    const activeGeneration = generation;
    for (const [key, entry] of pending) {
      if (inFlight.has(key)) continue;
      inFlight.set(key, entry);
      // Only call send while joined, so the SDK cannot silently use REST.
      void activeChannel.send({ type: 'broadcast', event: entry.event, payload: entry.payload }, {
        timeout: 5000,
      }).then((result) => {
        if (!isCurrent(activeChannel, activeGeneration)) return;
        if (inFlight.get(key) === entry) inFlight.delete(key);
        if (result !== 'ok') {
          scheduleRetry('入力内容を共有できませんでした。再接続後に再送します。');
          return;
        }
        if (pending.get(key) === entry) pending.delete(key);
        retryAttempt = 0;
        flushBroadcasts();
      }).catch(() => {
        if (isCurrent(activeChannel, activeGeneration)) {
          if (inFlight.get(key) === entry) inFlight.delete(key);
          scheduleRetry('入力内容を共有できませんでした。再接続後に再送します。');
        }
      });
    }
  };

  const connect = () => {
    if (!running) return;
    const activeGeneration = ++generation;
    options.onStatus('connecting');
    void serializeTopic(client, options.topic, async () => {
      if (!running || generation !== activeGeneration) return;
      // setAuth() reads the current session via the SDK's token callback and
      // completes before the private channel sends its join request.
      await client.realtime.setAuth();
      if (!running || generation !== activeGeneration) return;
      for (const existing of client.getChannels().filter((candidate) =>
        candidate.topic === `realtime:${options.topic}`)) {
        await closeChannel(existing);
      }
      if (!running || generation !== activeGeneration) return;
      const nextChannel = client.channel(options.topic, {
        config: {
          private: true,
          broadcast: { ack: true, self: false },
          presence: { enabled: true, key: options.sessionId },
        },
      });
      channel = nextChannel;
      options.bindChannel(nextChannel, () => isCurrent(nextChannel, activeGeneration));
      nextChannel.subscribe((status, error) => {
        if (!isCurrent(nextChannel, activeGeneration)) return;
        if (status === 'SUBSCRIBED') {
          connected = true;
          trackedVersion = -1;
          options.onStatus('connected');
          options.onConnected();
          flushTrack();
          flushBroadcasts();
        } else {
          scheduleRetry(connectionErrorMessage(error));
        }
      }, 10000);
    }).catch(() => {
      if (running && generation === activeGeneration) {
        scheduleRetry('共同編集の認証・接続を確認できませんでした。再接続します。');
      }
    });
  };

  return {
    start() {
      if (running) return;
      running = true;
      retryAttempt = 0;
      connect();
    },
    stop() {
      running = false;
      generation += 1;
      connected = false;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      retryTimer = undefined;
      pending.clear();
      inFlight.clear();
      latestActivity = undefined;
      trackedVersion = -1;
      trackInFlight = false;
      const previous = channel;
      channel = null;
      if (previous) queueClose(previous);
    },
    send(event: string, payload: Record<string, unknown>) {
      if (!running) return;
      const target = typeof payload.targetSessionId === 'string' ? payload.targetSessionId : '';
      pending.set(JSON.stringify([event, target]), { event, payload });
      flushBroadcasts();
    },
    track(activity: Record<string, unknown>) {
      if (!running) return;
      latestActivity = activity;
      activityVersion += 1;
      flushTrack();
    },
  };
}
