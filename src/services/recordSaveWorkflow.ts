import type { SupportRecord } from '../types';

export type RecordSaveOutcome =
  | { status: 'saved'; records: SupportRecord[] }
  | { status: 'cancelled' };

export interface RecordOverwritePair {
  existing: SupportRecord;
  proposed: SupportRecord;
}

/** Use the database identity and the version that the user actually previewed. */
export function planRecordSave(incoming: SupportRecord[], existing: SupportRecord[]) {
  const comparisons: RecordOverwritePair[] = [];
  const keys = new Set<string>();
  const records = incoming.map((record) => {
    const key = JSON.stringify([record.childId, record.date]);
    if (keys.has(key)) throw new Error('保存対象に同じ児童・日付が重複しています。');
    keys.add(key);
    const matches = existing.filter((item) => item.id === record.id
      || (item.childId === record.childId && item.date === record.date));
    if (matches.length > 1) throw new Error(`${record.childName}の保存済み記録が複数あります。記録一覧で確認してください。`);
    const previous = matches[0];
    if (!previous) return record;
    const proposed: SupportRecord = {
      ...record,
      id: previous.id,
      version: previous.version,
      createdAt: previous.createdAt,
      // A newly started draft does not own approval or service metadata.
      ...(record.id !== previous.id ? {
        approvalStatus: previous.approvalStatus,
        jihatsukanComment: previous.jihatsukanComment,
        reviewIssues: previous.reviewIssues,
        reviewedBy: previous.reviewedBy,
        reviewedAt: previous.reviewedAt,
        serviceStartTime: previous.serviceStartTime,
        serviceEndTime: previous.serviceEndTime,
        transportation: previous.transportation,
        supportPlanId: previous.supportPlanId,
        fiveDomains: previous.fiveDomains,
        goalProgress: previous.goalProgress,
      } : {}),
    };
    comparisons.push({ existing: previous, proposed });
    return proposed;
  });
  return { records, comparisons };
}

interface ChildDraftCollection {
  selectedChildIds: string[];
  activeChildId: string;
  childDrafts: Record<string, unknown>;
  childStepIds: Record<string, string>;
  childTemplateIds: Record<string, string>;
  updatedAt?: string;
}

/** Remove saved children from every draft index without changing the others. */
export function removeSavedDraftChildren<T extends ChildDraftCollection>(draft: T, childIds: string[]): T {
  const removed = new Set(childIds);
  const selectedChildIds = draft.selectedChildIds.filter((id) => !removed.has(id));
  const omit = <V,>(values: Record<string, V>) => Object.fromEntries(
    Object.entries(values).filter(([id]) => !removed.has(id)),
  );
  return {
    ...draft,
    selectedChildIds,
    activeChildId: selectedChildIds.includes(draft.activeChildId) ? draft.activeChildId : selectedChildIds[0] || '',
    childDrafts: omit(draft.childDrafts),
    childStepIds: omit(draft.childStepIds),
    childTemplateIds: omit(draft.childTemplateIds),
    updatedAt: new Date().toISOString(),
  };
}

/** In-flight autosaves must finish before saved children are removed remotely. */
export function createDraftWriteQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(write: () => Promise<T>): Promise<T> {
      const result = tail.then(write);
      tail = result.catch(() => undefined);
      return result;
    },
    idle: () => tail,
  };
}
