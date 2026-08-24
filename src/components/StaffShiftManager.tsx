import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Save,
  X,
} from 'lucide-react';
import type {
  AttendanceRecord,
  AttendanceStatus,
  RecorderProfile,
  StaffEmploymentType,
  StaffShiftTemplate,
} from '../types';

interface StaffShiftManagerProps {
  templates: StaffShiftTemplate[];
  records: AttendanceRecord[];
  recorderProfiles: RecorderProfile[];
  selectedDate: string;
  onSaveRecords: (records: AttendanceRecord[]) => Promise<void> | void;
}

interface DayForm {
  recorderProfileId: string;
  date: string;
  status: AttendanceStatus;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  note: string;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const DAY_STATUSES: AttendanceStatus[] = ['勤務予定', '遅刻', '早退', '欠勤', '有給', '公休', '特別休暇', '研修'];
const NO_TIME_STATUSES: AttendanceStatus[] = ['欠勤', '有給', '公休', '特別休暇'];
const PART_TIME_WEEKDAY_DEFAULT = '__part_time_weekday_default__';
const PART_TIME_HOLIDAY_DEFAULT = '__part_time_holiday_default__';

export const StaffShiftManager: React.FC<StaffShiftManagerProps> = ({
  templates,
  records,
  recorderProfiles,
  selectedDate,
  onSaveRecords,
}) => {
  const activeProfiles = useMemo(
    () => recorderProfiles.filter((profile) => profile.active),
    [recorderProfiles],
  );
  const [month, setMonth] = useState(selectedDate.slice(0, 7));
  const [employmentFilter, setEmploymentFilter] = useState<'all' | StaffEmploymentType>('all');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [applyDate, setApplyDate] = useState(selectedDate);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [registerDaysOff, setRegisterDaysOff] = useState(true);
  const [dayForm, setDayForm] = useState<DayForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setMonth(selectedDate.slice(0, 7));
    setApplyDate(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    if (!selectedTemplateId && templates[0]) {
      setSelectedTemplateId(templates[0].id);
      setSelectedStaffIds(activeProfiles
        .filter((profile) => templates[0].targetEmploymentType === 'all'
          || (profile.employmentType || 'full_time') === templates[0].targetEmploymentType)
        .map((profile) => profile.id));
    }
  }, [activeProfiles, selectedTemplateId, templates]);

  const dates = useMemo(() => getMonthDates(month), [month]);
  const visibleProfiles = useMemo(
    () => activeProfiles.filter((profile) => employmentFilter === 'all'
      || (profile.employmentType || 'full_time') === employmentFilter),
    [activeProfiles, employmentFilter],
  );
  const monthRecords = useMemo(
    () => records.filter((record) => record.date.startsWith(month)),
    [month, records],
  );
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const partTimePattern = selectedTemplateId === PART_TIME_WEEKDAY_DEFAULT
    ? 'weekday'
    : selectedTemplateId === PART_TIME_HOLIDAY_DEFAULT
      ? 'holiday'
      : undefined;

  const fiscalSummary = useMemo(() => {
    const [year, monthNumber] = month.split('-').map(Number);
    const fiscalStart = `${monthNumber >= 4 ? year : year - 1}-04-01`;
    const fiscalEnd = `${monthNumber >= 4 ? year + 1 : year}-03-31`;
    const target = records.filter((record) => record.date >= fiscalStart && record.date <= fiscalEnd);
    return {
      label: `${fiscalStart.slice(0, 4)}年度`,
      publicHolidays: target.filter((record) => record.status === '公休').length,
      paidLeave: target.filter((record) => record.status === '有給').length,
      specialLeave: target.filter((record) => record.status === '特別休暇').length,
    };
  }, [month, records]);

  const toggleStaff = (profileId: string) => {
    setSelectedStaffIds((previous) => previous.includes(profileId)
      ? previous.filter((id) => id !== profileId)
      : [...previous, profileId]);
  };

  const chooseTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId === PART_TIME_WEEKDAY_DEFAULT || templateId === PART_TIME_HOLIDAY_DEFAULT) {
      setSelectedStaffIds(activeProfiles.filter((profile) => profile.employmentType === 'part_time').map((profile) => profile.id));
      setEmploymentFilter('part_time');
      return;
    }
    const template = templates.find((candidate) => candidate.id === templateId);
    if (!template) return;
    const matching = activeProfiles
      .filter((profile) => template.targetEmploymentType === 'all'
        || (profile.employmentType || 'full_time') === template.targetEmploymentType)
      .map((profile) => profile.id);
    setSelectedStaffIds(matching);
  };

  const applyTemplate = async (mode: 'day' | 'month') => {
    if (!selectedTemplate && !partTimePattern) return setMessage('勤務テンプレートまたはパート個別設定を選択してください。');
    const staff = activeProfiles.filter((profile) => selectedStaffIds.includes(profile.id));
    if (staff.length === 0) return setMessage('反映する職員を選択してください。');
    const targetDates = mode === 'day' ? [applyDate] : dates;
    const now = new Date().toISOString();
    const updates: AttendanceRecord[] = [];
    let skipped = 0;

    for (const profile of staff) {
      for (const date of targetDates) {
        const weekday = new Date(`${date}T12:00:00`).getDay();
        const patternDays = partTimePattern === 'weekday'
          ? profile.partTimeWeekdayWorkDays
          : partTimePattern === 'holiday'
            ? profile.partTimeHolidayWorkDays
            : undefined;
        const workdayIndexes = patternDays?.map((day) => WEEKDAYS.indexOf(day)) || [];
        const isWorkday = partTimePattern
          ? workdayIndexes.includes(weekday)
          : mode === 'day' || Boolean(selectedTemplate?.weekdays.includes(weekday));
        if (mode === 'month' && !isWorkday && !registerDaysOff) continue;
        const startTime = partTimePattern === 'weekday'
          ? profile.partTimeWeekdayStartTime
          : partTimePattern === 'holiday'
            ? profile.partTimeHolidayStartTime
            : selectedTemplate?.startTime;
        const endTime = partTimePattern === 'weekday'
          ? profile.partTimeWeekdayEndTime
          : partTimePattern === 'holiday'
            ? profile.partTimeHolidayEndTime
            : selectedTemplate?.endTime;
        if (isWorkday && (!startTime || !endTime)) {
          skipped += 1;
          continue;
        }
        const existing = records.find((record) => record.date === date && record.recorderProfileId === profile.id);
        const protectedRecord = existing && (
          existing.clockInAt
          || existing.clockOutAt
          || ['出勤中', '休憩中', '退勤済み', '有給', '特別休暇', '欠勤', '研修'].includes(existing.status)
        );
        if (mode === 'month' && protectedRecord) {
          skipped += 1;
          continue;
        }
        updates.push({
          id: existing?.id || createUuid(),
          recorderProfileId: profile.id,
          recorderName: profile.displayName,
          date,
          scheduledStartTime: isWorkday ? startTime : undefined,
          scheduledEndTime: isWorkday ? endTime : undefined,
          scheduledBreakMinutes: isWorkday ? (selectedTemplate?.breakMinutes || 0) : 0,
          status: isWorkday ? '勤務予定' : '公休',
          clockInAt: existing?.clockInAt,
          clockOutAt: existing?.clockOutAt,
          breakPeriods: existing?.breakPeriods || [],
          note: selectedTemplate?.note || (partTimePattern ? `パート個別設定（${partTimePattern === 'weekday' ? '平日利用' : '休日利用'}）` : existing?.note),
          deviceId: existing?.deviceId,
          lastActionByRecorderId: existing?.lastActionByRecorderId,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        });
      }
    }

    if (updates.length === 0) return setMessage('反映できる予定がありません。確定済みの打刻・休暇は月間反映で保護されます。');
    const label = mode === 'day' ? applyDate : month;
    if (!window.confirm(`${label}へ${updates.length}件の勤務予定を反映しますか？`)) return;
    setBusy(true);
    setMessage('');
    try {
      await onSaveRecords(updates);
      setMessage(`${updates.length}件を反映しました。${skipped ? ` 確定済み・休暇 ${skipped}件は変更していません。` : ''}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '勤務予定を反映できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  const openDay = (profile: RecorderProfile, date: string) => {
    const record = records.find((candidate) => candidate.recorderProfileId === profile.id && candidate.date === date);
    if (isClockedRecord(record)) {
      setMessage(`${profile.displayName}さんの${date}は打刻済みのため閲覧のみです。変更は打刻修正申請を使用してください。`);
      return;
    }
    setDayForm({
      recorderProfileId: profile.id,
      date,
      status: record?.status || '勤務予定',
      startTime: record?.scheduledStartTime || '09:00',
      endTime: record?.scheduledEndTime || '18:00',
      breakMinutes: record?.scheduledBreakMinutes || 0,
      note: record?.note || '',
    });
  };

  const saveDay = async () => {
    if (!dayForm) return;
    const profile = activeProfiles.find((candidate) => candidate.id === dayForm.recorderProfileId);
    if (!profile) return;
    const noTime = NO_TIME_STATUSES.includes(dayForm.status);
    if (!noTime && dayForm.startTime >= dayForm.endTime) return setMessage('終了時刻は開始時刻より後にしてください。');
    const existing = records.find((record) => record.recorderProfileId === profile.id && record.date === dayForm.date);
    const now = new Date().toISOString();
    setBusy(true);
    try {
      await onSaveRecords([{
        id: existing?.id || createUuid(),
        recorderProfileId: profile.id,
        recorderName: profile.displayName,
        date: dayForm.date,
        scheduledStartTime: noTime ? undefined : dayForm.startTime,
        scheduledEndTime: noTime ? undefined : dayForm.endTime,
        scheduledBreakMinutes: noTime ? 0 : dayForm.breakMinutes,
        status: dayForm.status,
        clockInAt: existing?.clockInAt,
        clockOutAt: existing?.clockOutAt,
        breakPeriods: existing?.breakPeriods || [],
        note: dayForm.note.trim() || undefined,
        deviceId: existing?.deviceId,
        lastActionByRecorderId: existing?.lastActionByRecorderId,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      }]);
      setDayForm(null);
      setMessage(`${profile.displayName}さんの${dayForm.date}の予定を保存しました。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '勤務予定を保存できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm">
      <div className="border-b border-indigo-100 bg-indigo-50/70 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black text-indigo-700">シフト管理</p>
            <h3 className="mt-1 flex items-center gap-2 font-black text-slate-950"><CalendarRange className="h-5 w-5 text-indigo-600" />月間シフト・休日管理</h3>
            <p className="mt-1 text-xs text-slate-600">勤務テンプレートを日・月単位で反映します。保存内容は予定表と職員配置ガントチャートへ自動反映されます。</p>
          </div>
          <p className="rounded-xl bg-white px-3 py-2 text-[11px] font-bold text-indigo-800">テンプレートの追加・編集は「管理者メニュー ＞ 勤務テンプレート」で行います。</p>
        </div>
      </div>

      <div className="grid grid-cols-3 border-b border-slate-100 bg-white">
        <Summary label={`${fiscalSummary.label} 公休`} value={`${fiscalSummary.publicHolidays}人日`} />
        <Summary label={`${fiscalSummary.label} 有給`} value={`${fiscalSummary.paidLeave}人日`} />
        <Summary label={`${fiscalSummary.label} 特別休暇`} value={`${fiscalSummary.specialLeave}人日`} />
      </div>

      <div className="space-y-3 border-b border-slate-200 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_180px_180px_auto_auto] lg:items-end">
          <label className="text-xs font-bold text-slate-700">勤務テンプレート
            <select value={selectedTemplateId} onChange={(event) => chooseTemplate(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
              <option value="">選択してください</option>
              <option value={PART_TIME_WEEKDAY_DEFAULT}>パート個別設定（平日利用）</option>
              <option value={PART_TIME_HOLIDAY_DEFAULT}>パート個別設定（休日利用）</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">反映日
            <input type="date" value={applyDate} onChange={(event) => setApplyDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" />
          </label>
          <label className="text-xs font-bold text-slate-700">表示する職員
            <select value={employmentFilter} onChange={(event) => setEmploymentFilter(event.target.value as 'all' | StaffEmploymentType)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
              <option value="all">全職員</option><option value="full_time">正職</option><option value="part_time">パート</option>
            </select>
          </label>
          <button type="button" disabled={busy || (!selectedTemplate && !partTimePattern)} onClick={() => void applyTemplate('day')} className="min-h-11 rounded-xl border border-indigo-300 px-4 text-sm font-black text-indigo-800 disabled:opacity-40">1日へ反映</button>
          <button type="button" disabled={busy || (!selectedTemplate && !partTimePattern)} onClick={() => void applyTemplate('month')} className="min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-black text-white disabled:opacity-40">月全体へ反映</button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-500">反映する職員</span>
          <button type="button" onClick={() => setSelectedStaffIds(visibleProfiles.map((profile) => profile.id))} className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-bold">表示中を全選択</button>
          <button type="button" onClick={() => setSelectedStaffIds([])} className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-bold">解除</button>
          {visibleProfiles.map((profile) => (
            <label key={profile.id} className={`flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${selectedStaffIds.includes(profile.id) ? 'border-indigo-400 bg-indigo-50 text-indigo-900' : 'border-slate-200 text-slate-600'}`}>
              <input type="checkbox" checked={selectedStaffIds.includes(profile.id)} onChange={() => toggleStaff(profile.id)} className="accent-indigo-600" />{profile.displayName}
            </label>
          ))}
          <label className="ml-auto flex items-center gap-2 text-[11px] font-bold text-slate-600"><input type="checkbox" checked={registerDaysOff} onChange={(event) => setRegisterDaysOff(event.target.checked)} className="accent-indigo-600" />勤務曜日以外を公休として登録</label>
        </div>

        {templates.length === 0 && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">共通勤務テンプレートは未登録です。パート個別設定はそのまま利用できます。共通パターンは管理者メニューから追加してください。</p>}
        {message && <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">{message}</p>}
      </div>

      <div className="flex items-center justify-between gap-3 p-3">
        <button type="button" onClick={() => setMonth(moveMonth(month, -1))} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-300"><ChevronLeft className="h-5 w-5" /></button>
        <div className="text-center"><strong className="block text-base text-slate-950">{month.replace('-', '年')}月</strong><span className="text-[10px] text-slate-500">日付を選ぶと個別編集できます</span></div>
        <button type="button" onClick={() => setMonth(moveMonth(month, 1))} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-300"><ChevronRight className="h-5 w-5" /></button>
      </div>

      <div className="space-y-4 border-t border-slate-100 bg-slate-50/60 p-3">
        {chunkDatesByWeek(dates).map((weekDates) => (
          <section key={weekDates[0]} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <h4 className="mb-3 text-xs font-black text-slate-700">{formatWeekRange(weekDates)}</h4>
            <div className="space-y-3">
              {visibleProfiles.map((profile) => {
                const profileRecords = monthRecords.filter((record) => record.recorderProfileId === profile.id);
                const workDays = profileRecords.filter((record) => !NO_TIME_STATUSES.includes(record.status)).length;
                const scheduledMinutes = profileRecords.reduce((total, record) => total + getScheduledMinutes(record), 0);
                return <div key={profile.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-2">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <strong className="mr-auto text-xs text-slate-900">{profile.displayName}</strong>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${profile.employmentType === 'part_time' ? 'bg-violet-100 text-violet-800' : 'bg-emerald-100 text-emerald-800'}`}>{profile.employmentType === 'part_time' ? 'パート' : '正職'}</span>
                    <span className="text-[9px] text-slate-500">月計 {workDays}日・{formatMinutes(scheduledMinutes)}</span>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {weekDates.map((date) => {
                      const day = new Date(`${date}T12:00:00`).getDay();
                      const record = profileRecords.find((candidate) => candidate.date === date);
                      const locked = isClockedRecord(record);
                      return <button key={date} type="button" onClick={() => openDay(profile, date)} className={`min-h-[3.4rem] min-w-0 rounded-lg px-0.5 text-[10px] font-black ${cellTone(record)} ${locked ? 'ring-1 ring-slate-400' : ''}`} title={locked ? '打刻済み・閲覧のみ' : record ? `${record.status} ${record.scheduledStartTime || ''}〜${record.scheduledEndTime || ''}` : '未登録'}><span className={`block text-[9px] ${day === 0 ? 'text-rose-600' : day === 6 ? 'text-sky-600' : ''}`}>{Number(date.slice(8))}（{WEEKDAYS[day]}）</span><span className="mt-0.5 block truncate">{cellLabel(record)}</span>{locked && <span className="block text-[8px] opacity-70">打刻済</span>}</button>;
                    })}
                    {Array.from({ length: 7 - weekDates.length }, (_, index) => <span key={`blank-${index}`} />)}
                  </div>
                </div>;
              })}
            </div>
          </section>
        ))}
        {visibleProfiles.length === 0 && <p className="p-6 text-center text-sm text-slate-500">該当する職員がいません。</p>}
      </div>

      {dayForm && (
        <Modal title="1日の勤務予定を編集" onClose={() => setDayForm(null)}>
          <p className="rounded-xl bg-slate-50 p-3 text-sm font-bold">{activeProfiles.find((profile) => profile.id === dayForm.recorderProfileId)?.displayName}／{dayForm.date}</p>
          <label className="block text-sm font-bold">状態<select value={dayForm.status} onChange={(event) => setDayForm({ ...dayForm, status: event.target.value as AttendanceStatus })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3">{DAY_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
          {!NO_TIME_STATUSES.includes(dayForm.status) && <div className="grid grid-cols-3 gap-2"><label className="text-sm font-bold">開始<input type="time" value={dayForm.startTime} onChange={(event) => setDayForm({ ...dayForm, startTime: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-2" /></label><label className="text-sm font-bold">終了<input type="time" value={dayForm.endTime} onChange={(event) => setDayForm({ ...dayForm, endTime: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-2" /></label><label className="text-sm font-bold">休憩（分）<input type="number" min="0" max="480" step="5" value={dayForm.breakMinutes} onChange={(event) => setDayForm({ ...dayForm, breakMinutes: Number(event.target.value) })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-2" /></label></div>}
          <label className="block text-sm font-bold">備考<textarea value={dayForm.note} onChange={(event) => setDayForm({ ...dayForm, note: event.target.value })} className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 p-3" /></label>
          <button type="button" disabled={busy} onClick={() => void saveDay()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 font-black text-white disabled:opacity-50"><Save className="h-5 w-5" />保存</button>
        </Modal>
      )}
    </section>
  );
};

const Summary = ({ label, value }: { label: string; value: string }) => <div className="border-r border-slate-100 p-3 text-center"><span className="block text-[9px] font-bold text-slate-500 sm:text-[10px]">{label}</span><strong className="mt-1 block text-sm text-slate-950 sm:text-base">{value}</strong></div>;

const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-4" role="dialog" aria-modal="true">
    <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl">
      <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-black">{title}</h3><button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100"><X className="h-5 w-5" /></button></div>
      <div className="space-y-4">{children}</div>
    </div>
  </div>
);

function getMonthDates(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return Array.from({ length: lastDay }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
}

function chunkDatesByWeek(dates: string[]) {
  const weeks: string[][] = [];
  let current: string[] = [];
  dates.forEach((date) => {
    const weekday = new Date(`${date}T12:00:00`).getDay();
    if (current.length && weekday === 0) {
      weeks.push(current);
      current = [];
    }
    current.push(date);
  });
  if (current.length) weeks.push(current);
  return weeks;
}

function formatWeekRange(dates: string[]) {
  const first = Number(dates[0]?.slice(8));
  const last = Number(dates[dates.length - 1]?.slice(8));
  return first === last ? `${first}日` : `${first}日〜${last}日`;
}

function isClockedRecord(record?: AttendanceRecord) {
  return Boolean(record?.clockInAt || record?.clockOutAt || (record && ['出勤中', '休憩中', '退勤済み'].includes(record.status)));
}

function moveMonth(month: string, amount: number) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getScheduledMinutes(record: AttendanceRecord) {
  if (!record.scheduledStartTime || !record.scheduledEndTime || NO_TIME_STATUSES.includes(record.status)) return 0;
  const [startHour, startMinute] = record.scheduledStartTime.split(':').map(Number);
  const [endHour, endMinute] = record.scheduledEndTime.split(':').map(Number);
  return Math.max(0, endHour * 60 + endMinute - startHour * 60 - startMinute - (record.scheduledBreakMinutes || 0));
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h${rest}m` : `${hours}h`;
}

function cellLabel(record?: AttendanceRecord) {
  if (!record) return '－';
  if (record.status === '公休') return '休';
  if (record.status === '有給') return '有';
  if (record.status === '特別休暇') return '特';
  if (record.status === '欠勤') return '欠';
  if (record.status === '研修') return '研';
  return record.scheduledStartTime || record.status.slice(0, 1);
}

function cellTone(record?: AttendanceRecord) {
  if (!record) return 'text-slate-300 hover:bg-slate-50';
  if (record.status === '公休') return 'bg-amber-50 text-amber-800 hover:bg-amber-100';
  if (record.status === '有給') return 'bg-sky-100 text-sky-800 hover:bg-sky-200';
  if (record.status === '特別休暇') return 'bg-violet-100 text-violet-800 hover:bg-violet-200';
  if (record.status === '欠勤') return 'bg-rose-100 text-rose-800 hover:bg-rose-200';
  if (record.status === '研修') return 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200';
  return 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100';
}

function createUuid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `shift-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
