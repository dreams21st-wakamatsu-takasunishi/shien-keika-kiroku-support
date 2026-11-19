import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BusFront,
  CalendarDays,
  ChartGantt,
  Clock3,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react';
import type {
  AttendanceRecord,
  CalendarEvent,
  ChildProfile,
  DailyChildPlan,
  RecorderProfile,
  StaffScheduleItem,
  TransportRun,
  TransportAreaZone,
  TransportMapLocation,
  TransportRouteSettings,
  Vehicle,
} from '../types';
import { getLocalDateString, getRegularDaysForDate, getWeekdayFromDate } from '../utils/weekdays';
import { getVehicleChildCapacity, getVehicleStaffSeatCount } from '../utils/vehicleCapacity';
import { StaffSchedulePanel } from './StaffSchedulePanel';
import { TodayTransportOverview } from './TodayTransportOverview';

import {OperationalPeriodStatus,useOperationalPeriod,type OperationalLoader} from './useOperationalPeriod';
import {dayPeriod} from '../services/operationalPeriod';
type WorkView = 'placement' | 'transport';

interface TodayWorkPanelProps {
  onLoadOperationalPeriod?:OperationalLoader;
  initialDate?: string;
  initialView?: WorkView;
  staffScheduleItems: StaffScheduleItem[];
  calendarEvents: CalendarEvent[];
  attendanceRecords: AttendanceRecord[];
  vehicles: Vehicle[];
  transportRuns: TransportRun[];
  transportRouteSettings: TransportRouteSettings;
  transportMapLocations: TransportMapLocation[];
  transportAreaZones: TransportAreaZone[];
  recorderProfiles: RecorderProfile[];
  childrenList: ChildProfile[];
  dailyChildPlans: DailyChildPlan[];
  canManage: boolean;
  onSaveStaffSchedule: (item: StaffScheduleItem) => Promise<void> | void;
  onDeleteStaffSchedule: (itemId: string) => Promise<void> | void;
  onOpenAssignment?: (date: string, runId: string) => void;
}

export const TodayWorkPanel: React.FC<TodayWorkPanelProps> = ({
  onLoadOperationalPeriod,
  initialDate,
  initialView,
  staffScheduleItems,
  calendarEvents,
  attendanceRecords,
  vehicles,
  transportRuns,
  transportRouteSettings,
  transportMapLocations,
  transportAreaZones,
  recorderProfiles,
  childrenList,
  dailyChildPlans,
  canManage,
  onSaveStaffSchedule,
  onDeleteStaffSchedule,
  onOpenAssignment,
}) => {
  const [selectedDate, setSelectedDate] = useState(initialDate || getLocalDateString());
  const periodRead=useOperationalPeriod(onLoadOperationalPeriod,dayPeriod(selectedDate),'both');
  const [view, setView] = useState<WorkView>(initialView || 'placement');
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
  const absent = dayAttendance.filter((record) => ['欠勤', '有給', '公休', '特別休暇'].includes(record.status));

  const openGenerated = (item: StaffScheduleItem) => {
    if (item.sourceType === 'transport') setView('transport');
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-xs font-black text-teal-700">本日の業務</p><h2 className="mt-1 text-xl font-black text-slate-950">職員配置と当日の送迎を確認</h2><p className="mt-1 text-xs text-slate-500">出勤予定・業務カレンダー・利用予定／送迎管理はホームから開きます。</p></div>
          <label className="flex items-center gap-2 text-sm font-black text-slate-700"><CalendarDays className="h-5 w-5 text-teal-600" /><input aria-label="業務の対象日" type="date" value={selectedDate} onChange={(event) => {if(dayPeriod(event.target.value))setSelectedDate(event.target.value);}} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3" /></label>
        </div>
        {periodRead.ready && <div className="ui-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-5 lg:overflow-visible">
          <SummaryCard icon={UserRoundCheck} label="出勤中" value={`${working.length}名`} tone="emerald" />
          <SummaryCard icon={Clock3} label="未出勤・休暇" value={`${Math.max(0, recorderProfiles.filter((profile) => profile.active).length - working.length)}名`} detail={absent.length ? `休暇等 ${absent.length}名` : undefined} tone="amber" />
          <SummaryCard icon={UsersRound} label="利用予定児童" value={`${scheduledChildren.length}名`} tone="blue" />
          <SummaryCard icon={BusFront} label="送迎便" value={`${dayRuns.length}便`} detail={`${dayRuns.filter((run) => run.status !== '未出発').length}便 運行開始`} tone="violet" />
          <SummaryCard icon={AlertTriangle} label="要確認" value={`${new Set(allWarnings).size}件`} tone={allWarnings.length ? 'rose' : 'slate'} />
        </div>
        }
        <nav className="mt-3 border-t border-slate-100 pt-3" aria-label="本日の業務メニュー">
          <div className="grid grid-cols-2 gap-1">
            <WorkTab active={view === 'placement'} icon={ChartGantt} label="職員配置" onClick={() => setView('placement')} />
            <WorkTab active={view === 'transport'} icon={BusFront} label="送迎" onClick={() => setView('transport')} />
          </div>
        </nav>
      </section>

      {!periodRead.ready ? <OperationalPeriodStatus {...periodRead}/> : <>
      {allWarnings.length > 0 && (
        <details className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <summary className="cursor-pointer font-black text-amber-950">配置・配車の確認事項（{new Set(allWarnings).size}件）</summary>
          <ul className="mt-3 space-y-1 text-sm text-amber-900">{[...new Set(allWarnings)].map((warning) => <li key={warning} className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{warning}</li>)}</ul>
        </details>
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
      {view === 'transport' && (
        <TodayTransportOverview date={selectedDate} runs={transportRuns} locations={transportMapLocations} zones={transportAreaZones} routeSettings={transportRouteSettings} onOpenAssignment={onOpenAssignment ? runId => onOpenAssignment(selectedDate, runId) : undefined} />
      )}
      </>}
    </div>
  );
};

const WorkTab = ({ active, icon: Icon, label, onClick }: { active: boolean; icon: React.ElementType; label: string; onClick: () => void }) => <button type="button" onClick={onClick} aria-pressed={active} className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-black sm:flex-row sm:gap-2 sm:text-sm ${active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}><Icon className="h-4 w-4 sm:h-5 sm:w-5" />{label}</button>;
const SummaryCard = ({ icon: Icon, label, value, detail, tone }: { icon: React.ElementType; label: string; value: string; detail?: string; tone: string }) => <div className={`min-w-[8.5rem] rounded-xl border px-3 py-2.5 lg:min-w-0 ${tone === 'emerald' ? 'border-emerald-200 bg-emerald-50' : tone === 'amber' ? 'border-amber-200 bg-amber-50' : tone === 'blue' ? 'border-sky-200 bg-sky-50' : tone === 'violet' ? 'border-violet-200 bg-violet-50' : tone === 'rose' ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}><span className="flex items-center gap-1 text-[10px] font-bold text-slate-500"><Icon className="h-3.5 w-3.5" />{label}</span><strong className="mt-0.5 block text-lg text-slate-950">{value}</strong>{detail && <span className="block truncate text-[9px] text-slate-500">{detail}</span>}</div>;

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
    startTime: record.scheduledStartTime, endTime: record.scheduledEndTime, title: ['欠勤', '有給', '公休', '特別休暇'].includes(record.status) ? record.status : '勤務可能時間', category: 'その他' as const,
    childIds: [], note: record.note, createdAt: record.createdAt, updatedAt: record.updatedAt, sourceType: 'attendance' as const, sourceId: record.id, generated: true,
  }]);
  const transportItems = runs.flatMap((run) => [run.driverRecorderProfileId, ...run.assistantRecorderProfileIds].filter(Boolean).map((recorderId) => ({
    id: `generated-transport-${run.id}-${recorderId}`, recorderProfileId: recorderId!, recorderName: recorderName.get(recorderId!) || '職員', date: run.date,
    startTime: run.startTime, endTime: run.endTime, title: `${run.name}（${run.direction}）`, category: '送迎' as const, location: run.stops.map((stop) => stop.location).filter(Boolean).join(' → '),
    childIds: run.stops.map((stop) => stop.childId).filter((id): id is string => Boolean(id)), note: run.operationNote, createdAt: run.createdAt || now, updatedAt: run.updatedAt || now, sourceType: 'transport' as const, sourceId: run.id, generated: true,
  })));
  return [...calendarItems, ...attendanceItems, ...transportItems];
}

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
    if (vehicle && passengerIds.length > getVehicleChildCapacity(vehicle, run)) push(run.id, `${run.name}：乗車児童${passengerIds.length}名が、${vehicle.name}の総定員${vehicle.capacity}名から運転者1名・添乗${getVehicleStaffSeatCount(run) - 1}名を除いた児童枠${getVehicleChildCapacity(vehicle, run)}名を超えています。`);
    if (vehicle && !vehicle.available) push(run.id, `${run.name}：使用不可の車両が割り当てられています。`);
    if (vehicle?.inspectionDueDate && vehicle.inspectionDueDate < run.date) push(run.id, `${run.name}：${vehicle.name}の点検・車検期限（${vehicle.inspectionDueDate}）を過ぎています。`);
    if (run.driverRecorderProfileId) {
      const work = attendanceByRecorder.get(run.driverRecorderProfileId);
      if (!work || ['欠勤', '有給', '公休', '特別休暇'].includes(work.status)) push(run.id, `${run.name}：運転担当者の出勤予定を確認してください。`);
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
