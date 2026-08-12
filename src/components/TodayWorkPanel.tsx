import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  BusFront,
  CalendarDays,
  ChartGantt,
  CheckCircle2,
  Clock3,
  UserRoundCheck,
  UsersRound,
  X,
} from 'lucide-react';
import type {
  AttendanceCorrectionRequest,
  AttendanceRecord,
  CalendarEvent,
  ChildProfile,
  DailyChildPlan,
  DailyTransportRequirement,
  RecorderProfile,
  StaffScheduleItem,
  TransportRun,
  TransportAssignmentChangeInput,
  TransportPlanDay,
  TransportRouteSettings,
  TransportRunStatus,
  Vehicle,
} from '../types';
import { getLocalDateString, getRegularDaysForDate, getWeekdayFromDate } from '../utils/weekdays';
import { AttendancePanel } from './AttendancePanel';
import { CalendarPanel } from './CalendarPanel';
import { StaffSchedulePanel } from './StaffSchedulePanel';
import { TransportPanel } from './TransportPanel';

type WorkView = 'placement' | 'calendar' | 'attendance' | 'transport';

interface TodayWorkPanelProps {
  staffScheduleItems: StaffScheduleItem[];
  calendarEvents: CalendarEvent[];
  attendanceRecords: AttendanceRecord[];
  attendanceCorrections: AttendanceCorrectionRequest[];
  vehicles: Vehicle[];
  transportRuns: TransportRun[];
  transportPlanDays: TransportPlanDay[];
  dailyTransportRequirements: DailyTransportRequirement[];
  transportRouteSettings: TransportRouteSettings;
  recorderProfiles: RecorderProfile[];
  childrenList: ChildProfile[];
  dailyChildPlans: DailyChildPlan[];
  activeRecorder?: RecorderProfile;
  canManage: boolean;
  onSaveStaffSchedule: (item: StaffScheduleItem) => Promise<void> | void;
  onDeleteStaffSchedule: (itemId: string) => Promise<void> | void;
  onSaveCalendarEvent: (event: CalendarEvent) => Promise<void> | void;
  onDeleteCalendarEvent: (eventId: string) => Promise<void> | void;
  onSaveAttendance: (record: AttendanceRecord) => Promise<void> | void;
  onPunchAttendance: (recorder: RecorderProfile, pin: string, action: '出勤' | '退勤' | '休憩開始' | '休憩終了') => Promise<void> | void;
  onRequestAttendanceCorrection: (record: AttendanceRecord, pin: string, clockIn: string | undefined, clockOut: string | undefined, reason: string) => Promise<void> | void;
  onReviewAttendanceCorrection: (request: AttendanceCorrectionRequest, approved: boolean, note?: string) => Promise<void> | void;
  onSaveVehicle: (vehicle: Vehicle) => Promise<void> | void;
  onDeleteVehicle: (vehicleId: string) => Promise<void> | void;
  onSaveTransportPlanDay: (day: TransportPlanDay) => Promise<void> | void;
  onSaveDailyChildPlan: (plan: DailyChildPlan) => Promise<void> | void;
  onSaveDailyTransportRequirements: (requirements: DailyTransportRequirement[]) => Promise<void> | void;
  onReplaceMonthlyTransportRequirements: (month: string, requirements: DailyTransportRequirement[]) => Promise<DailyTransportRequirement[]>;
  onReplaceChildMonthlyTransportRequirements: (month: string, childId: string, requirements: DailyTransportRequirement[]) => Promise<DailyTransportRequirement[]>;
  onSaveTransportRun: (run: TransportRun) => Promise<void> | void;
  onChangeTransportAssignment: (change: TransportAssignmentChangeInput) => Promise<void> | void;
  onDeleteTransportRun: (runId: string) => Promise<void> | void;
  onSaveTransportRouteSettings: (settings: TransportRouteSettings) => Promise<void> | void;
  onUpdateTransportStatus: (run: TransportRun, recorder: RecorderProfile, pin: string, status: TransportRunStatus) => Promise<void> | void;
}

export const TodayWorkPanel: React.FC<TodayWorkPanelProps> = ({
  staffScheduleItems,
  calendarEvents,
  attendanceRecords,
  attendanceCorrections,
  vehicles,
  transportRuns,
  transportPlanDays,
  dailyTransportRequirements,
  transportRouteSettings,
  recorderProfiles,
  childrenList,
  dailyChildPlans,
  activeRecorder,
  canManage,
  onSaveStaffSchedule,
  onDeleteStaffSchedule,
  onSaveCalendarEvent,
  onDeleteCalendarEvent,
  onSaveAttendance,
  onPunchAttendance,
  onRequestAttendanceCorrection,
  onReviewAttendanceCorrection,
  onSaveVehicle,
  onDeleteVehicle,
  onSaveTransportPlanDay,
  onSaveDailyChildPlan,
  onSaveDailyTransportRequirements,
  onReplaceMonthlyTransportRequirements,
  onReplaceChildMonthlyTransportRequirements,
  onSaveTransportRun,
  onChangeTransportAssignment,
  onDeleteTransportRun,
  onSaveTransportRouteSettings,
  onUpdateTransportStatus,
}) => {
  const [selectedDate, setSelectedDate] = useState(getLocalDateString);
  const [view, setView] = useState<WorkView>('placement');
  const [focusRunId, setFocusRunId] = useState<string>();
  const dayEvents = useMemo(() => calendarEvents.filter((event) => eventOccursOn(event, selectedDate)), [calendarEvents, selectedDate]);
  const dayAttendance = useMemo(() => attendanceRecords.filter((record) => record.date === selectedDate), [attendanceRecords, selectedDate]);
  const dayRuns = useMemo(() => transportRuns.filter((run) => run.date === selectedDate), [transportRuns, selectedDate]);
  const generatedItems = useMemo(
    () => createGeneratedScheduleItems(dayEvents, dayAttendance, dayRuns, recorderProfiles, selectedDate),
    [dayEvents, dayAttendance, dayRuns, recorderProfiles, selectedDate],
  );
  const allScheduleItems = useMemo(() => [...staffScheduleItems, ...generatedItems], [staffScheduleItems, generatedItems]);
  const scheduledChildren = useMemo(() => getScheduledChildren(childrenList, dayEvents, dailyChildPlans, selectedDate), [childrenList, dayEvents, dailyChildPlans, selectedDate]);
  const warningsByRunId = useMemo(() => getTransportWarnings(dayRuns, vehicles, dayAttendance, dayEvents, dailyChildPlans, staffScheduleItems, childrenList), [dayRuns, vehicles, dayAttendance, dayEvents, dailyChildPlans, staffScheduleItems, childrenList]);
  const allWarnings = [...warningsByRunId.values()].flat();
  const working = dayAttendance.filter((record) => ['出勤中', '休憩中', '遅刻', '早退'].includes(record.status));
  const absent = dayAttendance.filter((record) => ['欠勤', '有給', '公休'].includes(record.status));

  const openGenerated = (item: StaffScheduleItem) => {
    if (item.sourceType === 'calendar') setView('calendar');
    if (item.sourceType === 'attendance') setView('attendance');
    if (item.sourceType === 'transport') {
      setFocusRunId(item.sourceId);
      setView('transport');
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-xs font-black text-teal-700">本日の業務</p><h2 className="mt-1 text-xl font-black text-slate-950">勤務・予定・送迎を一画面で確認</h2><p className="mt-1 text-xs text-slate-500">自動生成された配置は、元の勤務・予定・送迎から編集します。</p></div>
          <label className="flex items-center gap-2 text-sm font-black text-slate-700"><CalendarDays className="h-5 w-5 text-teal-600" /><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3" /></label>
        </div>
        <div className="ui-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-5 lg:overflow-visible">
          <SummaryCard icon={UserRoundCheck} label="出勤中" value={`${working.length}名`} tone="emerald" />
          <SummaryCard icon={Clock3} label="未出勤・休暇" value={`${Math.max(0, recorderProfiles.filter((profile) => profile.active).length - working.length)}名`} detail={absent.length ? `休暇等 ${absent.length}名` : undefined} tone="amber" />
          <SummaryCard icon={UsersRound} label="利用予定児童" value={`${scheduledChildren.length}名`} tone="blue" />
          <SummaryCard icon={BusFront} label="送迎便" value={`${dayRuns.length}便`} detail={`${dayRuns.filter((run) => run.status !== '未出発').length}便 運行開始`} tone="violet" />
          <SummaryCard icon={AlertTriangle} label="要確認" value={`${new Set(allWarnings).size}件`} tone={allWarnings.length ? 'rose' : 'slate'} />
        </div>
        <nav className="mt-3 border-t border-slate-100 pt-3" aria-label="本日の業務メニュー">
          <div className="grid grid-cols-4 gap-1">
            <WorkTab active={view === 'placement'} icon={ChartGantt} label="職員配置" onClick={() => setView('placement')} />
            <WorkTab active={view === 'calendar'} icon={CalendarDays} label="予定" onClick={() => setView('calendar')} />
            <WorkTab active={view === 'attendance'} icon={Clock3} label="出勤" onClick={() => setView('attendance')} />
            <WorkTab active={view === 'transport'} icon={BusFront} label="送迎" onClick={() => setView('transport')} />
          </div>
        </nav>
      </section>

      {allWarnings.length > 0 && (
        <details className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <summary className="cursor-pointer font-black text-amber-950">配置・配車の確認事項（{new Set(allWarnings).size}件）</summary>
          <ul className="mt-3 space-y-1 text-sm text-amber-900">{[...new Set(allWarnings)].map((warning) => <li key={warning} className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{warning}</li>)}</ul>
        </details>
      )}

      {canManage && (
        <OperationsAssistant
          selectedDate={selectedDate}
          calendarEvents={calendarEvents}
          attendanceRecords={attendanceRecords}
          transportRuns={transportRuns}
          vehicles={vehicles}
          recorderProfiles={recorderProfiles}
          onSaveCalendarEvent={onSaveCalendarEvent}
          onSaveAttendance={onSaveAttendance}
          onSaveTransportRun={onSaveTransportRun}
        />
      )}

      {view === 'placement' && (
        <>
          <StaffSchedulePanel items={allScheduleItems} recorderProfiles={recorderProfiles} childrenList={childrenList} canEdit={canManage} selectedDate={selectedDate} onDateChange={setSelectedDate} onOpenGenerated={openGenerated} onSave={onSaveStaffSchedule} onDelete={onDeleteStaffSchedule} />
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="font-black text-slate-900">利用予定児童（{scheduledChildren.length}名）</h3>
            <div className="mt-3 flex flex-wrap gap-2">{scheduledChildren.map((child) => <span key={child.id} className="rounded-full bg-sky-50 px-3 py-2 text-sm font-bold text-sky-900">{child.name}</span>)}{scheduledChildren.length === 0 && <span className="text-sm text-slate-400">利用予定はありません。</span>}</div>
          </section>
        </>
      )}
      {view === 'calendar' && <CalendarPanel events={calendarEvents} recorderProfiles={recorderProfiles} childrenList={childrenList} selectedDate={selectedDate} onDateChange={setSelectedDate} canEdit={canManage} onSave={onSaveCalendarEvent} onDelete={onDeleteCalendarEvent} />}
      {view === 'attendance' && <AttendancePanel records={attendanceRecords} corrections={attendanceCorrections} recorderProfiles={recorderProfiles} selectedDate={selectedDate} activeRecorder={activeRecorder} canManage={canManage} onSaveRecord={onSaveAttendance} onPunch={onPunchAttendance} onRequestCorrection={onRequestAttendanceCorrection} onReviewCorrection={onReviewAttendanceCorrection} />}
      {view === 'transport' && (
        <TransportPanel
          runs={transportRuns}
          vehicles={vehicles}
          routeSettings={transportRouteSettings}
          recorderProfiles={recorderProfiles}
          childrenList={childrenList}
          dailyChildPlans={dailyChildPlans}
          transportPlanDays={transportPlanDays}
          dailyTransportRequirements={dailyTransportRequirements}
          staffScheduleItems={staffScheduleItems}
          attendanceRecords={attendanceRecords}
          calendarEvents={calendarEvents}
          selectedDate={selectedDate}
          canManage={canManage}
          activeRecorder={activeRecorder}
          warningsByRunId={warningsByRunId}
          focusRunId={focusRunId}
          onSaveRun={onSaveTransportRun}
          onChangeAssignment={onChangeTransportAssignment}
          onDeleteRun={onDeleteTransportRun}
          onSaveVehicle={onSaveVehicle}
          onDeleteVehicle={onDeleteVehicle}
          onSaveTransportPlanDay={onSaveTransportPlanDay}
          onSaveDailyChildPlan={onSaveDailyChildPlan}
          onSaveDailyTransportRequirements={onSaveDailyTransportRequirements}
          onReplaceMonthlyTransportRequirements={onReplaceMonthlyTransportRequirements}
          onReplaceChildMonthlyTransportRequirements={onReplaceChildMonthlyTransportRequirements}
          onSaveRouteSettings={onSaveTransportRouteSettings}
          onUpdateStatus={onUpdateTransportStatus}
        />
      )}
    </div>
  );
};

const WorkTab = ({ active, icon: Icon, label, onClick }: { active: boolean; icon: React.ElementType; label: string; onClick: () => void }) => <button type="button" onClick={onClick} aria-pressed={active} className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-black sm:flex-row sm:gap-2 sm:text-sm ${active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}><Icon className="h-4 w-4 sm:h-5 sm:w-5" />{label}</button>;
const SummaryCard = ({ icon: Icon, label, value, detail, tone }: { icon: React.ElementType; label: string; value: string; detail?: string; tone: string }) => <div className={`min-w-[8.5rem] rounded-xl border px-3 py-2.5 lg:min-w-0 ${tone === 'emerald' ? 'border-emerald-200 bg-emerald-50' : tone === 'amber' ? 'border-amber-200 bg-amber-50' : tone === 'blue' ? 'border-sky-200 bg-sky-50' : tone === 'violet' ? 'border-violet-200 bg-violet-50' : tone === 'rose' ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}><span className="flex items-center gap-1 text-[10px] font-bold text-slate-500"><Icon className="h-3.5 w-3.5" />{label}</span><strong className="mt-0.5 block text-lg text-slate-950">{value}</strong>{detail && <span className="block truncate text-[9px] text-slate-500">{detail}</span>}</div>;

interface OperationsProposal {
  summary: string;
  details: string[];
  execute: () => Promise<void>;
}

function OperationsAssistant({
  selectedDate,
  calendarEvents,
  attendanceRecords,
  transportRuns,
  vehicles,
  recorderProfiles,
  onSaveCalendarEvent,
  onSaveAttendance,
  onSaveTransportRun,
}: {
  selectedDate: string;
  calendarEvents: CalendarEvent[];
  attendanceRecords: AttendanceRecord[];
  transportRuns: TransportRun[];
  vehicles: Vehicle[];
  recorderProfiles: RecorderProfile[];
  onSaveCalendarEvent: (event: CalendarEvent) => Promise<void> | void;
  onSaveAttendance: (record: AttendanceRecord) => Promise<void> | void;
  onSaveTransportRun: (run: TransportRun) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [proposal, setProposal] = useState<OperationsProposal>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const propose = () => {
    setMessage('');
    try {
      setProposal(buildOperationsProposal({ instruction, selectedDate, calendarEvents, attendanceRecords, transportRuns, vehicles, recorderProfiles, onSaveCalendarEvent, onSaveAttendance, onSaveTransportRun }));
    } catch (error) {
      setProposal(undefined);
      setMessage(error instanceof Error ? error.message : '実行内容を特定できませんでした。');
    }
  };

  const execute = async () => {
    if (!proposal) return;
    setBusy(true);
    setMessage('');
    try {
      await proposal.execute();
      setMessage('承認された内容を実行しました。職員配置にも自動反映されます。');
      setProposal(undefined);
      setInstruction('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '実行できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="rounded-2xl border border-indigo-200 bg-white shadow-sm">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-100 text-indigo-700"><Bot className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1"><strong className="block text-sm text-slate-900">業務AIアシスタント</strong><span className="block text-[10px] text-slate-500">実行案を確認し、承認後だけ勤務・予定・配車を更新します。</span></span>
        <span className="text-xs font-black text-indigo-700">{open ? '閉じる' : '開く'}</span>
      </summary>
      <div className="space-y-3 border-t border-indigo-100 p-4">
        <label className="block text-xs font-black text-slate-700">指示文<textarea rows={3} value={instruction} onChange={(event) => { setInstruction(event.target.value); setProposal(undefined); setMessage(''); }} placeholder="例：明日の鈴木児発管の送迎を山田指導員へ変更" className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-base leading-relaxed" /></label>
        {!proposal && <button type="button" disabled={!instruction.trim()} onClick={propose} className="min-h-11 w-full rounded-xl bg-indigo-600 px-4 text-sm font-black text-white disabled:bg-slate-300">実行案を作成</button>}
        {proposal && <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black text-indigo-700">アシスタント案</p><h4 className="mt-1 font-black text-slate-950">{proposal.summary}</h4></div><button type="button" onClick={() => setProposal(undefined)} aria-label="実行案を閉じる" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white"><X className="h-4 w-4" /></button></div><ul className="mt-3 space-y-1 text-xs text-slate-700">{proposal.details.map((detail) => <li key={detail} className="rounded-lg bg-white px-3 py-2">{detail}</li>)}</ul><p className="mt-3 text-[10px] font-bold text-amber-800">承認するまでデータは変更されません。</p><button type="button" disabled={busy} onClick={execute} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 text-sm font-black text-white disabled:opacity-60"><CheckCircle2 className="h-5 w-5" />{busy ? '実行中…' : 'この内容を承認して実行'}</button></section>}
        {message && <p role="status" className={`rounded-xl p-3 text-sm font-bold ${message.includes('実行しました') ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{message}</p>}
      </div>
    </details>
  );
}

function createGeneratedScheduleItems(events: CalendarEvent[], attendance: AttendanceRecord[], runs: TransportRun[], recorders: RecorderProfile[], selectedDate: string): StaffScheduleItem[] {
  const recorderName = new Map(recorders.map((profile) => [profile.id, profile.displayName]));
  const now = new Date().toISOString();
  const calendarItems = events.flatMap((event) => event.allDay || !event.startTime || !event.endTime ? [] : event.recorderProfileIds.map((recorderId) => ({
    id: `generated-calendar-${event.id}-${recorderId}-${selectedDate}`, recorderProfileId: recorderId, recorderName: recorderName.get(recorderId) || '職員', date: selectedDate,
    startTime: event.startTime!, endTime: event.endTime!, title: event.title, category: event.eventType === '会議' || event.eventType === '朝礼' ? '会議' as const : event.eventType === '送迎予定' ? '送迎' as const : 'その他' as const,
    location: event.location, childIds: event.childIds, note: event.note, createdAt: event.createdAt, updatedAt: event.updatedAt, sourceType: 'calendar' as const, sourceId: event.id, generated: true,
  })));
  const attendanceItems = attendance.flatMap((record) => !record.scheduledStartTime || !record.scheduledEndTime ? [] : [{
    id: `generated-attendance-${record.id}`, recorderProfileId: record.recorderProfileId, recorderName: record.recorderName, date: record.date,
    startTime: record.scheduledStartTime, endTime: record.scheduledEndTime, title: ['欠勤', '有給', '公休'].includes(record.status) ? record.status : '勤務可能時間', category: 'その他' as const,
    childIds: [], note: record.note, createdAt: record.createdAt, updatedAt: record.updatedAt, sourceType: 'attendance' as const, sourceId: record.id, generated: true,
  }]);
  const transportItems = runs.flatMap((run) => [run.driverRecorderProfileId, ...run.assistantRecorderProfileIds].filter(Boolean).map((recorderId) => ({
    id: `generated-transport-${run.id}-${recorderId}`, recorderProfileId: recorderId!, recorderName: recorderName.get(recorderId!) || '職員', date: run.date,
    startTime: run.startTime, endTime: run.endTime, title: `${run.name}（${run.direction}）`, category: '送迎' as const, location: run.stops.map((stop) => stop.location).filter(Boolean).join(' → '),
    childIds: run.stops.map((stop) => stop.childId).filter((id): id is string => Boolean(id)), note: run.operationNote, createdAt: run.createdAt || now, updatedAt: run.updatedAt || now, sourceType: 'transport' as const, sourceId: run.id, generated: true,
  })));
  return [...calendarItems, ...attendanceItems, ...transportItems];
}

function buildOperationsProposal({
  instruction,
  selectedDate,
  calendarEvents,
  attendanceRecords,
  transportRuns,
  vehicles,
  recorderProfiles,
  onSaveCalendarEvent,
  onSaveAttendance,
  onSaveTransportRun,
}: {
  instruction: string;
  selectedDate: string;
  calendarEvents: CalendarEvent[];
  attendanceRecords: AttendanceRecord[];
  transportRuns: TransportRun[];
  vehicles: Vehicle[];
  recorderProfiles: RecorderProfile[];
  onSaveCalendarEvent: (event: CalendarEvent) => Promise<void> | void;
  onSaveAttendance: (record: AttendanceRecord) => Promise<void> | void;
  onSaveTransportRun: (run: TransportRun) => Promise<void> | void;
}): OperationsProposal {
  const normalized = instruction.replace(/\s+/g, '');
  if (!normalized) throw new Error('指示文を入力してください。');
  if (/削除|権限|招待|承認済み記録/.test(normalized)) {
    throw new Error('削除・権限・招待・承認済み記録の変更は、安全のため各管理画面から行ってください。');
  }
  const targetDate = extractOperationsDate(instruction, selectedDate);
  const mentionedRecorders = recorderProfiles.filter((profile) => normalized.includes(profile.displayName.replace(/\s+/g, '')));
  const dayRuns = transportRuns.filter((run) => run.date === targetDate);

  if (/送迎|運転|便/.test(normalized) && /変更|交代|代わり/.test(normalized)) {
    const namedRun = dayRuns.find((run) => normalized.includes(run.name.replace(/\s+/g, '')));
    const sourceRecorder = mentionedRecorders.find((profile) => dayRuns.some((run) => run.driverRecorderProfileId === profile.id));
    const targetRecorder = [...mentionedRecorders].reverse().find((profile) => profile.id !== sourceRecorder?.id)
      || (mentionedRecorders.length === 1 && namedRun ? mentionedRecorders[0] : undefined);
    const targetRun = namedRun || dayRuns.find((run) => run.driverRecorderProfileId === sourceRecorder?.id);
    if (!targetRun) throw new Error(`${targetDate}の変更対象となる送迎便を特定できません。便名または現在の運転者名を含めてください。`);
    if (!targetRecorder) throw new Error('変更後の運転担当者を職員名で指定してください。');
    const beforeName = targetRun.driverName || '未設定';
    return {
      summary: `${targetDate}の「${targetRun.name}」の運転担当を${targetRecorder.displayName}へ変更します。よろしいですか？`,
      details: [`変更前：${beforeName}`, `変更後：${targetRecorder.displayName}`, 'ガントチャートは送迎便の更新後に自動更新'],
      execute: async () => { await onSaveTransportRun({ ...targetRun, driverRecorderProfileId: targetRecorder.id, driverName: targetRecorder.displayName, updatedAt: new Date().toISOString() }); },
    };
  }

  if (/車両|号車|配車/.test(normalized) && /変更|割り当て/.test(normalized)) {
    const vehicle = vehicles.find((candidate) => normalized.includes(candidate.name.replace(/\s+/g, '')));
    const targetRun = dayRuns.find((run) => normalized.includes(run.name.replace(/\s+/g, ''))) || (dayRuns.length === 1 ? dayRuns[0] : undefined);
    if (!targetRun) throw new Error(`${targetDate}の対象便を便名で指定してください。`);
    if (!vehicle) throw new Error('変更後の車両名を指定してください。');
    if (!vehicle.available) throw new Error(`${vehicle.name}は使用不可に設定されています。`);
    return {
      summary: `${targetDate}の「${targetRun.name}」を${vehicle.name}へ変更します。よろしいですか？`,
      details: [`変更前：${targetRun.vehicleName || '未設定'}`, `変更後：${vehicle.name}`, '定員・時間重複は更新後も自動点検'],
      execute: async () => { await onSaveTransportRun({ ...targetRun, vehicleId: vehicle.id, vehicleName: vehicle.name, updatedAt: new Date().toISOString() }); },
    };
  }

  const attendanceStatus = (['欠勤', '有給', '公休', '研修', '遅刻', '早退'] as const).find((status) => normalized.includes(status));
  if (attendanceStatus) {
    const recorder = mentionedRecorders[0];
    if (!recorder) throw new Error('勤務状態を変更する職員名を指定してください。');
    const existing = attendanceRecords.find((record) => record.date === targetDate && record.recorderProfileId === recorder.id);
    const now = new Date().toISOString();
    const updated: AttendanceRecord = {
      id: existing?.id || createOperationsUuid('attendance'), recorderProfileId: recorder.id, recorderName: recorder.displayName, date: targetDate,
      scheduledStartTime: existing?.scheduledStartTime, scheduledEndTime: existing?.scheduledEndTime, status: attendanceStatus,
      clockInAt: existing?.clockInAt, clockOutAt: existing?.clockOutAt, breakPeriods: existing?.breakPeriods || [], note: existing?.note,
      deviceId: existing?.deviceId, lastActionByRecorderId: existing?.lastActionByRecorderId, createdAt: existing?.createdAt || now, updatedAt: now,
    };
    return {
      summary: `${targetDate}の${recorder.displayName}を「${attendanceStatus}」として登録します。よろしいですか？`,
      details: [`変更前：${existing?.status || '未登録'}`, `変更後：${attendanceStatus}`, '朝礼と職員配置へ自動反映'],
      execute: async () => { await onSaveAttendance(updated); },
    };
  }

  const eventType = (['会議', '朝礼', '研修', '保護者面談', '学校行事', '事業所行事', '提出期限'] as const).find((type) => normalized.includes(type));
  if (eventType) {
    const times = [...instruction.matchAll(/(\d{1,2})(?::|時)(\d{2})?/g)].map((match) => `${String(Number(match[1])).padStart(2, '0')}:${String(Number(match[2] || 0)).padStart(2, '0')}`);
    const startTime = times[0] || '10:00';
    const endTime = times[1] || addMinutes(startTime, 60);
    if (startTime >= endTime) throw new Error('予定の終了時刻は開始時刻より後にしてください。');
    const title = `${eventType}（業務アシスタント）`;
    if (calendarEvents.some((event) => event.date === targetDate && event.title === title && event.startTime === startTime)) throw new Error('同じ予定がすでに登録されています。');
    const now = new Date().toISOString();
    const event: CalendarEvent = {
      id: createOperationsUuid('calendar'), title, eventType, date: targetDate, allDay: false, startTime, endTime,
      recorderProfileIds: (mentionedRecorders.length ? mentionedRecorders : recorderProfiles.filter((profile) => profile.active)).map((profile) => profile.id), childIds: [], notificationEnabled: false, visibility: '全体', color: '#2563eb', recurrence: 'なし',
      note: instruction.trim(), createdAt: now, updatedAt: now,
    };
    return {
      summary: `${targetDate} ${startTime}〜${endTime}に「${eventType}」を登録します。よろしいですか？`,
      details: [`対象職員：${mentionedRecorders.map((profile) => profile.displayName).join('、') || '全体'}`, 'カレンダー・ガントチャート・朝礼へ自動反映'],
      execute: async () => { await onSaveCalendarEvent(event); },
    };
  }

  throw new Error('現在は、送迎担当・車両の変更、欠勤／休暇／研修の登録、会議・朝礼・面談・行事・期限の追加に対応しています。');
}

function extractOperationsDate(instruction: string, selectedDate: string) {
  const today = getLocalDateString();
  if (/明日|翌日/.test(instruction)) return shiftOperationsDate(today, 1);
  if (/今日|本日/.test(instruction)) return today;
  const iso = instruction.match(/(20\d{2})[-/]([01]?\d)[-/]([0-3]?\d)/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const japanese = instruction.match(/(20\d{2})年([01]?\d)月([0-3]?\d)日/);
  if (japanese) return `${japanese[1]}-${japanese[2].padStart(2, '0')}-${japanese[3].padStart(2, '0')}`;
  const monthDay = instruction.match(/([01]?\d)月([0-3]?\d)日/);
  if (monthDay) return `${selectedDate.slice(0, 4)}-${monthDay[1].padStart(2, '0')}-${monthDay[2].padStart(2, '0')}`;
  return selectedDate;
}
function shiftOperationsDate(date: string, days: number) { const next = new Date(`${date}T00:00:00`); next.setDate(next.getDate() + days); return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`; }
function addMinutes(time: string, minutes: number) { const [hour, minute] = time.split(':').map(Number); const total = hour * 60 + minute + minutes; return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; }
function createOperationsUuid(prefix: string) { return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function getScheduledChildren(children: ChildProfile[], events: CalendarEvent[], dailyPlans: DailyChildPlan[], date: string) {
  const additions = new Set(events.filter((event) => ['追加利用', '通常利用'].includes(event.eventType)).flatMap((event) => event.childIds));
  const absences = new Set(events.filter((event) => event.eventType === '欠席').flatMap((event) => event.childIds));
  const plans = new Map(dailyPlans.filter((plan) => plan.date === date).map((plan) => [plan.childId, plan]));
  const weekday = getWeekdayFromDate(date);
  return children.filter((child) => {
    const plan = plans.get(child.id);
    if (plan) return plan.attendancePlan !== '欠席';
    return !absences.has(child.id) && (additions.has(child.id) || getRegularDaysForDate(child, date).includes(weekday));
  });
}

function getTransportWarnings(runs: TransportRun[], vehicles: Vehicle[], attendance: AttendanceRecord[], events: CalendarEvent[], dailyPlans: DailyChildPlan[], manualItems: StaffScheduleItem[], children: ChildProfile[]) {
  const result = new Map<string, string[]>();
  const serviceDate = runs[0]?.date;
  const servicePlans = new Map(dailyPlans.filter((plan) => plan.date === serviceDate).map((plan) => [plan.childId, plan]));
  const absentChildren = new Set([
    ...events.filter((event) => event.eventType === '欠席').flatMap((event) => event.childIds).filter((childId) => !servicePlans.has(childId)),
    ...[...servicePlans.values()].filter((plan) => plan.attendancePlan === '欠席').map((plan) => plan.childId),
  ]);
  const attendanceByRecorder = new Map(attendance.map((record) => [record.recorderProfileId, record]));
  const childMap = new Map(children.map((child) => [child.id, child]));
  const push = (runId: string, text: string) => result.set(runId, [...(result.get(runId) || []), text]);
  runs.forEach((run) => {
    const vehicle = vehicles.find((candidate) => candidate.id === run.vehicleId);
    const passengerIds = [...new Set(run.stops.map((stop) => stop.childId).filter(Boolean))];
    if (!run.vehicleId) push(run.id, `${run.name}：車両が未設定です。`);
    if (!run.driverRecorderProfileId) push(run.id, `${run.name}：運転担当者が未設定です。`);
    if (vehicle && passengerIds.length > vehicle.capacity) push(run.id, `${run.name}：乗車児童${passengerIds.length}名が${vehicle.name}の定員${vehicle.capacity}名を超えています。`);
    if (vehicle && !vehicle.available) push(run.id, `${run.name}：使用不可の車両が割り当てられています。`);
    if (vehicle?.inspectionDueDate && vehicle.inspectionDueDate < run.date) push(run.id, `${run.name}：${vehicle.name}の点検・車検期限（${vehicle.inspectionDueDate}）を過ぎています。`);
    if (run.driverRecorderProfileId) {
      const work = attendanceByRecorder.get(run.driverRecorderProfileId);
      if (!work || ['欠勤', '有給', '公休'].includes(work.status)) push(run.id, `${run.name}：運転担当者の出勤予定を確認してください。`);
      else if (work.scheduledStartTime && work.scheduledEndTime && (run.startTime < work.scheduledStartTime || run.endTime > work.scheduledEndTime)) push(run.id, `${run.name}：運転担当者の勤務予定時間外です。`);
    }
    run.stops.forEach((stop) => {
      if (!stop.location.trim()) push(run.id, `${run.name}：${stop.childName || '乗降先'}の場所が未登録です。`);
      if (!stop.plannedTime) push(run.id, `${run.name}：${stop.childName || '乗降先'}の予定時刻が未登録です。`);
      if (stop.childId && absentChildren.has(stop.childId)) push(run.id, `${run.name}：欠席予定の${stop.childName || childMap.get(stop.childId)?.name || '児童'}が含まれています。`);
    });
    runs.filter((other) => other.id !== run.id && overlaps(run, other)).forEach((other) => {
      if (run.vehicleId && run.vehicleId === other.vehicleId) push(run.id, `${run.name}と${other.name}で車両が重複しています。`);
      const runStaff = new Set([run.driverRecorderProfileId, ...run.assistantRecorderProfileIds].filter(Boolean));
      const otherStaff = [other.driverRecorderProfileId, ...other.assistantRecorderProfileIds].filter(Boolean);
      if (otherStaff.some((id) => runStaff.has(id))) push(run.id, `${run.name}と${other.name}で担当職員が重複しています。`);
    });
    const assigned = new Set([run.driverRecorderProfileId, ...run.assistantRecorderProfileIds].filter(Boolean));
    manualItems.filter((item) => item.date === run.date && assigned.has(item.recorderProfileId) && rangesOverlap(run.startTime, run.endTime, item.startTime, item.endTime)).forEach((item) => push(run.id, `${run.name}の担当職員に「${item.title}」との時間重複があります。`));
    events.filter((event) => !event.allDay && event.startTime && event.endTime && event.recorderProfileIds.some((id) => assigned.has(id)) && rangesOverlap(run.startTime, run.endTime, event.startTime, event.endTime)).forEach((event) => push(run.id, `${run.name}の担当職員にカレンダー予定「${event.title}」との時間重複があります。`));
  });
  return result;
}

function eventOccursOn(event: CalendarEvent, date: string) {
  if (event.recurrence === 'なし') return event.endDate
    ? event.date <= date && event.endDate >= date
    : event.date === date;
  if (date < event.date || (event.endDate && date > event.endDate)) return false;
  if (event.recurrence === '毎日') return true;
  const start = new Date(`${event.date}T00:00:00`);
  const target = new Date(`${date}T00:00:00`);
  return event.recurrence === '毎週' ? start.getDay() === target.getDay() : start.getDate() === target.getDate();
}
function overlaps(left: TransportRun, right: TransportRun) { return rangesOverlap(left.startTime, left.endTime, right.startTime, right.endTime); }
function rangesOverlap(startA: string, endA: string, startB: string, endB: string) { return startA < endB && startB < endA; }
