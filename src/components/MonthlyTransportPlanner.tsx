import React, { useMemo, useState } from 'react';
import {
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Clock3,
  CopyCheck,
  Home,
  Info,
  LoaderCircle,
  MapPin,
  Pencil,
  Printer,
  RotateCcw,
  Save,
  Search,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import type {
  ChildProfile,
  DailyChildPlan,
  DailyTransportRequirement,
  MonthlyScheduleDeleteResult,
  TransportDirection,
  TransportPickupMode,
  TransportPlanDay,
  TransportRouteSettings,
  TransportRun,
  TransportTimeChangeHistory,
  TransportTimeMode,
} from '../types';
import { loadTransportTimeChangeHistory } from '../services/dataService';
import { getTransportLocationOptions, type TransportLocationOption } from '../utils/transportLocations';
import { getTransportScheduleForDate } from '../utils/transportSchedule';
import { getDefaultDepartureTime } from '../utils/transportDeparture';
import { getRegularDaysForDate, getWeekdayFromDate } from '../utils/weekdays';
import { inferTransportArea, resolvedTransportArea } from '../utils/transportArea';
import { buildSiblingGroupByChild } from '../utils/childSiblings';

interface MonthlyTransportPlannerProps {
  organizationId?: string;
  initialDate: string;
  childrenList: ChildProfile[];
  dailyChildPlans: DailyChildPlan[];
  requirements: DailyTransportRequirement[];
  planDays: TransportPlanDay[];
  transportRuns: TransportRun[];
  routeSettings: TransportRouteSettings;
  canManage: boolean;
  onSavePlanDay: (day: TransportPlanDay) => Promise<void> | void;
  onSaveDailyChildPlan: (plan: DailyChildPlan) => Promise<void> | void;
  onDeleteDailyChildPlan: (childId: string, date: string) => Promise<void> | void;
  onDeleteRequirement: (childId: string, date: string) => Promise<void> | void;
  onDeleteMonthSchedules: (month: string, childId?: string) => Promise<MonthlyScheduleDeleteResult>;
  onSaveRequirements: (requirements: DailyTransportRequirement[]) => Promise<void> | void;
  onReplaceMonthRequirements: (month: string, requirements: DailyTransportRequirement[]) => Promise<DailyTransportRequirement[]>;
  onReplaceChildMonthRequirements: (month: string, childId: string, requirements: DailyTransportRequirement[]) => Promise<DailyTransportRequirement[]>;
}

const createUuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
type CalendarViewMode = 'all' | 'child' | 'household' | 'school';

function monthDates(month: string) {
  const [year, value] = month.split('-').map(Number);
  const last = new Date(year, value, 0).getDate();
  return Array.from({ length: last }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
}

function nextMonthValue(value: string) {
  const [year, month] = value.split('-').map(Number);
  const next = new Date(year, month, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}

function previousMonthValue(value: string) {
  const [year, month] = value.split('-').map(Number);
  const previous = new Date(year, month - 2, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
}

function timeValue(value?: string) {
  return value ? value.slice(0, 5) : '';
}

const TRANSPORT_TIME_MODE_OPTIONS: Array<{ value: TransportTimeMode; label: string }> = [
  { value: 'fixed', label: '時刻固定' },
  { value: 'arrival_backward', label: '来所・帰着時刻から逆算' },
  { value: 'departure_forward', label: '施設出発時刻から順算' },
];

function timeAnchorLabel(direction: TransportDirection, mode: TransportTimeMode) {
  if (mode === 'fixed') return direction === '迎え' ? '下校・迎え時刻' : '送り先への到着希望時刻';
  if (mode === 'arrival_backward') return direction === '迎え' ? '事業所への来所目標時刻' : '事業所への帰着目標時刻';
  return '施設からの送迎開始時刻';
}

function transportTimeSummary(requirement: DailyTransportRequirement, direction: TransportDirection) {
  const mode = direction === '迎え' ? requirement.pickupTimeMode : requirement.dropoffTimeMode;
  const anchor = direction === '迎え' ? requirement.pickupTargetTime : requirement.dropoffTargetTime;
  if (!anchor) return '基準時刻未設定';
  if (mode === 'fixed') return anchor;
  return `${mode === 'arrival_backward' ? '逆算' : '順算'} ${anchor}`;
}

function compactGrade(grade?: string) {
  if (!grade) return '—';
  return grade
    .replace('小学校', '小')
    .replace('中学校', '中')
    .replace('高等学校', '高')
    .replace('高校', '高')
    .replace('年生', '');
}

function rosterTimeLabel(requirement: DailyTransportRequirement | undefined, direction: TransportDirection, transportationRequired: boolean) {
  if (!requirement) return transportationRequired ? '未設定' : '保護者';
  const enabled = direction === '迎え' ? requirement.pickupEnabled : requirement.dropoffEnabled;
  if (!enabled) return '保護者';
  return timeValue(direction === '迎え' ? requirement.pickupTargetTime : requirement.dropoffTargetTime) || '未設定';
}

function rosterLocationLabel(requirement: DailyTransportRequirement | undefined, direction: TransportDirection, transportationRequired: boolean) {
  if (!requirement) return transportationRequired ? '未設定' : '保護者';
  const enabled = direction === '迎え' ? requirement.pickupEnabled : requirement.dropoffEnabled;
  if (!enabled) return '保護者';
  return (direction === '迎え' ? requirement.pickupLocationName : requirement.dropoffLocationName)
    || (direction === '迎え' ? requirement.pickupAddress : requirement.dropoffAddress)
    || '未設定';
}

function scheduledChildrenForDate(
  children: ChildProfile[],
  plans: DailyChildPlan[],
  date: string,
) {
  return serviceChildrenForDate(children, plans, date)
    .filter((child) => child.transportationRequired);
}

function serviceChildrenForDate(
  children: ChildProfile[],
  plans: DailyChildPlan[],
  date: string,
) {
  const weekday = getWeekdayFromDate(date);
  return children.filter((child) => {
    if (child.serviceSuspended) return false;
    const plan = plans.find((candidate) => candidate.childId === child.id && candidate.date === date);
    return plan ? plan.attendancePlan !== '欠席' : getRegularDaysForDate(child, date).includes(weekday);
  });
}

function preferredLocation(
  child: ChildProfile,
  direction: TransportDirection,
  date: string,
  pickupMode: TransportPickupMode,
) {
  const options = getTransportLocationOptions(child, direction, date);
  if (direction === '迎え' && pickupMode === 'home') {
    return options.find((option) => option.type === '自宅' && option.activeOnDate)
      || options.find((option) => option.name.includes('自宅'))
      || options.find((option) => option.activeOnDate);
  }
  return options.find((option) => option.recommended)
    || options.find((option) => option.activeOnDate)
    || options[0];
}

function buildRequirement(
  child: ChildProfile,
  date: string,
  pickupMode: TransportPickupMode,
  settings: TransportRouteSettings,
  dailyPlan?: DailyChildPlan,
): DailyTransportRequirement {
  const pickup = preferredLocation(child, '迎え', date, pickupMode);
  const dropoff = preferredLocation(child, '送り', date, pickupMode);
  const schedule = getTransportScheduleForDate(child, date);
  const now = new Date().toISOString();
  return {
    id: createUuid(),
    childId: child.id,
    date,
    pickupEnabled: true,
    dropoffEnabled: true,
    pickupPattern: pickupMode,
    pickupLocationProfileId: pickup?.source === 'registered' ? pickup.id : undefined,
    pickupLocationName: pickup?.name,
    pickupAddress: pickup?.address,
    pickupArea: resolvedTransportArea(pickup?.address, pickup?.area || child.pickupArea),
    pickupTimeMode: pickupMode === 'home' ? 'arrival_backward' : 'fixed',
    pickupTargetTime: pickupMode === 'home'
      ? settings.holidayArrivalTime
      : timeValue(dailyPlan?.schoolEndTime || schedule?.schoolEndTime) || undefined,
    dropoffLocationProfileId: dropoff?.source === 'registered' ? dropoff.id : undefined,
    dropoffLocationName: dropoff?.name,
    dropoffAddress: dropoff?.address,
    dropoffArea: resolvedTransportArea(dropoff?.address, dropoff?.area || child.dropoffArea),
    dropoffTimeMode: 'departure_forward',
    dropoffTargetTime: timeValue(dailyPlan?.departureTime || getDefaultDepartureTime(child, pickupMode === 'home' ? '休日' : '平日', settings)) || undefined,
    stopDurationMinutes: settings.stopDurationMinutes,
    keepSiblingsTogether: true,
    source: 'baseline',
    status: 'draft',
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function defaultPlanDay(date: string, settings: TransportRouteSettings): TransportPlanDay {
  const now = new Date().toISOString();
  return {
    date,
    pickupMode: 'school',
    targetArrivalTime: settings.holidayArrivalTime,
    status: 'draft',
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function defaultDailyChildPlan(
  child: ChildProfile,
  date: string,
  settings: TransportRouteSettings,
): DailyChildPlan {
  const now = new Date().toISOString();
  const weekday = getWeekdayFromDate(date);
  const holidayLike = weekday === '土' || weekday === '日';
  const schedule = getTransportScheduleForDate(child, date);
  return {
    id: createUuid(),
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
    schoolEndTime: schedule?.schoolEndTime,
    departureTime: getDefaultDepartureTime(child, holidayLike ? '休日' : '平日', settings),
    createdAt: now,
    updatedAt: now,
  };
}

function missingFields(requirement: DailyTransportRequirement) {
  const missing: string[] = [];
  if (requirement.pickupEnabled && !requirement.pickupAddress?.trim()) missing.push('迎え先');
  if (requirement.pickupEnabled && !requirement.pickupTargetTime) missing.push('迎えの基準時刻');
  if (requirement.dropoffEnabled && !requirement.dropoffAddress?.trim()) missing.push('送り先');
  if (requirement.dropoffEnabled && !requirement.dropoffTargetTime) missing.push('送りの基準時刻');
  return missing;
}

function comparableRequirement(requirement: DailyTransportRequirement) {
  return JSON.stringify({
    childId: requirement.childId,
    date: requirement.date,
    pickupEnabled: requirement.pickupEnabled,
    dropoffEnabled: requirement.dropoffEnabled,
    pickupPattern: requirement.pickupPattern,
    pickupLocationProfileId: requirement.pickupLocationProfileId || '',
    pickupLocationName: requirement.pickupLocationName || '',
    pickupAddress: requirement.pickupAddress || '',
    pickupArea: requirement.pickupArea || '',
    pickupTimeMode: requirement.pickupTimeMode,
    pickupTargetTime: timeValue(requirement.pickupTargetTime),
    dropoffLocationProfileId: requirement.dropoffLocationProfileId || '',
    dropoffLocationName: requirement.dropoffLocationName || '',
    dropoffAddress: requirement.dropoffAddress || '',
    dropoffArea: requirement.dropoffArea || '',
    dropoffTimeMode: requirement.dropoffTimeMode,
    dropoffTargetTime: timeValue(requirement.dropoffTargetTime),
    stopDurationMinutes: requirement.stopDurationMinutes,
    keepSiblingsTogether: requirement.keepSiblingsTogether,
    source: requirement.source,
    status: requirement.status,
    note: requirement.note || '',
  });
}

function TransportRequirementFieldset({
  direction,
  item,
  selectedLocationId,
  locations,
  canManage,
  onToggle,
  onChangeLocation,
  onUpdate,
}: {
  direction: TransportDirection;
  item: DailyTransportRequirement;
  selectedLocationId: string;
  locations: TransportLocationOption[];
  canManage: boolean;
  onToggle: (enabled: boolean) => void;
  onChangeLocation: (locationId: string) => void;
  onUpdate: (patch: Partial<DailyTransportRequirement>) => void;
}) {
  const pickup = direction === '迎え';
  const enabled = pickup ? item.pickupEnabled : item.dropoffEnabled;
  const locationName = pickup ? item.pickupLocationName : item.dropoffLocationName;
  const address = pickup ? item.pickupAddress : item.dropoffAddress;
  const area = pickup ? item.pickupArea : item.dropoffArea;
  const tone = pickup
    ? { border: 'border-sky-200', text: 'text-sky-800', select: 'border-sky-300 bg-sky-50' }
    : { border: 'border-violet-200', text: 'text-violet-800', select: 'border-violet-300 bg-violet-50' };

  return <fieldset className={`rounded-xl border bg-white p-3 ${tone.border}`}>
    <legend className={`px-1 text-xs font-black ${tone.text}`}>{direction}</legend>
    <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={enabled} disabled={!canManage} onChange={(event) => onToggle(event.target.checked)} />施設が{direction}を行う</label>
    {!enabled && <p className="mt-2 rounded-lg bg-sky-50 px-2 py-2 text-[10px] font-black text-sky-800">保護者対応として、一覧の時刻欄へ「保護者」と表示します。</p>}
    {enabled && <div className="mt-2 grid gap-2">
      <label className="text-[10px] font-bold text-slate-600">児童情報に登録した{direction}先
        <select value={selectedLocationId} disabled={!canManage} onChange={(event) => onChangeLocation(event.target.value)} className={`mt-1 min-h-10 w-full rounded-lg border px-2 text-sm font-bold ${tone.select}`}>
          <option value="manual">直接入力する</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.name}（{location.type}）{location.recommended ? '・おすすめ' : !location.activeOnDate ? '・対象日外' : ''}</option>)}
        </select>
        <span className="mt-1 block text-[9px] font-normal text-slate-500">選択すると名称・住所・エリアを自動反映します。下の欄を変更すると、その日だけの直接入力として保存されます。</span>
      </label>
      <label className="text-[10px] font-bold text-slate-600">{direction}先の名称<input value={locationName || ''} disabled={!canManage} onChange={(event) => onUpdate(pickup ? { pickupLocationProfileId: undefined, pickupLocationName: event.target.value } : { dropoffLocationProfileId: undefined, dropoffLocationName: event.target.value })} placeholder={pickup ? '例：祖母宅、○○学童' : '例：自宅、祖母宅、○○学童'} className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label>
      <label className="text-[10px] font-bold text-slate-600">{direction}先の住所<input value={address || ''} disabled={!canManage} onChange={(event) => { const nextAddress = event.target.value; onUpdate(pickup ? { pickupLocationProfileId: undefined, pickupAddress: nextAddress, pickupArea: inferTransportArea(nextAddress) } : { dropoffLocationProfileId: undefined, dropoffAddress: nextAddress, dropoffArea: inferTransportArea(nextAddress) }); }} placeholder="登録先と異なる場合は直接入力" className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label>
      <label className="text-[10px] font-bold text-slate-600">エリア（自動）<input value={area || ''} disabled={!canManage} onChange={(event) => onUpdate(pickup ? { pickupArea: event.target.value } : { dropoffArea: event.target.value })} className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label>
      <p className="rounded-lg bg-slate-100 px-2 py-1.5 text-[9px] font-bold text-slate-600">時刻は、この編集画面上部の時刻欄で変更します。</p>
    </div>}
  </fieldset>;
}

export const MonthlyTransportPlanner: React.FC<MonthlyTransportPlannerProps> = ({
  organizationId,
  initialDate,
  childrenList,
  dailyChildPlans,
  requirements,
  planDays,
  transportRuns,
  routeSettings,
  canManage,
  onSavePlanDay,
  onSaveDailyChildPlan,
  onDeleteDailyChildPlan,
  onDeleteRequirement,
  onDeleteMonthSchedules,
  onSaveRequirements,
  onReplaceMonthRequirements,
  onReplaceChildMonthRequirements,
}) => {
  const [month, setMonth] = useState(initialDate.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [drafts, setDrafts] = useState<DailyTransportRequirement[]>(() => requirements
    .filter((item) => item.date === initialDate && !childrenList.find((child) => child.id === item.childId)?.serviceSuspended)
    .map((item) => ({ ...item })));
  const [dayDraft, setDayDraft] = useState<TransportPlanDay>(() => planDays.find((day) => day.date === initialDate) || defaultPlanDay(initialDate, routeSettings));
  const [editingChildId, setEditingChildId] = useState<string>();
  const [editingOriginal, setEditingOriginal] = useState<DailyTransportRequirement>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [monthlySettingsOpen, setMonthlySettingsOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [holidayRangeOpen, setHolidayRangeOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [attendanceSavingChildId, setAttendanceSavingChildId] = useState<string>();
  const [additionalPickerOpen, setAdditionalPickerOpen] = useState(false);
  const [additionalSearch, setAdditionalSearch] = useState('');
  const [monthChildId, setMonthChildId] = useState('');
  const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>('all');
  const [calendarViewKey, setCalendarViewKey] = useState('');
  const [bulkPickupTime, setBulkPickupTime] = useState('');
  const [historyChildId, setHistoryChildId] = useState<string>();
  const [historyRows, setHistoryRows] = useState<TransportTimeChangeHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [holidayFrom, setHolidayFrom] = useState(`${month}-01`);
  const [holidayTo, setHolidayTo] = useState(monthDates(month).at(-1) || `${month}-01`);
  const dates = useMemo(() => monthDates(month), [month]);
  const activeChildIds = useMemo(() => new Set(childrenList.filter((child) => !child.serviceSuspended).map((child) => child.id)), [childrenList]);
  const absentPlanKeys = useMemo(() => new Set(dailyChildPlans
    .filter((plan) => plan.attendancePlan === '欠席')
    .map((plan) => `${plan.childId}:${plan.date}`)), [dailyChildPlans]);
  const monthRequirements = useMemo(() => requirements.filter((item) =>
    item.date.startsWith(month)
    && activeChildIds.has(item.childId)
    && !absentPlanKeys.has(`${item.childId}:${item.date}`)
  ), [absentPlanKeys, activeChildIds, month, requirements]);
  const monthRegisteredScheduleKeys = useMemo(() => new Set([
    ...dailyChildPlans.filter((plan) => plan.date.startsWith(month)).map((plan) => `${plan.childId}:${plan.date}`),
    ...requirements.filter((item) => item.date.startsWith(month)).map((item) => `${item.childId}:${item.date}`),
  ]), [dailyChildPlans, month, requirements]);
  const selectedAbsentPlans = useMemo(() => dailyChildPlans.filter((plan) =>
    plan.date === selectedDate
    && plan.attendancePlan === '欠席'
    && activeChildIds.has(plan.childId)
  ), [activeChildIds, dailyChildPlans, selectedDate]);
  const selectedServiceChildren = useMemo(
    () => serviceChildrenForDate(childrenList, dailyChildPlans, selectedDate),
    [childrenList, dailyChildPlans, selectedDate],
  );
  const selectedAdditionalPlans = useMemo(() => dailyChildPlans.filter((plan) =>
    plan.date === selectedDate
    && plan.attendancePlan === '追加利用'
    && activeChildIds.has(plan.childId)
  ), [activeChildIds, dailyChildPlans, selectedDate]);
  const activeChildren = useMemo(() => childrenList
    .filter((child) => !child.serviceSuspended)
    .sort((left, right) => left.name.localeCompare(right.name, 'ja')), [childrenList]);
  const transportChildren = useMemo(() => activeChildren
    .filter((child) => child.transportationRequired), [activeChildren]);
  const siblingGroupByChild = useMemo(() => buildSiblingGroupByChild(activeChildren), [activeChildren]);
  const householdOptions = useMemo(() => {
    const groups = new Map<string, ChildProfile[]>();
    activeChildren.forEach((child) => {
      const key = siblingGroupByChild.get(child.id) || `household:${child.id}`;
      groups.set(key, [...(groups.get(key) || []), child]);
    });
    return Array.from(groups, ([key, members]) => ({ key, label: members.map((child) => child.name).join('・'), childIds: members.map((child) => child.id) }))
      .sort((left, right) => left.label.localeCompare(right.label, 'ja'));
  }, [activeChildren, siblingGroupByChild]);
  const schoolOptions = useMemo(() => {
    const groups = new Map<string, ChildProfile[]>();
    activeChildren.forEach((child) => {
      const name = child.schoolName?.trim();
      if (!name) return;
      const key = child.schoolId ? `school:${child.schoolId}` : `school-name:${name}`;
      groups.set(key, [...(groups.get(key) || []), child]);
    });
    return Array.from(groups, ([key, members]) => ({ key, label: members[0].schoolName || '学校未設定', childIds: members.map((child) => child.id) }))
      .sort((left, right) => left.label.localeCompare(right.label, 'ja'));
  }, [activeChildren]);
  const calendarViewOptions = useMemo(() => {
    if (calendarViewMode === 'child') return activeChildren.map((child) => ({ key: child.id, label: child.name, childIds: [child.id] }));
    if (calendarViewMode === 'household') return householdOptions;
    if (calendarViewMode === 'school') return schoolOptions;
    return [];
  }, [activeChildren, calendarViewMode, householdOptions, schoolOptions]);
  const calendarChildIds = useMemo(() => {
    if (calendarViewMode === 'all') return undefined;
    const selected = calendarViewOptions.find((option) => option.key === calendarViewKey) || calendarViewOptions[0];
    return new Set(selected?.childIds || []);
  }, [calendarViewKey, calendarViewMode, calendarViewOptions]);
  const additionalCandidates = useMemo(() => {
    const scheduledIds = new Set(selectedServiceChildren.map((child) => child.id));
    const query = additionalSearch.trim().toLocaleLowerCase('ja');
    return activeChildren.filter((child) => !scheduledIds.has(child.id)
      && (!query || child.name.toLocaleLowerCase('ja').includes(query)));
  }, [activeChildren, additionalSearch, selectedServiceChildren]);
  const attendanceChildren = useMemo(() => {
    const weekday = getWeekdayFromDate(selectedDate);
    const requirementChildIds = new Set(requirements
      .filter((item) => item.date === selectedDate)
      .map((item) => item.childId));
    const plannedChildIds = new Set(dailyChildPlans
      .filter((plan) => plan.date === selectedDate)
      .map((plan) => plan.childId));
    return activeChildren.filter((child) =>
      requirementChildIds.has(child.id)
      || plannedChildIds.has(child.id)
      || getRegularDaysForDate(child, selectedDate).includes(weekday)
    );
  }, [activeChildren, dailyChildPlans, requirements, selectedDate]);
  const selectedRequirements = drafts.length > 0 && drafts.every((item) => item.date === selectedDate)
    ? drafts.filter((item) => activeChildIds.has(item.childId) && !absentPlanKeys.has(`${item.childId}:${item.date}`))
    : requirements.filter((item) => item.date === selectedDate && activeChildIds.has(item.childId) && !absentPlanKeys.has(`${item.childId}:${item.date}`));
  const displayedSelectedRequirements = useMemo(() => {
    const rows = selectedRequirements.length ? selectedRequirements : drafts;
    return calendarChildIds ? rows.filter((item) => calendarChildIds.has(item.childId)) : rows;
  }, [calendarChildIds, drafts, selectedRequirements]);
  const displayedServiceChildren = useMemo(() => (
    calendarChildIds
      ? selectedServiceChildren.filter((child) => calendarChildIds.has(child.id))
      : selectedServiceChildren
  ), [calendarChildIds, selectedServiceChildren]);
  const selectedAdditionalChildIds = useMemo(
    () => new Set(selectedAdditionalPlans.map((plan) => plan.childId)),
    [selectedAdditionalPlans],
  );
  const selectedRuns = useMemo(() => transportRuns
    .filter((run) => run.date === selectedDate)
    .sort((left, right) => left.direction.localeCompare(right.direction, 'ja') || left.startTime.localeCompare(right.startTime)),
  [selectedDate, transportRuns]);

  const savedRequirementFor = (item: DailyTransportRequirement) => requirements.find(
    (candidate) => candidate.childId === item.childId && candidate.date === item.date,
  );

  const baselineTimesFor = (item: DailyTransportRequirement) => {
    const child = childrenList.find((candidate) => candidate.id === item.childId);
    if (!child) return { pickup: '', dropoff: '' };
    const schedule = getTransportScheduleForDate(child, item.date);
    const dailyPlan = dailyChildPlans.find((plan) => plan.childId === item.childId && plan.date === item.date);
    const holidayLike = item.pickupPattern === 'home' || dailyPlan?.serviceCategory === '休日';
    return {
      pickup: timeValue(schedule?.schoolEndTime),
      dropoff: timeValue(getDefaultDepartureTime(child, holidayLike ? '休日' : '平日', routeSettings)),
    };
  };

  const timeChangedSinceSave = (item: DailyTransportRequirement) => {
    const saved = savedRequirementFor(item);
    if (saved) {
      return saved.pickupTimeMode !== item.pickupTimeMode
        || saved.dropoffTimeMode !== item.dropoffTimeMode
        || timeValue(saved.pickupTargetTime) !== timeValue(item.pickupTargetTime)
        || timeValue(saved.dropoffTargetTime) !== timeValue(item.dropoffTargetTime);
    }
    const baseline = baselineTimesFor(item);
    const expectedPickupMode: TransportTimeMode = item.pickupPattern === 'home' ? 'arrival_backward' : 'fixed';
    const expectedPickup = item.pickupPattern === 'home' ? dayDraft.targetArrivalTime : baseline.pickup;
    return item.pickupTimeMode !== expectedPickupMode
      || timeValue(item.pickupTargetTime) !== timeValue(expectedPickup)
      || item.dropoffTimeMode !== 'departure_forward'
      || timeValue(item.dropoffTargetTime) !== baseline.dropoff;
  };

  const editingChild = editingChildId
    ? childrenList.find((child) => child.id === editingChildId)
    : undefined;
  const editingRequirement = editingChildId
    ? (selectedRequirements.find((item) => item.childId === editingChildId)
      || drafts.find((item) => item.childId === editingChildId))
    : undefined;

  const openRequirementEditor = (child: ChildProfile) => {
    let requirement = selectedRequirements.find((item) => item.childId === child.id)
      || drafts.find((item) => item.childId === child.id);
    setEditingOriginal(requirement ? { ...requirement } : undefined);
    if (!requirement) {
      const dailyPlan = dailyChildPlans.find((plan) => plan.childId === child.id && plan.date === selectedDate);
      requirement = buildRequirement(child, selectedDate, dayDraft.pickupMode, routeSettings, dailyPlan);
      if (!child.transportationRequired) {
        requirement = { ...requirement, pickupEnabled: false, dropoffEnabled: false, source: 'manual' };
      }
      setDrafts((current) => [requirement!, ...current.filter((item) => item.childId !== child.id)]);
    }
    setEditingChildId(child.id);
    setError('');
  };

  const closeRequirementEditor = () => {
    if (editingChildId) {
      setDrafts((current) => editingOriginal
        ? current.map((item) => item.childId === editingChildId ? { ...editingOriginal } : item)
        : current.filter((item) => item.childId !== editingChildId));
    }
    setEditingChildId(undefined);
    setEditingOriginal(undefined);
    setError('');
  };

  const selectDate = (date: string) => {
    setSelectedDate(date);
    setDrafts(requirements.filter((item) => item.date === date && activeChildIds.has(item.childId)).map((item) => ({ ...item })));
    setDayDraft(planDays.find((day) => day.date === date) || defaultPlanDay(date, routeSettings));
    setEditingChildId(undefined);
    setEditingOriginal(undefined);
    setAdditionalPickerOpen(false);
    setAdditionalSearch('');
    setBulkPickupTime('');
    setMessage('');
    setError('');
  };

  const changeMonth = (value: string) => {
    setMonth(value);
    const first = `${value}-01`;
    setHolidayFrom(first);
    setHolidayTo(monthDates(value).at(-1) || first);
    setBulkDeleteOpen(false);
    selectDate(first);
  };

  const changeSelectedDate = (value: string) => {
    if (!value) return;
    const nextMonth = value.slice(0, 7);
    if (nextMonth !== month) {
      setMonth(nextMonth);
      setHolidayFrom(`${nextMonth}-01`);
      setHolidayTo(monthDates(nextMonth).at(-1) || `${nextMonth}-01`);
      setBulkDeleteOpen(false);
    }
    selectDate(value);
  };

  const moveSelectedDate = (days: number) => {
    const date = new Date(`${selectedDate}T00:00:00`);
    date.setDate(date.getDate() + days);
    const nextDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    changeSelectedDate(nextDate);
  };

  const createForDate = (
    date: string,
    pickupMode: TransportPickupMode,
    overwrite = false,
  ): DailyTransportRequirement[] => {
    const existing = requirements.filter((item) => item.date === date);
    const existingByChild = new Map<string, DailyTransportRequirement>(
      existing.map((item) => [item.childId, item]),
    );
    return scheduledChildrenForDate(childrenList, dailyChildPlans, date).map((child) => {
      if (!overwrite && existingByChild.has(child.id)) return existingByChild.get(child.id)!;
      return buildRequirement(
        child,
        date,
        pickupMode,
        routeSettings,
        dailyChildPlans.find((plan) => plan.childId === child.id && plan.date === date),
      );
    });
  };

  const reflectMonth = async () => {
    if (!canManage) return;
    const created = dates.flatMap((date) => {
      const day = planDays.find((candidate) => candidate.date === date);
      return createForDate(date, day?.pickupMode || 'school');
    });
    const existingKeys = new Set(requirements.map((item) => `${item.childId}:${item.date}`));
    const additions = created.filter((item) => !existingKeys.has(`${item.childId}:${item.date}`));
    if (additions.length === 0) return setMessage('この月の基本予定はすでに反映されています。');
    setSaving(true);
    setError('');
    try {
      await onSaveRequirements(additions);
      if (additions.some((item) => item.date === selectedDate)) setDrafts([...requirements.filter((item) => item.date === selectedDate), ...additions.filter((item) => item.date === selectedDate)]);
      setMessage(`${additions.length}件の基本予定を追加しました。手動変更済みの予定は上書きしていません。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '基本予定を反映できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const reapplyMonth = async () => {
    if (!canManage) return;
    const [year, monthNumber] = month.split('-');
    if (!window.confirm(`${year}年${Number(monthNumber)}月の基本情報をすべて再反映しますか？\n\n児童情報の定期曜日・送迎先・住所・エリア・基準時刻で作り直します。月間予定で手動修正した内容と確定状態はリセットされます。作成済みの配車便と過去の運行履歴は変更しません。`)) return;
    const nextRequirements = dates.flatMap((date) => {
      const planDay = planDays.find((candidate) => candidate.date === date);
      return createForDate(date, planDay?.pickupMode || 'school', true);
    });
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const appliedRequirements = await onReplaceMonthRequirements(month, nextRequirements);
      setDrafts(appliedRequirements.filter((item) => item.date === selectedDate));
      const selectedPlan = planDays.find((day) => day.date === selectedDate);
      setDayDraft(selectedPlan
        ? { ...selectedPlan, status: 'draft', confirmedAt: undefined, revision: selectedPlan.revision + 1, updatedAt: new Date().toISOString() }
        : defaultPlanDay(selectedDate, routeSettings));
      setEditingChildId(undefined);
      setEditingOriginal(undefined);
      const previousByKey = new Map<string, DailyTransportRequirement>(
        monthRequirements.map((item) => [`${item.childId}:${item.date}`, item] as const),
      );
      const appliedKeys = new Set(appliedRequirements.map((item) => `${item.childId}:${item.date}`));
      const createdCount = appliedRequirements.filter((item) => !previousByKey.has(`${item.childId}:${item.date}`)).length;
      const updatedCount = appliedRequirements.filter((item) => {
        const previous = previousByKey.get(`${item.childId}:${item.date}`);
        return previous && comparableRequirement(previous) !== comparableRequirement(item);
      }).length;
      const unchangedCount = appliedRequirements.length - createdCount - updatedCount;
      const removedCount = monthRequirements.filter((item) => !appliedKeys.has(`${item.childId}:${item.date}`)).length;
      const resultSummary = updatedCount === 0 && createdCount === 0 && removedCount === 0
        ? `全${unchangedCount}件がすでに最新の基本情報でした。`
        : `新規${createdCount}件・更新${updatedCount}件・変更なし${unchangedCount}件・対象外削除${removedCount}件です。`;
      setMessage(`${year}年${Number(monthNumber)}月をDBから再取得し、${appliedRequirements.length}件の反映を確認しました。${resultSummary}各日の内容を確認してから確定してください。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '月全体の基本情報を再反映できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const reapplyChildMonth = async () => {
    if (!canManage || !monthChildId) return setError('基本予定を反映する児童を選択してください。');
    const child = childrenList.find((candidate) => candidate.id === monthChildId);
    if (!child) return setError('選択した児童が見つかりません。');
    const [year, monthNumber] = month.split('-');
    if (!window.confirm(`${child.name}の${year}年${Number(monthNumber)}月の基本予定を反映しますか？\n\nこの児童について、月間予定で手動修正した内容は児童情報の定期曜日・送迎先・基準時刻で作り直されます。他の児童の予定は変更しません。`)) return;
    const childRequirements = dates.flatMap((date) => {
      const plan = dailyChildPlans.find((candidate) => candidate.childId === child.id && candidate.date === date);
      const scheduled = plan
        ? plan.attendancePlan !== '欠席'
        : getRegularDaysForDate(child, date).includes(getWeekdayFromDate(date));
      if (!scheduled) return [];
      const planDay = planDays.find((candidate) => candidate.date === date);
      return [buildRequirement(child, date, planDay?.pickupMode || 'school', routeSettings, plan)];
    });
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const appliedRequirements = await onReplaceChildMonthRequirements(month, child.id, childRequirements);
      setDrafts(appliedRequirements.filter((item) => item.date === selectedDate));
      setEditingChildId(undefined);
      setMessage(`${child.name}の${year}年${Number(monthNumber)}月について、基本予定${childRequirements.length}件を反映しました。他の児童の手動変更は保持しています。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '児童別の基本予定を反映できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const setSelectedDateAttendance = async (childId: string, attendancePlan: '利用予定' | '欠席') => {
    if (!canManage || !childId) return;
    const child = childrenList.find((candidate) => candidate.id === childId);
    if (!child) return setError('選択した児童が見つかりません。');
    const existingPlan = dailyChildPlans.find((plan) => plan.childId === childId && plan.date === selectedDate);
    const now = new Date().toISOString();
    const nextPlan: DailyChildPlan = {
      ...defaultDailyChildPlan(child, selectedDate, routeSettings),
      ...existingPlan,
      attendancePlan,
      updatedAt: now,
    };
    setAttendanceSavingChildId(childId);
    setError('');
    setMessage('');
    try {
      await onSaveDailyChildPlan(nextPlan);
      const nextDay: TransportPlanDay = {
        ...dayDraft,
        status: 'draft',
        confirmedAt: undefined,
        revision: dayDraft.revision + 1,
        updatedAt: now,
      };
      await onSavePlanDay(nextDay);
      setDayDraft(nextDay);
      if (attendancePlan === '欠席') {
        setDrafts((current) => current.filter((item) => item.childId !== childId));
        if (editingChildId === childId) {
          setEditingChildId(undefined);
          setEditingOriginal(undefined);
        }
        setMessage(`${child.name}を${selectedDate}の欠席として登録しました。記録候補と送迎編成から除外されます。`);
      } else {
        const restored = buildRequirement(child, selectedDate, dayDraft.pickupMode, routeSettings, nextPlan);
        await onSaveRequirements([restored]);
        setDrafts((current) => [restored, ...current.filter((item) => item.childId !== childId)]);
        setMessage(`${child.name}を${selectedDate}の利用予定へ戻し、基本送迎情報を反映しました。`);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '利用・欠席予定を保存できませんでした。');
    } finally {
      setAttendanceSavingChildId(undefined);
    }
  };

  const addAdditionalChild = async (childId: string) => {
    if (!canManage || !childId || attendanceSavingChildId) return;
    const child = childrenList.find((candidate) => candidate.id === childId);
    if (!child) return setError('選択した児童が見つかりません。');
    const existingPlan = dailyChildPlans.find((plan) => plan.childId === childId && plan.date === selectedDate);
    const existingRequirement = requirements.find((item) => item.childId === childId && item.date === selectedDate);
    const now = new Date().toISOString();
    const nextPlan: DailyChildPlan = {
      ...defaultDailyChildPlan(child, selectedDate, routeSettings),
      ...existingPlan,
      attendancePlan: '追加利用',
      updatedAt: now,
    };

    setAttendanceSavingChildId(childId);
    setError('');
    setMessage('');
    try {
      await onSaveDailyChildPlan(nextPlan);
      if (child.transportationRequired) {
        const requirement = buildRequirement(child, selectedDate, dayDraft.pickupMode, routeSettings, nextPlan);
        await onSaveRequirements([requirement]);
        setDrafts((current) => [requirement, ...current.filter((item) => item.childId !== childId)]);
      } else {
        if (existingRequirement) await onDeleteRequirement(childId, selectedDate);
        setDrafts((current) => current.filter((item) => item.childId !== childId));
      }

      const nextDay: TransportPlanDay = {
        ...dayDraft,
        status: 'draft',
        confirmedAt: undefined,
        revision: dayDraft.revision + 1,
        updatedAt: now,
      };
      await onSavePlanDay(nextDay);
      setDayDraft(nextDay);
      setAdditionalSearch('');
      setMessage(`${child.name}を${selectedDate}の追加利用として登録しました。${child.transportationRequired ? '送迎条件にも基本情報を反映しています。' : '送迎なしの利用予定として各機能へ反映します。'}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '追加利用を登録できませんでした。');
    } finally {
      setAttendanceSavingChildId(undefined);
    }
  };

  const deleteSelectedDatePlan = async (childId: string) => {
    if (!canManage || attendanceSavingChildId) return;
    const child = childrenList.find((candidate) => candidate.id === childId);
    const existingPlan = dailyChildPlans.find((plan) => plan.childId === childId && plan.date === selectedDate);
    const existingRequirement = requirements.find((item) => item.childId === childId && item.date === selectedDate)
      || drafts.find((item) => item.childId === childId && item.date === selectedDate);
    if (!child || (!existingPlan && !existingRequirement)) return;
    if (!window.confirm(`${child.name}の${selectedDate}の利用・送迎予定を削除しますか？\n\n保存済みの支援記録と児童名簿の基本情報は削除しません。必要な場合は「基本予定を反映」で再作成できます。`)) return;

    setAttendanceSavingChildId(childId);
    setError('');
    setMessage('');
    try {
      if (existingPlan) await onDeleteDailyChildPlan(childId, selectedDate);
      if (existingRequirement) await onDeleteRequirement(childId, selectedDate);
      setDrafts((current) => current.filter((item) => item.childId !== childId));
      if (editingChildId === childId) {
        setEditingChildId(undefined);
        setEditingOriginal(undefined);
      }

      const now = new Date().toISOString();
      const nextDay: TransportPlanDay = {
        ...dayDraft,
        status: 'draft',
        confirmedAt: undefined,
        revision: dayDraft.revision + 1,
        updatedAt: now,
      };
      await onSavePlanDay(nextDay);
      setDayDraft(nextDay);
      setMessage(`${child.name}の${selectedDate}の利用・送迎予定を削除しました。保存済みの支援記録は保持しています。`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '日別予定を削除できませんでした。');
    } finally {
      setAttendanceSavingChildId(undefined);
    }
  };

  const deleteMonthSchedules = async () => {
    if (!canManage || bulkDeleting) return;
    const targetKeys = [...monthRegisteredScheduleKeys];
    if (targetKeys.length === 0) return setError(`${month}に削除できる登録予定はありません。`);
    const [year, monthNumber] = month.split('-');
    if (!window.confirm(`${year}年${Number(monthNumber)}月の全児童の登録予定 ${targetKeys.length}件を一括削除しますか？\n\n選択中の月に登録された、全児童の日別利用予定と送迎条件を削除します。保存済みの支援記録・児童名簿・作成済みの送迎便は削除しません。`)) return;

    setBulkDeleting(true);
    setError('');
    setMessage('');
    try {
      const result = await onDeleteMonthSchedules(month);
      if (selectedDate.startsWith(month)) {
        setDrafts([]);
        setEditingChildId(undefined);
        setDayDraft((current) => ({
          ...current,
          status: 'draft',
          confirmedAt: undefined,
          revision: current.revision + 1,
          updatedAt: new Date().toISOString(),
        }));
      }
      setBulkDeleteOpen(false);
      setMessage(`${year}年${Number(monthNumber)}月の全児童について、利用予定${result.dailyPlanCount}件・送迎予定${result.requirementCount}件を削除しました。`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '月間予定を一括削除できませんでした。');
    } finally {
      setBulkDeleting(false);
    }
  };

  const applyHolidayRange = async () => {
    if (!holidayFrom || !holidayTo || holidayFrom > holidayTo) return setError('長期休暇の開始日と終了日を確認してください。');
    const targetDates = monthDates(month).filter((date) => date >= holidayFrom && date <= holidayTo);
    const nextRequirements = targetDates.flatMap((date) => createForDate(date, 'home', true));
    const now = new Date().toISOString();
    const nextDays = targetDates.map((date) => ({
      ...(planDays.find((day) => day.date === date) || defaultPlanDay(date, routeSettings)),
      pickupMode: 'home' as const,
      targetArrivalTime: routeSettings.holidayArrivalTime,
      status: 'draft' as const,
      revision: (planDays.find((day) => day.date === date)?.revision || 0) + 1,
      updatedAt: now,
    }));
    setSaving(true);
    setError('');
    try {
      await onSaveRequirements(nextRequirements);
      for (const day of nextDays) await onSavePlanDay(day);
      if (targetDates.includes(selectedDate)) {
        setDrafts(nextRequirements.filter((item) => item.date === selectedDate));
        setDayDraft(nextDays.find((day) => day.date === selectedDate)!);
      }
      setHolidayRangeOpen(false);
      setMessage(`${holidayFrom}～${holidayTo}を自宅等への迎えに設定しました。迎え予定時刻は${routeSettings.holidayArrivalTime}来所から自動計算します。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '長期休暇設定を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const prepareSelectedDate = (overwrite = false) => {
    const next = createForDate(selectedDate, dayDraft.pickupMode, overwrite);
    setDrafts(next.map((item) => ({ ...item, pickupPattern: dayDraft.pickupMode })));
    setMessage(overwrite ? '選択日の基本情報を再反映しました。保存するまで確定されません。' : '選択日の基本予定を作成しました。');
  };

  const updateRequirement = (childId: string, patch: Partial<DailyTransportRequirement>) => {
    const touchesTime = Object.prototype.hasOwnProperty.call(patch, 'pickupTimeMode')
      || Object.prototype.hasOwnProperty.call(patch, 'pickupTargetTime')
      || Object.prototype.hasOwnProperty.call(patch, 'dropoffTimeMode')
      || Object.prototype.hasOwnProperty.call(patch, 'dropoffTargetTime');
    setDrafts((current) => current.map((item) => item.childId === childId
      ? { ...item, ...patch, ...(touchesTime ? { timeChangeNote: undefined } : {}), source: 'manual', status: 'draft', revision: item.revision + 1, updatedAt: new Date().toISOString() }
      : item));
  };

  const openTimeHistory = async (childId: string) => {
    setHistoryChildId(childId);
    setHistoryRows([]);
    setHistoryError('');
    if (!organizationId) return;
    setHistoryLoading(true);
    try {
      setHistoryRows(await loadTransportTimeChangeHistory(organizationId, childId));
    } catch (loadError) {
      setHistoryError(loadError instanceof Error ? loadError.message : '時刻の変更履歴を取得できませんでした。');
    } finally {
      setHistoryLoading(false);
    }
  };

  const saveRequirementRow = async (item: DailyTransportRequirement) => {
    if (!canManage) return;
    const missing = missingFields(item);
    if (missing.length > 0) return setError(`未入力があります：${missing.join('、')}`);
    if (timeChangedSinceSave(item) && !item.timeChangeNote?.trim()) return setError('時刻を変更した理由・連絡内容をメモへ入力してください。');
    const now = new Date().toISOString();
    const next = { ...item, source: 'manual' as const, status: 'draft' as const, revision: item.revision + 1, updatedAt: now };
    const nextDay = { ...dayDraft, status: 'draft' as const, confirmedAt: undefined, revision: dayDraft.revision + 1, updatedAt: now };
    setSaving(true);
    setError('');
    try {
      await onSaveRequirements([next]);
      await onSavePlanDay(nextDay);
      setDrafts((current) => current.map((candidate) => candidate.childId === next.childId ? next : candidate));
      setDayDraft(nextDay);
      setEditingChildId(undefined);
      setEditingOriginal(undefined);
      setMessage(`${childrenList.find((child) => child.id === item.childId)?.name || '児童'}の利用・送迎内容を保存しました。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '利用・送迎内容を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const changePickupLocation = (childId: string, locationId: string) => {
    const child = childrenList.find((candidate) => candidate.id === childId);
    if (!child) return;
    if (locationId === 'manual') {
      updateRequirement(childId, { pickupLocationProfileId: undefined });
      return;
    }
    const location = getTransportLocationOptions(child, '迎え', selectedDate)
      .find((option) => option.id === locationId);
    if (!location) return;
    updateRequirement(childId, {
      pickupLocationProfileId: location.source === 'registered' ? location.id : undefined,
      pickupLocationName: location.name,
      pickupAddress: location.address,
      pickupArea: resolvedTransportArea(location.address, location.area),
    });
  };

  const changeDropoffLocation = (childId: string, locationId: string) => {
    const child = childrenList.find((candidate) => candidate.id === childId);
    if (!child) return;
    if (locationId === 'manual') {
      updateRequirement(childId, { dropoffLocationProfileId: undefined });
      return;
    }
    const location = getTransportLocationOptions(child, '送り', selectedDate)
      .find((option) => option.id === locationId);
    if (!location) return;
    updateRequirement(childId, {
      dropoffLocationProfileId: location.source === 'registered' ? location.id : undefined,
      dropoffLocationName: location.name,
      dropoffAddress: location.address,
      dropoffArea: resolvedTransportArea(location.address, location.area),
    });
  };

  const changePickupMode = (pickupMode: TransportPickupMode) => {
    setDayDraft((current) => ({ ...current, pickupMode, status: 'draft', revision: current.revision + 1, updatedAt: new Date().toISOString() }));
    setDrafts((current) => current.map((item) => {
      const child = childrenList.find((candidate) => candidate.id === item.childId);
      if (!child) return { ...item, pickupPattern: pickupMode };
      const pickup = preferredLocation(child, '迎え', selectedDate, pickupMode);
      return {
        ...item,
        pickupPattern: pickupMode,
        pickupLocationProfileId: pickup?.source === 'registered' ? pickup.id : undefined,
        pickupLocationName: pickup?.name,
        pickupAddress: pickup?.address,
        pickupArea: resolvedTransportArea(pickup?.address, pickup?.area || child.pickupArea),
        pickupTimeMode: pickupMode === 'home' ? 'arrival_backward' : item.pickupTimeMode,
        pickupTargetTime: pickupMode === 'home' ? dayDraft.targetArrivalTime : item.pickupTargetTime,
        timeChangeNote: undefined,
        source: 'manual',
        status: 'draft',
      };
    }));
  };

  const saveSelected = async (confirm: boolean) => {
    const rows = selectedRequirements.length ? selectedRequirements : drafts;
    if (!rows.length) return setError('先に選択日の基本予定を作成してください。');
    const missing = rows.flatMap((item) => missingFields(item).map((field) => `${childrenList.find((child) => child.id === item.childId)?.name || '児童'}：${field}`));
    if (confirm && missing.length > 0) return setError(`未入力があります：${missing.slice(0, 4).join('、')}${missing.length > 4 ? 'ほか' : ''}`);
    const timeMemoMissing = rows.filter((item) => timeChangedSinceSave(item) && !item.timeChangeNote?.trim());
    if (timeMemoMissing.length > 0) return setError(`時刻変更メモが未入力です：${timeMemoMissing.slice(0, 4).map((item) => childrenList.find((child) => child.id === item.childId)?.name || '児童').join('、')}${timeMemoMissing.length > 4 ? 'ほか' : ''}`);
    const now = new Date().toISOString();
    const nextRows = rows.map((item) => ({ ...item, status: confirm ? 'confirmed' as const : 'draft' as const, updatedAt: now }));
    const nextDay: TransportPlanDay = {
      ...dayDraft,
      status: confirm ? 'requirements_confirmed' : 'draft',
      confirmedAt: confirm ? now : undefined,
      updatedAt: now,
    };
    setSaving(true);
    setError('');
    try {
      await onSaveRequirements(nextRows);
      await onSavePlanDay(nextDay);
      setDrafts(nextRows);
      setDayDraft(nextDay);
      setMessage(confirm ? 'この日の送迎条件を確定しました。日別配車を作成できます。' : '送迎条件を下書き保存しました。');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '送迎条件を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const confirmedDays = dates.filter((date) => planDays.find((day) => day.date === date)?.status !== undefined && planDays.find((day) => day.date === date)?.status !== 'draft').length;
  const missingCount = monthRequirements.filter((item) => missingFields(item).length > 0).length;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-black text-teal-700">選択日の予定を確認・編集</p>
            <h3 className="text-lg font-black text-slate-950">利用・送迎一覧</h3>
            <p className="mt-1 text-xs text-slate-500">普段はこの一覧だけを使います。月全体の操作やカレンダーは必要な時に開けます。</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => moveSelectedDate(-1)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700" aria-label="前の日"><ChevronLeft className="h-5 w-5" /></button>
            <label className="min-w-0 flex-1 text-[10px] font-black text-slate-500 lg:w-44">対象日
              <input type="date" value={selectedDate} onChange={(event) => changeSelectedDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-black text-slate-900" />
            </label>
            <button type="button" onClick={() => moveSelectedDate(1)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700" aria-label="次の日"><ChevronRight className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setMonthlySettingsOpen((current) => !current)} aria-expanded={monthlySettingsOpen} className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 text-left transition-colors ${monthlySettingsOpen ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}>
            <CopyCheck className={`h-5 w-5 shrink-0 ${monthlySettingsOpen ? 'text-teal-700' : 'text-slate-500'}`} />
            <span className="min-w-0 flex-1"><span className="block text-xs font-black text-slate-950">月間予定の設定</span><span className="block truncate text-[9px] font-bold text-slate-500">基本予定の反映・長期休暇・一括削除</span></span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${monthlySettingsOpen ? 'rotate-180' : ''}`} />
          </button>
          <button type="button" onClick={() => setCalendarOpen((current) => !current)} aria-expanded={calendarOpen} className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 text-left transition-colors ${calendarOpen ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}>
            <CalendarRange className={`h-5 w-5 shrink-0 ${calendarOpen ? 'text-violet-700' : 'text-slate-500'}`} />
            <span className="min-w-0 flex-1"><span className="block text-xs font-black text-slate-950">月間カレンダー</span><span className="block truncate text-[9px] font-bold text-slate-500">全体・児童別・家庭別・学校別で確認</span></span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${calendarOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {monthlySettingsOpen && <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50/50 p-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => changeMonth(previousMonthValue(month))} className="flex min-h-11 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-slate-700"><ChevronLeft className="h-4 w-4" />前月</button>
            <input type="month" value={month} onChange={(event) => changeMonth(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold" />
            <button type="button" onClick={() => changeMonth(nextMonthValue(month))} className="flex min-h-11 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-slate-700">翌月<ChevronRight className="h-4 w-4" /></button>
            {canManage && <button type="button" disabled={saving} onClick={() => void reflectMonth()} className="flex min-h-11 items-center gap-2 rounded-xl bg-teal-600 px-4 text-xs font-black text-white disabled:opacity-50"><CopyCheck className="h-4 w-4" />基本予定を反映</button>}
            {canManage && <button type="button" disabled={saving} onClick={() => void reapplyMonth()} className="flex min-h-11 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 text-xs font-black text-amber-900 disabled:opacity-50"><RotateCcw className="h-4 w-4" />月全体を再反映</button>}
            {canManage && <button type="button" onClick={() => setHolidayRangeOpen((current) => !current)} className="flex min-h-11 items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-4 text-xs font-black text-sky-800"><Home className="h-4 w-4" />長期休暇期間</button>}
            {canManage && <button type="button" onClick={() => setBulkDeleteOpen((current) => !current)} className="flex min-h-11 items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 text-xs font-black text-rose-800"><Trash2 className="h-4 w-4" />予定を一括削除</button>}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl bg-emerald-50 p-2"><strong className="block text-lg text-emerald-800">{confirmedDays}</strong>確定日</div>
            <div className="rounded-xl bg-sky-50 p-2"><strong className="block text-lg text-sky-800">{new Set(monthRequirements.map((item) => item.date)).size}</strong>予定作成日</div>
            <div className={`rounded-xl p-2 ${missingCount ? 'bg-rose-50 text-rose-800' : 'bg-slate-50'}`}><strong className="block text-lg">{missingCount}</strong>情報不足</div>
          </div>
          {canManage && (
            <div className="mt-3 grid gap-2 rounded-xl border border-teal-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <label className="text-[10px] font-black text-teal-950">児童ごとに基本予定を反映
                <select value={monthChildId} onChange={(event) => setMonthChildId(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-teal-300 bg-white px-3 text-sm font-bold">
                  <option value="">児童を選択</option>
                  {transportChildren.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
                </select>
              </label>
              <button type="button" disabled={saving || !monthChildId} onClick={() => void reapplyChildMonth()} className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 text-xs font-black text-white disabled:opacity-40"><CopyCheck className="h-4 w-4" />選択児童へ反映</button>
            </div>
          )}
          {holidayRangeOpen && (
          <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
            <p className="text-xs font-black text-sky-950">長期休暇・自宅等への迎えを一括設定</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <label className="text-[10px] font-bold text-slate-600">開始日<input type="date" value={holidayFrom} onChange={(event) => setHolidayFrom(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-sky-200 bg-white px-2 text-sm" /></label>
              <label className="text-[10px] font-bold text-slate-600">終了日<input type="date" value={holidayTo} onChange={(event) => setHolidayTo(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-sky-200 bg-white px-2 text-sm" /></label>
              <button type="button" disabled={saving} onClick={() => void applyHolidayRange()} className="min-h-10 self-end rounded-lg bg-sky-700 px-4 text-xs font-black text-white">期間へ反映</button>
            </div>
            <p className="mt-2 text-[10px] text-sky-800">児童ごとの迎え時刻入力は不要です。{routeSettings.holidayArrivalTime}の事業所到着から逆算します。</p>
          </div>
          )}
          {bulkDeleteOpen && canManage && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-black text-rose-950">{Number(month.slice(5, 7))}月・全児童の登録予定を一括削除</p>
                <p className="mt-1 text-[10px] font-bold leading-relaxed text-rose-800">選択中の月に登録された全児童の日別利用予定と送迎条件を削除します。保存済み支援記録、児童名簿、作成済み送迎便は保持します。</p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-rose-800">登録 {monthRegisteredScheduleKeys.size}件</span>
            </div>
            <div className="mt-3 flex flex-col gap-2 rounded-lg border border-rose-200 bg-white p-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-[10px] font-bold text-slate-600">
                <span className="block text-xs font-black text-slate-900">対象月：{month.replace('-', '年')}月</span>
                <span>削除対象：全児童・登録予定 {monthRegisteredScheduleKeys.size}件</span>
              </div>
              <button type="button" disabled={bulkDeleting || monthRegisteredScheduleKeys.size === 0} onClick={() => void deleteMonthSchedules()} className="flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-rose-700 px-4 text-xs font-black text-white disabled:opacity-40">
                {bulkDeleting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{bulkDeleting ? '削除中…' : 'この月の全児童予定を削除'}
              </button>
            </div>
          </div>
          )}
        </div>}
      </section>

      {calendarOpen && <section className="ui-panel-enter rounded-2xl border border-violet-200 bg-white p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
          <div><p className="text-[10px] font-black text-violet-700">必要な時だけ確認</p><h3 className="text-sm font-black text-slate-950">月間カレンダー</h3></div>
          <button type="button" onClick={() => setCalendarOpen(false)} className="min-h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-[10px] font-black text-slate-600">閉じる</button>
        </div>
        <div className="mb-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black text-slate-500">月間カレンダーの表示単位</p>
            <div className="mt-1 grid grid-cols-4 rounded-lg bg-white p-1 shadow-sm">
              {([['all', '全体'], ['child', '児童別'], ['household', '家庭別'], ['school', '学校別']] as Array<[CalendarViewMode, string]>).map(([mode, label]) => <button key={mode} type="button" onClick={() => { setCalendarViewMode(mode); setCalendarViewKey(''); }} className={`min-h-9 rounded-md px-2 text-[10px] font-black ${calendarViewMode === mode ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>{label}</button>)}
            </div>
          </div>
          {calendarViewMode !== 'all' && <label className="min-w-0 text-[10px] font-black text-slate-600 sm:w-72">{calendarViewMode === 'child' ? '児童' : calendarViewMode === 'household' ? '家庭' : '学校'}を選択<select value={calendarViewKey || calendarViewOptions[0]?.key || ''} onChange={(event) => setCalendarViewKey(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-bold">{calendarViewOptions.length === 0 && <option value="">対象なし</option>}{calendarViewOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-slate-400">{['日','月','火','水','木','金','土'].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: new Date(`${month}-01T00:00:00`).getDay() }).map((_, index) => <span key={`blank-${index}`} />)}
          {dates.map((date) => {
            const rows = monthRequirements.filter((item) => item.date === date && (!calendarChildIds || calendarChildIds.has(item.childId)));
            const absentCount = dailyChildPlans.filter((plan) => plan.date === date && plan.attendancePlan === '欠席' && activeChildIds.has(plan.childId) && (!calendarChildIds || calendarChildIds.has(plan.childId))).length;
            const additionalCount = dailyChildPlans.filter((plan) => plan.date === date && plan.attendancePlan === '追加利用' && activeChildIds.has(plan.childId) && (!calendarChildIds || calendarChildIds.has(plan.childId))).length;
            const serviceCount = serviceChildrenForDate(childrenList, dailyChildPlans, date).filter((child) => !calendarChildIds || calendarChildIds.has(child.id)).length;
            const day = planDays.find((candidate) => candidate.date === date);
            const missing = rows.some((item) => missingFields(item).length > 0);
            const focused = calendarViewMode !== 'all';
            return <button key={date} type="button" onClick={() => selectDate(date)} className={`${focused ? 'min-h-24' : 'min-h-16'} min-w-0 rounded-lg border p-1 text-left ${selectedDate === date ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-100' : 'border-slate-200 bg-white'}`}><span className="block text-xs font-black">{Number(date.slice(-2))}</span>{focused ? <span className="mt-1 block space-y-0.5">{rows.map((item) => { const timeSummary = item.pickupEnabled ? transportTimeSummary(item, '迎え') : '保護者'; return <span key={item.childId} className="block truncate text-[8px] font-black text-sky-800" title={`${childrenList.find((child) => child.id === item.childId)?.name || '児童'}：${timeSummary}`}>{childrenList.find((child) => child.id === item.childId)?.name || '児童'}：{timeSummary}</span>; })}{rows.length === 0 && <span className="block text-[8px] font-bold text-slate-300">予定なし</span>}{absentCount > 0 && <span className="block truncate text-[8px] font-black text-rose-600">欠席 {absentCount}名</span>}</span> : <><span className={`mt-1 block truncate text-[9px] font-bold ${missing ? 'text-rose-700' : day?.status && day.status !== 'draft' ? 'text-emerald-700' : serviceCount ? 'text-sky-700' : 'text-slate-300'}`}>{missing ? '要確認' : day?.status && day.status !== 'draft' ? `確定 ${serviceCount}名` : serviceCount ? `${serviceCount}名` : '予定なし'}</span>{additionalCount > 0 && <span className="mt-0.5 block truncate text-[8px] font-black text-teal-700">追加{additionalCount}名</span>}{absentCount > 0 && <span className="mt-0.5 block truncate text-[8px] font-black text-rose-600">欠席{absentCount}名</span>}</>}</button>;
          })}
        </div>
      </section>}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-[10px] font-black text-teal-700">{getWeekdayFromDate(selectedDate)}曜日</p><h3 className="text-lg font-black">{selectedDate} の利用・送迎予定</h3></div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[10px] font-bold text-slate-600">迎え方式<select value={dayDraft.pickupMode} disabled={!canManage} onChange={(event) => changePickupMode(event.target.value as TransportPickupMode)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-bold"><option value="school">学校等への迎え</option><option value="home">自宅等への迎え</option><option value="custom">個別設定</option></select></label>
            {dayDraft.pickupMode === 'home' && <label className="text-[10px] font-bold text-slate-600">事業所到着目標<input type="time" value={dayDraft.targetArrivalTime} disabled={!canManage} onChange={(event) => setDayDraft((current) => ({ ...current, targetArrivalTime: event.target.value }))} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-2 text-sm font-bold" /></label>}
          </div>
        </div>
        {canManage && calendarViewMode !== 'all' && displayedSelectedRequirements.length > 1 && <div className="mt-3 flex flex-col gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 sm:flex-row sm:items-end"><label className="min-w-0 flex-1 text-[10px] font-black text-sky-950">表示中 {displayedSelectedRequirements.length}名の下校・迎え時刻を一括変更<input type="time" value={bulkPickupTime} onChange={(event) => setBulkPickupTime(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-sky-300 bg-white px-3 text-sm" /></label><button type="button" disabled={!bulkPickupTime} onClick={() => { const targetIds = new Set(displayedSelectedRequirements.map((item) => item.childId)); const now = new Date().toISOString(); setDrafts((current) => current.map((item) => targetIds.has(item.childId) ? { ...item, pickupTargetTime: bulkPickupTime, timeChangeNote: undefined, source: 'manual', status: 'draft', revision: item.revision + 1, updatedAt: now } : item)); setMessage(`表示中の${targetIds.size}名へ下校・迎え時刻 ${bulkPickupTime} を反映しました。児童ごとに変更メモを入力して保存してください。`); }} className="min-h-10 shrink-0 rounded-lg bg-sky-700 px-4 text-xs font-black text-white disabled:opacity-40">表示中の児童へ反映</button></div>}

        <section className="mt-3 overflow-hidden rounded-2xl border-2 border-slate-200 bg-white" aria-label="利用・送迎一覧">
          <header className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-black text-teal-700">利用予定と送迎時刻を一画面で確認</p>
              <h4 className="flex items-center gap-2 text-base font-black text-slate-950"><CalendarRange className="h-5 w-5 text-teal-700" />利用・送迎一覧</h4>
              <p className="mt-0.5 text-[10px] font-bold text-slate-500">表示は確認用です。内容を変更する場合は、各児童の「編集」を選択します。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex min-h-10 items-center rounded-xl bg-white px-3 text-[10px] font-black text-slate-700 shadow-sm">{selectedDate}・{displayedServiceChildren.length}名</span>
              <button type="button" disabled={selectedServiceChildren.length === 0} onClick={() => window.print()} className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-slate-700 disabled:opacity-40"><Printer className="h-4 w-4" />日別表を印刷</button>
              {canManage && <button type="button" onClick={() => setAdditionalPickerOpen(true)} className="flex min-h-10 items-center gap-2 rounded-xl bg-teal-700 px-3 text-xs font-black text-white"><UserPlus className="h-4 w-4" />児童を追加</button>}
            </div>
          </header>

          {displayedServiceChildren.length === 0 ? (
            <div className="py-8 text-center"><CalendarRange className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-2 text-sm font-bold text-slate-500">この日の利用予定はありません。</p>{canManage && <button type="button" onClick={() => prepareSelectedDate()} className="mt-3 min-h-10 rounded-xl bg-teal-600 px-4 text-xs font-black text-white">この日の基本予定を作成</button>}</div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <div className="min-w-[900px]">
                  <div className="grid grid-cols-[58px_minmax(120px,1.15fr)_minmax(105px,1fr)_88px_minmax(100px,1fr)_88px_minmax(130px,1.2fr)_64px] gap-px bg-slate-200 text-[10px] font-black text-slate-600">
                    {['学年', '児童名', '迎え先', '下校／迎え', '送り先', '送り時間', '連絡・メモ', '操作'].map((label) => <span key={label} className="bg-slate-100 px-2 py-2 text-center">{label}</span>)}
                  </div>
                  {[...displayedServiceChildren].sort((left, right) => {
                    const leftRequirement = displayedSelectedRequirements.find((item) => item.childId === left.id);
                    const rightRequirement = displayedSelectedRequirements.find((item) => item.childId === right.id);
                    return rosterTimeLabel(leftRequirement, '迎え', Boolean(left.transportationRequired)).localeCompare(rosterTimeLabel(rightRequirement, '迎え', Boolean(right.transportationRequired)))
                      || compactGrade(left.grade).localeCompare(compactGrade(right.grade), 'ja')
                      || left.name.localeCompare(right.name, 'ja');
                  }).map((child) => {
                    const item = displayedSelectedRequirements.find((candidate) => candidate.childId === child.id);
                    const baseline = item ? baselineTimesFor(item) : { pickup: '', dropoff: '' };
                    const pickupDifferent = Boolean(item?.pickupEnabled && item.pickupTimeMode === 'fixed' && baseline.pickup && timeValue(item.pickupTargetTime) !== baseline.pickup);
                    const dropoffDifferent = Boolean(item?.dropoffEnabled && item.dropoffTimeMode === 'departure_forward' && baseline.dropoff && timeValue(item.dropoffTargetTime) !== baseline.dropoff);
                    const missing = item ? missingFields(item) : (child.transportationRequired ? ['送迎条件'] : []);
                    const pickupGuardian = item ? !item.pickupEnabled : !child.transportationRequired;
                    const dropoffGuardian = item ? !item.dropoffEnabled : !child.transportationRequired;
                    return (
                      <div key={child.id} className={`grid min-h-14 grid-cols-[58px_minmax(120px,1.15fr)_minmax(105px,1fr)_88px_minmax(100px,1fr)_88px_minmax(130px,1.2fr)_64px] gap-px border-t border-slate-200 ${missing.length ? 'bg-rose-200' : pickupDifferent || dropoffDifferent ? 'bg-amber-200' : 'bg-slate-200'}`}>
                        <span className="flex items-center justify-center bg-white px-2 py-2 text-xs font-black text-slate-700">{compactGrade(child.grade)}</span>
                        <span className="flex min-w-0 items-center gap-1.5 bg-white px-2 py-2 text-xs font-black text-slate-950"><span className="truncate">{child.name}</span>{selectedAdditionalChildIds.has(child.id) && <span className="shrink-0 rounded-full bg-teal-100 px-1.5 py-0.5 text-[8px] text-teal-800">追加</span>}</span>
                        <span className={`flex min-w-0 items-center bg-white px-2 py-2 text-[11px] font-bold ${pickupGuardian ? 'text-sky-800' : 'text-slate-700'}`}><span className="truncate" title={rosterLocationLabel(item, '迎え', Boolean(child.transportationRequired))}>{rosterLocationLabel(item, '迎え', Boolean(child.transportationRequired))}</span></span>
                        <span className={`flex flex-col items-center justify-center bg-white px-1 py-2 text-xs font-black ${pickupDifferent ? 'text-amber-800' : pickupGuardian ? 'text-sky-800' : 'text-slate-950'}`}>{rosterTimeLabel(item, '迎え', Boolean(child.transportationRequired))}{item?.pickupEnabled && item.pickupTimeMode !== 'fixed' && <small className="text-[8px] text-slate-400">{item.pickupTimeMode === 'arrival_backward' ? '逆算' : '順算'}</small>}{pickupDifferent && <small className="text-[8px]">基本 {baseline.pickup}</small>}</span>
                        <span className={`flex min-w-0 items-center bg-white px-2 py-2 text-[11px] font-bold ${dropoffGuardian ? 'text-violet-800' : 'text-slate-700'}`}><span className="truncate" title={rosterLocationLabel(item, '送り', Boolean(child.transportationRequired))}>{rosterLocationLabel(item, '送り', Boolean(child.transportationRequired))}</span></span>
                        <span className={`flex flex-col items-center justify-center bg-white px-1 py-2 text-xs font-black ${dropoffDifferent ? 'text-amber-800' : dropoffGuardian ? 'text-violet-800' : 'text-slate-950'}`}>{rosterTimeLabel(item, '送り', Boolean(child.transportationRequired))}{item?.dropoffEnabled && item.dropoffTimeMode !== 'fixed' && <small className="text-[8px] text-slate-400">{item.dropoffTimeMode === 'arrival_backward' ? '逆算' : '順算'}</small>}{dropoffDifferent && <small className="text-[8px]">基本 {baseline.dropoff}</small>}</span>
                        <span className="flex min-w-0 items-center bg-white px-2 py-2 text-[10px] font-bold text-slate-600"><span className="line-clamp-2">{item?.timeChangeNote || item?.note || '—'}</span></span>
                        <span className="grid place-items-center bg-white p-1"><button type="button" onClick={() => openRequirementEditor(child)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700" aria-label={`${child.name}の利用・送迎予定を編集`} title="編集"><Pencil className="h-4 w-4" /></button></span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="divide-y divide-slate-200 md:hidden">
                {[...displayedServiceChildren].sort((left, right) => left.name.localeCompare(right.name, 'ja')).map((child) => {
                  const item = displayedSelectedRequirements.find((candidate) => candidate.childId === child.id);
                  const baseline = item ? baselineTimesFor(item) : { pickup: '', dropoff: '' };
                  const pickupDifferent = Boolean(item?.pickupEnabled && item.pickupTimeMode === 'fixed' && baseline.pickup && timeValue(item.pickupTargetTime) !== baseline.pickup);
                  const dropoffDifferent = Boolean(item?.dropoffEnabled && item.dropoffTimeMode === 'departure_forward' && baseline.dropoff && timeValue(item.dropoffTargetTime) !== baseline.dropoff);
                  const missing = item ? missingFields(item) : (child.transportationRequired ? ['送迎条件'] : []);
                  return (
                    <div key={child.id} className={`px-3 py-3 ${missing.length ? 'bg-rose-50' : pickupDifferent || dropoffDifferent ? 'bg-amber-50' : 'bg-white'}`}>
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{compactGrade(child.grade)}</span>
                        <strong className="min-w-0 flex-1 truncate text-sm text-slate-950">{child.name}</strong>
                        {selectedAdditionalChildIds.has(child.id) && <span className="rounded-full bg-teal-100 px-2 py-1 text-[8px] font-black text-teal-800">追加利用</span>}
                        <button type="button" onClick={() => openRequirementEditor(child)} className="flex min-h-10 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-[10px] font-black text-slate-700"><Pencil className="h-3.5 w-3.5" />編集</button>
                      </div>
                      <div className="mt-2 grid grid-cols-[1fr_82px] gap-x-2 gap-y-1 text-[10px]">
                        <span className="truncate font-bold text-slate-600"><b className="mr-1 text-sky-800">迎え</b>{rosterLocationLabel(item, '迎え', Boolean(child.transportationRequired))}</span>
                        <span className={`text-right font-black ${pickupDifferent ? 'text-amber-800' : 'text-slate-900'}`}>{rosterTimeLabel(item, '迎え', Boolean(child.transportationRequired))}</span>
                        <span className="truncate font-bold text-slate-600"><b className="mr-1 text-violet-800">送り</b>{rosterLocationLabel(item, '送り', Boolean(child.transportationRequired))}</span>
                        <span className={`text-right font-black ${dropoffDifferent ? 'text-amber-800' : 'text-slate-900'}`}>{rosterTimeLabel(item, '送り', Boolean(child.transportationRequired))}</span>
                      </div>
                      {(item?.timeChangeNote || item?.note) && <p className="mt-2 truncate rounded-md bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600">連絡：{item.timeChangeNote || item.note}</p>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <details className="group mt-3 overflow-hidden rounded-xl border border-rose-200 bg-rose-50">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 marker:hidden">
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-black text-rose-950">欠席設定</span>
              <span className="block truncate text-[9px] font-bold text-rose-700">開いて欠席する児童をチェック</span>
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-rose-800">欠席 {selectedAbsentPlans.length}名</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-rose-700 transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t border-rose-200 p-2.5">
            <p className="mb-2 text-[10px] font-bold text-rose-800">欠席する児童にチェックを入れます。チェックを外すと利用予定へ戻ります。</p>
            {attendanceChildren.length === 0 ? (
              <p className="rounded-lg bg-white p-2 text-center text-xs font-bold text-slate-500">この日の利用予定児童はいません。</p>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {attendanceChildren.map((child) => {
                  const absent = selectedAbsentPlans.some((plan) => plan.childId === child.id);
                  const savingAttendance = attendanceSavingChildId === child.id;
                  return (
                    <div key={child.id} className={`flex min-h-9 items-center gap-1 rounded-lg border px-2 ${absent ? 'border-rose-400 bg-white text-rose-950' : 'border-rose-100 bg-white/80 text-slate-800'}`}>
                      <label className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 ${canManage ? 'cursor-pointer' : 'cursor-default'}`}>
                        <input
                          type="checkbox"
                          checked={absent}
                          disabled={!canManage || Boolean(attendanceSavingChildId)}
                          onChange={(event) => void setSelectedDateAttendance(child.id, event.target.checked ? '欠席' : '利用予定')}
                          className="h-4 w-4 shrink-0 accent-rose-600"
                        />
                        <span className="min-w-0 flex-1 truncate text-[11px] font-black">{child.name}</span>
                        <span className={`shrink-0 text-[8px] font-black ${absent ? 'text-rose-700' : 'text-slate-400'}`}>{savingAttendance ? '保存中…' : absent ? '欠席' : '利用予定'}</span>
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </details>

        {canManage && (selectedRequirements.length > 0 || drafts.length > 0) && <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={() => prepareSelectedDate(true)} className="min-h-10 rounded-xl border border-slate-300 px-3 text-xs font-black text-slate-600">基本情報を再反映</button><button type="button" disabled={saving} onClick={() => void saveSelected(false)} className="flex min-h-10 items-center gap-2 rounded-xl border border-teal-300 bg-white px-4 text-xs font-black text-teal-800"><Save className="h-4 w-4" />下書き保存</button><button type="button" disabled={saving} onClick={() => void saveSelected(true)} className="flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-black text-white">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}送迎条件を確定</button></div>}
        {message && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800">{message}</p>}
        {error && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-800">{error}</p>}
        {saving && <p className="mt-2 flex items-center gap-2 text-xs font-bold text-slate-500"><Clock3 className="h-4 w-4" />保存しています…</p>}
      </section>

      <section className="transport-print-sheet" aria-hidden="true">
        <div className="transport-print-heading">
          <span>日直：</span>
          <strong>{selectedDate.replaceAll('-', '/')}（{getWeekdayFromDate(selectedDate)}）</strong>
        </div>
        <table className="transport-print-roster">
          <thead>
            <tr><th>学年</th><th>No.</th><th>氏名</th><th>迎え</th><th>下校／迎え</th><th>送り</th><th>送り時間</th><th>連絡事項・その他</th><th>担当</th></tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.max(15, selectedServiceChildren.length) }, (_, index) => {
              const child = [...selectedServiceChildren].sort((left, right) => compactGrade(left.grade).localeCompare(compactGrade(right.grade), 'ja') || left.name.localeCompare(right.name, 'ja'))[index];
              const item = child ? selectedRequirements.find((candidate) => candidate.childId === child.id) : undefined;
              const dailyPlan = child ? dailyChildPlans.find((plan) => plan.childId === child.id && plan.date === selectedDate) : undefined;
              return (
                <tr key={child?.id || `print-empty-${index}`}>
                  <td>{child ? compactGrade(child.grade) : ''}</td>
                  <td>{index + 1}</td>
                  <td>{child?.name || ''}</td>
                  <td>{child ? rosterLocationLabel(item, '迎え', Boolean(child.transportationRequired)) : ''}</td>
                  <td>{child ? rosterTimeLabel(item, '迎え', Boolean(child.transportationRequired)) : ''}</td>
                  <td>{child ? rosterLocationLabel(item, '送り', Boolean(child.transportationRequired)) : ''}</td>
                  <td>{child ? rosterTimeLabel(item, '送り', Boolean(child.transportationRequired)) : ''}</td>
                  <td>{item?.timeChangeNote || item?.note || dailyPlan?.note || ''}</td>
                  <td />
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="transport-print-runs">
          {(selectedRuns.length > 0 ? selectedRuns : Array.from({ length: 5 }, (_, index) => ({ id: `blank-${index}` } as TransportRun))).map((run) => (
            <section key={run.id} className="transport-print-run">
              <h3>{run.vehicleName || run.name || '（　　　　　　）'}</h3>
              <p><b>方向</b><span>{run.direction || ''}</span></p>
              <p><b>ドライバー</b><span>{run.driverName || ''}</span></p>
              <p><b>出発</b><span>{run.startTime || ''}</span></p>
              {Array.from({ length: Math.max(5, run.stops?.length || 0) }, (_, index) => <p key={`${run.id}-stop-${index}`}><b>{index + 1}</b><span>{run.stops?.[index]?.childName || run.stops?.[index]?.locationName || ''}</span></p>)}
            </section>
          ))}
        </div>
        <div className="transport-print-footer"><span>休み職員：</span><span>★活動：</span></div>
      </section>

      {editingChild && editingRequirement && (() => {
        const pickupLocations = getTransportLocationOptions(editingChild, '迎え', selectedDate);
        const selectedPickupLocationId = editingRequirement.pickupLocationProfileId
          || pickupLocations.find((location) => location.name === editingRequirement.pickupLocationName && location.address === editingRequirement.pickupAddress)?.id
          || 'manual';
        const dropoffLocations = getTransportLocationOptions(editingChild, '送り', selectedDate);
        const selectedDropoffLocationId = editingRequirement.dropoffLocationProfileId
          || dropoffLocations.find((location) => location.name === editingRequirement.dropoffLocationName && location.address === editingRequirement.dropoffAddress)?.id
          || 'manual';
        const baseline = baselineTimesFor(editingRequirement);
        const pickupDifferent = editingRequirement.pickupEnabled && editingRequirement.pickupTimeMode === 'fixed' && Boolean(baseline.pickup) && timeValue(editingRequirement.pickupTargetTime) !== baseline.pickup;
        const dropoffDifferent = editingRequirement.dropoffEnabled && editingRequirement.dropoffTimeMode === 'departure_forward' && Boolean(baseline.dropoff) && timeValue(editingRequirement.dropoffTargetTime) !== baseline.dropoff;
        const changed = timeChangedSinceSave(editingRequirement);
        return (
          <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`${editingChild.name}の利用・送迎予定を編集`}>
            <div className="max-h-[94dvh] w-full overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-3xl sm:rounded-2xl">
              <header className="flex items-center justify-between border-b border-slate-200 p-4">
                <div><p className="text-[10px] font-black text-teal-700">{selectedDate}・{compactGrade(editingChild.grade)}</p><h3 className="text-lg font-black text-slate-950">{editingChild.name}の利用・送迎を編集</h3></div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => void openTimeHistory(editingChild.id)} className="flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[10px] font-black text-slate-700"><Info className="h-4 w-4" />履歴</button>
                  <button type="button" onClick={closeRequirementEditor} aria-label="閉じる" className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100"><X className="h-5 w-5" /></button>
                </div>
              </header>
              <div className="max-h-[calc(94dvh-142px)] overflow-y-auto p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className={`rounded-xl border p-3 ${pickupDifferent ? 'border-amber-300 bg-amber-50' : 'border-sky-200 bg-sky-50'}`}>
                    <label className="text-[10px] font-black text-sky-950">{editingRequirement.pickupTimeMode === 'fixed' ? '下校・迎え時間' : timeAnchorLabel('迎え', editingRequirement.pickupTimeMode)}<input type="time" value={editingRequirement.pickupTargetTime || ''} disabled={!canManage || !editingRequirement.pickupEnabled} onChange={(event) => updateRequirement(editingRequirement.childId, { pickupTargetTime: event.target.value || undefined })} className="mt-1 min-h-12 w-full rounded-lg border border-sky-300 bg-white px-3 text-xl font-black disabled:opacity-50" /></label>
                    <select value={editingRequirement.pickupTimeMode} disabled={!canManage || !editingRequirement.pickupEnabled} onChange={(event) => updateRequirement(editingRequirement.childId, { pickupTimeMode: event.target.value as TransportTimeMode })} className="mt-2 min-h-9 w-full rounded-lg border border-sky-200 bg-white px-2 text-[10px] font-bold">{TRANSPORT_TIME_MODE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                    {baseline.pickup && <p className={`mt-2 text-[10px] font-black ${pickupDifferent ? 'text-amber-800' : 'text-slate-500'}`}>児童情報の基本：{baseline.pickup}{pickupDifferent && '（変更あり）'}</p>}
                  </div>
                  <div className={`rounded-xl border p-3 ${dropoffDifferent ? 'border-amber-300 bg-amber-50' : 'border-violet-200 bg-violet-50'}`}>
                    <label className="text-[10px] font-black text-violet-950">{editingRequirement.dropoffTimeMode === 'departure_forward' ? '送り開始時間' : timeAnchorLabel('送り', editingRequirement.dropoffTimeMode)}<input type="time" value={editingRequirement.dropoffTargetTime || ''} disabled={!canManage || !editingRequirement.dropoffEnabled} onChange={(event) => updateRequirement(editingRequirement.childId, { dropoffTargetTime: event.target.value || undefined })} className="mt-1 min-h-12 w-full rounded-lg border border-violet-300 bg-white px-3 text-xl font-black disabled:opacity-50" /></label>
                    <select value={editingRequirement.dropoffTimeMode} disabled={!canManage || !editingRequirement.dropoffEnabled} onChange={(event) => updateRequirement(editingRequirement.childId, { dropoffTimeMode: event.target.value as TransportTimeMode })} className="mt-2 min-h-9 w-full rounded-lg border border-violet-200 bg-white px-2 text-[10px] font-bold">{TRANSPORT_TIME_MODE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                    {baseline.dropoff && <p className={`mt-2 text-[10px] font-black ${dropoffDifferent ? 'text-amber-800' : 'text-slate-500'}`}>基本の退所：{baseline.dropoff}{dropoffDifferent && '（変更あり）'}</p>}
                  </div>
                </div>
                {(pickupDifferent || dropoffDifferent) && <p className="mt-3 rounded-xl bg-amber-100 px-3 py-2 text-[10px] font-black text-amber-950">児童情報に登録された基本時刻と異なります。変更理由を入力して保存してください。</p>}
                {changed && canManage && <label className="mt-3 block text-[10px] font-black text-slate-700">時刻変更メモ（必須）<input value={editingRequirement.timeChangeNote || ''} onChange={(event) => updateRequirement(editingRequirement.childId, { timeChangeNote: event.target.value })} placeholder="例：学校から短縮授業の連絡あり（○○先生）" className="mt-1 min-h-11 w-full rounded-xl border border-amber-300 bg-amber-50 px-3 text-sm" /></label>}
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <TransportRequirementFieldset direction="迎え" item={editingRequirement} selectedLocationId={selectedPickupLocationId} locations={pickupLocations} canManage={canManage} onToggle={(enabled) => updateRequirement(editingRequirement.childId, { pickupEnabled: enabled })} onChangeLocation={(locationId) => changePickupLocation(editingRequirement.childId, locationId)} onUpdate={(patch) => updateRequirement(editingRequirement.childId, patch)} />
                  <TransportRequirementFieldset direction="送り" item={editingRequirement} selectedLocationId={selectedDropoffLocationId} locations={dropoffLocations} canManage={canManage} onToggle={(enabled) => updateRequirement(editingRequirement.childId, { dropoffEnabled: enabled })} onChangeLocation={(locationId) => changeDropoffLocation(editingRequirement.childId, locationId)} onUpdate={(patch) => updateRequirement(editingRequirement.childId, patch)} />
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3"><label className="text-[10px] font-bold text-slate-600">乗降対応時間（分）<input type="number" min="0" max="60" value={editingRequirement.stopDurationMinutes} disabled={!canManage} onChange={(event) => updateRequirement(editingRequirement.childId, { stopDurationMinutes: Number(event.target.value) })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label><label className="flex min-h-12 items-center gap-2 self-end rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold"><input type="checkbox" checked={editingRequirement.keepSiblingsTogether} disabled={!canManage} onChange={(event) => updateRequirement(editingRequirement.childId, { keepSiblingsTogether: event.target.checked })} />兄弟を同じ便にする</label><label className="text-[10px] font-bold text-slate-600">連絡・メモ<input value={editingRequirement.note || ''} disabled={!canManage} onChange={(event) => updateRequirement(editingRequirement.childId, { note: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label></div>
                {error && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-800">{error}</p>}
              </div>
              <footer className="flex items-center justify-between gap-2 border-t border-slate-200 bg-white p-3">
                {canManage ? <button type="button" disabled={Boolean(attendanceSavingChildId)} onClick={() => void deleteSelectedDatePlan(editingChild.id)} className="flex min-h-10 items-center gap-2 rounded-xl border border-rose-200 px-3 text-xs font-black text-rose-700"><Trash2 className="h-4 w-4" />予定を削除</button> : <span />}
                <div className="flex gap-2"><button type="button" onClick={closeRequirementEditor} className="min-h-10 rounded-xl border border-slate-300 px-4 text-xs font-black text-slate-700">キャンセル</button>{canManage && <button type="button" disabled={saving} onClick={() => void saveRequirementRow(editingRequirement)} className="flex min-h-10 items-center gap-2 rounded-xl bg-teal-700 px-4 text-xs font-black text-white disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}変更を保存</button>}</div>
              </footer>
            </div>
          </div>
        );
      })()}

      {historyChildId && (
        <div className="fixed inset-0 z-[125] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="送迎時刻の変更履歴">
          <div className="max-h-[90dvh] w-full overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl">
            <header className="flex items-center justify-between border-b border-slate-200 p-4">
              <div>
                <p className="text-[10px] font-black text-sky-700">インフォメーション</p>
                <h3 className="text-lg font-black text-slate-950">{childrenList.find((child) => child.id === historyChildId)?.name || '児童'}の時刻変更履歴</h3>
              </div>
              <button type="button" onClick={() => setHistoryChildId(undefined)} aria-label="閉じる" className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100"><X className="h-5 w-5" /></button>
            </header>
            <div className="max-h-[72dvh] overflow-y-auto p-4">
              {historyLoading && <p className="flex items-center justify-center gap-2 py-8 text-xs font-bold text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />変更履歴を読み込んでいます…</p>}
              {historyError && <p className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-800">{historyError}</p>}
              {!organizationId && <p className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900">変更履歴は共有データベース接続時に表示されます。</p>}
              {!historyLoading && !historyError && organizationId && historyRows.length === 0 && <p className="py-8 text-center text-xs font-bold text-slate-500">保存済みの時刻変更履歴はありません。</p>}
              {historyRows.length > 0 && (
                <ol className="space-y-2">
                  {historyRows.map((row) => (
                    <li key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black ${row.field === 'pickup_target_time' ? 'bg-sky-100 text-sky-900' : 'bg-violet-100 text-violet-900'}`}>{row.field === 'pickup_target_time' ? '下校・迎え時間' : '送り開始時間'}</span>
                          <p className="mt-1 text-sm font-black text-slate-950">{row.previousTime || '未設定'} <span className="px-1 text-slate-400">→</span> {row.newTime || '未設定'}</p>
                          {row.previousMode !== row.newMode && <p className="mt-0.5 text-[9px] font-bold text-slate-500">{row.previousMode ? TRANSPORT_TIME_MODE_OPTIONS.find((option) => option.value === row.previousMode)?.label : '未設定'} → {row.newMode ? TRANSPORT_TIME_MODE_OPTIONS.find((option) => option.value === row.newMode)?.label : '未設定'}</p>}
                        </div>
                        <span className="text-right text-[9px] font-bold text-slate-500">{row.date}<br />{new Date(row.createdAt).toLocaleString('ja-JP')}</span>
                      </div>
                      <p className="mt-2 rounded-lg bg-white px-2 py-1.5 text-xs font-bold text-slate-700">{row.note}</p>
                      <p className="mt-1 text-[9px] font-bold text-slate-500">変更者：{row.changedByName || 'システム'}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}

      {additionalPickerOpen && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`${selectedDate}の追加利用児童を登録`}>
          <div className="max-h-[90dvh] w-full overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl">
            <header className="flex items-center justify-between border-b border-slate-200 p-4">
              <div><p className="text-[10px] font-black text-teal-700">{selectedDate}</p><h3 className="text-lg font-black text-slate-950">追加利用児童を登録</h3></div>
              <button type="button" onClick={() => { setAdditionalPickerOpen(false); setAdditionalSearch(''); }} aria-label="閉じる" className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100"><X className="h-5 w-5" /></button>
            </header>
            <div className="border-b border-slate-100 p-3">
              <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="sr-only">児童名で検索</span>
                <input value={additionalSearch} onChange={(event) => setAdditionalSearch(event.target.value)} autoFocus placeholder="児童名で検索" className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" />
              </label>
            </div>
            <div className="max-h-[60dvh] overflow-y-auto p-3">
              {additionalCandidates.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {additionalCandidates.map((child) => {
                    const savingChild = attendanceSavingChildId === child.id;
                    const previousPlan = dailyChildPlans.find((plan) => plan.childId === child.id && plan.date === selectedDate);
                    return (
                      <button key={child.id} type="button" disabled={Boolean(attendanceSavingChildId)} onClick={() => void addAdditionalChild(child.id)} className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 px-3 text-left hover:border-teal-400 hover:bg-teal-50 disabled:opacity-50">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal-100 text-teal-700"><UserPlus className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-950">{child.name}</strong><span className="block truncate text-[10px] text-slate-500">{savingChild ? '登録中…' : previousPlan?.attendancePlan === '欠席' ? '欠席予定から追加利用へ変更' : child.transportationRequired ? '送迎条件も自動作成' : '送迎なしで登録'}</span></span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl bg-slate-50 p-6 text-center text-xs font-bold text-slate-500">該当する児童はいません。すでに利用予定へ入っている児童は表示されません。</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
