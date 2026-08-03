import React, { useMemo, useState } from 'react';
import { CalendarCheck2, CheckCircle2, Clock3, Eye, FileEdit, Info, PlayCircle, Trash2, UserRoundCheck } from 'lucide-react';
import type { ChildProfile, RecordDraftSummary, SupportRecord } from '../types';
import { getLocalDateString, getRegularDaysForDate, getWeekdayFromDate } from '../utils/weekdays';
import { ChildInfoDialog } from './ChildInfoDialog';

interface DailyOperationsPanelProps {
  childrenList: ChildProfile[];
  records: SupportRecord[];
  drafts: RecordDraftSummary[];
  currentUserId?: string;
  currentRecorderId?: string;
  canManageDrafts?: boolean;
  onStartRecord: (childId: string, date: string) => void;
  onResumeDraft: (draftKey: string) => void;
  onViewDraft: (draftKey: string, ownerName?: string) => void;
  onTakeOverDraft: (draftKey: string, ownerName: string | undefined, childId: string) => void;
  onDeleteDraft: (draftKey: string) => void;
  onOpenRecord: (record: SupportRecord) => void;
}

export const DailyOperationsPanel: React.FC<DailyOperationsPanelProps> = ({
  childrenList,
  records,
  drafts,
  currentUserId,
  currentRecorderId,
  canManageDrafts = false,
  onStartRecord,
  onResumeDraft,
  onViewDraft,
  onTakeOverDraft,
  onDeleteDraft,
  onOpenRecord,
}) => {
  const [targetDate, setTargetDate] = useState(getLocalDateString());
  const [infoChild, setInfoChild] = useState<ChildProfile | null>(null);
  const weekday = getWeekdayFromDate(targetDate);

  const rows = useMemo(() => {
    const recordChildren = new Set(
      records.filter((record) => record.date === targetDate).map((record) => record.childId)
    );
    const draftChildren = new Set(
      drafts.filter((draft) => draft.date === targetDate).flatMap((draft) => draft.selectedChildIds)
    );
    return childrenList.filter((child) => {
      const regularDays = getRegularDaysForDate(child, targetDate);
      return regularDays.length === 0
        || regularDays.includes(weekday)
        || recordChildren.has(child.id)
        || draftChildren.has(child.id);
    }).map((child) => {
      const childRecords = records
        .filter((record) => record.childId === child.id && record.date === targetDate)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      const childDraft = drafts.find((draft) =>
        draft.date === targetDate && draft.selectedChildIds.includes(child.id)
      );
      return {
        child,
        record: childRecords[0],
        draft: childDraft,
        scheduled: getRegularDaysForDate(child, targetDate).includes(weekday),
        scheduleUnset: getRegularDaysForDate(child, targetDate).length === 0,
      };
    }).sort((left, right) => left.child.name.localeCompare(right.child.name, 'ja'));
  }, [childrenList, drafts, records, targetDate, weekday]);

  const counts = {
    missing: rows.filter((row) => !row.record && !row.draft).length,
    drafting: rows.filter((row) => !row.record && row.draft).length,
    saved: rows.filter((row) => row.record).length,
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-sm">
      <div className="border-b border-teal-100 bg-teal-50/70 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-black text-slate-900">
              <CalendarCheck2 className="h-5 w-5 text-teal-700" />本日の運用状況
            </h3>
            <p className="mt-1 text-xs text-slate-600">利用予定児童の記録状況を一画面で確認できます。</p>
          </div>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
            対象日
            <input
              type="date"
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm"
            />
          </label>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <StatusCount label="未入力" value={counts.missing} tone="rose" />
          <StatusCount label="入力中" value={counts.drafting} tone="amber" />
          <StatusCount label="保存済み" value={counts.saved} tone="emerald" />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-slate-500">
          {targetDate}（{weekday}）の利用予定児童はいません。
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map(({ child, record, draft, scheduled, scheduleUnset }) => {
            const sameAccount = !draft?.userId || !currentUserId || draft.userId === currentUserId;
            const ownedByAnotherRecorder = Boolean(
              draft?.recorderId
              && currentRecorderId
              && draft.recorderId !== currentRecorderId
            );
            const canResumeDraft = sameAccount && !ownedByAnotherRecorder;
            const canTakeOverDraft = Boolean(currentUserId) && !canResumeDraft;
            return (
            <article key={child.id} className="p-4 sm:flex sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setInfoChild(child)} className="flex min-h-10 items-center gap-1 rounded-lg px-1 text-left text-base font-black text-slate-900 hover:bg-slate-100">
                    {child.name}<Info className="h-4 w-4 text-teal-700" />
                  </button>
                  {scheduleUnset ? (
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">
                      曜日未設定
                    </span>
                  ) : !scheduled && (
                    <span className="rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-bold text-indigo-800">
                      追加利用
                    </span>
                  )}
                  {record ? (
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                      record.approvalStatus === '確認済み'
                        ? 'bg-emerald-100 text-emerald-800'
                        : record.approvalStatus === '要修正'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-sky-100 text-sky-800'
                    }`}>
                      {record.attendance.includes('欠席') ? '欠席登録済み' : record.approvalStatus}
                    </span>
                  ) : draft ? (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800">
                      {canResumeDraft ? '入力中' : '別職員が入力中'}
                    </span>
                  ) : (
                    <span className="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-bold text-rose-800">未入力</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {child.grade || '学年未設定'}
                  {record ? `・記録者 ${record.recorderName}` : draft?.recorderName ? `・入力者 ${draft.recorderName}` : ''}
                </p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 sm:mt-0 sm:justify-end">
                {record ? (
                  <button
                    type="button"
                    onClick={() => onOpenRecord(record)}
                    className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white sm:flex-none"
                  >
                    <CheckCircle2 className="h-4 w-4" />記録を確認
                  </button>
                ) : draft ? (
                  <>
                    {canResumeDraft ? (
                      <button
                        type="button"
                        onClick={() => onResumeDraft(draft.draftKey)}
                        className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 text-xs font-black text-slate-950 sm:flex-none"
                      >
                        <FileEdit className="h-4 w-4" />入力を再開
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onViewDraft(draft.draftKey, draft.recorderName)}
                        className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-4 text-xs font-black text-sky-900 sm:flex-none"
                      >
                        <Eye className="h-4 w-4" />入力状況を見る
                      </button>
                    )}
                    {canTakeOverDraft && (
                      <button
                        type="button"
                        onClick={() => onTakeOverDraft(draft.draftKey, draft.recorderName, child.id)}
                        className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-400 bg-amber-50 px-4 text-xs font-black text-amber-950 sm:flex-none"
                      >
                        <UserRoundCheck className="h-4 w-4" />引き継ぐ
                      </button>
                    )}
                    {(canResumeDraft || canManageDrafts) && (
                      <button
                        type="button"
                        aria-label={`${child.name}を含む下書きを削除`}
                        onClick={() => onDeleteDraft(draft.draftKey)}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-rose-200 text-rose-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onStartRecord(child.id, targetDate)}
                    className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-4 text-xs font-black text-white sm:flex-none"
                  >
                    <PlayCircle className="h-4 w-4" />記録を開始
                  </button>
                )}
              </div>
            </article>
            );
          })}
        </div>
      )}

      {drafts.length > 0 && (
        <details className="border-t border-slate-200 bg-slate-50">
          <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 text-xs font-black text-slate-700">
            <Clock3 className="h-4 w-4 text-amber-600" />
            入力中の記録一覧（{drafts.length}件）
          </summary>
          <div className="space-y-2 border-t border-slate-200 p-3">
            {drafts.map((draft) => {
              const childNames = draft.selectedChildIds
                .map((id) => childrenList.find((child) => child.id === id)?.name)
                .filter(Boolean)
                .join('、');
              const sameAccount = !draft.userId || !currentUserId || draft.userId === currentUserId;
              const ownedByAnotherRecorder = Boolean(
                draft.recorderId
                && currentRecorderId
                && draft.recorderId !== currentRecorderId
              );
              const canResumeDraft = sameAccount && !ownedByAnotherRecorder;
              const canTakeOverDraft = Boolean(currentUserId) && !canResumeDraft;
              return (
                <div key={draft.draftKey} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-slate-900">{childNames || '児童未選択'}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {draft.date || '日付未選択'}・{draft.recorderName || '記録者未選択'}・
                      {new Date(draft.updatedAt).toLocaleString('ja-JP')}更新
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canResumeDraft ? (
                      <button type="button" onClick={() => onResumeDraft(draft.draftKey)} className="min-h-10 flex-1 rounded-lg bg-amber-500 px-3 text-xs font-black text-slate-950 sm:flex-none">
                        再開
                      </button>
                    ) : (
                      <button type="button" onClick={() => onViewDraft(draft.draftKey, draft.recorderName)} className="flex min-h-10 items-center gap-1 rounded-lg border border-sky-300 bg-sky-50 px-3 text-[10px] font-black text-sky-900">
                        <Eye className="h-3.5 w-3.5" />入力状況を見る
                      </button>
                    )}
                    {canTakeOverDraft && draft.selectedChildIds.map((childId) => {
                      const childName = childrenList.find((child) => child.id === childId)?.name || '児童';
                      return (
                        <button
                          key={childId}
                          type="button"
                          onClick={() => onTakeOverDraft(draft.draftKey, draft.recorderName, childId)}
                          className="flex min-h-10 items-center gap-1 rounded-lg border border-amber-400 bg-amber-50 px-3 text-[10px] font-black text-amber-950"
                        >
                          <UserRoundCheck className="h-3.5 w-3.5" />
                          {draft.selectedChildIds.length > 1 ? `${childName}だけ引き継ぐ` : '引き継ぐ'}
                        </button>
                      );
                    })}
                    {(canResumeDraft || canManageDrafts) && (
                      <button type="button" onClick={() => onDeleteDraft(draft.draftKey)} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-rose-200 text-rose-700" aria-label="下書きを削除">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}
      <ChildInfoDialog child={infoChild} onClose={() => setInfoChild(null)} />
    </section>
  );
};

function StatusCount({ label, value, tone }: { label: string; value: number; tone: 'rose' | 'amber' | 'emerald' }) {
  const classes = {
    rose: 'border-rose-200 bg-rose-50 text-rose-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  };
  return (
    <div className={`rounded-xl border p-2 text-center ${classes[tone]}`}>
      <span className="block text-xl font-black">{value}</span>
      <span className="text-[10px] font-bold">{label}</span>
    </div>
  );
}
