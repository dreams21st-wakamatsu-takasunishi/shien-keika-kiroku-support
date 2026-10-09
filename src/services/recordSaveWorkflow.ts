import type { SupportRecord } from '../types';

export type RecordSaveOutcome =
  | { status: 'saved'; records: SupportRecord[] }
  | { status: 'cancelled' };

export interface RecordOverwritePair {
  existing: SupportRecord;
  proposed: SupportRecord;
}

/** Deleted rows reserve their IDs forever; never revive or overwrite them. */
export function replaceDeletedRecordIds(incoming: SupportRecord[], deletedIds: string[], newId: () => string) {
  const reserved = new Set([...deletedIds, ...incoming.map(record => record.id)]);
  return incoming.map(record => {
    if (!deletedIds.includes(record.id)) return record;
    if (record.version) throw new Error('編集中の保存済み記録は削除されています。入力内容は残しています。管理者に確認してください。');
    const id = newId();
    if (!id || reserved.has(id)) throw new Error('新しい記録IDを生成できませんでした。入力内容は残しています。');
    reserved.add(id);
    return { ...record, id, version: undefined };
  });
}

/** The same normalized payload is used for both sending and uncertain-save recovery. */
export function recordSavePayload(organizationId: string, record: SupportRecord) {
  const time = (value?: string) => value ? (/^\d{2}:\d{2}$/.test(value) ? `${value}:00` : value) : null;
  return {
    organization_id: organizationId, id: record.id,
    template_id: record.templateId, template_name: record.templateName, template_type: record.templateType,
    child_id: record.childId, child_name: record.childName, record_date: record.date,
    attendance: record.attendance, attendance_note: record.attendanceNote || null,
    expression: record.expressions.join('、'), expression_note: record.expressionNote || null,
    snack: record.snack, snack_note: record.snackNote || null,
    recorder_profile_id: record.recorderId || null, recorder_name: record.recorderName,
    service_start_time: time(record.serviceStartTime), service_end_time: time(record.serviceEndTime),
    transportation: record.transportation || null, support_plan_id: record.supportPlanId || null,
    five_domains: record.fiveDomains || [], goal_progress: record.goalProgress || [],
    section_answers: record.sectionAnswers, skipped_question_ids: record.skippedQuestionIds || [],
    template_snapshot: { id: record.templateId, name: record.templateName, type: record.templateType, sections: record.templateSectionsSnapshot || [] },
    synthesized_summary: record.synthesizedSummary || null, approval_status: record.approvalStatus,
    review_comment: record.jihatsukanComment || null, review_issues: record.reviewIssues || [],
    reviewer_name: record.reviewedBy || null, reviewed_at: record.reviewedAt || null,
    deleted_at: null, expected_version: record.version || 0,
  };
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([,v])=>v !== undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stableValue(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export function sameSavedRecordContent(a: SupportRecord, b: SupportRecord) {
  const content = (record: SupportRecord) => {
    const { id, expected_version, ...payload } = recordSavePayload('', record);
    return payload;
  };
  return stableValue(content(a)) === stableValue(content(b));
}

interface RecordSaveSnapshot { records: SupportRecord[]; deletedIds: string[] }
interface RecordWriteResult { id: string; version: number; outcome: 'inserted' | 'updated' | 'already_saved' }

/** Read again on uncertain success; never auto-overwrite differing content. */
export async function runRecordSaveWorkflow(incoming: SupportRecord[], dependencies: {
  load: (records: SupportRecord[]) => Promise<RecordSaveSnapshot>;
  write: (records: SupportRecord[]) => Promise<RecordWriteResult[]>;
  confirm: (pairs: RecordOverwritePair[]) => Promise<boolean>;
  newId: () => string;
  recovery?: (kind: 'deleted_id_replaced' | 'same_content_confirmed' | 'save_result_rechecked') => void;
}): Promise<RecordSaveOutcome> {
  let candidates = incoming;
  for (let attempt = 0; attempt < 3; attempt++) {
    const snapshot = await dependencies.load(candidates);
    const replaced = replaceDeletedRecordIds(candidates, snapshot.deletedIds, dependencies.newId);
    if (replaced.some((record,i)=>record.id !== candidates[i].id)) dependencies.recovery?.('deleted_id_replaced');
    candidates = replaced;
    const plan = planRecordSave(candidates, snapshot.records);
    const identical = plan.comparisons.filter(pair=>sameSavedRecordContent(pair.existing,pair.proposed));
    const comparisons = plan.comparisons.filter(pair=>!sameSavedRecordContent(pair.existing,pair.proposed));
    if (comparisons.length && !await dependencies.confirm(comparisons)) return { status: 'cancelled' };
    if (comparisons.some(pair=>pair.existing.approvalStatus === '確認済み')) throw new Error('確認済みの記録は上書きできません。入力内容は残しています。');
    const recovered = new Map(identical.map(pair=>[pair.proposed.id,pair.existing]));
    if (recovered.size) dependencies.recovery?.('same_content_confirmed');
    const pending = plan.records.filter(record=>!recovered.has(record.id));
    if (!pending.length) return { status: 'saved', records: plan.records.map(record=>recovered.get(record.id)!) };
    let results: RecordWriteResult[];
    try { results = await dependencies.write(pending); }
    catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'RECORD_DELETED') {
        dependencies.recovery?.('save_result_rechecked');
        candidates = plan.records;
        continue;
      }
      throw error;
    }
    const resultMap = new Map(results.map(result=>[result.id,result]));
    if (pending.some(record=>!resultMap.has(record.id))) throw new Error('保存結果を確認できません。入力内容は残しています。通信復旧後に再試行してください。');
    if (results.some(result=>result.outcome === 'already_saved')) {
      dependencies.recovery?.('save_result_rechecked');
      candidates = plan.records;
      continue;
    }
    return { status: 'saved', records: plan.records.map(record=>recovered.get(record.id) || { ...record, version: resultMap.get(record.id)!.version }) };
  }
  throw new Error('保存状態が繰り返し変化しているため停止しました。入力内容は残しています。管理者にエラー履歴を共有してください。');
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
