import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  ArrowDown,
  ArrowUp,
  BusFront,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  ChildProfile,
  DailyChildPlan,
  RecorderProfile,
  TransportDirection,
  TransportLocationType,
  TransportRun,
  TransportStop,
  Vehicle,
} from '../types';
import { getSuggestedTransportLocation, getTransportLocationOptions } from '../utils/transportLocations';
import { getTransportScheduleForDate, getTransportTargetTime } from '../utils/transportSchedule';
import { getRegularDaysForDate, getWeekdayFromDate } from '../utils/weekdays';

interface DailyTransportPlannerProps {
  date: string;
  runs: TransportRun[];
  vehicles: Vehicle[];
  recorderProfiles: RecorderProfile[];
  childrenList: ChildProfile[];
  dailyChildPlans: DailyChildPlan[];
  onSaveRun: (run: TransportRun) => Promise<void> | void;
  onDeleteRun: (runId: string) => Promise<void> | void;
  onClose: () => void;
}

interface DragChildData {
  childId: string;
  sourceRunId?: string;
  sourceStopId?: string;
}

const transportCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
};

const LOCATION_TYPES: TransportLocationType[] = ['自宅', '学校', '学童', '習い事', '親族宅', '事業所', 'その他'];
const createUuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function createRun(date: string, direction: TransportDirection, sequence: number, vehicle?: Vehicle): TransportRun {
  const now = new Date().toISOString();
  return {
    id: createUuid(),
    date,
    name: `${direction}${sequence}便${vehicle ? `・${vehicle.name}` : ''}`,
    direction,
    startTime: direction === '迎え' ? '13:00' : '17:00',
    endTime: direction === '迎え' ? '14:00' : '18:00',
    vehicleId: vehicle?.id,
    vehicleName: vehicle?.name,
    assistantRecorderProfileIds: [],
    stops: [],
    status: '未出発',
    createdAt: now,
    updatedAt: now,
  };
}

function childStop(child: ChildProfile, direction: TransportDirection, date: string, dailyPlan?: DailyChildPlan): TransportStop {
  const suggestion = getSuggestedTransportLocation(child, direction, date);
  return {
    id: createUuid(),
    childId: child.id,
    childName: child.name,
    location: suggestion?.address || '',
    locationType: suggestion?.type || (direction === '迎え' ? '学校' : '自宅'),
    locationName: suggestion?.name,
    locationProfileId: suggestion?.source === 'registered' ? suggestion.id : undefined,
    plannedTime: dailyTransportTargetTime(child, date, direction, dailyPlan) || undefined,
    order: 1,
    note: suggestion?.note,
  };
}

function dailyTransportTargetTime(child: ChildProfile, date: string, direction: TransportDirection, dailyPlan?: DailyChildPlan) {
  if (direction === '迎え') return dailyPlan?.schoolEndTime || dailyPlan?.arrivalTime || getTransportTargetTime(child, date, direction);
  return dailyPlan?.departureTime || getTransportTargetTime(child, date, direction);
}

function minutes(time?: string) {
  if (!time) return Number.MAX_SAFE_INTEGER;
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function shiftedTime(time: string, offset: number) {
  const value = Math.max(0, Math.min(23 * 60 + 59, minutes(time) + offset));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function adjustRunTimes(run: TransportRun): TransportRun {
  const times = run.stops.map((stop) => stop.plannedTime).filter((time): time is string => Boolean(time)).sort();
  if (!times.length) return run;
  return {
    ...run,
    startTime: shiftedTime(times[0], run.direction === '迎え' ? -30 : -20),
    endTime: shiftedTime(times[times.length - 1], 30),
  };
}

const ChildCardContent: React.FC<{
  child: ChildProfile;
  date: string;
  pickupAssigned: boolean;
  dropoffAssigned: boolean;
  compact?: boolean;
  preview?: boolean;
}> = ({
  child,
  date,
  pickupAssigned,
  dropoffAssigned,
  compact = false,
  preview = false,
}) => {
  const schedule = getTransportScheduleForDate(child, date);
  return (
    <>
      <div className="flex min-w-0 items-start gap-1.5">
        <span className={`grid h-9 w-8 shrink-0 place-items-center rounded-lg ${preview ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'}`}><GripVertical className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-xs text-slate-900">{child.name}</strong>
          <span className="block truncate text-[9px] font-bold text-slate-500">{child.schoolName || child.pickupLocation || '学校・迎え先未登録'}</span>
          <span className="mt-1 block text-[9px] text-slate-500">迎え基準 {schedule?.schoolEndTime || '―'}／乗車 {schedule?.pickupTime || '―'}／送り {schedule?.dropoffTime || '―'}</span>
        </div>
      </div>
      {!compact && (
        <div className="mt-1.5 flex flex-wrap gap-1 text-[8px] font-black">
          <span className={`rounded-full px-1.5 py-0.5 ${pickupAssigned ? 'bg-sky-600 text-white' : 'bg-sky-50 text-sky-700'}`}>迎え{pickupAssigned ? '済' : '未'}</span>
          <span className={`rounded-full px-1.5 py-0.5 ${dropoffAssigned ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700'}`}>送り{dropoffAssigned ? '済' : '未'}</span>
          {child.siblingGroup && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-800">兄弟 {child.siblingGroup}</span>}
        </div>
      )}
    </>
  );
};

const DraggableChildCard: React.FC<{
  child: ChildProfile;
  date: string;
  data: DragChildData;
  pickupAssigned: boolean;
  dropoffAssigned: boolean;
  compact?: boolean;
}> = ({ child, date, data, pickupAssigned, dropoffAssigned, compact = false }) => {
  const dragId = data.sourceStopId ? `stop-${data.sourceStopId}` : `pool-${child.id}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId, data });
  return (
    <article
      ref={setNodeRef}
      aria-label={`${child.name}の配車カード`}
      className={`relative min-w-0 rounded-xl border bg-white shadow-sm transition-[opacity,box-shadow,border-color] duration-150 ${isDragging ? 'border-teal-300 opacity-30 shadow-none' : 'border-slate-200'} ${compact ? 'p-2' : 'p-2.5'}`}
    >
      <button
        type="button"
        aria-label={`${child.name}をドラッグ`}
        aria-pressed={isDragging}
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 z-10 h-12 w-12 touch-none rounded-xl opacity-0"
      />
      <ChildCardContent child={child} date={date} pickupAssigned={pickupAssigned} dropoffAssigned={dropoffAssigned} compact={compact} />
    </article>
  );
};

const DraggedChildPreview: React.FC<{
  child: ChildProfile;
  date: string;
  pickupAssigned: boolean;
  dropoffAssigned: boolean;
}> = ({ child, date, pickupAssigned, dropoffAssigned }) => (
  <article className="pointer-events-none min-w-0 rotate-[0.4deg] rounded-xl border-2 border-teal-400 bg-white p-2.5 shadow-[0_18px_45px_rgba(15,23,42,0.24)]">
    <ChildCardContent child={child} date={date} pickupAssigned={pickupAssigned} dropoffAssigned={dropoffAssigned} compact preview />
  </article>
);

const TransportRunLane: React.FC<{
  run: TransportRun;
  vehicle?: Vehicle;
  childrenList: ChildProfile[];
  date: string;
  activeRecorders: RecorderProfile[];
  pickupAssignedIds: Set<string>;
  dropoffAssignedIds: Set<string>;
  expandedStopId?: string;
  onExpandStop: (stopId?: string) => void;
  onUpdateRun: (runId: string, patch: Partial<TransportRun>) => void;
  onUpdateStop: (runId: string, stopId: string, patch: Partial<TransportStop>) => void;
  onMoveStop: (runId: string, stopId: string, offset: number) => void;
  onRemoveStop: (runId: string, stopId: string) => void;
  onRemoveRun: (run: TransportRun) => void;
}> = ({
  run,
  vehicle,
  childrenList,
  dailyChildPlans,
  date,
  activeRecorders,
  pickupAssignedIds,
  dropoffAssignedIds,
  expandedStopId,
  onExpandStop,
  onUpdateRun,
  onUpdateStop,
  onMoveStop,
  onRemoveStop,
  onRemoveRun,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: `run-${run.id}`, data: { runId: run.id } });
  const capacity = vehicle?.capacity || 30;
  const overCapacity = run.stops.length > capacity;
  return (
    <article className={`overflow-hidden rounded-xl border bg-white shadow-sm ${overCapacity ? 'border-rose-400' : 'border-slate-200'}`}>
      <header className={`p-2 ${run.direction === '迎え' ? 'bg-sky-50' : 'bg-violet-50'}`}>
        <div className="flex items-center gap-1.5">
          <input aria-label="便名" value={run.name} onChange={(event) => onUpdateRun(run.id, { name: event.target.value })} className="min-h-9 min-w-0 flex-1 rounded-lg border border-white bg-white px-2 text-[11px] font-black" />
          <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${overCapacity ? 'bg-rose-600 text-white' : 'bg-white text-slate-600'}`}>{run.stops.length}/{capacity}名</span>
          <button type="button" onClick={() => onRemoveRun(run)} aria-label={`${run.name}を削除`} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-rose-600"><Trash2 className="h-4 w-4" /></button>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <label className="text-[8px] font-black text-slate-500">開始<input type="time" value={run.startTime} onChange={(event) => onUpdateRun(run.id, { startTime: event.target.value })} className="mt-0.5 min-h-9 w-full rounded-lg border border-white bg-white px-1 text-[10px] font-bold" /></label>
          <label className="text-[8px] font-black text-slate-500">終了<input type="time" value={run.endTime} onChange={(event) => onUpdateRun(run.id, { endTime: event.target.value })} className="mt-0.5 min-h-9 w-full rounded-lg border border-white bg-white px-1 text-[10px] font-bold" /></label>
        </div>
        <label className="mt-1.5 block text-[8px] font-black text-slate-500">運転者<select value={run.driverRecorderProfileId || ''} onChange={(event) => onUpdateRun(run.id, { driverRecorderProfileId: event.target.value || undefined })} className="mt-0.5 min-h-9 w-full rounded-lg border border-white bg-white px-1 text-[10px] font-bold"><option value="">未設定</option>{activeRecorders.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}</select></label>
      </header>
      <div
        ref={setNodeRef}
        role="group"
        aria-label={`${run.name}の配車先`}
        className={`relative min-h-24 space-y-1.5 p-2 transition-[background-color,box-shadow] duration-150 ${isOver ? 'bg-teal-50 shadow-[inset_0_0_0_2px_rgb(45_212_191)]' : 'bg-slate-50'}`}
      >
        {isOver && <span className="pointer-events-none absolute right-2 top-2 z-10 rounded-full bg-teal-600 px-2 py-1 text-[9px] font-black text-white shadow-sm">ここに配置</span>}
        {run.stops.length === 0 && <p className="flex min-h-20 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 px-2 text-center text-[10px] font-bold text-slate-400">ここへ児童をドラッグ</p>}
        {run.stops.map((stop, index) => {
          const child = childrenList.find((candidate) => candidate.id === stop.childId);
          if (!child) return null;
          const expanded = expandedStopId === stop.id;
          const options = getTransportLocationOptions(child, run.direction, date);
          const selectedLocationId = stop.locationProfileId || options.find((option) => option.address === stop.location && option.type === stop.locationType)?.id || '';
          return (
            <div key={stop.id} className="rounded-xl border border-slate-200 bg-white p-1.5">
              <DraggableChildCard child={child} date={date} data={{ childId: child.id, sourceRunId: run.id, sourceStopId: stop.id }} pickupAssigned={pickupAssignedIds.has(child.id)} dropoffAssigned={dropoffAssignedIds.has(child.id)} compact />
              <div className="mt-1 flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate text-[9px] font-bold text-slate-500">{stop.plannedTime || '時刻未設定'}・{stop.locationName || stop.location || '場所未設定'}</span>
                <button type="button" disabled={index === 0} onClick={() => onMoveStop(run.id, stop.id, -1)} aria-label="上へ" className="grid h-8 w-8 place-items-center rounded-md bg-slate-100 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" disabled={index === run.stops.length - 1} onClick={() => onMoveStop(run.id, stop.id, 1)} aria-label="下へ" className="grid h-8 w-8 place-items-center rounded-md bg-slate-100 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => onExpandStop(expanded ? undefined : stop.id)} aria-label="送迎先を編集" className="grid h-8 w-8 place-items-center rounded-md bg-slate-100">{expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button>
                <button type="button" onClick={() => onRemoveStop(run.id, stop.id)} aria-label="児童を便から外す" className="grid h-8 w-8 place-items-center rounded-md bg-rose-50 text-rose-600"><X className="h-3.5 w-3.5" /></button>
              </div>
              {expanded && (
                <div className="ui-panel-enter mt-2 space-y-2 border-t border-slate-100 pt-2">
                  <label className="block text-[9px] font-black text-slate-500">登録送迎先<select value={selectedLocationId} onChange={(event) => { const option = options.find((item) => item.id === event.target.value); onUpdateStop(run.id, stop.id, option ? { location: option.address, locationType: option.type, locationName: option.name, locationProfileId: option.source === 'registered' ? option.id : undefined, note: option.note } : { locationProfileId: undefined, locationName: '今回のみの送迎先' }); }} className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-[10px] font-bold"><option value="">今回のみ・直接入力</option>{options.map((option) => <option key={option.id} value={option.id}>{option.recommended ? '★ ' : ''}{option.name}</option>)}</select></label>
                  <div className="grid grid-cols-[5.5rem_1fr] gap-1.5">
                    <select value={stop.locationType} onChange={(event) => onUpdateStop(run.id, stop.id, { locationType: event.target.value as TransportLocationType, locationProfileId: undefined })} className="min-h-9 rounded-lg border border-slate-300 px-1 text-[10px] font-bold">{LOCATION_TYPES.map((type) => <option key={type}>{type}</option>)}</select>
                    <input value={stop.location} onChange={(event) => onUpdateStop(run.id, stop.id, { location: event.target.value, locationProfileId: undefined, locationName: '今回のみの送迎先' })} placeholder="住所・乗降場所" className="min-h-9 min-w-0 rounded-lg border border-slate-300 px-2 text-[10px]" />
                  </div>
                  <label className="block text-[9px] font-black text-slate-500">予定時刻<input type="time" value={stop.plannedTime || ''} onChange={(event) => onUpdateStop(run.id, stop.id, { plannedTime: event.target.value || undefined })} className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-[10px] font-bold" /></label>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
};

export const DailyTransportPlanner: React.FC<DailyTransportPlannerProps> = ({
  date,
  runs,
  vehicles,
  recorderProfiles,
  childrenList,
  dailyChildPlans,
  onSaveRun,
  onDeleteRun,
  onClose,
}) => {
  const [drafts, setDrafts] = useState<TransportRun[]>(() => runs.map((run) => ({ ...run, stops: run.stops.map((stop) => ({ ...stop })), assistantRecorderProfileIds: [...run.assistantRecorderProfileIds] })));
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [additionalChildIds, setAdditionalChildIds] = useState<string[]>([]);
  const [childPickerOpen, setChildPickerOpen] = useState(false);
  const [childSearch, setChildSearch] = useState('');
  const [expandedStopId, setExpandedStopId] = useState<string>();
  const [activeDragData, setActiveDragData] = useState<DragChildData>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 10 } }),
  );
  const activeRecorders = useMemo(() => recorderProfiles.filter((profile) => profile.active), [recorderProfiles]);
  const boardVehicles = useMemo(() => vehicles.filter((vehicle) => vehicle.available || drafts.some((run) => run.vehicleId === vehicle.id)), [drafts, vehicles]);
  const vehicleSlots = useMemo<Array<Vehicle | undefined>>(() => [
    ...boardVehicles,
    ...(boardVehicles.length === 0 || drafts.some((run) => !run.vehicleId) ? [undefined] : []),
  ], [boardVehicles, drafts]);
  const weekday = getWeekdayFromDate(date);
  const dayPlans = useMemo(() => dailyChildPlans.filter((plan) => plan.date === date), [dailyChildPlans, date]);
  const dayPlansByChild = useMemo(() => new Map(dayPlans.map((plan) => [plan.childId, plan])), [dayPlans]);
  const scheduledChildren = useMemo(() => childrenList.filter((child) => {
    const plan = dayPlansByChild.get(child.id);
    return plan ? plan.attendancePlan !== '欠席' : getRegularDaysForDate(child, date).includes(weekday);
  }), [childrenList, date, dayPlansByChild, weekday]);
  const assignedChildIds = useMemo(() => new Set(drafts.flatMap((run) => run.stops.map((stop) => stop.childId).filter((id): id is string => Boolean(id)))), [drafts]);
  const poolChildren = useMemo(() => childrenList.filter((child) => scheduledChildren.some((scheduled) => scheduled.id === child.id) || additionalChildIds.includes(child.id) || assignedChildIds.has(child.id)), [additionalChildIds, assignedChildIds, childrenList, scheduledChildren]);
  const pickupAssignedIds = useMemo(() => new Set(drafts.filter((run) => run.direction === '迎え').flatMap((run) => run.stops.map((stop) => stop.childId).filter((id): id is string => Boolean(id)))), [drafts]);
  const dropoffAssignedIds = useMemo(() => new Set(drafts.filter((run) => run.direction === '送り').flatMap((run) => run.stops.map((stop) => stop.childId).filter((id): id is string => Boolean(id)))), [drafts]);
  const activeDragChild = useMemo(() => childrenList.find((child) => child.id === activeDragData?.childId), [activeDragData?.childId, childrenList]);

  const updateRun = (runId: string, patch: Partial<TransportRun>) => setDrafts((current) => current.map((run) => run.id === runId ? { ...run, ...patch, routeOptimizedAt: undefined } : run));
  const updateStop = (runId: string, stopId: string, patch: Partial<TransportStop>) => setDrafts((current) => current.map((run) => run.id === runId ? { ...run, routeOptimizedAt: undefined, stops: run.stops.map((stop) => stop.id === stopId ? { ...stop, ...patch } : stop) } : run));
  const removeStop = (runId: string, stopId: string) => setDrafts((current) => current.map((run) => run.id === runId ? { ...run, routeOptimizedAt: undefined, stops: run.stops.filter((stop) => stop.id !== stopId).map((stop, index) => ({ ...stop, order: index + 1 })) } : run));
  const moveStop = (runId: string, stopId: string, offset: number) => setDrafts((current) => current.map((run) => {
    if (run.id !== runId) return run;
    const index = run.stops.findIndex((stop) => stop.id === stopId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= run.stops.length) return run;
    const stops = [...run.stops];
    [stops[index], stops[target]] = [stops[target], stops[index]];
    return { ...run, routeOptimizedAt: undefined, stops: stops.map((stop, order) => ({ ...stop, order: order + 1 })) };
  }));

  const addRun = (direction: TransportDirection, vehicle?: Vehicle) => {
    const sequence = drafts.filter((run) => run.direction === direction && run.vehicleId === vehicle?.id).length + 1;
    setDrafts((current) => [...current, createRun(date, direction, sequence, vehicle)]);
  };

  const removeRun = (run: TransportRun) => {
    if (run.stops.length && !window.confirm(`${run.name}には児童がいます。便を削除して児童を未配車へ戻しますか？`)) return;
    if (runs.some((saved) => saved.id === run.id)) setDeletedIds((current) => Array.from(new Set([...current, run.id])));
    setDrafts((current) => current.filter((candidate) => candidate.id !== run.id));
  };

  const assignChild = (childId: string, targetRunId: string) => {
    const child = childrenList.find((candidate) => candidate.id === childId);
    const targetRun = drafts.find((run) => run.id === targetRunId);
    if (!child || !targetRun) return;
    setDrafts((current) => current.map((run) => {
      const withoutSameDirection = run.direction === targetRun.direction ? run.stops.filter((stop) => stop.childId !== childId) : run.stops;
      if (run.id !== targetRunId) return { ...run, stops: withoutSameDirection.map((stop, index) => ({ ...stop, order: index + 1 })) };
      const nextStop = childStop(child, run.direction, date, dayPlansByChild.get(child.id));
      return adjustRunTimes({ ...run, routeOptimizedAt: undefined, stops: [...withoutSameDirection, { ...nextStop, order: withoutSameDirection.length + 1 }] });
    }));
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveDragData(active.data.current as DragChildData | undefined);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveDragData(undefined);
    if (!over) return;
    const data = active.data.current as DragChildData | undefined;
    const targetRunId = over.data.current?.runId as string | undefined;
    if (data?.childId && targetRunId) assignChild(data.childId, targetRunId);
  };

  const autoAllocate = () => {
    const eligible = poolChildren.filter((child) => child.transportationRequired === true);
    if (!eligible.length) return setError('送迎利用が有効な児童がいません。児童名簿の送迎情報を確認してください。');
    if (drafts.some((run) => run.stops.length) && !window.confirm('現在の配車を、登録情報を基に振り分け直しますか？')) return;
    let nextDrafts = drafts.map((run) => ({ ...run, routeOptimizedAt: undefined, stops: [] as TransportStop[] }));
    const usableVehicles = boardVehicles.length ? boardVehicles : [undefined];

    (['迎え', '送り'] as TransportDirection[]).forEach((direction) => {
      let lanes = nextDrafts.filter((run) => run.direction === direction);
      usableVehicles.forEach((vehicle) => {
        if (!lanes.some((run) => run.vehicleId === vehicle?.id)) {
          const created = createRun(date, direction, 1, vehicle);
          nextDrafts.push(created);
          lanes.push(created);
        }
      });
      const familyGroups = new Map<string, ChildProfile[]>();
      eligible.forEach((child) => {
        const key = child.siblingGroup?.trim() || `child-${child.id}`;
        familyGroups.set(key, [...(familyGroups.get(key) || []), child]);
      });
      const maximumVehicleCapacity = Math.max(...usableVehicles.map((vehicle) => vehicle?.capacity || 30));
      const groups = Array.from(familyGroups.values())
        .sort((left, right) => minutes(dailyTransportTargetTime(left[0], date, direction, dayPlansByChild.get(left[0].id))) - minutes(dailyTransportTargetTime(right[0], date, direction, dayPlansByChild.get(right[0].id))))
        .flatMap((family) => {
          if (family.length <= maximumVehicleCapacity) return [family];
          const divided: ChildProfile[][] = [];
          for (let index = 0; index < family.length; index += maximumVehicleCapacity) divided.push(family.slice(index, index + maximumVehicleCapacity));
          return divided;
        });
      groups.forEach((group) => {
        const firstSuggestion = getSuggestedTransportLocation(group[0], direction, date);
        const ranked = lanes.map((run) => {
          const vehicle = usableVehicles.find((candidate) => candidate?.id === run.vehicleId);
          const capacity = vehicle?.capacity || 30;
          const sameLocation = run.stops.some((stop) => stop.location === firstSuggestion?.address);
          const hasCapacity = run.stops.length + group.length <= capacity;
          return { run, score: (hasCapacity ? 100 : -1000) + (sameLocation ? 40 : 0) - run.stops.length * 3 };
        }).sort((left, right) => right.score - left.score);
        let target = ranked[0]?.score >= 0 ? ranked[0].run : undefined;
        if (!target) {
          const fittingVehicles = usableVehicles.filter((vehicle) => (vehicle?.capacity || 30) >= group.length);
          const vehicle = (fittingVehicles.length ? fittingVehicles : usableVehicles).slice().sort((left, right) => {
            const laneDifference = lanes.filter((run) => run.vehicleId === left?.id).length - lanes.filter((run) => run.vehicleId === right?.id).length;
            return laneDifference || (left?.capacity || 30) - (right?.capacity || 30);
          })[0];
          target = createRun(date, direction, lanes.filter((run) => run.vehicleId === vehicle?.id).length + 1, vehicle);
          nextDrafts.push(target);
          lanes.push(target);
        }
        const additions = group.map((child, index) => ({ ...childStop(child, direction, date, dayPlansByChild.get(child.id)), order: target!.stops.length + index + 1 }));
        const updated = adjustRunTimes({ ...target, stops: [...target.stops, ...additions] });
        nextDrafts = nextDrafts.map((run) => run.id === target!.id ? updated : run);
        lanes = lanes.map((run) => run.id === target!.id ? updated : run);
      });
    });
    setDrafts(nextDrafts);
    setError('');
  };

  const saveAll = async () => {
    const runsToSave = drafts.filter((run) => run.stops.length > 0 || runs.some((saved) => saved.id === run.id));
    const invalidRun = runsToSave.find((run) => !run.name.trim() || run.startTime >= run.endTime);
    if (invalidRun) return setError(`${invalidRun.name || '名称未設定の便'}の便名または時刻を確認してください。`);
    const invalidStopRun = runsToSave.find((run) => run.stops.some((stop) => !stop.childId || !stop.location.trim()));
    if (invalidStopRun) return setError(`${invalidStopRun.name}に送迎場所が未入力の児童がいます。`);
    setSaving(true);
    setError('');
    try {
      for (const run of runsToSave) await onSaveRun({ ...run, name: run.name.trim(), driverName: activeRecorders.find((profile) => profile.id === run.driverRecorderProfileId)?.displayName, vehicleName: vehicles.find((vehicle) => vehicle.id === run.vehicleId)?.name, stops: run.stops.map((stop, index) => ({ ...stop, order: index + 1 })), updatedAt: new Date().toISOString() });
      for (const id of deletedIds) await onDeleteRun(id);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '当日の送迎を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const renderDirection = (direction: TransportDirection) => (
    <section className={`min-w-0 rounded-2xl border p-2 ${direction === '迎え' ? 'border-sky-300 bg-sky-50/60' : 'border-violet-300 bg-violet-50/60'}`}>
      <header className="mb-2 flex items-center justify-between gap-2 px-1">
        <div><p className={`text-[10px] font-black uppercase tracking-[0.14em] ${direction === '迎え' ? 'text-sky-700' : 'text-violet-700'}`}>{direction}配車</p><h3 className="text-base font-black text-slate-950">{direction}便</h3></div>
        <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-slate-600">{drafts.filter((run) => run.direction === direction && run.stops.length > 0).length}便使用</span>
      </header>
      <div className="space-y-2">
        {vehicleSlots.map((vehicle) => {
          const vehicleRuns = drafts.filter((run) => run.direction === direction && run.vehicleId === vehicle?.id);
          return (
            <section key={vehicle?.id || 'unassigned'} className="rounded-xl border border-slate-200 bg-white/80 p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-black text-slate-800"><BusFront className={`h-4 w-4 ${direction === '迎え' ? 'text-sky-600' : 'text-violet-600'}`} /><span className="truncate">{vehicle?.name || '車両未設定'}</span>{vehicle && <span className="text-[9px] font-bold text-slate-400">定員{vehicle.capacity}</span>}</span>
                <button type="button" onClick={() => addRun(direction, vehicle)} className={`min-h-9 shrink-0 rounded-lg px-2 text-[10px] font-black text-white ${direction === '迎え' ? 'bg-sky-600' : 'bg-violet-600'}`}><Plus className="mr-0.5 inline h-3.5 w-3.5" />便を追加</button>
              </div>
              <div className="space-y-2">
                {vehicleRuns.length === 0 && <button type="button" onClick={() => addRun(direction, vehicle)} className="min-h-20 w-full rounded-xl border-2 border-dashed border-slate-300 bg-white text-[10px] font-bold text-slate-400">この車両に{direction}便を追加</button>}
                {vehicleRuns.map((run) => <TransportRunLane key={run.id} run={run} vehicle={vehicle} childrenList={childrenList} date={date} activeRecorders={activeRecorders} pickupAssignedIds={pickupAssignedIds} dropoffAssignedIds={dropoffAssignedIds} expandedStopId={expandedStopId} onExpandStop={setExpandedStopId} onUpdateRun={updateRun} onUpdateStop={updateStop} onMoveStop={moveStop} onRemoveStop={removeStop} onRemoveRun={removeRun} />)}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="app-safe-block ui-fade-in fixed inset-0 z-[100] flex flex-col bg-slate-100" role="dialog" aria-modal="true" aria-label={`${date}の全送迎を編集`}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2.5 shadow-sm sm:px-5">
        <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.15em] text-teal-700">一日配車ボード・{weekday}曜日</p><h2 className="truncate text-base font-black text-slate-950 sm:text-xl">{date} の全送迎を組む</h2></div>
        <button type="button" onClick={onClose} aria-label="閉じる" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100"><X className="h-5 w-5" /></button>
      </header>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <button type="button" onClick={autoAllocate} className="flex min-h-10 items-center gap-1 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-3 text-xs font-black text-white"><Sparkles className="h-4 w-4" />登録情報から自動振り分け</button>
        <button type="button" onClick={() => setChildPickerOpen(true)} className="flex min-h-10 items-center gap-1 rounded-xl border border-teal-300 bg-teal-50 px-3 text-xs font-black text-teal-800"><UserPlus className="h-4 w-4" />児童を追加</button>
        <p className="min-w-0 flex-1 text-[10px] font-bold leading-relaxed text-slate-500">児童カードを車両の便へドラッグして配車します。自動振り分け後も移動・順番変更・送迎先編集ができます。</p>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={transportCollisionDetection}
        onDragStart={handleDragStart}
        onDragCancel={() => setActiveDragData(undefined)}
        onDragEnd={handleDragEnd}
      >
        <div className="ui-scrollbar flex-1 overflow-y-auto p-2 sm:p-3">
          <div className="mx-auto grid max-w-[1600px] items-start gap-2 md:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_minmax(0,1fr)]">
            <aside className="min-w-0 rounded-2xl border border-emerald-300 bg-emerald-50/70 p-2 md:sticky md:top-0">
              <div className="mb-2 flex items-center justify-between gap-1 px-1"><div><p className="text-[9px] font-black text-emerald-700">{weekday}曜日の利用予定</p><h3 className="text-sm font-black text-slate-950">対象児童</h3></div><span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-emerald-800">{poolChildren.length}名</span></div>
              <div className="space-y-1.5 md:max-h-[calc(100dvh-15rem)] md:overflow-y-auto md:pr-0.5">
                {poolChildren.map((child) => <DraggableChildCard key={child.id} child={child} date={date} data={{ childId: child.id }} pickupAssigned={pickupAssignedIds.has(child.id)} dropoffAssigned={dropoffAssignedIds.has(child.id)} />)}
                {poolChildren.length === 0 && <div className="rounded-xl border-2 border-dashed border-emerald-200 bg-white p-4 text-center"><Users className="mx-auto h-7 w-7 text-emerald-300" /><p className="mt-1 text-[10px] font-bold text-slate-400">定期利用児童がいません。「児童を追加」から追加できます。</p></div>}
              </div>
            </aside>
            {renderDirection('迎え')}
            {renderDirection('送り')}
          </div>
        </div>
        {createPortal(
          <DragOverlay
            adjustScale={false}
            dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
            zIndex={150}
          >
            {activeDragChild ? (
              <DraggedChildPreview
                child={activeDragChild}
                date={date}
                pickupAssigned={pickupAssignedIds.has(activeDragChild.id)}
                dropoffAssigned={dropoffAssignedIds.has(activeDragChild.id)}
              />
            ) : null}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>
      <footer className="shrink-0 border-t border-slate-200 bg-white p-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)]">
        <div className="mx-auto flex max-w-[1600px] flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="min-h-5 text-xs font-bold text-rose-700">{error}</div><div className="grid shrink-0 grid-cols-2 gap-2 sm:flex"><button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-slate-300 px-5 text-sm font-black text-slate-600">キャンセル</button><button type="button" disabled={saving} onClick={() => void saveAll()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 text-sm font-black text-white disabled:opacity-50">{saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save className="h-5 w-5" />}{saving ? '保存中…' : '配車を保存'}</button></div></div>
      </footer>
      {childPickerOpen && (
        <div className="ui-fade-in fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="追加利用児童を選択">
          <section className="ui-panel-enter flex max-h-[82dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <header className="flex items-center justify-between border-b border-slate-200 p-4"><div><p className="text-[10px] font-black text-teal-700">追加利用・突発利用</p><h3 className="text-lg font-black">児童を追加</h3></div><button type="button" onClick={() => setChildPickerOpen(false)} aria-label="閉じる" className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100"><X className="h-5 w-5" /></button></header>
            <div className="border-b border-slate-100 p-3"><label className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={childSearch} onChange={(event) => setChildSearch(event.target.value)} placeholder="児童名・学校名で検索" className="min-h-10 w-full rounded-xl border border-slate-300 pl-9 pr-3 text-sm" /></label></div>
            <div className="ui-scrollbar flex-1 space-y-1 overflow-y-auto p-3">{childrenList.filter((child) => `${child.name}${child.kana || ''}${child.schoolName || ''}`.includes(childSearch.trim())).map((child) => { const defaultChild = scheduledChildren.some((item) => item.id === child.id); const added = additionalChildIds.includes(child.id); return <button key={child.id} type="button" disabled={defaultChild} onClick={() => setAdditionalChildIds((current) => added ? current.filter((id) => id !== child.id) : [...current, child.id])} className={`flex min-h-12 w-full items-center justify-between rounded-xl border px-3 text-left ${defaultChild || added ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-white'}`}><span><strong className="block text-sm">{child.name}</strong><span className="text-[10px] text-slate-500">{child.schoolName || child.grade || '学校未登録'}</span></span><span className="text-[10px] font-black text-teal-700">{defaultChild ? '定期利用' : added ? '追加済み' : '追加する'}</span></button>; })}</div>
            <div className="border-t border-slate-200 p-3"><button type="button" onClick={() => setChildPickerOpen(false)} className="min-h-11 w-full rounded-xl bg-teal-600 text-sm font-black text-white">配車ボードへ反映</button></div>
          </section>
        </div>
      )}
    </div>
  );
};
