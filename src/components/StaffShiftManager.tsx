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
  CalendarEvent,
  ChildProfile,
  DailyChildPlan,
  DailyTransportRequirement,
  RecorderProfile,
  StaffEmploymentType,
  StaffShiftRequest,
  StaffShiftTemplate,
  TransportRun,
} from '../types';

interface StaffShiftManagerProps {
  templates: StaffShiftTemplate[];
  records: AttendanceRecord[];
  recorderProfiles: RecorderProfile[];
  shiftRequests?: StaffShiftRequest[];
  calendarEvents?: CalendarEvent[];
  childrenList?: ChildProfile[];
  dailyChildPlans?: DailyChildPlan[];
  dailyTransportRequirements?: DailyTransportRequirement[];
  transportRuns?: TransportRun[];
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

type ShiftViewMode = 'year' | 'month' | 'day';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const DAY_STATUSES: AttendanceStatus[] = ['勤務予定', '遅刻', '早退', '欠勤', '有給', '公休', '特別休暇', '研修'];
const NO_TIME_STATUSES: AttendanceStatus[] = ['欠勤', '有給', '公休', '特別休暇'];
const PART_TIME_WEEKDAY_DEFAULT = '__part_time_weekday_default__';
const PART_TIME_HOLIDAY_DEFAULT = '__part_time_holiday_default__';

export const StaffShiftManager: React.FC<StaffShiftManagerProps> = ({
  templates,
  records,
  recorderProfiles,
  shiftRequests = [],
  calendarEvents = [],
  childrenList = [],
  dailyChildPlans = [],
  dailyTransportRequirements = [],
  transportRuns = [],
  selectedDate,
  onSaveRecords,
}) => {
  const activeProfiles = useMemo(
    () => recorderProfiles.filter((profile) => profile.active),
    [recorderProfiles],
  );
  const [month, setMonth] = useState(selectedDate.slice(0, 7));
  const [year, setYear] = useState(Number(selectedDate.slice(0, 4)));
  const [dayDate, setDayDate] = useState(selectedDate);
  const [viewMode, setViewMode] = useState<ShiftViewMode>('month');
  const [employmentFilter, setEmploymentFilter] = useState<'all' | StaffEmploymentType>('all');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [applyDate, setApplyDate] = useState(selectedDate);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [registerDaysOff, setRegisterDaysOff] = useState(true);
  const [dayForm, setDayForm] = useState<DayForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [childTimelineExpanded, setChildTimelineExpanded] = useState(false);

  useEffect(() => {
    setMonth(selectedDate.slice(0, 7));
    setYear(Number(selectedDate.slice(0, 4)));
    setDayDate(selectedDate);
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
  const yearRecords = useMemo(
    () => records.filter((record) => record.date.startsWith(`${year}-`)),
    [records, year],
  );
  const dayRecords = useMemo(
    () => records.filter((record) => record.date === dayDate),
    [dayDate, records],
  );
  const monthRequests = useMemo(() => shiftRequests.filter((request) => request.requestedDate.startsWith(month) && request.status !== '却下'), [month, shiftRequests]);
  const dayRequests = useMemo(() => shiftRequests.filter((request) => request.requestedDate === dayDate && request.status !== '却下'), [dayDate, shiftRequests]);
  const dayEvents = useMemo(() => calendarEvents.filter((event) => event.date <= dayDate && (event.endDate || event.date) >= dayDate && !event.allDay && event.startTime && event.endTime), [calendarEvents, dayDate]);
  const childTimelineRows = useMemo(() => {
    const childIds = new Set<string>();
    dailyChildPlans.filter((plan) => plan.date === dayDate && plan.attendancePlan !== '欠席').forEach((plan) => childIds.add(plan.childId));
    dailyTransportRequirements.filter((item) => item.date === dayDate).forEach((item) => childIds.add(item.childId));
    return [...childIds].map((childId) => ({
      child: childrenList.find((child) => child.id === childId),
      plan: dailyChildPlans.find((plan) => plan.date === dayDate && plan.childId === childId),
      requirement: dailyTransportRequirements.find((item) => item.date === dayDate && item.childId === childId),
    })).filter((row) => row.child).sort((left, right) => (left.child?.name || '').localeCompare(right.child?.name || '', 'ja'));
  }, [childrenList, dailyChildPlans, dailyTransportRequirements, dayDate]);
  const dayRuns = useMemo(() => transportRuns.filter((run) => run.date === dayDate), [dayDate, transportRuns]);
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

  const navigateView = (amount: number) => {
    if (viewMode === 'year') {
      setYear((current) => current + amount);
      return;
    }
    if (viewMode === 'month') {
      const next = moveMonth(month, amount);
      setMonth(next);
      setYear(Number(next.slice(0, 4)));
      return;
    }
    const next = moveDate(dayDate, amount);
    setDayDate(next);
    setMonth(next.slice(0, 7));
    setYear(Number(next.slice(0, 4)));
  };

  const periodLabel = viewMode === 'year'
    ? `${year}年`
    : viewMode === 'month'
      ? `${month.replace('-', '年')}月`
      : formatJapaneseDate(dayDate);

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

      <div className="border-b border-slate-200 bg-white p-3">
        <div className="mx-auto grid max-w-md grid-cols-3 rounded-xl bg-slate-100 p-1">
          {([['year', '年別'], ['month', '月別'], ['day', '日別']] as Array<[ShiftViewMode, string]>).map(([mode, label]) => <button key={mode} type="button" onClick={() => setViewMode(mode)} className={`min-h-10 rounded-lg text-xs font-black transition-colors ${viewMode === mode ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600'}`}>{label}</button>)}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <button type="button" onClick={() => navigateView(-1)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-300" aria-label="前へ"><ChevronLeft className="h-5 w-5" /></button>
          <div className="text-center"><strong className="block text-base text-slate-950">{periodLabel}</strong><span className="text-[10px] text-slate-500">{viewMode === 'year' ? '月を選ぶと月別表示へ移動します' : viewMode === 'month' ? '○は勤務、休・有・特・欠は休暇区分です' : '7時から21時までの配置を表示します'}</span></div>
          <button type="button" onClick={() => navigateView(1)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-300" aria-label="次へ"><ChevronRight className="h-5 w-5" /></button>
        </div>
      </div>

      <div className="border-t border-slate-100 bg-slate-50/60 p-3">
        {viewMode === 'month' && <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white shadow-sm">
          <div style={{ minWidth: `${112 + dates.length * 30 + 54}px` }}>
            <div className="grid border-b border-slate-300 bg-slate-100" style={{ gridTemplateColumns: `112px repeat(${dates.length}, minmax(30px, 1fr)) 54px` }}>
              <div className="flex items-center px-2 text-[10px] font-black text-slate-700">職員名</div>
              {dates.map((date) => { const weekday = new Date(`${date}T12:00:00`).getDay(); return <div key={date} className={`border-l border-slate-300 py-1 text-center text-[9px] font-black ${weekday === 0 ? 'bg-rose-50 text-rose-700' : weekday === 6 ? 'bg-sky-50 text-sky-700' : 'text-slate-700'}`}><span className="block">{Number(date.slice(8))}</span><span>{WEEKDAYS[weekday]}</span></div>; })}
              <div className="border-l border-slate-300 py-1 text-center text-[9px] font-black text-slate-700">休暇<br />計</div>
            </div>
            {visibleProfiles.map((profile) => {
              const profileRecords = monthRecords.filter((record) => record.recorderProfileId === profile.id);
              const leaveDays = profileRecords.filter((record) => NO_TIME_STATUSES.includes(record.status)).length;
              return <div key={profile.id} className="grid border-b border-slate-200 last:border-b-0" style={{ gridTemplateColumns: `112px repeat(${dates.length}, minmax(30px, 1fr)) 54px` }}>
                <div className="min-w-0 px-2 py-2"><strong className="block truncate text-[11px] text-slate-950">{profile.displayName}</strong><span className="text-[9px] text-slate-500">{profile.employmentType === 'part_time' ? 'パート' : '正職'}・{profileRecords.filter((record) => !NO_TIME_STATUSES.includes(record.status)).length}日</span></div>
                {dates.map((date) => {
                  const record = profileRecords.find((candidate) => candidate.date === date);
                  const request = monthRequests.find((candidate) => candidate.recorderProfileId === profile.id && candidate.requestedDate === date);
                  const locked = isClockedRecord(record);
                  return <button key={date} type="button" onClick={() => openDay(profile, date)} className={`relative min-h-11 border-l border-slate-200 text-[10px] font-black ${cellTone(record)} ${locked ? 'ring-1 ring-inset ring-slate-500' : ''} ${request ? 'ring-2 ring-inset ring-violet-400' : ''}`} title={[record ? `${record.status} ${record.scheduledStartTime || ''}〜${record.scheduledEndTime || ''}` : '未登録', request ? `希望 ${request.requestedStartTime || ''}〜${request.requestedEndTime || ''}（${request.status}）` : ''].filter(Boolean).join('／')}>{record ? monthCellLabel(record) : request ? '希' : '－'}{request && record && <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-violet-600" />}</button>;
                })}
                <div className="flex items-center justify-center border-l border-slate-300 text-xs font-black text-slate-700">{leaveDays}</div>
              </div>;
            })}
          </div>
        </div>}

        {viewMode === 'day' && <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white shadow-sm">
          <div className="min-w-[850px]">
            <div className="grid border-b border-slate-300 bg-slate-100" style={{ gridTemplateColumns: '120px minmax(700px, 1fr)' }}>
              <div className="px-3 py-2 text-[10px] font-black text-slate-700">職員・運営情報</div>
              <TimelineHeader />
            </div>
            {visibleProfiles.map((profile) => {
              const record = dayRecords.find((candidate) => candidate.recorderProfileId === profile.id);
              const request = dayRequests.find((candidate) => candidate.recorderProfileId === profile.id);
              const profileEvents = profile.employmentType !== 'part_time' ? dayEvents.filter((event) => event.recorderProfileIds.includes(profile.id)) : [];
              const bar = ganttBarStyle(record);
               return <div key={profile.id} className="grid border-b border-slate-200 text-left hover:bg-indigo-50/40" style={{ gridTemplateColumns: '120px minmax(700px, 1fr)' }}><button type="button" onClick={() => openDay(profile, dayDate)} className="min-w-0 px-2 py-2 text-left"><strong className="block truncate text-[11px] text-slate-950">{profile.displayName}</strong><span className="block truncate text-[8px] text-slate-500">{profile.employmentType === 'part_time' ? 'パート' : '正職'}{request ? `・希望${request.status}` : ''}</span></button><div className="relative min-h-12 overflow-hidden" style={timelineGridStyle()}>{bar ? <span className={`absolute top-1.5 flex h-7 items-center overflow-hidden rounded-lg px-2 text-[9px] font-black shadow-sm ${cellTone(record)}`} style={bar}>{record?.scheduledStartTime}〜{record?.scheduledEndTime}</span> : record ? <span className={`absolute inset-x-2 top-1.5 flex h-7 items-center justify-center rounded-lg text-[9px] font-black ${cellTone(record)}`}>{cellLabel(record)}</span> : <span className="absolute left-2 top-2.5 text-[9px] text-slate-300">未登録</span>}{request?.requestedStartTime && request.requestedEndTime && <span className="absolute bottom-1 h-1.5 rounded-full bg-violet-500" style={timeRangeBarStyle(request.requestedStartTime, request.requestedEndTime)} title={`シフト希望 ${request.requestedStartTime}〜${request.requestedEndTime}`} />}{profileEvents.map((event) => <span key={event.id} className="absolute bottom-0.5 h-2.5 overflow-hidden rounded-sm bg-amber-400 px-1 text-[7px] font-black text-amber-950" style={timeRangeBarStyle(event.startTime!, event.endTime!)} title={`${event.title} ${event.startTime}〜${event.endTime}`}>{event.title}</span>)}</div></div>;
            })}
            {dayRuns.length > 0 && <div className="border-y border-sky-200 bg-sky-50 px-3 py-1 text-[9px] font-black text-sky-800">送迎便</div>}
            {dayRuns.map((run) => <div key={run.id} className="grid border-b border-sky-100 bg-sky-50/30" style={{ gridTemplateColumns: '120px minmax(700px, 1fr)' }}><div className="min-w-0 px-2 py-1.5"><strong className="block truncate text-[10px] text-slate-900">{run.name}</strong><span className="block truncate text-[8px] text-slate-500">{run.direction}・{run.driverName || '担当未定'}</span></div><div className="relative min-h-9" style={timelineGridStyle()}><span className="absolute top-1.5 flex h-6 items-center overflow-hidden rounded-md bg-sky-500 px-2 text-[8px] font-black text-white" style={timeRangeBarStyle(run.startTime, run.endTime)}>{run.startTime}〜{run.endTime}</span></div></div>)}
            {childTimelineRows.length > 0 && <button type="button" aria-expanded={childTimelineExpanded} onClick={() => setChildTimelineExpanded((expanded) => !expanded)} className="flex min-h-9 w-full items-center justify-between border-y border-teal-200 bg-teal-50 px-3 text-[9px] font-black text-teal-800"><span>児童の下校・送迎・在所見込み　{childTimelineRows.length}名</span><span className="rounded-md bg-white px-2 py-1">{childTimelineExpanded ? '詳細を閉じる' : '児童別に表示'}</span></button>}
            {childTimelineExpanded && childTimelineRows.map(({ child, plan, requirement }) => {
              if (!child) return null;
              const dismissal = plan?.schoolEndTime || requirement?.pickupTargetTime;
              const arrival = plan?.arrivalTime || requirement?.pickupPlannedTime || (requirement?.pickupTimeMode !== 'fixed' ? requirement?.pickupTargetTime : undefined);
              const departure = plan?.departureTime || requirement?.dropoffTargetTime;
              return <div key={child.id} className="grid border-b border-teal-100" style={{ gridTemplateColumns: '120px minmax(700px, 1fr)' }}><div className="min-w-0 px-2 py-1"><strong className="block truncate text-[10px] text-slate-900">{child.name}</strong><span className="block truncate text-[7px] text-slate-500">下校 {dismissal || '未設定'}・退所 {departure || '未設定'}</span></div><div className="relative min-h-8" style={timelineGridStyle()}>{arrival && departure && <span className="absolute top-1 flex h-6 items-center overflow-hidden rounded-md bg-teal-100 px-2 text-[8px] font-black text-teal-900" style={timeRangeBarStyle(arrival, departure)} title={`在所見込み ${arrival}〜${departure}`}>在所 {arrival}〜{departure}</span>}{dismissal && <span className="absolute top-0 h-full w-0.5 bg-indigo-600" style={{ left: timePointPosition(dismissal) }} title={`下校・迎え ${dismissal}`}><span className="absolute left-1 top-0 whitespace-nowrap text-[7px] font-black text-indigo-700">下校 {dismissal}</span></span>}</div></div>;
            })}
          </div>
        </div>}

        {viewMode === 'year' && <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white shadow-sm">
          <div className="min-w-[860px]">
            <div className="grid border-b border-slate-300 bg-slate-100" style={{ gridTemplateColumns: '150px repeat(12, minmax(56px, 1fr))' }}><div className="px-3 py-2 text-[10px] font-black text-slate-700">職員名</div>{Array.from({ length: 12 }, (_, index) => <button key={index} type="button" onClick={() => { setMonth(`${year}-${String(index + 1).padStart(2, '0')}`); setViewMode('month'); }} className="border-l border-slate-300 py-2 text-[10px] font-black text-indigo-800 hover:bg-indigo-50">{index + 1}月</button>)}</div>
            {visibleProfiles.map((profile) => <div key={profile.id} className="grid border-b border-slate-200 last:border-b-0" style={{ gridTemplateColumns: '150px repeat(12, minmax(56px, 1fr))' }}><div className="min-w-0 px-3 py-2"><strong className="block truncate text-[11px] text-slate-950">{profile.displayName}</strong><span className="text-[9px] text-slate-500">{profile.employmentType === 'part_time' ? 'パート' : '正職'}</span></div>{Array.from({ length: 12 }, (_, index) => {
              const prefix = `${year}-${String(index + 1).padStart(2, '0')}`;
              const target = yearRecords.filter((record) => record.recorderProfileId === profile.id && record.date.startsWith(prefix));
              const workDays = target.filter((record) => !NO_TIME_STATUSES.includes(record.status)).length;
              const leaveDays = target.filter((record) => NO_TIME_STATUSES.includes(record.status)).length;
              return <button key={prefix} type="button" onClick={() => { setMonth(prefix); setViewMode('month'); }} className="border-l border-slate-200 px-1 py-2 text-center hover:bg-indigo-50"><strong className="block text-xs text-slate-900">{workDays}日</strong><span className={`text-[9px] font-bold ${leaveDays ? 'text-rose-700' : 'text-slate-400'}`}>休 {leaveDays}</span></button>;
            })}</div>)}
          </div>
        </div>}
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

function isClockedRecord(record?: AttendanceRecord) {
  return Boolean(record?.clockInAt || record?.clockOutAt || (record && ['出勤中', '休憩中', '退勤済み'].includes(record.status)));
}

function moveMonth(month: string, amount: number) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function moveDate(date: string, amount: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + amount);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}

function formatJapaneseDate(date: string) {
  const value = new Date(`${date}T12:00:00`);
  return `${value.getFullYear()}年${value.getMonth() + 1}月${value.getDate()}日（${WEEKDAYS[value.getDay()]}）`;
}

function monthCellLabel(record?: AttendanceRecord) {
  if (!record) return '－';
  if (record.status === '公休') return '休';
  if (record.status === '有給') return '有';
  if (record.status === '特別休暇') return '特';
  if (record.status === '欠勤') return '欠';
  if (record.status === '研修') return '研';
  if (record.status === '遅刻') return '遅';
  if (record.status === '早退') return '早';
  return '○';
}

const TIMELINE_START_MINUTES = 7 * 60;
const TIMELINE_END_MINUTES = 21 * 60;
const TIMELINE_TOTAL_MINUTES = TIMELINE_END_MINUTES - TIMELINE_START_MINUTES;

const TimelineHeader = () => <div className="relative h-9" style={timelineGridStyle()}>{Array.from({ length: 15 }, (_, index) => {
  const position = (index / 14) * 100;
  return <span key={index} className="absolute top-2 text-[9px] font-black text-slate-600" style={{ left: `${position}%`, transform: index === 0 ? 'none' : index === 14 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{7 + index}</span>;
})}</div>;

function timelineGridStyle(): React.CSSProperties {
  return {
    backgroundImage: 'linear-gradient(to right, rgb(203 213 225) 1px, transparent 1px)',
    backgroundSize: `${100 / 14}% 100%`,
    backgroundPosition: '0 0',
  };
}

function toTimelineMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  return hours * 60 + minutes;
}

function timePointPosition(value: string) {
  const minutes = Math.max(TIMELINE_START_MINUTES, Math.min(TIMELINE_END_MINUTES, toTimelineMinutes(value)));
  return `${((minutes - TIMELINE_START_MINUTES) / TIMELINE_TOTAL_MINUTES) * 100}%`;
}

function timeRangeBarStyle(startValue: string, endValue: string): React.CSSProperties {
  const start = Math.max(TIMELINE_START_MINUTES, Math.min(TIMELINE_END_MINUTES, toTimelineMinutes(startValue)));
  const end = Math.max(start, Math.min(TIMELINE_END_MINUTES, toTimelineMinutes(endValue)));
  return {
    left: `${((start - TIMELINE_START_MINUTES) / TIMELINE_TOTAL_MINUTES) * 100}%`,
    width: `${Math.max(1.5, ((end - start) / TIMELINE_TOTAL_MINUTES) * 100)}%`,
  };
}

function ganttBarStyle(record?: AttendanceRecord): React.CSSProperties | undefined {
  if (!record?.scheduledStartTime || !record.scheduledEndTime || NO_TIME_STATUSES.includes(record.status)) return undefined;
  return timeRangeBarStyle(record.scheduledStartTime, record.scheduledEndTime);
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
