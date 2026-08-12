import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  CopyCheck,
  Home,
  LoaderCircle,
  MapPin,
  RotateCcw,
  Save,
} from 'lucide-react';
import type {
  ChildProfile,
  DailyChildPlan,
  DailyTransportRequirement,
  TransportDirection,
  TransportPickupMode,
  TransportPlanDay,
  TransportRouteSettings,
} from '../types';
import { getTransportLocationOptions } from '../utils/transportLocations';
import { getTransportScheduleForDate } from '../utils/transportSchedule';
import { getDefaultDepartureTime } from '../utils/transportDeparture';
import { getRegularDaysForDate, getWeekdayFromDate } from '../utils/weekdays';
import { inferTransportArea, resolvedTransportArea } from '../utils/transportArea';

interface MonthlyTransportPlannerProps {
  initialDate: string;
  childrenList: ChildProfile[];
  dailyChildPlans: DailyChildPlan[];
  requirements: DailyTransportRequirement[];
  planDays: TransportPlanDay[];
  routeSettings: TransportRouteSettings;
  canManage: boolean;
  onSavePlanDay: (day: TransportPlanDay) => Promise<void> | void;
  onSaveDailyChildPlan: (plan: DailyChildPlan) => Promise<void> | void;
  onSaveRequirements: (requirements: DailyTransportRequirement[]) => Promise<void> | void;
  onReplaceMonthRequirements: (month: string, requirements: DailyTransportRequirement[]) => Promise<DailyTransportRequirement[]>;
  onReplaceChildMonthRequirements: (month: string, childId: string, requirements: DailyTransportRequirement[]) => Promise<DailyTransportRequirement[]>;
}

const createUuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

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

function scheduledChildrenForDate(
  children: ChildProfile[],
  plans: DailyChildPlan[],
  date: string,
) {
  const weekday = getWeekdayFromDate(date);
  return children.filter((child) => {
    if (child.serviceSuspended) return false;
    if (!child.transportationRequired) return false;
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
    pickupTargetTime: pickupMode === 'home'
      ? undefined
      : timeValue(dailyPlan?.schoolEndTime || schedule?.schoolEndTime) || undefined,
    dropoffLocationProfileId: dropoff?.source === 'registered' ? dropoff.id : undefined,
    dropoffLocationName: dropoff?.name,
    dropoffAddress: dropoff?.address,
    dropoffArea: resolvedTransportArea(dropoff?.address, dropoff?.area || child.dropoffArea),
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
  if (requirement.pickupEnabled && requirement.pickupPattern !== 'home' && !requirement.pickupTargetTime) missing.push('迎え時刻');
  if (requirement.dropoffEnabled && !requirement.dropoffAddress?.trim()) missing.push('送り先');
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
    pickupTargetTime: timeValue(requirement.pickupTargetTime),
    dropoffLocationProfileId: requirement.dropoffLocationProfileId || '',
    dropoffLocationName: requirement.dropoffLocationName || '',
    dropoffAddress: requirement.dropoffAddress || '',
    dropoffArea: requirement.dropoffArea || '',
    dropoffTargetTime: timeValue(requirement.dropoffTargetTime),
    stopDurationMinutes: requirement.stopDurationMinutes,
    keepSiblingsTogether: requirement.keepSiblingsTogether,
    source: requirement.source,
    status: requirement.status,
    note: requirement.note || '',
  });
}

export const MonthlyTransportPlanner: React.FC<MonthlyTransportPlannerProps> = ({
  initialDate,
  childrenList,
  dailyChildPlans,
  requirements,
  planDays,
  routeSettings,
  canManage,
  onSavePlanDay,
  onSaveDailyChildPlan,
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
  const [expandedChildId, setExpandedChildId] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [holidayRangeOpen, setHolidayRangeOpen] = useState(false);
  const [attendanceChildId, setAttendanceChildId] = useState('');
  const [attendanceSavingChildId, setAttendanceSavingChildId] = useState<string>();
  const [monthChildId, setMonthChildId] = useState('');
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
  const selectedAbsentPlans = useMemo(() => dailyChildPlans.filter((plan) =>
    plan.date === selectedDate
    && plan.attendancePlan === '欠席'
    && activeChildIds.has(plan.childId)
  ), [activeChildIds, dailyChildPlans, selectedDate]);
  const activeChildren = useMemo(() => childrenList
    .filter((child) => !child.serviceSuspended)
    .sort((left, right) => left.name.localeCompare(right.name, 'ja')), [childrenList]);
  const transportChildren = useMemo(() => activeChildren
    .filter((child) => child.transportationRequired), [activeChildren]);
  const selectedRequirements = drafts.length > 0 && drafts.every((item) => item.date === selectedDate)
    ? drafts.filter((item) => activeChildIds.has(item.childId) && !absentPlanKeys.has(`${item.childId}:${item.date}`))
    : requirements.filter((item) => item.date === selectedDate && activeChildIds.has(item.childId) && !absentPlanKeys.has(`${item.childId}:${item.date}`));

  const selectDate = (date: string) => {
    setSelectedDate(date);
    setDrafts(requirements.filter((item) => item.date === date && activeChildIds.has(item.childId)).map((item) => ({ ...item })));
    setDayDraft(planDays.find((day) => day.date === date) || defaultPlanDay(date, routeSettings));
    setExpandedChildId(undefined);
    setMessage('');
    setError('');
  };

  const changeMonth = (value: string) => {
    setMonth(value);
    const first = `${value}-01`;
    setHolidayFrom(first);
    setHolidayTo(monthDates(value).at(-1) || first);
    selectDate(first);
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
      setExpandedChildId(undefined);
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
      setExpandedChildId(undefined);
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
        if (expandedChildId === childId) setExpandedChildId(undefined);
        setMessage(`${child.name}を${selectedDate}の欠席として登録しました。記録候補と送迎編成から除外されます。`);
      } else {
        const restored = buildRequirement(child, selectedDate, dayDraft.pickupMode, routeSettings, nextPlan);
        await onSaveRequirements([restored]);
        setDrafts((current) => [restored, ...current.filter((item) => item.childId !== childId)]);
        setMessage(`${child.name}を${selectedDate}の利用予定へ戻し、基本送迎情報を反映しました。`);
      }
      setAttendanceChildId('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '利用・欠席予定を保存できませんでした。');
    } finally {
      setAttendanceSavingChildId(undefined);
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
    setDrafts((current) => current.map((item) => item.childId === childId
      ? { ...item, ...patch, source: 'manual', status: 'draft', revision: item.revision + 1, updatedAt: new Date().toISOString() }
      : item));
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
        pickupTargetTime: pickupMode === 'home' ? undefined : item.pickupTargetTime,
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
            <p className="text-[11px] font-black text-teal-700">翌月準備</p>
            <h3 className="text-lg font-black text-slate-950">月間送迎予定</h3>
            <p className="mt-1 text-xs text-slate-500">定期曜日と登録済み送迎情報を反映し、当日の条件だけを修正・確定します。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => changeMonth(previousMonthValue(month))} className="flex min-h-11 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-slate-700"><ChevronLeft className="h-4 w-4" />前月</button>
            <input type="month" value={month} onChange={(event) => changeMonth(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 px-3 text-sm font-bold" />
            <button type="button" onClick={() => changeMonth(nextMonthValue(month))} className="flex min-h-11 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-slate-700">翌月<ChevronRight className="h-4 w-4" /></button>
            {canManage && <button type="button" disabled={saving} onClick={() => void reflectMonth()} className="flex min-h-11 items-center gap-2 rounded-xl bg-teal-600 px-4 text-xs font-black text-white disabled:opacity-50"><CopyCheck className="h-4 w-4" />基本予定を反映</button>}
            {canManage && <button type="button" disabled={saving} onClick={() => void reapplyMonth()} className="flex min-h-11 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 text-xs font-black text-amber-900 disabled:opacity-50"><RotateCcw className="h-4 w-4" />月全体を再反映</button>}
            {canManage && <button type="button" onClick={() => setHolidayRangeOpen((current) => !current)} className="flex min-h-11 items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-4 text-xs font-black text-sky-800"><Home className="h-4 w-4" />長期休暇期間</button>}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-emerald-50 p-2"><strong className="block text-lg text-emerald-800">{confirmedDays}</strong>確定日</div>
          <div className="rounded-xl bg-sky-50 p-2"><strong className="block text-lg text-sky-800">{new Set(monthRequirements.map((item) => item.date)).size}</strong>予定作成日</div>
          <div className={`rounded-xl p-2 ${missingCount ? 'bg-rose-50 text-rose-800' : 'bg-slate-50'}`}><strong className="block text-lg">{missingCount}</strong>情報不足</div>
        </div>
        {canManage && (
          <div className="mt-3 grid gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
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
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-slate-400">{['日','月','火','水','木','金','土'].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: new Date(`${month}-01T00:00:00`).getDay() }).map((_, index) => <span key={`blank-${index}`} />)}
          {dates.map((date) => {
            const rows = monthRequirements.filter((item) => item.date === date);
            const absentCount = dailyChildPlans.filter((plan) => plan.date === date && plan.attendancePlan === '欠席' && activeChildIds.has(plan.childId)).length;
            const day = planDays.find((candidate) => candidate.date === date);
            const missing = rows.some((item) => missingFields(item).length > 0);
            return <button key={date} type="button" onClick={() => selectDate(date)} className={`min-h-14 rounded-lg border p-1 text-left ${selectedDate === date ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-100' : 'border-slate-200 bg-white'}`}><span className="block text-xs font-black">{Number(date.slice(-2))}</span><span className={`mt-1 block truncate text-[9px] font-bold ${missing ? 'text-rose-700' : day?.status && day.status !== 'draft' ? 'text-emerald-700' : rows.length ? 'text-sky-700' : 'text-slate-300'}`}>{missing ? '要確認' : day?.status && day.status !== 'draft' ? '確定' : rows.length ? `${rows.length}名` : '未作成'}</span>{absentCount > 0 && <span className="mt-0.5 block truncate text-[8px] font-black text-rose-600">欠席{absentCount}名</span>}</button>;
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-[10px] font-black text-teal-700">{getWeekdayFromDate(selectedDate)}曜日</p><h3 className="text-lg font-black">{selectedDate} の送迎条件</h3></div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[10px] font-bold text-slate-600">迎え方式<select value={dayDraft.pickupMode} disabled={!canManage} onChange={(event) => changePickupMode(event.target.value as TransportPickupMode)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-bold"><option value="school">学校等への迎え</option><option value="home">自宅等への迎え</option><option value="custom">個別設定</option></select></label>
            {dayDraft.pickupMode === 'home' && <label className="text-[10px] font-bold text-slate-600">事業所到着目標<input type="time" value={dayDraft.targetArrivalTime} disabled={!canManage} onChange={(event) => setDayDraft((current) => ({ ...current, targetArrivalTime: event.target.value }))} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-2 text-sm font-bold" /></label>}
          </div>
        </div>

        {canManage && (
          <div className="mt-3 grid gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="text-[10px] font-black text-rose-950">この日の欠席を登録
              <select value={attendanceChildId} onChange={(event) => setAttendanceChildId(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-rose-300 bg-white px-3 text-sm font-bold">
                <option value="">児童を選択</option>
                {activeChildren.filter((child) => !selectedAbsentPlans.some((plan) => plan.childId === child.id)).map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
              </select>
            </label>
            <button type="button" disabled={!attendanceChildId || Boolean(attendanceSavingChildId)} onClick={() => void setSelectedDateAttendance(attendanceChildId, '欠席')} className="min-h-10 rounded-lg bg-rose-700 px-4 text-xs font-black text-white disabled:opacity-40">欠席として登録</button>
          </div>
        )}

        {selectedAbsentPlans.length > 0 && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-white p-3">
            <p className="text-xs font-black text-rose-900">欠席予定 {selectedAbsentPlans.length}名</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedAbsentPlans.map((plan) => {
                const child = childrenList.find((candidate) => candidate.id === plan.childId);
                return <div key={plan.childId} className="flex min-h-10 items-center gap-2 rounded-lg bg-rose-50 px-3"><span className="text-xs font-black text-rose-900">{child?.name || '児童'}</span>{canManage && <button type="button" disabled={attendanceSavingChildId === plan.childId} onClick={() => void setSelectedDateAttendance(plan.childId, '利用予定')} className="rounded-md border border-rose-200 bg-white px-2 py-1 text-[10px] font-black text-rose-800 disabled:opacity-40">利用予定へ戻す</button>}</div>;
              })}
            </div>
          </div>
        )}

        {selectedRequirements.length === 0 && drafts.length === 0 ? (
          <div className="py-8 text-center"><CalendarRange className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-2 text-sm font-bold text-slate-500">この日の送迎予定は未作成です。</p>{canManage && <button type="button" onClick={() => prepareSelectedDate()} className="mt-3 min-h-10 rounded-xl bg-teal-600 px-4 text-xs font-black text-white">この日の基本予定を作成</button>}</div>
        ) : (
          <div className="mt-3 space-y-2">
            {(selectedRequirements.length ? selectedRequirements : drafts).sort((left, right) => (left.pickupTargetTime || '99:99').localeCompare(right.pickupTargetTime || '99:99') || (left.pickupArea || '').localeCompare(right.pickupArea || '')).map((item) => {
              const child = childrenList.find((candidate) => candidate.id === item.childId);
              const missing = missingFields(item);
              const expanded = expandedChildId === item.childId;
              return <article key={item.childId} className={`overflow-hidden rounded-xl border ${missing.length ? 'border-rose-300' : 'border-slate-200'}`}>
                <button type="button" onClick={() => setExpandedChildId(expanded ? undefined : item.childId)} className="flex min-h-14 w-full items-center gap-3 px-3 text-left"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${missing.length ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{missing.length ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><strong className="block text-sm text-slate-900">{child?.name || '児童'}</strong><span className="block truncate text-[10px] text-slate-500">迎え {item.pickupEnabled ? `${item.pickupTargetTime || '自動計算'}・${item.pickupLocationName || item.pickupAddress || '未設定'}` : 'なし'}／送り {item.dropoffEnabled ? `${item.dropoffTargetTime || '時刻未設定'}・${item.dropoffLocationName || item.dropoffAddress || '未設定'}` : 'なし'}</span></span>{missing.length > 0 && <span className="rounded-full bg-rose-100 px-2 py-1 text-[9px] font-black text-rose-700">{missing.join('・')}</span>}{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
                {expanded && <div className="grid gap-3 border-t border-slate-100 bg-slate-50 p-3 lg:grid-cols-2">
                  <fieldset className="rounded-xl border border-sky-200 bg-white p-3"><legend className="px-1 text-xs font-black text-sky-800">迎え</legend><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={item.pickupEnabled} disabled={!canManage} onChange={(event) => updateRequirement(item.childId, { pickupEnabled: event.target.checked })} />迎えを利用</label>{item.pickupEnabled && <div className="mt-2 grid gap-2"><label className="text-[10px] font-bold text-slate-600">場所名<input value={item.pickupLocationName || ''} disabled={!canManage} onChange={(event) => updateRequirement(item.childId, { pickupLocationName: event.target.value })} className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label><label className="text-[10px] font-bold text-slate-600">住所<input value={item.pickupAddress || ''} disabled={!canManage} onChange={(event) => { const address = event.target.value; updateRequirement(item.childId, { pickupAddress: address, pickupArea: inferTransportArea(address) }); }} className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label><div className="grid grid-cols-2 gap-2"><label className="text-[10px] font-bold text-slate-600">エリア（自動）<input value={item.pickupArea || ''} disabled={!canManage} onChange={(event) => updateRequirement(item.childId, { pickupArea: event.target.value })} className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label>{item.pickupPattern !== 'home' && <label className="text-[10px] font-bold text-slate-600">下校・迎え時刻<input type="time" value={item.pickupTargetTime || ''} disabled={!canManage} onChange={(event) => updateRequirement(item.childId, { pickupTargetTime: event.target.value || undefined })} className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label>}</div></div>}</fieldset>
                  <fieldset className="rounded-xl border border-violet-200 bg-white p-3"><legend className="px-1 text-xs font-black text-violet-800">送り</legend><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={item.dropoffEnabled} disabled={!canManage} onChange={(event) => updateRequirement(item.childId, { dropoffEnabled: event.target.checked })} />送りを利用</label>{item.dropoffEnabled && <div className="mt-2 grid gap-2"><label className="text-[10px] font-bold text-slate-600">場所名<input value={item.dropoffLocationName || ''} disabled={!canManage} onChange={(event) => updateRequirement(item.childId, { dropoffLocationName: event.target.value })} className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label><label className="text-[10px] font-bold text-slate-600">住所<input value={item.dropoffAddress || ''} disabled={!canManage} onChange={(event) => { const address = event.target.value; updateRequirement(item.childId, { dropoffAddress: address, dropoffArea: inferTransportArea(address) }); }} className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label><div className="grid grid-cols-2 gap-2"><label className="text-[10px] font-bold text-slate-600">エリア（自動）<input value={item.dropoffArea || ''} disabled={!canManage} onChange={(event) => updateRequirement(item.childId, { dropoffArea: event.target.value })} className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label><label className="text-[10px] font-bold text-slate-600">送り希望時刻<input type="time" value={item.dropoffTargetTime || ''} disabled={!canManage} onChange={(event) => updateRequirement(item.childId, { dropoffTargetTime: event.target.value || undefined })} className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label></div></div>}</fieldset>
                  <div className="grid gap-2 lg:col-span-2 sm:grid-cols-3"><label className="text-[10px] font-bold text-slate-600">乗降対応時間（分）<input type="number" min="0" max="60" value={item.stopDurationMinutes} disabled={!canManage} onChange={(event) => updateRequirement(item.childId, { stopDurationMinutes: Number(event.target.value) })} className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label><label className="flex min-h-12 items-center gap-2 self-end rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold"><input type="checkbox" checked={item.keepSiblingsTogether} disabled={!canManage} onChange={(event) => updateRequirement(item.childId, { keepSiblingsTogether: event.target.checked })} />兄弟を同じ便にする</label><label className="text-[10px] font-bold text-slate-600">補足<input value={item.note || ''} disabled={!canManage} onChange={(event) => updateRequirement(item.childId, { note: event.target.value })} className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label></div>
                </div>}
              </article>;
            })}
          </div>
        )}

        {canManage && (selectedRequirements.length > 0 || drafts.length > 0) && <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={() => prepareSelectedDate(true)} className="min-h-10 rounded-xl border border-slate-300 px-3 text-xs font-black text-slate-600">基本情報を再反映</button><button type="button" disabled={saving} onClick={() => void saveSelected(false)} className="flex min-h-10 items-center gap-2 rounded-xl border border-teal-300 bg-white px-4 text-xs font-black text-teal-800"><Save className="h-4 w-4" />下書き保存</button><button type="button" disabled={saving} onClick={() => void saveSelected(true)} className="flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-black text-white">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}送迎条件を確定</button></div>}
        {message && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800">{message}</p>}
        {error && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-800">{error}</p>}
        {saving && <p className="mt-2 flex items-center gap-2 text-xs font-bold text-slate-500"><Clock3 className="h-4 w-4" />保存しています…</p>}
      </section>
    </div>
  );
};
