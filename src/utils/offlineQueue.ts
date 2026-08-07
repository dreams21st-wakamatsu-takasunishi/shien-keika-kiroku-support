import type { SupportRecord } from '../types';

export interface PendingRecordSync {
  id: string;
  records: SupportRecord[];
  enqueuedAt: string;
  lastError?: string;
}

function queueKey(organizationId?: string, userId?: string) {
  return `support-record-sync-queue:${organizationId || 'local'}:${userId || 'local'}`;
}

export function loadPendingRecordSyncs(organizationId?: string, userId?: string): PendingRecordSync[] {
  try {
    const stored = localStorage.getItem(queueKey(organizationId, userId));
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? parsed as PendingRecordSync[] : [];
  } catch {
    return [];
  }
}

function storePendingRecordSyncs(
  organizationId: string | undefined,
  userId: string | undefined,
  items: PendingRecordSync[]
) {
  const key = queueKey(organizationId, userId);
  if (items.length === 0) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify(items));
}

export function enqueueRecordSync(
  organizationId: string | undefined,
  userId: string | undefined,
  records: SupportRecord[]
) {
  const existing = loadPendingRecordSyncs(organizationId, userId);
  const recordIds = new Set(records.map((record) => record.id));
  const withoutOlderCopies = existing
    .map((item) => ({
      ...item,
      records: item.records.filter((record) => !recordIds.has(record.id)),
    }))
    .filter((item) => item.records.length > 0);
  const queued: PendingRecordSync = {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    records,
    enqueuedAt: new Date().toISOString(),
  };
  const next = [...withoutOlderCopies, queued];
  storePendingRecordSyncs(organizationId, userId, next);
  return next;
}

export function removePendingRecordSync(
  organizationId: string | undefined,
  userId: string | undefined,
  queueId: string
) {
  const next = loadPendingRecordSyncs(organizationId, userId)
    .filter((item) => item.id !== queueId);
  storePendingRecordSyncs(organizationId, userId, next);
  return next;
}

export function markPendingRecordSyncError(
  organizationId: string | undefined,
  userId: string | undefined,
  queueId: string,
  error: string
) {
  const next = loadPendingRecordSyncs(organizationId, userId)
    .map((item) => item.id === queueId ? { ...item, lastError: error } : item);
  storePendingRecordSyncs(organizationId, userId, next);
  return next;
}

export function mergePendingRecords(
  remoteRecords: SupportRecord[],
  pendingItems: PendingRecordSync[]
) {
  const pendingRecords = pendingItems.flatMap((item) => item.records);
  const pendingIds = new Set(pendingRecords.map((record) => record.id));
  return [...pendingRecords, ...remoteRecords.filter((record) => !pendingIds.has(record.id))];
}
