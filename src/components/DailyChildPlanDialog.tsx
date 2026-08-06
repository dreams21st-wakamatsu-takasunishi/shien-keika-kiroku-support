import React, { useMemo, useState } from 'react';
import { CalendarClock, Save, Trash2, X } from 'lucide-react';
import type { ChildProfile, DailyChildPlan, DailyDayPattern, DailyRecordFormat, Weekday } from '../types';

interface DailyChildPlanDialogProps {
  child: ChildProfile;
  date: string;
  weekday: Weekday;
  plan?: DailyChildPlan;
  onClose: () => void;
  onSave: (plan: DailyChildPlan) => Promise<void> | void;
  onDelete: (childId: string, date: string) => Promise<void> | void;
}

const patterns: DailyDayPattern[] = ['通常', '短縮授業', '午前のみ', '午後のみ', '個別'];

function createDefaultPlan(child: ChildProfile, date: string, weekday: Weekday): DailyChildPlan {
  const now = new Date().toISOString();
  const holidayLike = weekday === '土' || weekday === '日';
  const transport = child.transportSchedule?.find((schedule) => schedule.weekday === weekday);
  return {
    id: crypto.randomUUID(),
    childId: child.id,
    date,
    attendancePlan: '利用予定',
    serviceCategory: holidayLike ? '休日' : '平日',
    recordFormat: holidayLike ? '休日' : '平日',
    dayPattern: '通常',
    hasMorningProgram: holidayLike,
    hasLunch: holidayLike,
    hasAfternoonProgram: true,
    hasSnack: true,
    schoolEndTime: transport?.schoolEndTime,
    arrivalTime: transport?.pickupTime,
    departureTime: transport?.dropoffTime,
    createdAt: now,
    updatedAt: now,
  };
}

function applyPattern(plan: DailyChildPlan, pattern: DailyDayPattern): DailyChildPlan {
  if (pattern === '短縮授業') {
    return { ...plan, dayPattern: pattern, recordFormat: '休日', hasMorningProgram: false, hasLunch: true, hasAfternoonProgram: true, hasSnack: true };
  }
  if (pattern === '午前のみ') {
    return { ...plan, dayPattern: pattern, recordFormat: '休日', hasMorningProgram: true, hasLunch: true, hasAfternoonProgram: false, hasSnack: false };
  }
  if (pattern === '午後のみ') {
    return { ...plan, dayPattern: pattern, recordFormat: '平日', hasMorningProgram: false, hasLunch: false, hasAfternoonProgram: true, hasSnack: true };
  }
  if (pattern === '通常') {
    const holidayLike = plan.serviceCategory === '休日';
    return { ...plan, dayPattern: pattern, recordFormat: holidayLike ? '休日' : '平日', hasMorningProgram: holidayLike, hasLunch: holidayLike, hasAfternoonProgram: true, hasSnack: true };
  }
  return { ...plan, dayPattern: pattern };
}

export const DailyChildPlanDialog: React.FC<DailyChildPlanDialogProps> = ({
  child,
  date,
  weekday,
  plan,
  onClose,
  onSave,
  onDelete,
}) => {
  const initial = useMemo(() => plan || createDefaultPlan(child, date, weekday), [child, date, plan, weekday]);
  const [draft, setDraft] = useState<DailyChildPlan>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (updates: Partial<DailyChildPlan>) => setDraft((previous) => ({ ...previous, ...updates }));
  const chooseFormat = (recordFormat: DailyRecordFormat) => update({ recordFormat });

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...draft, updatedAt: new Date().toISOString() });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '日別予定を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!plan || !window.confirm(`${child.name}の${date}の日別変更を解除しますか？`)) return;
    setSaving(true);
    setError(null);
    try {
      await onDelete(child.id, date);
      onClose();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '日別変更を解除できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`${child.name}の日別利用予定`}>
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 p-4 backdrop-blur sm:p-5">
          <div>
            <p className="flex items-center gap-2 text-xs font-black text-teal-700"><CalendarClock className="h-4 w-4" />日別利用予定</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">{child.name}・{date}（{weekday}）</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600" aria-label="閉じる"><X className="h-5 w-5" /></button>
        </header>

        <div className="space-y-5 p-4 sm:p-6">
          <section>
            <h3 className="text-sm font-black text-slate-900">利用予定</h3>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(['利用予定', '追加利用', '欠席'] as const).map((value) => (
                <button key={value} type="button" onClick={() => update({ attendancePlan: value })} className={`min-h-11 rounded-xl border px-2 text-xs font-black ${draft.attendancePlan === value ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{value}</button>
              ))}
            </div>
          </section>

          <section className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-black text-slate-900">利用区分</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">事業所で管理する平日・休日の区分です。</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(['平日', '休日'] as const).map((value) => (
                  <button key={value} type="button" onClick={() => setDraft((previous) => applyPattern({ ...previous, serviceCategory: value }, previous.dayPattern))} className={`min-h-11 rounded-xl border text-xs font-black ${draft.serviceCategory === value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{value}</button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">記録形式</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">実際の過ごし方に合わせて質問を切り替えます。利用区分とは別に変更できます。</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(['平日', '休日'] as const).map((value) => (
                  <button key={value} type="button" onClick={() => chooseFormat(value)} className={`min-h-11 rounded-xl border text-xs font-black ${draft.recordFormat === value ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{value}形式</button>
                ))}
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-black text-slate-900">当日の流れ</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {patterns.map((pattern) => (
                <button key={pattern} type="button" onClick={() => setDraft((previous) => applyPattern(previous, pattern))} className={`min-h-10 rounded-full border px-4 text-xs font-black ${draft.dayPattern === pattern ? 'border-amber-500 bg-amber-100 text-amber-950' : 'border-slate-300 bg-white text-slate-700'}`}>{pattern}</button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                ['hasMorningProgram', '午前の取組'],
                ['hasLunch', '昼食'],
                ['hasAfternoonProgram', '午後の取組'],
                ['hasSnack', 'おやつ'],
              ] as const).map(([key, label]) => (
                <label key={key} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-black ${draft[key] ? 'border-teal-400 bg-teal-50 text-teal-900' : 'border-slate-200 bg-white text-slate-500'}`}>
                  <input type="checkbox" checked={draft[key]} onChange={(event) => update({ [key]: event.target.checked })} className="h-4 w-4 accent-teal-600" />
                  {label}
                </label>
              ))}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            {([
              ['schoolEndTime', '下校時刻'],
              ['arrivalTime', '来所予定'],
              ['departureTime', '退所予定'],
            ] as const).map(([key, label]) => (
              <label key={key} className="text-xs font-black text-slate-700">{label}
                <input type="time" value={draft[key] || ''} onChange={(event) => update({ [key]: event.target.value || undefined })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" />
              </label>
            ))}
          </section>

          <label className="block text-xs font-black text-slate-700">当日の補足
            <textarea rows={3} value={draft.note || ''} onChange={(event) => update({ note: event.target.value })} placeholder="学校行事、送迎変更、昼食の有無など" className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm" />
          </label>

          {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800" role="alert">{error}</p>}
        </div>

        <footer className="sticky bottom-0 flex gap-2 border-t border-slate-200 bg-white/95 p-4 backdrop-blur">
          {plan && <button type="button" disabled={saving} onClick={() => void handleDelete()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-rose-200 px-4 text-xs font-black text-rose-700 disabled:opacity-50"><Trash2 className="h-4 w-4" />日別変更を解除</button>}
          <button type="button" disabled={saving} onClick={() => void handleSave()} className="ml-auto flex min-h-12 min-w-36 items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 text-sm font-black text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? '保存中…' : '保存'}</button>
        </footer>
      </div>
    </div>
  );
};
