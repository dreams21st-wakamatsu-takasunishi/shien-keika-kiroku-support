import type { SupportRecord } from '../types';

/** Preserve unrelated rows and never replace a locally acknowledged newer
 * version with an earlier in-flight response. Missing changed IDs are removals
 * (soft deletion or loss of visibility), not permission to resurrect a row.
 */
export function mergeRecordRefresh(previous: SupportRecord[], incoming: SupportRecord[], changedIds: readonly string[]) {
  const changes = new Set(changedIds), next = new Map(incoming.map(record => [record.id, record]));
  const result = previous.flatMap(record => {
    if (!changes.has(record.id)) return [record];
    const updated = next.get(record.id); next.delete(record.id);
    if (!updated) return [];
    return [(record.version || 0) > (updated.version || 0) ? record : updated];
  });
  return [...result, ...next.values()];
}
