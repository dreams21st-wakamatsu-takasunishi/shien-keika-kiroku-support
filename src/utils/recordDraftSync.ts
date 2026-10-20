// Device-local view position is not a change to a child's support record.
const localKeys = new Set(['updatedAt', 'currentStepIndex', 'activeChildId', 'childStepIds', '__cloudSync']);
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function canonical(v: unknown): string | undefined {
  return JSON.stringify(v, (_key, item) => plain(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}
export interface SharedDraftBase<T> { revision: number; payload: T }
export function withoutDraftSyncMetadata<T extends object>(value: T): T {
  const copy = { ...value } as T & { __cloudSync?: unknown }; delete copy.__cloudSync; return copy;
}
function content<T extends object>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !localKeys.has(key)));
}
export function sameDraftContent<T extends object>(left: T, right: T): boolean { return canonical(content(left)) === canonical(content(right)); }

export function reconcileRecordDraft<T extends object>(base: T | null, local: T, remote: T): { payload: T; conflicts: string[]; dirty: boolean } {
  const conflicts: string[] = [];
  const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);
  const merge = (before: unknown, here: unknown, there: unknown, path: string): unknown => {
    if (equal(here, there)) return here;
    if (equal(here, before)) return there;
    if (equal(there, before)) return here;
    // Missing objects may be independently extended. Deletion versus editing is
    // a conflict; never revive a removed child/answer or combine arbitrary arrays.
    if ((plain(before) || before === undefined) && plain(here) && plain(there)) {
      const result: Record<string, unknown> = {};
      for (const key of new Set([...Object.keys(plain(before) ? before : {}), ...Object.keys(here), ...Object.keys(there)])) {
        const value = merge(plain(before) ? before[key] : undefined, here[key], there[key], path ? `${path}.${key}` : key);
        if (value !== undefined) result[key] = value;
      }
      return result;
    }
    conflicts.push(path); return here;
  };
  let merged: Record<string, unknown>;
  if (!base) {
    if (!sameDraftContent(local, remote) && (local as { selectedChildIds?: string[] }).selectedChildIds?.length) conflicts.push('unknown-baseline');
    merged = conflicts.length ? content(local) : content(remote);
  } else merged = merge(content(base), content(local), content(remote), '') as Record<string, unknown>;
  const payload = { ...remote, ...merged } as T;
  for (const key of Object.keys(remote)) if (!localKeys.has(key) && !(key in merged)) delete (payload as Record<string, unknown>)[key];
  for (const key of localKeys) if (key !== '__cloudSync' && key !== 'updatedAt' && key in local) Object.assign(payload, { [key]: (local as Record<string, unknown>)[key] });
  const selection = (payload as { selectedChildIds?: string[] }).selectedChildIds;
  if (selection && !selection.includes((payload as { activeChildId?: string }).activeChildId || '')) {
    Object.assign(payload, { activeChildId: selection[0] || '', currentStepIndex: (remote as { currentStepIndex?: number }).currentStepIndex ?? 0 });
  }
  return { payload: withoutDraftSyncMetadata(payload), conflicts, dirty: !sameDraftContent(payload, remote) };
}
