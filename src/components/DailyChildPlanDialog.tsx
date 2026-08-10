import React, { useMemo, useState } from 'react';
import { CalendarClock, RotateCcw, Save, Trash2, X } from 'lucide-react';
import type { ChildProfile, DailyChildPlan, TransportRouteSettings, Weekday } from '../types';
import { getDefaultDepartureTime, getTransportProgram } from '../utils/transportDeparture';

interface DailyChildPlanDialogProps {
  child: ChildProfile;
  date: string;
  weekday: Weekday;
  plan?: DailyChildPlan;
  routeSettings: TransportRouteSettings;
  onClose: () => void;
  onSave: (plan: DailyChildPlan) => Promise<void> | void;
  onDelete: (childId: string, date: string) => Promise<void> | void;
}

function createDefaultPlan(child: ChildProfile, date: string, weekday: Weekday, routeSettings: TransportRouteSettings): DailyChildPlan {
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
    departureTime: getDefaultDepartureTime(child, holidayLike ? '休日' : '平日', routeSettings),
    createdAt: now,
    updatedAt: now,
  };
}

export const DailyChildPlanDialog: React.FC<DailyChildPlanDialogProps> = ({
  child,
  date,
  weekday,
  plan,
  routeSettings,
  onClose,
  onSave,
  onDelete,
}) => {
  const initial = useMemo(() => {
    const fallback = createDefaultPlan(child, date, weekday, routeSettings);
    return plan ? { ...plan, departureTime: plan.departureTime || fallback.departureTime } : fallback;
  }, [child, date, plan, routeSettings, weekday]);
  const [draft, setDraft] = useState<DailyChildPlan>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const defaultDepartureTime = getDefaultDepartureTime(child, draft.serviceCategory, routeSettings);

  const update = (updates: Partial<DailyChildPlan>) => setDraft((previous) => ({ ...previous, ...updates }));
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
      <div className="max-h-[calc(100dvh-var(--app-safe-area-top,0px))] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-h-[92dvh] sm:rounded-3xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white/95 p-3 backdrop-blur sm:p-5">
          <div>
            <p className="flex items-center gap-2 text-xs font-black text-teal-700"><CalendarClock className="h-4 w-4" />日別利用予定</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">{child.name}・{date}（{weekday}）</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600" aria-label="閉じる"><X className="h-5 w-5" /></button>
        </header>

        <div className="space-y-4 p-3 sm:space-y-5 sm:p-6">
          <section>
            <h3 className="text-sm font-black text-slate-900">利用予定</h3>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(['利用予定', '追加利用', '欠席'] as const).map((value) => (
                <button key={value} type="button" onClick={() => update({ attendancePlan: value })} className={`min-h-11 rounded-xl border px-2 text-xs font-black ${draft.attendancePlan === value ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{value}</button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-black text-slate-900">本日の予定</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">記録画面の候補表示や送迎予定に反映します。実際に行う内容だけを選択してください。</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                ['hasMorningProgram', '午前の取組'],
                ['hasLunch', '昼食'],
                ['hasAfternoonProgram', '午後の取組'],
                ['hasSnack', 'おやつ'],
              ] as const).map(([key, label]) => (
                <label key={key} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-black ${draft[key] ? 'border-teal-400 bg-teal-50 text-teal-900' : 'border-slate-200 bg-white text-slate-500'}`}>
                  <input type="checkbox" checked={draft[key]} onChange={(event) => update({ [key]: event.target.checked, dayPattern: '個別' })} className="h-4 w-4 accent-teal-600" />
                  {label}
                </label>
              ))}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-black text-slate-700">迎え基準時刻
              <input type="time" value={draft.schoolEndTime || ''} onChange={(event) => update({ schoolEndTime: event.target.value || undefined })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" />
              <span className="mt-1 block text-[10px] font-normal text-slate-500">学校の下校時刻や、自宅等へ迎えに向かう基準時刻です。</span>
            </label>
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
              <div className="flex items-start justify-between gap-2">
                <label className="min-w-0 flex-1 text-xs font-black text-violet-950">退所予定時刻
                  <input type="time" value={draft.departureTime || ''} onChange={(event) => update({ departureTime: event.target.value || undefined })} className="mt-1 min-h-11 w-full rounded-xl border border-violet-300 bg-white px-3 text-sm" />
                </label>
                {draft.departureTime !== defaultDepartureTime && <button type="button" onClick={() => update({ departureTime: defaultDepartureTime })} className="mt-5 grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-violet-200 bg-white text-violet-700" aria-label="基本時刻へ戻す"><RotateCcw className="h-4 w-4" /></button>}
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-violet-900">基本：{draft.serviceCategory}・{getTransportProgram(child)} {defaultDepartureTime}{draft.departureTime !== defaultDepartureTime ? '（早退・延長などの当日変更）' : ''}</p>
            </div>
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
