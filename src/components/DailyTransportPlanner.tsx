import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
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
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDown,
  ArrowUp,
  AlertTriangle,
  BusFront,
  ChevronDown,
  ChevronUp,
  Clock3,
  GripVertical,
  LoaderCircle,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  AttendanceRecord,
  CalendarEvent,
  ChildProfile,
  DailyChildPlan,
  DailyTransportRequirement,
  RecorderProfile,
  StaffScheduleItem,
  TransportDirection,
  TransportAreaZone,
  TransportMapLocation,
  TransportPlanDay,
  TransportRouteOptimizationResult,
  TransportRouteSettings,
  TransportLocationType,
  TransportRun,
  TransportStop,
  TransportTimeMode,
  Vehicle,
} from '../types';
import { optimizeTransportRoute } from '../services/dataService';
import { getSuggestedTransportLocation, getTransportLocationOptions } from '../utils/transportLocations';
import { getTransportScheduleForDate, getTransportTargetTime } from '../utils/transportSchedule';
import { getDefaultDepartureTime } from '../utils/transportDeparture';
import { getLocalDateString, getRegularDaysForDate, getWeekdayFromDate } from '../utils/weekdays';
import { inferTransportArea, resolvedTransportArea } from '../utils/transportArea';
import { buildSiblingGroupByChild } from '../utils/childSiblings';
import { findTransportMapLocation, findTransportZones, normalizeMapAddress } from '../utils/transportMap';
import { getVehicleChildCapacity, getVehicleStaffSeatCount } from '../utils/vehicleCapacity';
import {
  DailyTransportMiniMap,
  type CalculatedTransportRunRoute,
  type DailyTransportMiniMapPoint,
} from './DailyTransportMiniMap';

interface DailyTransportPlannerProps {
  date: string;
  runs: TransportRun[];
  vehicles: Vehicle[];
  recorderProfiles: RecorderProfile[];
  childrenList: ChildProfile[];
  dailyChildPlans: DailyChildPlan[];
  transportPlanDay?: TransportPlanDay;
  dailyTransportRequirements: DailyTransportRequirement[];
  routeSettings: TransportRouteSettings;
  transportMapLocations: TransportMapLocation[];
  transportAreaZones: TransportAreaZone[];
  staffScheduleItems: StaffScheduleItem[];
  attendanceRecords: AttendanceRecord[];
  calendarEvents: CalendarEvent[];
  onSaveRun: (run: TransportRun) => Promise<void> | void;
  onSaveRequirements: (requirements: DailyTransportRequirement[]) => Promise<void> | void;
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
const ROUTE_COLORS = ['#0284c7', '#7c3aed', '#059669', '#ea580c', '#db2777', '#4f46e5', '#0891b2', '#65a30d'];

function mergeTransportNotes(...notes: Array<string | undefined>) {
  const parts = notes.flatMap((note) => note?.split('／') || [])
    .map((note) => note.trim())
    .filter(Boolean);
  return Array.from(new Set(parts)).join('／') || undefined;
}

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

function requirementTimeMode(requirement: DailyTransportRequirement | undefined, direction: TransportDirection, pickupMode?: TransportPlanDay['pickupMode']): TransportTimeMode {
  if (direction === '迎え') return requirement?.pickupTimeMode || (pickupMode === 'home' ? 'arrival_backward' : 'fixed');
  return requirement?.dropoffTimeMode || 'departure_forward';
}

function requirementAnchorTime(requirement: DailyTransportRequirement | undefined, direction: TransportDirection) {
  return direction === '迎え' ? requirement?.pickupTargetTime : requirement?.dropoffTargetTime;
}

function timeModeShortLabel(mode: TransportTimeMode) {
  if (mode === 'arrival_backward') return '来所・帰着から逆算';
  if (mode === 'departure_forward') return '施設出発から順算';
  return '時刻固定';
}

function childStop(
  child: ChildProfile,
  direction: TransportDirection,
  date: string,
  dailyPlan?: DailyChildPlan,
  requirement?: DailyTransportRequirement,
  routeSettings?: TransportRouteSettings,
  pickupMode?: TransportPlanDay['pickupMode'],
  siblingGroup?: string,
  preferredArea?: string,
): TransportStop {
  const requirementAddress = direction === '迎え' ? requirement?.pickupAddress : requirement?.dropoffAddress;
  const requirementName = direction === '迎え' ? requirement?.pickupLocationName : requirement?.dropoffLocationName;
  const requirementProfileId = direction === '迎え' ? requirement?.pickupLocationProfileId : requirement?.dropoffLocationProfileId;
  const requirementArea = direction === '迎え' ? requirement?.pickupArea : requirement?.dropoffArea;
  const timeMode = requirementTimeMode(requirement, direction, pickupMode);
  const timeAnchorTime = requirementAnchorTime(requirement, direction)
    || dailyTransportTargetTime(child, date, direction, dailyPlan, routeSettings, pickupMode)
    || undefined;
  const requirementOption = getTransportLocationOptions(child, direction, date)
    .find((option) => option.id === requirementProfileId);
  const suggestion = requirementOption || getSuggestedTransportLocation(child, direction, date);
  return {
    id: createUuid(),
    childId: child.id,
    childName: child.name,
    siblingGroup: requirement?.keepSiblingsTogether === false ? undefined : siblingGroup,
    location: requirementAddress || suggestion?.address || '',
    locationType: suggestion?.type || (direction === '迎え' ? '学校' : '自宅'),
    locationName: requirementName || suggestion?.name,
    locationProfileId: requirementProfileId || (suggestion?.source === 'registered' ? suggestion.id : undefined),
    timeMode,
    timeAnchorTime,
    plannedTime: timeMode === 'fixed' ? timeAnchorTime : undefined,
    area: preferredArea || resolvedTransportArea(
      requirementAddress || suggestion?.address,
      requirementArea || suggestion?.area,
    ),
    stopDurationMinutes: requirement?.stopDurationMinutes,
    order: 1,
    permanentNote: child.transportPermanentNote,
    note: mergeTransportNotes(requirement?.note, suggestion?.note),
  };
}

function applyMonthlyRequirementToStop(
  stop: TransportStop,
  child: ChildProfile,
  direction: TransportDirection,
  date: string,
  requirement?: DailyTransportRequirement,
) {
  if (!requirement || stop.locationName === '今回のみの送迎先') {
    return { ...stop, permanentNote: child.transportPermanentNote, note: mergeTransportNotes(stop.note) };
  }
  const profileId = direction === '迎え'
    ? requirement.pickupLocationProfileId
    : requirement.dropoffLocationProfileId;
  const option = getTransportLocationOptions(child, direction, date)
    .find((candidate) => candidate.id === profileId);
  const address = direction === '迎え' ? requirement.pickupAddress : requirement.dropoffAddress;
  const name = direction === '迎え' ? requirement.pickupLocationName : requirement.dropoffLocationName;
  const area = direction === '迎え' ? requirement.pickupArea : requirement.dropoffArea;
  const targetTime = direction === '迎え' ? requirement.pickupTargetTime : requirement.dropoffTargetTime;
  const timeMode = requirementTimeMode(requirement, direction);
  const timeRuleChanged = stop.timeMode !== timeMode || stop.timeAnchorTime !== targetTime;
  return {
    ...stop,
    location: address || stop.location,
    locationType: option?.type || stop.locationType,
    locationName: name || option?.name || stop.locationName,
    locationProfileId: profileId || stop.locationProfileId,
    timeMode,
    timeAnchorTime: targetTime,
    plannedTime: timeMode === 'fixed' ? targetTime || stop.plannedTime : timeRuleChanged ? undefined : stop.plannedTime,
    area: resolvedTransportArea(address || stop.location, area || option?.area || stop.area),
    stopDurationMinutes: requirement.stopDurationMinutes,
    permanentNote: child.transportPermanentNote,
    note: mergeTransportNotes(requirement.note, option?.note, stop.note),
  };
}

function dailyTransportTargetTime(child: ChildProfile, date: string, direction: TransportDirection, dailyPlan?: DailyChildPlan, settings?: TransportRouteSettings, pickupMode?: TransportPlanDay['pickupMode']) {
  if (direction === '迎え') return dailyPlan?.schoolEndTime || getTransportTargetTime(child, date, direction);
  if (dailyPlan?.departureTime) return dailyPlan.departureTime;
  if (settings) return getDefaultDepartureTime(child, pickupMode === 'home' ? '休日' : '平日', settings);
  return getTransportTargetTime(child, date, direction);
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

function formattedMinutes(value: number) {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, Math.round(value)));
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}


function normalizedStopLocation(value?: string) {
  return (value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('ja-JP')
    .replace(/[\s\u3000]/g, '')
    .replace(/[‐‑‒–—―−ーｰ]/g, '-')
    .replace(/(\d+)丁目/g, '$1-')
    .replace(/(\d+)番地?/g, '$1-')
    .replace(/(\d+)号/g, '$1')
    .replace(/-+/g, '-')
    .replace(/-$/, '');
}

function sharedStopLocationKey(stop: TransportStop) {
  const normalizedName = normalizedStopLocation(stop.locationName);
  const institutionalLocation = stop.locationType === '学校' || stop.locationType === '学童' || stop.locationType === '事業所';
  const linkedResidentialLocation = Boolean(stop.siblingGroup)
    && (stop.locationType === '自宅' || stop.locationType === '親族宅');
  const location = institutionalLocation && normalizedName
    ? `name:${stop.locationType}:${normalizedName}`
    : linkedResidentialLocation
      ? `siblings:${stop.siblingGroup}:${stop.locationType}:${normalizedName || stop.locationType}`
    : normalizedStopLocation(stop.location)
      || (normalizedName ? `name:${stop.locationType}:${normalizedName}` : '');
  return location || undefined;
}

interface TransportStopCluster {
  key: string;
  stops: TransportStop[];
}

function clusterTransportStops(stops: TransportStop[]): TransportStopCluster[] {
  const clusters: TransportStopCluster[] = [];
  const sharedLocationClusters = new Map<string, TransportStopCluster>();
  stops.forEach((stop) => {
    const locationKey = sharedStopLocationKey(stop);
    if (!locationKey) {
      clusters.push({ key: `stop-${stop.id}`, stops: [stop] });
      return;
    }
    const existing = sharedLocationClusters.get(locationKey);
    if (existing) {
      existing.stops.push(stop);
      return;
    }
    const cluster = { key: locationKey, stops: [stop] };
    sharedLocationClusters.set(locationKey, cluster);
    clusters.push(cluster);
  });
  return clusters;
}

function clusterRepresentative(cluster: TransportStopCluster) {
  return cluster.stops[0];
}

function clusterMatrixId(cluster: TransportStopCluster) {
  const representative = clusterRepresentative(cluster);
  return representative.childId || representative.id;
}

function clusterDwellMinutes(cluster: TransportStopCluster, settings: TransportRouteSettings) {
  return Math.max(...cluster.stops.map((stop) => stop.stopDurationMinutes ?? settings.stopDurationMinutes));
}

function clusterTargetMinute(cluster: TransportStopCluster, useLatest = false) {
  const targets = cluster.stops
    .map((stop) => stop.plannedTime)
    .filter((value): value is string => Boolean(value))
    .map(minutes);
  if (!targets.length) return undefined;
  return useLatest ? Math.max(...targets) : Math.min(...targets);
}

type RunTimeMode = TransportTimeMode | 'mixed';

function runTimeMode(run: TransportRun): RunTimeMode {
  const modes = Array.from(new Set(run.stops.map((stop) => stop.timeMode || 'fixed')));
  return modes.length <= 1 ? modes[0] || 'fixed' : 'mixed';
}

function runAnchorMinute(run: TransportRun, mode: TransportTimeMode, planDay?: TransportPlanDay, settings?: TransportRouteSettings) {
  const anchors = run.stops.map((stop) => stop.timeAnchorTime).filter((time): time is string => Boolean(time)).map(minutes);
  if (anchors.length) return mode === 'arrival_backward' ? Math.max(...anchors) : Math.min(...anchors);
  if (mode === 'arrival_backward' && run.direction === '迎え') {
    const fallback = planDay?.targetArrivalTime || settings?.holidayArrivalTime;
    return fallback ? minutes(fallback) : undefined;
  }
  return mode === 'departure_forward' ? minutes(run.startTime) : undefined;
}

function estimatedRunMinutes(run: TransportRun, settings: TransportRouteSettings) {
  const clusters = clusterTransportStops(run.stops);
  return (clusters.length + 1) * 15 + clusters.reduce((sum, cluster) => sum + clusterDwellMinutes(cluster, settings), 0);
}

function invalidateCalculatedStopTimes(stops: TransportStop[]) {
  return stops.map((stop) => stop.timeMode && stop.timeMode !== 'fixed' ? { ...stop, plannedTime: undefined } : stop);
}

function alignHouseholdStopTimes(stops: TransportStop[]) {
  return clusterTransportStops(stops).flatMap((cluster) => {
    const target = clusterTargetMinute(cluster, true);
    const plannedTime = target === undefined ? undefined : formattedMinutes(target);
    return cluster.stops.map((stop) => plannedTime ? { ...stop, plannedTime } : stop);
  });
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

function finalizeRunTimes(
  run: TransportRun,
  planDay: TransportPlanDay | undefined,
  settings: TransportRouteSettings,
) {
  const clusteredStops = clusterTransportStops(run.stops).flatMap((cluster) => cluster.stops);
  if (run.stops.length === 0) return run;
  const mode = runTimeMode(run);
  if (mode === 'mixed') return { ...run, stops: clusteredStops };
  if (mode === 'fixed') return adjustRunTimes({ ...run, stops: alignHouseholdStopTimes(clusteredStops) });
  const totalEstimate = estimatedRunMinutes(run, settings);
  const anchor = runAnchorMinute(run, mode, planDay, settings);
  if (anchor === undefined || anchor === Number.MAX_SAFE_INTEGER) return { ...run, stops: clusteredStops };
  if (mode === 'departure_forward') {
    return { ...run, startTime: formattedMinutes(anchor), endTime: formattedMinutes(anchor + totalEstimate), stops: clusteredStops.map((stop) => ({ ...stop, plannedTime: undefined })) };
  }
  const calculatedStart = anchor - totalEstimate;
  const startMinute = run.direction === '迎え' && planDay?.pickupMode === 'home'
    ? Math.max(minutes(settings.holidayOpeningTime), calculatedStart)
    : calculatedStart;
  return { ...run, startTime: formattedMinutes(startMinute), endTime: formattedMinutes(startMinute + totalEstimate), stops: clusteredStops.map((stop) => ({ ...stop, plannedTime: undefined })) };
}

interface SharedLocationVisual {
  key: string;
  label: string;
  count: number;
  cardClass: string;
}

const SHARED_LOCATION_TONES = [
  { cardClass: 'border-cyan-500 bg-cyan-50 ring-2 ring-cyan-100' },
  { cardClass: 'border-fuchsia-500 bg-fuchsia-50 ring-2 ring-fuchsia-100' },
  { cardClass: 'border-orange-500 bg-orange-50 ring-2 ring-orange-100' },
  { cardClass: 'border-lime-600 bg-lime-50 ring-2 ring-lime-100' },
  { cardClass: 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100' },
] as const;

type ChildSortField = 'time' | 'area' | 'grade';
type SortDirection = 'asc' | 'desc';
interface ChildSortRule { field: ChildSortField; direction: SortDirection }
const SORT_FIELD_LABELS: Record<ChildSortField, string> = { time: '下校・迎え時間', area: 'エリア', grade: '学年' };

const SortableSortRuleRow: React.FC<{
  rule: ChildSortRule;
  index: number;
  rules: ChildSortRule[];
  onChange: (rule: ChildSortRule) => void;
}> = ({ rule, index, rules, onChange }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rule.field });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`grid grid-cols-[1.2rem_1.8rem_minmax(0,1fr)_3.4rem] items-center gap-1 rounded-lg border bg-white p-1 ${isDragging ? 'z-20 scale-[1.02] border-emerald-400 shadow-xl' : 'border-slate-100'}`}>
    <span className="text-center text-[9px] font-black text-slate-400">{index + 1}</span>
    <button type="button" {...attributes} {...listeners} className="grid h-8 w-7 touch-none cursor-grab place-items-center rounded-md bg-emerald-50 text-emerald-700 active:cursor-grabbing" aria-label={`${SORT_FIELD_LABELS[rule.field]}の優先順位をドラッグして変更`}><GripVertical className="h-4 w-4" /></button>
    <select value={rule.field} onChange={(event) => onChange({ ...rule, field: event.target.value as ChildSortField })} className="min-h-8 min-w-0 rounded-lg border border-slate-200 bg-white px-1 text-[9px] font-bold">{(Object.keys(SORT_FIELD_LABELS) as ChildSortField[]).map((field) => <option key={field} value={field} disabled={rules.some((item, itemIndex) => itemIndex !== index && item.field === field)}>{SORT_FIELD_LABELS[field]}</option>)}</select>
    <button type="button" onClick={() => onChange({ ...rule, direction: rule.direction === 'asc' ? 'desc' : 'asc' })} className="min-h-8 rounded-lg border border-slate-200 text-[9px] font-black text-slate-700">{rule.direction === 'asc' ? '昇順' : '降順'}</button>
  </div>;
};

function gradeSortValue(grade?: string) {
  if (!grade) return 999;
  const normalized = grade.normalize('NFKC');
  const year = Number(normalized.match(/(\d+)/)?.[1] || 0);
  if (normalized.includes('未就学') || normalized.includes('年少') || normalized.includes('年中') || normalized.includes('年長')) return year;
  if (normalized.includes('小学')) return 10 + year;
  if (normalized.includes('中学')) return 20 + year;
  if (normalized.includes('高校') || normalized.includes('高等')) return 30 + year;
  return 900 + year;
}

function fallbackPinColor(type: TransportLocationType | undefined, settings: TransportRouteSettings) {
  if (type === '自宅' || type === '親族宅') return settings.residentialPinColor;
  if (type === '学校' || type === '学童') return settings.educationPinColor;
  if (type === '事業所') return settings.facilityPinColor;
  return settings.otherPinColor;
}

function resolvedPlanningLocation(
  child: ChildProfile,
  direction: TransportDirection,
  date: string,
  requirement?: DailyTransportRequirement,
  stop?: TransportStop,
) {
  const requirementProfileId = direction === '迎え'
    ? requirement?.pickupLocationProfileId
    : requirement?.dropoffLocationProfileId;
  const requirementLocation = getTransportLocationOptions(child, direction, date)
    .find((option) => option.id === requirementProfileId);
  const fallbackLocation = getSuggestedTransportLocation(child, direction, date);
  const locationType = stop?.locationType || requirementLocation?.type || fallbackLocation?.type;
  const locationName = stop?.locationName
    || (direction === '迎え' ? requirement?.pickupLocationName : requirement?.dropoffLocationName)
    || requirementLocation?.name
    || fallbackLocation?.name;
  const locationAddress = stop?.location
    || (direction === '迎え' ? requirement?.pickupAddress : requirement?.dropoffAddress)
    || requirementLocation?.address
    || fallbackLocation?.address;
  const locationArea = stop?.area
    || (direction === '迎え' ? requirement?.pickupArea : requirement?.dropoffArea)
    || requirementLocation?.area
    || fallbackLocation?.area;
  const normalizedName = normalizedStopLocation(locationName);
  const normalizedAddress = normalizedStopLocation(locationAddress);
  const institutionalLocation = locationType === '学校' || locationType === '学童' || locationType === '事業所';
  const key = institutionalLocation && normalizedName
    ? `name:${locationType}:${normalizedName}`
    : normalizedAddress || (normalizedName ? `name:${locationType || direction}:${normalizedName}` : '');
  return { key, locationType, locationName, locationAddress, locationArea };
}

function resolvedPlanningArea(
  child: ChildProfile,
  direction: TransportDirection,
  date: string,
  requirement: DailyTransportRequirement | undefined,
  stop: TransportStop | undefined,
  mapLocations: TransportMapLocation[],
  zones: TransportAreaZone[],
) {
  return resolvedPlanningAreas(child, direction, date, requirement, stop, mapLocations, zones)[0];
}

function resolvedPlanningAreas(
  child: ChildProfile,
  direction: TransportDirection,
  date: string,
  requirement: DailyTransportRequirement | undefined,
  stop: TransportStop | undefined,
  mapLocations: TransportMapLocation[],
  zones: TransportAreaZone[],
) {
  const resolved = resolvedPlanningLocation(child, direction, date, requirement, stop);
  const profileId = stop?.locationProfileId || (direction === '迎え'
    ? requirement?.pickupLocationProfileId
    : requirement?.dropoffLocationProfileId);
  const mapLocation = ((resolved.locationType === '学校' || resolved.locationType === '学童') && child.schoolId
    ? mapLocations.find((location) => location.id === `school:${child.schoolId}`)
    : undefined)
    || findTransportMapLocation(mapLocations, child.id, profileId, resolved.locationAddress);
  const preferredAreas = findTransportZones(mapLocation, zones).map((zone) => zone.name);
  if (preferredAreas.length) return preferredAreas;
  const fallbackArea = resolvedTransportArea(resolved.locationAddress, resolved.locationArea);
  return fallbackArea ? [fallbackArea] : [];
}

function exactNavigationLocation(stop: TransportStop, mapLocations: TransportMapLocation[], childrenList: ChildProfile[]) {
  const child = childrenList.find((candidate) => candidate.id === stop.childId);
  const registeredSchoolLocation = (stop.locationType === '学校' || stop.locationType === '学童') && child?.schoolId
    ? mapLocations.find((location) => location.id === `school:${child.schoolId}`)
    : undefined;
  const schoolLocation = registeredSchoolLocation
    && normalizeMapAddress(registeredSchoolLocation.address) === normalizeMapAddress(stop.location)
    ? registeredSchoolLocation
    : undefined;
  const mapLocation = schoolLocation || findTransportMapLocation(
    mapLocations,
    stop.childId,
    stop.locationProfileId,
    stop.location,
  );
  return mapLocation
    ? `${mapLocation.latitude.toFixed(7)},${mapLocation.longitude.toFixed(7)}`
    : stop.navigationLocation || stop.location.trim();
}

const ChildCardContent: React.FC<{
  child: ChildProfile;
  date: string;
  direction: TransportDirection;
  requirement?: DailyTransportRequirement;
  stop?: TransportStop;
  sharedLocation?: SharedLocationVisual;
  compact?: boolean;
}> = ({
  child,
  date,
  direction,
  requirement,
  stop,
  sharedLocation,
  compact = false,
}) => {
  const schedule = getTransportScheduleForDate(child, date);
  const { locationName } = resolvedPlanningLocation(child, direction, date, requirement, stop);
  const mode = stop?.timeMode || requirementTimeMode(requirement, direction);
  const dailyTargetTime = stop?.timeAnchorTime || requirementAnchorTime(requirement, direction);
  const fallbackTime = schedule?.schoolEndTime || schedule?.pickupTime;
  const timeText = mode === 'fixed'
    ? dailyTargetTime || stop?.plannedTime || fallbackTime || '時刻未設定'
    : stop?.plannedTime
      ? `到着見込 ${stop.plannedTime}`
      : `${mode === 'arrival_backward' ? '逆算待ち' : '順算待ち'}${dailyTargetTime ? `（基準 ${dailyTargetTime}）` : ''}`;
  return (
    <div className="min-w-0" title={sharedLocation ? `${sharedLocation.label}・${sharedLocation.count}名が設定時間内です` : undefined}>
      <strong className="block truncate text-xs text-slate-950">{child.name}</strong>
      <span className="mt-0.5 block truncate text-[10px] font-black text-slate-700">{direction === '迎え' ? '下校・迎え' : '送り'} {timeText}</span>
      <span className={`mt-0.5 block truncate font-bold text-slate-500 ${compact ? 'text-[8px]' : 'text-[9px]'}`}>{locationName || `${direction}先未登録`}</span>
      {child.transportPermanentNote && <span className={`mt-1 block truncate rounded-md bg-amber-100 px-1.5 py-0.5 font-black text-amber-900 ${compact ? 'text-[7px]' : 'text-[8px]'}`}>連絡：{child.transportPermanentNote}</span>}
    </div>
  );
};

const DraggableChildCard: React.FC<{
  child: ChildProfile;
  date: string;
  direction: TransportDirection;
  requirement?: DailyTransportRequirement;
  stop?: TransportStop;
  data: DragChildData;
  sharedLocation?: SharedLocationVisual;
  compact?: boolean;
}> = ({ child, date, direction, requirement, stop, data, sharedLocation, compact = false }) => {
  const dragId = data.sourceStopId ? `stop-${data.sourceStopId}` : `pool-${child.id}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId, data });
  return (
    <article
      ref={setNodeRef}
      aria-label={`${child.name}の配車カード`}
      aria-pressed={isDragging}
      {...attributes}
      {...listeners}
      className={`relative min-w-0 touch-pan-y select-none rounded-xl border shadow-sm transition-[opacity,transform,box-shadow,border-color,background-color] duration-150 ${isDragging ? 'scale-[0.98] border-teal-300 opacity-30 shadow-none' : sharedLocation?.cardClass || 'border-slate-200 bg-white'} ${compact ? 'cursor-grab p-2 active:cursor-grabbing' : 'cursor-grab p-2.5 active:cursor-grabbing'}`}
    >
      <ChildCardContent child={child} date={date} direction={direction} requirement={requirement} stop={stop} sharedLocation={sharedLocation} compact={compact} />
    </article>
  );
};

const DraggedChildPreview: React.FC<{
  child: ChildProfile;
  date: string;
  direction: TransportDirection;
  requirement?: DailyTransportRequirement;
  sharedLocation?: SharedLocationVisual;
  groupCount?: number;
}> = ({ child, date, direction, requirement, sharedLocation, groupCount = 1 }) => (
  <div className="pointer-events-none relative min-w-0 pb-2 pr-2">
    {groupCount > 2 && <span className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl border-2 border-teal-200 bg-teal-50 shadow-lg" />}
    {groupCount > 1 && <span className="absolute inset-0 translate-x-1 translate-y-1 rounded-xl border-2 border-teal-300 bg-white shadow-lg" />}
    <article className="relative min-w-0 rotate-[0.4deg] rounded-xl border-2 border-teal-500 bg-white p-2.5 shadow-[0_18px_45px_rgba(15,23,42,0.24)]">
      {groupCount > 1 && <span className="absolute -right-2 -top-2 z-10 rounded-full bg-teal-700 px-2 py-1 text-[10px] font-black text-white shadow-md">{groupCount}名まとめて移動</span>}
      <ChildCardContent child={child} date={date} direction={direction} requirement={requirement} sharedLocation={sharedLocation} compact />
    </article>
  </div>
);

const TransportRunLane: React.FC<{
  run: TransportRun;
  vehicle?: Vehicle;
  childrenList: ChildProfile[];
  date: string;
  activeRecorders: RecorderProfile[];
  requirementByChild: Map<string, DailyTransportRequirement>;
  sharedLocationByChild: Map<string, SharedLocationVisual>;
  routeCalculation?: CalculatedTransportRunRoute;
  routeSelected: boolean;
  calculatingRoute: boolean;
  needsRecalculation: boolean;
  expandedStopId?: string;
  holidayOpeningTime?: string;
  onExpandStop: (stopId?: string) => void;
  onUpdateRun: (runId: string, patch: Partial<TransportRun>) => void;
  onUpdateStop: (runId: string, stopId: string, patch: Partial<TransportStop>) => void;
  onMoveStop: (runId: string, stopId: string, offset: number) => void;
  onRemoveStop: (runId: string, stopId: string) => void;
  onRemoveRun: (run: TransportRun) => void;
  onCalculateTime: (runId: string) => void;
  onSelectRoute: (runId: string) => void;
}> = ({
  run,
  vehicle,
  childrenList,
  date,
  activeRecorders,
  requirementByChild,
  sharedLocationByChild,
  routeCalculation,
  routeSelected,
  calculatingRoute,
  needsRecalculation,
  expandedStopId,
  holidayOpeningTime,
  onExpandStop,
  onUpdateRun,
  onUpdateStop,
  onMoveStop,
  onRemoveStop,
  onRemoveRun,
  onCalculateTime,
  onSelectRoute,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: `run-${run.id}`, data: { runId: run.id } });
  const capacity = getVehicleChildCapacity(vehicle, run);
  const overCapacity = run.stops.length > capacity;
  const calculationMode = runTimeMode(run);
  const anchor = calculationMode === 'mixed' ? undefined : runAnchorMinute(run, calculationMode);
  const calculationState = run.routeOptimizedAt
    ? '計算済み'
    : needsRecalculation
      ? '再計算が必要'
      : calculationMode === 'fixed'
        ? '時刻確認待ち'
        : '計算待ち';
  return (
    <article className={`overflow-hidden rounded-xl border bg-white shadow-sm ${overCapacity ? 'border-rose-400' : routeSelected ? 'border-teal-500 ring-2 ring-teal-100' : 'border-slate-200'}`}>
      <header className={`p-2 ${run.direction === '迎え' ? 'bg-sky-50' : 'bg-violet-50'}`}>
        <div className="flex items-center gap-1.5">
          <input aria-label="便名" value={run.name} onChange={(event) => onUpdateRun(run.id, { name: event.target.value })} className="min-h-9 min-w-0 flex-1 rounded-lg border border-white bg-white px-2 text-[11px] font-black" />
          <span title={vehicle ? `総定員${vehicle.capacity}名から運転者1名・添乗${getVehicleStaffSeatCount(run) - 1}名を除いた児童枠` : '車両未設定'} className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${overCapacity ? 'bg-rose-600 text-white' : 'bg-white text-slate-600'}`}>児童 {run.stops.length}/{capacity}名</span>
          <button type="button" onClick={() => onRemoveRun(run)} aria-label={`${run.name}を削除`} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-rose-600"><Trash2 className="h-4 w-4" /></button>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <label className="text-[8px] font-black text-slate-500">{calculationMode === 'departure_forward' ? '送迎開始（基準）' : '開始'}<input type="time" value={run.startTime} onChange={(event) => onUpdateRun(run.id, { startTime: event.target.value })} className="mt-0.5 min-h-9 w-full rounded-lg border border-white bg-white px-1 text-[10px] font-bold" /></label>
          <label className="text-[8px] font-black text-slate-500">{calculationMode === 'arrival_backward' ? '来所・帰着（基準）' : '終了'}<input type="time" value={run.endTime} onChange={(event) => onUpdateRun(run.id, { endTime: event.target.value })} className="mt-0.5 min-h-9 w-full rounded-lg border border-white bg-white px-1 text-[10px] font-bold" /></label>
        </div>
        {run.stops.length > 0 && <p className={`mt-1.5 rounded-md px-2 py-1 text-[9px] font-black ${calculationMode === 'mixed' ? 'bg-rose-100 text-rose-800' : run.routeOptimizedAt ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{calculationMode === 'mixed' ? '時刻方式が混在・便を分けてください' : `${timeModeShortLabel(calculationMode)}${anchor !== undefined ? ` ${formattedMinutes(anchor)}` : ''}・${calculationState}`}</p>}
        {holidayOpeningTime && run.startTime < holidayOpeningTime && <p className="mt-1.5 rounded-md bg-amber-100 px-2 py-1 text-[9px] font-black text-amber-900">開所前の手動設定（開所 {holidayOpeningTime}）</p>}
        <label className="mt-1.5 block text-[8px] font-black text-slate-500">運転者<select value={run.driverRecorderProfileId || ''} onChange={(event) => onUpdateRun(run.id, { driverRecorderProfileId: event.target.value || undefined })} className="mt-0.5 min-h-9 w-full rounded-lg border border-white bg-white px-1 text-[10px] font-bold"><option value="">未設定</option>{activeRecorders.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}</select></label>
        <div className="mt-1.5 flex items-center gap-1.5">
          <button type="button" disabled={calculatingRoute || run.stops.length === 0} onClick={() => onCalculateTime(run.id)} className="flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-slate-900 px-2 text-[10px] font-black text-white disabled:opacity-40">{calculatingRoute ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Clock3 className="h-3.5 w-3.5" />}{calculatingRoute ? '計算中…' : '時間計算'}</button>
          {routeCalculation && <button type="button" onClick={() => onSelectRoute(run.id)} className={`min-h-9 rounded-lg border px-2 text-[9px] font-black ${routeSelected ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{Math.ceil(routeCalculation.totalDurationSeconds / 60)}分・{(routeCalculation.totalDistanceMeters / 1000).toFixed(1)}km</button>}
        </div>
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
              <DraggableChildCard child={child} date={date} direction={run.direction} requirement={requirementByChild.get(child.id)} stop={stop} data={{ childId: child.id, sourceRunId: run.id, sourceStopId: stop.id }} sharedLocation={sharedLocationByChild.get(child.id)} compact />
              <div className="mt-1 flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate text-[9px] font-bold text-slate-500">{routeCalculation ? `計算結果：到着 ${stop.plannedTime || '未計算'}${routeCalculation.legMinutesByStopId[stop.id] !== undefined ? `・移動 ${routeCalculation.legMinutesByStopId[stop.id]}分` : ''}` : '乗降順を変更できます'}</span>
                <button type="button" disabled={index === 0} onClick={() => onMoveStop(run.id, stop.id, -1)} aria-label="上へ" className="grid h-8 w-8 place-items-center rounded-md bg-slate-100 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" disabled={index === run.stops.length - 1} onClick={() => onMoveStop(run.id, stop.id, 1)} aria-label="下へ" className="grid h-8 w-8 place-items-center rounded-md bg-slate-100 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => onExpandStop(expanded ? undefined : stop.id)} aria-label="送迎先を編集" className="grid h-8 w-8 place-items-center rounded-md bg-slate-100">{expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button>
                <button type="button" onClick={() => onRemoveStop(run.id, stop.id)} aria-label="児童を便から外す" className="grid h-8 w-8 place-items-center rounded-md bg-rose-50 text-rose-600"><X className="h-3.5 w-3.5" /></button>
              </div>
              {expanded && (
                <div className="ui-panel-enter mt-2 space-y-2 border-t border-slate-100 pt-2">
                  <label className="block text-[9px] font-black text-slate-500">登録送迎先<select value={selectedLocationId} onChange={(event) => { const option = options.find((item) => item.id === event.target.value); onUpdateStop(run.id, stop.id, option ? { location: option.address, locationType: option.type, locationName: option.name, locationProfileId: option.source === 'registered' ? option.id : undefined, area: option.area, note: option.note } : { locationProfileId: undefined, locationName: '今回のみの送迎先', area: undefined }); }} className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-[10px] font-bold"><option value="">今回のみ・直接入力</option>{options.map((option) => <option key={option.id} value={option.id}>{option.recommended ? '★ ' : ''}{option.type}｜{option.name}</option>)}</select></label>
                  <div className="grid grid-cols-[5.5rem_1fr] gap-1.5">
                    <select value={stop.locationType} onChange={(event) => onUpdateStop(run.id, stop.id, { locationType: event.target.value as TransportLocationType, locationProfileId: undefined })} className="min-h-9 rounded-lg border border-slate-300 px-1 text-[10px] font-bold">{LOCATION_TYPES.map((type) => <option key={type}>{type}</option>)}</select>
                    <input value={stop.location} onChange={(event) => { const location = event.target.value; onUpdateStop(run.id, stop.id, { location, locationProfileId: undefined, locationName: '今回のみの送迎先', area: inferTransportArea(location) }); }} placeholder="住所・乗降場所" className="min-h-9 min-w-0 rounded-lg border border-slate-300 px-2 text-[10px]" />
                  </div>
                  <label className="block text-[9px] font-black text-slate-500">{stop.timeMode && stop.timeMode !== 'fixed' ? '到着時刻を手動固定' : '予定時刻'}<input type="time" value={stop.plannedTime || stop.timeAnchorTime || ''} onChange={(event) => onUpdateStop(run.id, stop.id, { timeMode: 'fixed', timeAnchorTime: event.target.value || undefined, plannedTime: event.target.value || undefined })} className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-[10px] font-bold" /><span className="mt-1 block text-[8px] font-normal text-slate-400">変更すると、この児童は「時刻固定」になります。</span></label>
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
  transportPlanDay,
  dailyTransportRequirements,
  routeSettings,
  transportMapLocations,
  transportAreaZones,
  staffScheduleItems,
  attendanceRecords,
  calendarEvents,
  onSaveRun,
  onSaveRequirements,
  onDeleteRun,
  onClose,
}) => {
  const siblingGroupByChild = useMemo(() => buildSiblingGroupByChild(childrenList), [childrenList]);
  const [drafts, setDrafts] = useState<TransportRun[]>(() => {
    const suspendedIds = new Set(childrenList.filter((child) => child.serviceSuspended).map((child) => child.id));
    const absentIds = new Set(dailyChildPlans
      .filter((plan) => plan.date === date && plan.attendancePlan === '欠席')
      .map((plan) => plan.childId));
    const requirementMap = new Map<string, DailyTransportRequirement>(
      dailyTransportRequirements.map((requirement) => [requirement.childId, requirement] as const),
    );
    const excludeSuspended = date >= getLocalDateString();
    const synchronizedRuns = runs.map((run) => {
      const synchronizedStops = run.stops
        .filter((stop) => {
          if (!stop.childId) return true;
          if (absentIds.has(stop.childId)) return false;
          if (excludeSuspended && suspendedIds.has(stop.childId)) return false;
          const requirement = requirementMap.get(stop.childId);
          return !requirement || (run.direction === '迎え' ? requirement.pickupEnabled : requirement.dropoffEnabled);
        })
        .map((stop) => {
          const child = childrenList.find((candidate) => candidate.id === stop.childId);
          if (!child) return stop;
          const requirement = requirementMap.get(child.id);
          const synchronized = applyMonthlyRequirementToStop(stop, child, run.direction, date, requirement);
          return {
            ...synchronized,
            area: resolvedPlanningArea(child, run.direction, date, requirement, synchronized, transportMapLocations, transportAreaZones),
            siblingGroup: requirement?.keepSiblingsTogether === false ? undefined : siblingGroupByChild.get(child.id),
          };
        })
        .map((stop, index) => ({ ...stop, order: index + 1 }));
      const routeInputsChanged = JSON.stringify(synchronizedStops) !== JSON.stringify(run.stops);
      return {
        ...run,
        routeOptimizedAt: routeInputsChanged ? undefined : run.routeOptimizedAt,
        stops: synchronizedStops,
        assistantRecorderProfileIds: [...run.assistantRecorderProfileIds],
      };
    });
    const defaultVehicle = [...vehicles]
      .filter((vehicle) => vehicle.available)
      .sort((left, right) => (left.assignmentPriority || 100) - (right.assignmentPriority || 100) || left.name.localeCompare(right.name, 'ja'))[0];
    const withPickup = synchronizedRuns.some((run) => run.direction === '迎え')
      ? synchronizedRuns
      : [...synchronizedRuns, createRun(date, '迎え', 1, defaultVehicle)];
    return withPickup.some((run) => run.direction === '送り')
      ? withPickup
      : [...withPickup, createRun(date, '送り', 1, defaultVehicle)];
  });
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [additionalChildIds, setAdditionalChildIds] = useState<string[]>([]);
  const [childPickerOpen, setChildPickerOpen] = useState(false);
  const [childSearch, setChildSearch] = useState('');
  const [expandedStopId, setExpandedStopId] = useState<string>();
  const [activeDirection, setActiveDirection] = useState<TransportDirection>('迎え');
  const [sortPanelOpen, setSortPanelOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [ganttOpen, setGanttOpen] = useState(false);
  const [groupDragEnabled, setGroupDragEnabled] = useState(true);
  const [sortRules, setSortRules] = useState<ChildSortRule[]>([
    { field: 'time', direction: 'asc' },
    { field: 'area', direction: 'asc' },
    { field: 'grade', direction: 'asc' },
  ]);
  const [activeDragData, setActiveDragData] = useState<DragChildData>();
  const [error, setError] = useState('');
  const [routingNotice, setRoutingNotice] = useState('');
  const [calculatedRoutes, setCalculatedRoutes] = useState<Record<string, CalculatedTransportRunRoute>>({});
  const [recalculationRequiredRunIds, setRecalculationRequiredRunIds] = useState<Set<string>>(() => new Set());
  const [selectedRouteRunId, setSelectedRouteRunId] = useState<string>();
  const [calculatingRouteRunId, setCalculatingRouteRunId] = useState<string>();
  const [saving, setSaving] = useState(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 10 } }),
  );
  useEffect(() => {
    const requirementMap = new Map<string, DailyTransportRequirement>(
      dailyTransportRequirements.map((requirement) => [requirement.childId, requirement] as const),
    );
    setDrafts((current) => current.map((run) => {
      const synchronizedStops = run.stops
        .filter((stop) => {
          if (!stop.childId) return true;
          const requirement = requirementMap.get(stop.childId);
          return !requirement || (run.direction === '迎え' ? requirement.pickupEnabled : requirement.dropoffEnabled);
        })
        .map((stop) => {
          const child = childrenList.find((candidate) => candidate.id === stop.childId);
          if (!child) return stop;
          const requirement = requirementMap.get(child.id);
          const synchronized = applyMonthlyRequirementToStop(stop, child, run.direction, date, requirement);
          return {
            ...synchronized,
            area: resolvedPlanningArea(child, run.direction, date, requirement, synchronized, transportMapLocations, transportAreaZones),
            siblingGroup: requirement?.keepSiblingsTogether === false ? undefined : siblingGroupByChild.get(child.id),
          };
        })
        .map((stop, index) => ({ ...stop, order: index + 1 }));
      if (JSON.stringify(synchronizedStops) === JSON.stringify(run.stops)) return run;
      return { ...run, routeOptimizedAt: undefined, stops: synchronizedStops };
    }));
  }, [childrenList, dailyTransportRequirements, date, siblingGroupByChild, transportAreaZones, transportMapLocations]);
  useEffect(() => {
    if (date < getLocalDateString()) return;
    const suspendedIds = new Set(childrenList.filter((child) => child.serviceSuspended).map((child) => child.id));
    const absentIds = new Set(dailyChildPlans
      .filter((plan) => plan.date === date && plan.attendancePlan === '欠席')
      .map((plan) => plan.childId));
    const excludedIds = new Set([...suspendedIds, ...absentIds]);
    if (excludedIds.size === 0) return;
    setAdditionalChildIds((current) => current.filter((childId) => !excludedIds.has(childId)));
    setDrafts((current) => current.map((run) => {
      const stops = run.stops.filter((stop) => !stop.childId || !excludedIds.has(stop.childId));
      if (stops.length === run.stops.length) return run;
      return {
        ...run,
        routeOptimizedAt: undefined,
        stops: stops.map((stop, index) => ({ ...stop, order: index + 1 })),
      };
    }));
  }, [childrenList, dailyChildPlans, date]);
  const activeRecorders = useMemo(() => recorderProfiles.filter((profile) => profile.active), [recorderProfiles]);
  const boardVehicles = useMemo(() => vehicles
    .filter((vehicle) => vehicle.available || drafts.some((run) => run.vehicleId === vehicle.id))
    .sort((left, right) => (left.assignmentPriority || 100) - (right.assignmentPriority || 100) || left.name.localeCompare(right.name)), [drafts, vehicles]);
  const vehicleSlots = useMemo<Array<Vehicle | undefined>>(() => [
    ...boardVehicles,
    ...(boardVehicles.length === 0 || drafts.some((run) => !run.vehicleId) ? [undefined] : []),
  ], [boardVehicles, drafts]);
  const weekday = getWeekdayFromDate(date);
  const dayPlans = useMemo(() => dailyChildPlans.filter((plan) => plan.date === date), [dailyChildPlans, date]);
  const dayPlansByChild = useMemo(() => new Map(dayPlans.map((plan) => [plan.childId, plan])), [dayPlans]);
  const activeChildIds = useMemo(() => new Set(childrenList.filter((child) => !child.serviceSuspended).map((child) => child.id)), [childrenList]);
  const requirementByChild = useMemo(() => new Map(dailyTransportRequirements
    .filter((item) => item.date === date && activeChildIds.has(item.childId))
    .map((item) => [item.childId, item])), [activeChildIds, dailyTransportRequirements, date]);
  const scheduledChildren = useMemo(() => childrenList.filter((child) => {
    if (child.serviceSuspended) return false;
    const plan = dayPlansByChild.get(child.id);
    if (plan?.attendancePlan === '欠席') return false;
    if (requirementByChild.has(child.id)) return true;
    return plan ? true : getRegularDaysForDate(child, date).includes(weekday);
  }), [childrenList, date, dayPlansByChild, requirementByChild, weekday]);
  const assignedChildIds = useMemo(() => new Set(drafts.flatMap((run) => run.stops.map((stop) => stop.childId).filter((id): id is string => Boolean(id)))), [drafts]);
  const poolChildren = useMemo(() => childrenList.filter((child) => !child.serviceSuspended && (scheduledChildren.some((scheduled) => scheduled.id === child.id) || additionalChildIds.includes(child.id) || assignedChildIds.has(child.id))), [additionalChildIds, assignedChildIds, childrenList, scheduledChildren]);
  const pickupAssignedIds = useMemo(() => new Set(drafts.filter((run) => run.direction === '迎え').flatMap((run) => run.stops.map((stop) => stop.childId).filter((id): id is string => Boolean(id)))), [drafts]);
  const dropoffAssignedIds = useMemo(() => new Set(drafts.filter((run) => run.direction === '送り').flatMap((run) => run.stops.map((stop) => stop.childId).filter((id): id is string => Boolean(id)))), [drafts]);
  const activeDragChild = useMemo(() => childrenList.find((child) => child.id === activeDragData?.childId), [activeDragData?.childId, childrenList]);
  const directionChildren = useMemo(() => poolChildren
    .filter((child) => {
      const requirement = requirementByChild.get(child.id);
      if (!requirement) return true;
      return activeDirection === '迎え' ? requirement.pickupEnabled : requirement.dropoffEnabled;
    })
    .sort((left, right) => {
      const leftRequirement = requirementByChild.get(left.id);
      const rightRequirement = requirementByChild.get(right.id);
      const leftArea = resolvedPlanningArea(left, activeDirection, date, leftRequirement, undefined, transportMapLocations, transportAreaZones);
      const rightArea = resolvedPlanningArea(right, activeDirection, date, rightRequirement, undefined, transportMapLocations, transportAreaZones);
      const leftTime = activeDirection === '迎え' ? leftRequirement?.pickupTargetTime : leftRequirement?.dropoffTargetTime;
      const rightTime = activeDirection === '迎え' ? rightRequirement?.pickupTargetTime : rightRequirement?.dropoffTargetTime;
      for (const rule of sortRules) {
        let comparison = 0;
        if (rule.field === 'time') {
          if (!leftTime && rightTime) comparison = 1;
          else if (leftTime && !rightTime) comparison = -1;
          else comparison = minutes(leftTime) - minutes(rightTime);
        } else if (rule.field === 'area') {
          comparison = (leftArea || '未設定').localeCompare(rightArea || '未設定', 'ja');
        } else {
          comparison = gradeSortValue(left.grade) - gradeSortValue(right.grade);
        }
        if (comparison) return rule.direction === 'asc' ? comparison : -comparison;
      }
      return left.name.localeCompare(right.name, 'ja');
    }), [activeDirection, date, poolChildren, requirementByChild, sortRules, transportAreaZones, transportMapLocations]);
  const activeAssignedIds = activeDirection === '迎え' ? pickupAssignedIds : dropoffAssignedIds;
  const unassignedDirectionChildren = useMemo(
    () => directionChildren.filter((child) => !activeAssignedIds.has(child.id)),
    [activeAssignedIds, directionChildren],
  );
  const sharedLocationByChild = useMemo(() => {
    const groups = new Map<string, Array<{ childId: string; label: string; targetMinute: number }>>();
    directionChildren.forEach((child) => {
      const stop = drafts
        .filter((run) => run.direction === activeDirection)
        .flatMap((run) => run.stops)
        .find((candidate) => candidate.childId === child.id);
      const location = resolvedPlanningLocation(child, activeDirection, date, requirementByChild.get(child.id), stop);
      const siblingGroup = siblingGroupByChild.get(child.id);
      const linkedResidentialLocation = Boolean(siblingGroup)
        && (location.locationType === '自宅' || location.locationType === '親族宅');
      const locationKey = linkedResidentialLocation
        ? `siblings:${siblingGroup}:${location.locationType}:${normalizedStopLocation(location.locationName) || location.locationType}`
        : location.key;
      if (!locationKey) return;
      const requirement = requirementByChild.get(child.id);
      const targetTime = activeDirection === '迎え' ? requirement?.pickupTargetTime : requirement?.dropoffTargetTime;
      if (!targetTime) return;
      const label = location.locationName || location.locationAddress || `${activeDirection}先`;
      groups.set(locationKey, [...(groups.get(locationKey) || []), { childId: child.id, label, targetMinute: minutes(targetTime) }]);
    });
    const result = new Map<string, SharedLocationVisual>();
    let visualIndex = 0;
    Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right)).forEach(([key, members]) => {
      const sorted = [...members].sort((left, right) => left.targetMinute - right.targetMinute);
      let cluster: typeof sorted = [];
      const commitCluster = () => {
        if (cluster.length < 2) { cluster = []; return; }
        const tone = SHARED_LOCATION_TONES[visualIndex % SHARED_LOCATION_TONES.length];
        const visual: SharedLocationVisual = { key: `${key}:${cluster[0].targetMinute}`, label: cluster[0].label, count: cluster.length, ...tone };
        cluster.forEach((member) => result.set(member.childId, visual));
        visualIndex += 1;
        cluster = [];
      };
      sorted.forEach((member) => {
        if (cluster.length && member.targetMinute - cluster[0].targetMinute > routeSettings.sameLocationTimeWindowMinutes) commitCluster();
        cluster.push(member);
      });
      commitCluster();
    });
    return result;
  }, [activeDirection, date, directionChildren, drafts, requirementByChild, routeSettings.sameLocationTimeWindowMinutes, siblingGroupByChild]);
  const miniMapPoints = useMemo<DailyTransportMiniMapPoint[]>(() => directionChildren.flatMap((child) => {
    const assignedRun = drafts.find((run) => run.direction === activeDirection && run.stops.some((stop) => stop.childId === child.id));
    const stop = assignedRun?.stops.find((candidate) => candidate.childId === child.id);
    const requirement = requirementByChild.get(child.id);
    const resolved = resolvedPlanningLocation(child, activeDirection, date, requirement, stop);
    const locationProfileId = stop?.locationProfileId || (activeDirection === '迎え' ? requirement?.pickupLocationProfileId : requirement?.dropoffLocationProfileId);
    const mapLocation = ((resolved.locationType === '学校' || resolved.locationType === '学童') && child.schoolId
      ? transportMapLocations.find((location) => location.id === `school:${child.schoolId}`)
      : undefined)
      || findTransportMapLocation(transportMapLocations, child.id, locationProfileId, resolved.locationAddress);
    if (!mapLocation) return [];
    const assignedArea = findTransportZones(mapLocation, transportAreaZones)[0];
    return [{
      childId: child.id,
      childName: child.name,
      locationName: resolved.locationName || `${activeDirection}先`,
      address: resolved.locationAddress || mapLocation.address,
      latitude: mapLocation.latitude,
      longitude: mapLocation.longitude,
      color: assignedArea?.color || fallbackPinColor(resolved.locationType, routeSettings),
      areaName: assignedArea?.name,
      assignedRunId: assignedRun?.id,
      assignedRunName: assignedRun?.name,
      plannedTime: assignedRun && calculatedRoutes[assignedRun.id] ? stop?.plannedTime : undefined,
    }];
  }), [activeDirection, calculatedRoutes, date, directionChildren, drafts, requirementByChild, routeSettings, transportAreaZones, transportMapLocations]);
  const facilityMapPoint = useMemo(() => {
    const facility = transportMapLocations.find((location) => location.sourceType === 'facility')
      || findTransportMapLocation(transportMapLocations, undefined, undefined, routeSettings.facilityAddress);
    const assignedArea = facility ? findTransportZones(facility, transportAreaZones)[0] : undefined;
    return facility ? { latitude: facility.latitude, longitude: facility.longitude, address: facility.address, color: assignedArea?.color || routeSettings.facilityPinColor } : undefined;
  }, [routeSettings.facilityAddress, routeSettings.facilityPinColor, transportAreaZones, transportMapLocations]);
  const visibleCalculatedRoutes = useMemo(() => drafts
    .filter((run) => run.direction === activeDirection)
    .map((run) => calculatedRoutes[run.id])
    .filter((route): route is CalculatedTransportRunRoute => Boolean(route)), [activeDirection, calculatedRoutes, drafts]);
  const planningWarnings = useMemo(() => getDraftPlanningWarnings({
    date,
    direction: activeDirection,
    drafts,
    vehicles,
    activeRecorders,
    attendanceRecords,
    staffScheduleItems,
    calendarEvents,
    minimumFacilityStaff: routeSettings.minimumFacilityStaff,
  }), [activeDirection, activeRecorders, attendanceRecords, calendarEvents, date, drafts, routeSettings.minimumFacilityStaff, staffScheduleItems, vehicles]);

  useEffect(() => {
    setRecalculationRequiredRunIds(new Set());
  }, [date]);

  const clearRouteCalculations = (runIds: string[], markRecalculation = true) => {
    if (!runIds.length) return;
    const targets = new Set(runIds);
    if (markRecalculation) {
      const calculatedRunIds = runIds.filter((runId) => calculatedRoutes[runId] || drafts.some((run) => run.id === runId && Boolean(run.routeOptimizedAt)));
      if (calculatedRunIds.length) {
        setRecalculationRequiredRunIds((current) => new Set([...current, ...calculatedRunIds]));
      }
    }
    setCalculatedRoutes((current) => Object.fromEntries(Object.entries(current).filter(([runId]) => !targets.has(runId))));
    setSelectedRouteRunId((current) => current && targets.has(current) ? undefined : current);
  };

  const updateRun = (runId: string, patch: Partial<TransportRun>) => {
    const routeAffectingChange = patch.startTime !== undefined || patch.endTime !== undefined || patch.stops !== undefined;
    if (!routeAffectingChange) {
      setDrafts((current) => current.map((run) => run.id === runId ? { ...run, ...patch } : run));
      if (patch.name !== undefined) {
        setCalculatedRoutes((current) => current[runId]
          ? { ...current, [runId]: { ...current[runId], runName: patch.name || current[runId].runName } }
          : current);
      }
      return;
    }
    clearRouteCalculations([runId]);
    setDrafts((current) => current.map((run) => {
      if (run.id !== runId) return run;
      const mode = runTimeMode(run);
      if (patch.startTime && patch.startTime !== run.startTime) {
        const offset = minutes(patch.startTime) - minutes(run.startTime);
        return {
          ...run,
          ...patch,
          endTime: patch.endTime || (mode === 'departure_forward' ? shiftedTime(run.endTime, offset) : run.endTime),
          stops: mode === 'departure_forward'
            ? run.stops.map((stop) => ({ ...stop, timeAnchorTime: patch.startTime, plannedTime: undefined }))
            : invalidateCalculatedStopTimes(run.stops),
          routeOptimizedAt: undefined,
        };
      }
      if (patch.endTime && patch.endTime !== run.endTime && mode === 'arrival_backward') {
        return { ...run, ...patch, stops: run.stops.map((stop) => ({ ...stop, timeAnchorTime: patch.endTime, plannedTime: undefined })), routeOptimizedAt: undefined };
      }
      return { ...run, ...patch, stops: patch.stops || invalidateCalculatedStopTimes(run.stops), routeOptimizedAt: undefined };
    }));
  };
  const updateStop = (runId: string, stopId: string, patch: Partial<TransportStop>) => {
    clearRouteCalculations([runId]);
    setDrafts((current) => current.map((run) => run.id === runId ? { ...run, routeOptimizedAt: undefined, stops: run.stops.map((stop) => { const next = stop.id === stopId ? { ...stop, ...patch } : stop; return next.timeMode && next.timeMode !== 'fixed' ? { ...next, plannedTime: undefined } : next; }) } : run));
  };
  const removeStop = (runId: string, stopId: string) => {
    clearRouteCalculations([runId]);
    setDrafts((current) => current.map((run) => run.id === runId ? { ...run, routeOptimizedAt: undefined, stops: invalidateCalculatedStopTimes(run.stops.filter((stop) => stop.id !== stopId)).map((stop, index) => ({ ...stop, order: index + 1 })) } : run));
  };
  const moveStop = (runId: string, stopId: string, offset: number) => {
    clearRouteCalculations([runId]);
    setDrafts((current) => current.map((run) => {
    if (run.id !== runId) return run;
    const index = run.stops.findIndex((stop) => stop.id === stopId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= run.stops.length) return run;
    const stops = [...run.stops];
    [stops[index], stops[target]] = [stops[target], stops[index]];
    return { ...run, routeOptimizedAt: undefined, stops: invalidateCalculatedStopTimes(stops).map((stop, order) => ({ ...stop, order: order + 1 })) };
    }));
  };

  const addRun = (direction: TransportDirection, vehicle?: Vehicle) => {
    const sequence = drafts.filter((run) => run.direction === direction && run.vehicleId === vehicle?.id).length + 1;
    setDrafts((current) => [...current, createRun(date, direction, sequence, vehicle)]);
  };

  const removeRun = (run: TransportRun) => {
    if (run.stops.length && !window.confirm(`${run.name}には児童がいます。便を削除して児童を未配車へ戻しますか？`)) return;
    if (runs.some((saved) => saved.id === run.id)) setDeletedIds((current) => Array.from(new Set([...current, run.id])));
    clearRouteCalculations([run.id], false);
    setRecalculationRequiredRunIds((current) => {
      const next = new Set(current);
      next.delete(run.id);
      return next;
    });
    setDrafts((current) => current.filter((candidate) => candidate.id !== run.id));
  };

  const assignChild = (childId: string, targetRunId: string) => {
    const child = childrenList.find((candidate) => candidate.id === childId);
    const targetRun = drafts.find((run) => run.id === targetRunId);
    if (!child || child.serviceSuspended || !targetRun) return;
    clearRouteCalculations(Array.from(new Set([targetRunId, ...drafts.filter((run) => run.direction === targetRun.direction && run.stops.some((stop) => stop.childId === childId)).map((run) => run.id)])));
    setDrafts((current) => current.map((run) => {
      const withoutSameDirection = run.direction === targetRun.direction ? run.stops.filter((stop) => stop.childId !== childId) : run.stops;
      if (run.id !== targetRunId) return { ...run, routeOptimizedAt: undefined, stops: invalidateCalculatedStopTimes(withoutSameDirection).map((stop, index) => ({ ...stop, order: index + 1 })) };
      const requirement = requirementByChild.get(child.id);
      const nextStop = childStop(
        child,
        run.direction,
        date,
        dayPlansByChild.get(child.id),
        requirement,
        routeSettings,
        transportPlanDay?.pickupMode,
        siblingGroupByChild.get(child.id),
        resolvedPlanningArea(child, run.direction, date, requirement, undefined, transportMapLocations, transportAreaZones),
      );
      return finalizeRunTimes({ ...run, routeOptimizedAt: undefined, stops: [...withoutSameDirection, { ...nextStop, order: withoutSameDirection.length + 1 }] }, transportPlanDay, routeSettings);
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
    if (data?.childId && targetRunId) {
      const draggedVisual = sharedLocationByChild.get(data.childId);
      const childIds = groupDragEnabled && draggedVisual?.count && draggedVisual.count > 1
        ? directionChildren
            .filter((child) => sharedLocationByChild.get(child.id)?.key === draggedVisual.key)
            .map((child) => child.id)
        : [data.childId];
      childIds.forEach((childId) => assignChild(childId, targetRunId));
    }
  };


  const calculateRunTime = async (runId: string) => {
    const run = drafts.find((candidate) => candidate.id === runId);
    if (!run) return;
    if (!routeSettings.facilityAddress.trim()) return setError('事業所住所が未設定です。経路設定で事業所住所を登録してください。');
    if (run.stops.length === 0) return setError('児童を便へ配置してから時間計算を行ってください。');
    if (run.stops.some((stop) => !stop.location.trim())) return setError(`${run.name}に住所未入力の送迎先があります。`);
    const clusters = clusterTransportStops(run.stops);
    if (clusters.length > 10) return setError('費用管理のため、1便で時間計算できる送迎先は10地点までです。同じ住所の児童は1地点として数えます。');
    const calculationMode = runTimeMode(run);
    if (calculationMode === 'mixed') return setError(`${run.name}には時刻の決め方が異なる児童が混在しています。「時刻固定」「逆算」「順算」ごとに便を分けてください。`);

    setCalculatingRouteRunId(runId);
    setSelectedRouteRunId(runId);
    setError('');
    setRoutingNotice(`${run.name}の道路時間と到着時刻を計算しています…`);
    try {
      const routeStops = clusters.map((cluster, index) => {
        const stop = clusterRepresentative(cluster);
        return {
          id: `point-${index + 1}`,
          label: cluster.stops.map((item) => item.childName || item.locationName || '乗降地点').join('・'),
          location: exactNavigationLocation(stop, transportMapLocations, childrenList),
        };
      });
      const facilityMapLocation = transportMapLocations.find((location) => location.sourceType === 'facility');
      const facilityNavigationLocation = facilityMapLocation
        ? `${facilityMapLocation.latitude.toFixed(7)},${facilityMapLocation.longitude.toFixed(7)}`
        : routeSettings.facilityAddress.trim();
      const dwellSeconds = clusters.map((cluster) => clusterDwellMinutes(cluster, routeSettings) * 60);
      const anchorMinute = calculationMode === 'fixed'
        ? clusterTargetMinute(clusters[0])
        : runAnchorMinute(run, calculationMode, transportPlanDay, routeSettings);
      const requestRoute = (departureTime: string) => optimizeTransportRoute({
        transportRunId: run.id,
        serviceDate: run.date,
        departureTime,
        origin: facilityNavigationLocation,
        destination: facilityNavigationLocation,
        stops: routeStops,
        avoidTolls: routeSettings.avoidTolls,
        avoidHighways: routeSettings.avoidHighways,
        preserveOrder: true,
      });
      const routeTiming = (routeResult: TransportRouteOptimizationResult) => {
        const legSeconds = clusters.map((_, index) => routeResult.legs[index]?.durationSeconds || 0);
        const returnLegSeconds = routeResult.legs[clusters.length]?.durationSeconds || 0;
        return {
          legSeconds,
          returnLegSeconds,
          totalElapsedSeconds: legSeconds.reduce((sum, value) => sum + value, 0)
            + dwellSeconds.reduce((sum, value) => sum + value, 0)
            + returnLegSeconds,
        };
      };
      const firstDepartureMinute = calculationMode === 'departure_forward' && anchorMinute !== undefined
        ? anchorMinute
        : minutes(run.startTime);
      let result: TransportRouteOptimizationResult = await requestRoute(formattedMinutes(firstDepartureMinute));
      let timing = routeTiming(result);
      let estimatedDepartureMinute = firstDepartureMinute;
      if (calculationMode === 'arrival_backward' && anchorMinute !== undefined) {
        estimatedDepartureMinute = anchorMinute - timing.totalElapsedSeconds / 60;
        if (run.direction === '迎え' && transportPlanDay?.pickupMode === 'home') {
          estimatedDepartureMinute = Math.max(estimatedDepartureMinute, minutes(routeSettings.holidayOpeningTime));
        }
      } else if (calculationMode === 'fixed' && anchorMinute !== undefined) {
        estimatedDepartureMinute = anchorMinute - (timing.legSeconds[0] || 0) / 60;
      }
      // Backward/fixed schedules only reveal their actual departure after a
      // first route pass. Recalculate once in that departure time band so the
      // displayed traffic duration matches the departure shown to staff.
      if (calculationMode !== 'departure_forward' && Math.abs(estimatedDepartureMinute - firstDepartureMinute) >= 5) {
        result = await requestRoute(formattedMinutes(estimatedDepartureMinute));
        timing = routeTiming(result);
      }
      const { legSeconds, returnLegSeconds, totalElapsedSeconds } = timing;
      let startMinute = minutes(run.startTime);
      const calculationWarnings: string[] = [];
      if (calculationMode === 'arrival_backward' && anchorMinute !== undefined) {
        startMinute = anchorMinute - totalElapsedSeconds / 60;
        if (run.direction === '迎え' && transportPlanDay?.pickupMode === 'home' && startMinute < minutes(routeSettings.holidayOpeningTime)) {
          startMinute = minutes(routeSettings.holidayOpeningTime);
          calculationWarnings.push(`開所時刻${routeSettings.holidayOpeningTime}以降へ調整したため、目標時刻に遅れる可能性があります。`);
        }
      } else if (calculationMode === 'departure_forward' && anchorMinute !== undefined) {
        startMinute = anchorMinute;
      } else if (calculationMode === 'fixed' && anchorMinute !== undefined) {
        startMinute = anchorMinute - (legSeconds[0] || 0) / 60;
      }

      let elapsedSeconds = 0;
      const legMinutesByStopId: Record<string, number> = {};
      const calculatedStops: TransportStop[] = [];
      clusters.forEach((cluster, clusterIndex) => {
        const travelSeconds = legSeconds[clusterIndex];
        elapsedSeconds += travelSeconds;
        const arrivalMinute = startMinute + elapsedSeconds / 60;
        const fixedTarget = calculationMode === 'fixed' ? clusterTargetMinute(cluster, true) : undefined;
        const plannedMinute = fixedTarget === undefined ? arrivalMinute : Math.max(arrivalMinute, fixedTarget);
        if (fixedTarget !== undefined && arrivalMinute > fixedTarget + routeSettings.schoolWaitToleranceMinutes) {
          calculationWarnings.push(`${cluster.stops.map((stop) => stop.childName || stop.locationName || '乗降地点').join('・')}は固定時刻より約${Math.ceil(arrivalMinute - fixedTarget)}分遅れる見込みです。`);
        }
        if (plannedMinute > arrivalMinute) elapsedSeconds += (plannedMinute - arrivalMinute) * 60;
        const plannedTime = formattedMinutes(plannedMinute);
        cluster.stops.forEach((stop) => {
          legMinutesByStopId[stop.id] = Math.max(0, Math.ceil(travelSeconds / 60));
          calculatedStops.push({ ...stop, plannedTime, order: calculatedStops.length + 1 });
        });
        elapsedSeconds += dwellSeconds[clusterIndex];
      });
      elapsedSeconds += returnLegSeconds;
      const endMinute = startMinute + elapsedSeconds / 60;
      if (calculationMode === 'arrival_backward' && anchorMinute !== undefined && endMinute > anchorMinute + 1) {
        calculationWarnings.push(`来所・帰着目標${formattedMinutes(anchorMinute)}に対して、約${Math.ceil(endMinute - anchorMinute)}分遅れる見込みです。`);
      }
      const updatedRun: TransportRun = {
        ...run,
        startTime: formattedMinutes(startMinute),
        endTime: formattedMinutes(endMinute),
        routeOrigin: routeSettings.facilityAddress.trim(),
        routeDestination: routeSettings.facilityAddress.trim(),
        routeOptimizedAt: new Date().toISOString(),
        stops: calculatedStops,
      };
      const color = ROUTE_COLORS[drafts.filter((candidate) => candidate.direction === run.direction).findIndex((candidate) => candidate.id === run.id) % ROUTE_COLORS.length] || ROUTE_COLORS[0];
      setDrafts((current) => current.map((candidate) => candidate.id === runId ? updatedRun : candidate));
      setCalculatedRoutes((current) => ({
        ...current,
        [runId]: {
          runId,
          runName: run.name,
          color,
          totalDistanceMeters: result.totalDistanceMeters,
          totalDurationSeconds: result.totalDurationSeconds,
          legs: result.legs,
          legMinutesByStopId,
          encodedPolyline: result.encodedPolyline,
        },
      }));
      setRecalculationRequiredRunIds((current) => {
        const next = new Set(current);
        next.delete(runId);
        return next;
      });
      const totalMinutes = Math.ceil(result.totalDurationSeconds / 60);
      const trafficLabel = result.trafficApplied
        ? `出発${updatedRun.startTime}の交通予測を使用`
        : '通常の道路時間を使用';
      setRoutingNotice(`${run.name}：${timeModeShortLabel(calculationMode)}で、出発${updatedRun.startTime}・帰着${updatedRun.endTime}を反映しました。${trafficLabel}・走行${totalMinutes}分・${(result.totalDistanceMeters / 1000).toFixed(1)}km。${[...result.warnings, ...calculationWarnings].join(' ')}`.trim());
    } catch (routeError) {
      setRoutingNotice('');
      setError(routeError instanceof Error ? routeError.message : `${run.name}の時間を計算できませんでした。`);
    } finally {
      setCalculatingRouteRunId(undefined);
    }
  };

  const saveAll = async () => {
    const runsToSave = drafts.filter((run) => run.stops.length > 0 || runs.some((saved) => saved.id === run.id));
    const invalidRun = runsToSave.find((run) => !run.name.trim() || run.startTime >= run.endTime);
    if (invalidRun) return setError(`${invalidRun.name || '名称未設定の便'}の便名または時刻を確認してください。`);
    const invalidStopRun = runsToSave.find((run) => run.stops.some((stop) => !stop.childId || !stop.location.trim()));
    if (invalidStopRun) return setError(`${invalidStopRun.name}に送迎場所が未入力の児童がいます。`);
    const earlyHolidayRuns = transportPlanDay?.pickupMode === 'home'
      ? runsToSave.filter((run) => run.direction === '迎え' && run.startTime < routeSettings.holidayOpeningTime)
      : [];
    if (earlyHolidayRuns.length && !window.confirm(`${earlyHolidayRuns.map((run) => `${run.name}（${run.startTime}）`).join('、')}は、休日の開所時刻${routeSettings.holidayOpeningTime}より前に出発する手動設定です。このまま保存しますか？`)) return;
    setSaving(true);
    setError('');
    try {
      for (const run of runsToSave) await onSaveRun({ ...run, name: run.name.trim(), driverName: activeRecorders.find((profile) => profile.id === run.driverRecorderProfileId)?.displayName, vehicleName: vehicles.find((vehicle) => vehicle.id === run.vehicleId)?.name, stops: run.stops.map((stop, index) => ({ ...stop, permanentNote: childrenList.find((child) => child.id === stop.childId)?.transportPermanentNote, navigationLocation: exactNavigationLocation(stop, transportMapLocations, childrenList), order: index + 1 })), updatedAt: new Date().toISOString() });
      const now = new Date().toISOString();
      const reflectedRequirements = dailyTransportRequirements.flatMap((requirement) => {
        const pickupRun = runsToSave.find((run) => run.direction === '迎え' && run.stops.some((stop) => stop.childId === requirement.childId));
        const dropoffRun = runsToSave.find((run) => run.direction === '送り' && run.stops.some((stop) => stop.childId === requirement.childId));
        const pickupStop = pickupRun?.stops.find((stop) => stop.childId === requirement.childId);
        const dropoffStop = dropoffRun?.stops.find((stop) => stop.childId === requirement.childId);
        const pickupPlannedTime = pickupRun?.routeOptimizedAt ? pickupStop?.plannedTime : undefined;
        const dropoffPlannedTime = dropoffRun?.routeOptimizedAt ? dropoffStop?.plannedTime : undefined;
        if (pickupPlannedTime === requirement.pickupPlannedTime && dropoffPlannedTime === requirement.dropoffPlannedTime) return [];
        return [{
          ...requirement,
          pickupPlannedTime,
          dropoffPlannedTime,
          plannedTimeUpdatedAt: now,
          revision: requirement.revision + 1,
          updatedAt: now,
        }];
      });
      if (reflectedRequirements.length > 0) await onSaveRequirements(reflectedRequirements);
      for (const id of deletedIds) await onDeleteRun(id);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '当日の送迎を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const renderDirection = (direction: TransportDirection) => (
    <section className={`flex h-full min-h-0 min-w-0 flex-col rounded-2xl border p-2 ${direction === '迎え' ? 'border-sky-300 bg-sky-50/60' : 'border-violet-300 bg-violet-50/60'}`}>
      <header className="mb-2 flex shrink-0 items-center justify-between gap-2 px-1">
        <div><p className={`text-[10px] font-black uppercase tracking-[0.14em] ${direction === '迎え' ? 'text-sky-700' : 'text-violet-700'}`}>{direction}配車</p><h3 className="text-base font-black text-slate-950">{direction}便</h3></div>
        <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-slate-600">{drafts.filter((run) => run.direction === direction && run.stops.length > 0).length}便使用</span>
      </header>
      <div className="space-y-2 lg:grid lg:min-h-0 lg:flex-1 lg:auto-cols-[minmax(15rem,1fr)] lg:grid-flow-col lg:gap-2 lg:space-y-0 lg:overflow-x-auto lg:pb-1">
        {vehicleSlots.map((vehicle) => {
          const vehicleRuns = drafts.filter((run) => run.direction === direction && run.vehicleId === vehicle?.id);
          return (
            <section key={vehicle?.id || 'unassigned'} className="rounded-xl border border-slate-200 bg-white/80 p-2 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
              <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-black text-slate-800"><BusFront className={`h-4 w-4 ${direction === '迎え' ? 'text-sky-600' : 'text-violet-600'}`} /><span className="truncate">{vehicle?.name || '車両未設定'}</span>{vehicle && <span className="text-[9px] font-bold text-slate-400">総定員{vehicle.capacity}名</span>}</span>
                <button type="button" onClick={() => addRun(direction, vehicle)} className={`min-h-9 shrink-0 rounded-lg px-2 text-[10px] font-black text-white ${direction === '迎え' ? 'bg-sky-600' : 'bg-violet-600'}`}><Plus className="mr-0.5 inline h-3.5 w-3.5" />便を追加</button>
              </div>
              <div className="space-y-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                {vehicleRuns.length === 0 && <button type="button" onClick={() => addRun(direction, vehicle)} className="min-h-20 w-full rounded-xl border-2 border-dashed border-slate-300 bg-white text-[10px] font-bold text-slate-400">この車両に{direction}便を追加</button>}
                {vehicleRuns.map((run) => <TransportRunLane key={run.id} run={run} vehicle={vehicle} childrenList={childrenList} date={date} activeRecorders={activeRecorders} requirementByChild={requirementByChild} sharedLocationByChild={sharedLocationByChild} routeCalculation={calculatedRoutes[run.id]} routeSelected={selectedRouteRunId === run.id} calculatingRoute={calculatingRouteRunId === run.id} needsRecalculation={recalculationRequiredRunIds.has(run.id)} expandedStopId={expandedStopId} holidayOpeningTime={direction === '迎え' && transportPlanDay?.pickupMode === 'home' ? routeSettings.holidayOpeningTime : undefined} onExpandStop={setExpandedStopId} onUpdateRun={updateRun} onUpdateStop={updateStop} onMoveStop={moveStop} onRemoveStop={removeStop} onRemoveRun={removeRun} onCalculateTime={(runId) => void calculateRunTime(runId)} onSelectRoute={setSelectedRouteRunId} />)}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );

  return createPortal((
    <div className="app-safe-block ui-fade-in fixed inset-0 z-[100] flex min-h-[100dvh] flex-col bg-slate-100" role="dialog" aria-modal="true" aria-label={`${date}の全送迎を編集`}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2.5 shadow-sm sm:px-5">
        <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.15em] text-teal-700">一日配車ボード・{weekday}曜日</p><h2 className="truncate text-base font-black text-slate-950 sm:text-xl">{date} の全送迎を組む</h2></div>
        <button type="button" onClick={onClose} aria-label="閉じる" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100"><X className="h-5 w-5" /></button>
      </header>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <div className="grid min-w-52 grid-cols-2 rounded-xl bg-slate-100 p-1">
          {(['迎え', '送り'] as TransportDirection[]).map((direction) => <button key={direction} type="button" onClick={() => setActiveDirection(direction)} className={`min-h-9 rounded-lg text-xs font-black ${activeDirection === direction ? direction === '迎え' ? 'bg-sky-600 text-white shadow-sm' : 'bg-violet-600 text-white shadow-sm' : 'text-slate-500'}`}>{direction}配車</button>)}
        </div>
        <button type="button" onClick={() => setChildPickerOpen(true)} className="flex min-h-10 items-center gap-1 rounded-xl border border-teal-300 bg-teal-50 px-3 text-xs font-black text-teal-800"><UserPlus className="h-4 w-4" />児童を追加</button>
        <button type="button" onClick={() => setMapOpen((current) => !current)} className={`min-h-10 rounded-xl border px-3 text-xs font-black ${mapOpen ? 'border-sky-600 bg-sky-600 text-white' : 'border-sky-300 bg-white text-sky-800'}`}>{mapOpen ? 'ミニマップを収納' : 'ミニマップを表示'}</button>
        <button type="button" onClick={() => setGanttOpen((current) => !current)} className={`min-h-10 rounded-xl border px-3 text-xs font-black ${ganttOpen ? 'border-violet-600 bg-violet-600 text-white' : 'border-violet-300 bg-white text-violet-800'}`}>{ganttOpen ? '配置確認を収納' : '職員・時間を確認'}</button>
        <label className="flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 text-[10px] font-black text-emerald-900"><input type="checkbox" checked={groupDragEnabled} onChange={(event) => setGroupDragEnabled(event.target.checked)} className="h-4 w-4 accent-emerald-600" />同じ場所・近い時刻をまとめて移動</label>
        <p className="min-w-0 flex-1 text-[10px] font-bold leading-relaxed text-slate-500">{routingNotice || 'ミニマップで送迎先を確認し、児童カードを車両の便へドラッグします。配置後、各便の「時間計算」を押してください。'}</p>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={transportCollisionDetection}
        onDragStart={handleDragStart}
        onDragCancel={() => setActiveDragData(undefined)}
        onDragEnd={handleDragEnd}
      >
        <div className="ui-scrollbar flex-1 overflow-y-auto p-2 sm:p-3 lg:overflow-auto">
          <div className={`mx-auto grid max-w-[1900px] items-start gap-2 lg:min-h-0 lg:items-stretch ${ganttOpen ? 'lg:h-full lg:grid-rows-[minmax(24rem,3fr)_minmax(18rem,2fr)]' : 'lg:h-full lg:grid-rows-1'} ${mapOpen ? 'lg:grid-cols-[220px_minmax(0,1fr)_minmax(320px,0.72fr)]' : 'lg:grid-cols-[220px_minmax(0,1fr)]'}`}>
            <aside className="min-w-0 rounded-2xl border border-emerald-300 bg-emerald-50/70 p-2 lg:col-start-1 lg:row-span-2 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
              <div className="mb-2 flex shrink-0 items-center justify-between gap-1 px-1"><div><p className="text-[9px] font-black text-emerald-700">{weekday}曜日・{activeDirection}</p><h3 className="text-sm font-black text-slate-950">未配車児童</h3></div><div className="flex items-center gap-1"><button type="button" onClick={() => setSortPanelOpen((current) => !current)} aria-expanded={sortPanelOpen} className={`grid h-8 w-8 place-items-center rounded-lg border ${sortPanelOpen ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-emerald-200 bg-white text-emerald-800'}`} aria-label="児童リストの並べ替え"><SlidersHorizontal className="h-3.5 w-3.5" /></button><span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-emerald-800">{unassignedDirectionChildren.length}名</span></div></div>
              {sortPanelOpen && <div className="mb-2 shrink-0 space-y-1.5 rounded-xl border border-emerald-200 bg-white p-2"><div className="flex items-center justify-between"><div><p className="text-[9px] font-black text-slate-700">上から優先して並べ替え</p><p className="text-[8px] font-bold text-slate-400">つまみをドラッグして優先順を変更</p></div><button type="button" onClick={() => setSortRules([{ field: 'time', direction: 'asc' }, { field: 'area', direction: 'asc' }, { field: 'grade', direction: 'asc' }])} className="text-[8px] font-black text-emerald-700">初期値へ戻す</button></div><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => { if (!over || active.id === over.id) return; setSortRules((current) => { const oldIndex = current.findIndex((rule) => rule.field === active.id); const newIndex = current.findIndex((rule) => rule.field === over.id); return oldIndex < 0 || newIndex < 0 ? current : arrayMove(current, oldIndex, newIndex); }); }}><SortableContext items={sortRules.map((rule) => rule.field)} strategy={verticalListSortingStrategy}><div className="space-y-1">{sortRules.map((rule, index) => <SortableSortRuleRow key={rule.field} rule={rule} index={index} rules={sortRules} onChange={(nextRule) => setSortRules((current) => current.map((item, itemIndex) => itemIndex === index ? nextRule : item))} />)}</div></SortableContext></DndContext></div>}
              <div className="space-y-1.5 md:max-h-[calc(100dvh-15rem)] md:overflow-y-auto md:pr-0.5 lg:min-h-0 lg:flex-1 lg:max-h-none">
                {unassignedDirectionChildren.map((child) => <DraggableChildCard key={child.id} child={child} date={date} direction={activeDirection} requirement={requirementByChild.get(child.id)} data={{ childId: child.id }} sharedLocation={sharedLocationByChild.get(child.id)} />)}
                {unassignedDirectionChildren.length === 0 && <div className="rounded-xl border-2 border-dashed border-emerald-200 bg-white p-4 text-center"><Users className="mx-auto h-7 w-7 text-emerald-300" /><p className="mt-1 text-[10px] font-bold text-slate-400">{directionChildren.length ? '全員の配車が完了しています。' : '対象児童がいません。「児童を追加」から追加できます。'}</p></div>}
              </div>
            </aside>
            <div className="min-w-0 lg:col-start-2 lg:row-start-1 lg:h-full lg:min-h-0">{renderDirection(activeDirection)}</div>
            {mapOpen && <div className="ui-panel-enter min-w-0 lg:col-start-3 lg:row-start-1 lg:h-full lg:min-h-0">
              <DailyTransportMiniMap direction={activeDirection} points={miniMapPoints} facilityPoint={facilityMapPoint} expectedCount={directionChildren.length} activeChildId={activeDragData?.childId} routes={visibleCalculatedRoutes} selectedRouteRunId={selectedRouteRunId} fillHeight onSelectRoute={setSelectedRouteRunId} />
            </div>}
            {ganttOpen && <div className={`ui-panel-enter min-w-0 lg:col-start-2 lg:row-start-2 lg:h-full lg:min-h-0 lg:overflow-y-auto ${mapOpen ? 'lg:col-span-2' : ''}`}>
              <DraftTransportGantt date={date} direction={activeDirection} drafts={drafts} recorders={activeRecorders} requirements={dailyTransportRequirements} children={childrenList} attendanceRecords={attendanceRecords} staffScheduleItems={staffScheduleItems} calendarEvents={calendarEvents} warnings={planningWarnings} minimumFacilityStaff={routeSettings.minimumFacilityStaff} embedded />
            </div>}
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
                direction={activeDirection}
                requirement={requirementByChild.get(activeDragChild.id)}
                sharedLocation={sharedLocationByChild.get(activeDragChild.id)}
                groupCount={groupDragEnabled ? sharedLocationByChild.get(activeDragChild.id)?.count : 1}
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
            <div className="ui-scrollbar flex-1 space-y-1 overflow-y-auto p-3">{childrenList.filter((child) => !child.serviceSuspended && `${child.name}${child.kana || ''}${child.schoolName || ''}`.includes(childSearch.trim())).map((child) => { const defaultChild = scheduledChildren.some((item) => item.id === child.id); const added = additionalChildIds.includes(child.id); return <button key={child.id} type="button" disabled={defaultChild} onClick={() => setAdditionalChildIds((current) => added ? current.filter((id) => id !== child.id) : [...current, child.id])} className={`flex min-h-12 w-full items-center justify-between rounded-xl border px-3 text-left ${defaultChild || added ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-white'}`}><span><strong className="block text-sm">{child.name}</strong><span className="text-[10px] text-slate-500">{child.schoolName || child.grade || '学校未登録'}</span></span><span className="text-[10px] font-black text-teal-700">{defaultChild ? '定期利用' : added ? '追加済み' : '追加する'}</span></button>; })}</div>
            <div className="border-t border-slate-200 p-3"><button type="button" onClick={() => setChildPickerOpen(false)} className="min-h-11 w-full rounded-xl bg-teal-600 text-sm font-black text-white">配車ボードへ反映</button></div>
          </section>
        </div>
      )}
    </div>
  ), document.body);
};


function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA < endB && startB < endA;
}

function getDraftPlanningWarnings({
  date,
  direction,
  drafts,
  vehicles,
  activeRecorders,
  attendanceRecords,
  staffScheduleItems,
  calendarEvents,
  minimumFacilityStaff,
}: {
  date: string;
  direction: TransportDirection;
  drafts: TransportRun[];
  vehicles: Vehicle[];
  activeRecorders: RecorderProfile[];
  attendanceRecords: AttendanceRecord[];
  staffScheduleItems: StaffScheduleItem[];
  calendarEvents: CalendarEvent[];
  minimumFacilityStaff: number;
}) {
  const warnings: string[] = [];
  const dayRuns = drafts.filter((run) => run.direction === direction && run.stops.length > 0);
  const dayAttendance = attendanceRecords.filter((record) => record.date === date);
  const leaveIds = new Set(calendarEvents
    .filter((event) => event.eventType === '職員休み' && event.date <= date && (event.endDate || event.date) >= date)
    .flatMap((event) => event.recorderProfileIds));
  const workingIds = new Set(dayAttendance
    .filter((record) => !leaveIds.has(record.recorderProfileId) && ['勤務予定', '出勤中', '休憩中', '遅刻', '早退'].includes(record.status))
    .map((record) => record.recorderProfileId));
  const availableCount = dayAttendance.length > 0 ? workingIds.size : activeRecorders.filter((recorder) => !leaveIds.has(recorder.id)).length;

  dayRuns.forEach((run) => {
    const vehicle = vehicles.find((candidate) => candidate.id === run.vehicleId);
    if (!run.vehicleId) warnings.push(`${run.name}：車両が未設定です。`);
    if (!run.driverRecorderProfileId) warnings.push(`${run.name}：運転者が未設定です。`);
    if (vehicle && run.stops.length > getVehicleChildCapacity(vehicle, run)) warnings.push(`${run.name}：総定員${vehicle.capacity}名から運転者1名・添乗${getVehicleStaffSeatCount(run) - 1}名を除いた児童枠${getVehicleChildCapacity(vehicle, run)}名を超えています。`);
    if (vehicle?.vehicleKind === 'private') warnings.push(`${run.name}：職員の自家用車を使用します。使用許可・保険を確認してください。`);
    if (run.stops.some((stop) => !stop.location.trim())) warnings.push(`${run.name}：送迎先が未入力の児童がいます。`);
    const assigned = new Set([run.driverRecorderProfileId, ...run.assistantRecorderProfileIds].filter((id): id is string => Boolean(id)));
    [...assigned].filter((id) => leaveIds.has(id)).forEach((id) => warnings.push(`${run.name}：${activeRecorders.find((recorder) => recorder.id === id)?.displayName || '担当職員'}さんは業務カレンダーで休みに登録されています。`));
    staffScheduleItems.filter((item) => item.date === date && assigned.has(item.recorderProfileId) && rangesOverlap(run.startTime, run.endTime, item.startTime, item.endTime)).forEach((item) => warnings.push(`${run.name}：${item.recorderName}さんの「${item.title}」と重複しています。`));
    calendarEvents.filter((event) => event.date === date && !event.allDay && event.startTime && event.endTime && event.recorderProfileIds.some((id) => assigned.has(id)) && rangesOverlap(run.startTime, run.endTime, event.startTime, event.endTime)).forEach((event) => warnings.push(`${run.name}：予定「${event.title}」と重複しています。`));
    const awayIds = new Set(dayRuns.filter((candidate) => rangesOverlap(run.startTime, run.endTime, candidate.startTime, candidate.endTime)).flatMap((candidate) => [candidate.driverRecorderProfileId, ...candidate.assistantRecorderProfileIds].filter((id): id is string => Boolean(id))));
    const knownAwayCount = dayAttendance.length > 0
      ? [...awayIds].filter((id) => workingIds.has(id)).length
      : awayIds.size;
    if (Math.max(0, availableCount - knownAwayCount) < minimumFacilityStaff) warnings.push(`${run.startTime}～${run.endTime}：勤務予定で確認できる施設内職員が${Math.max(0, availableCount - knownAwayCount)}名となり、最低${minimumFacilityStaff}名を下回ります。`);
  });

  dayRuns.forEach((run, index) => dayRuns.slice(index + 1).forEach((other) => {
    if (!rangesOverlap(run.startTime, run.endTime, other.startTime, other.endTime)) return;
    if (run.vehicleId && run.vehicleId === other.vehicleId) warnings.push(`${run.name}と${other.name}で車両が重複しています。`);
    const runStaff = new Set([run.driverRecorderProfileId, ...run.assistantRecorderProfileIds].filter(Boolean));
    if ([other.driverRecorderProfileId, ...other.assistantRecorderProfileIds].some((id) => id && runStaff.has(id))) warnings.push(`${run.name}と${other.name}で担当職員が重複しています。`);
  }));
  return [...new Set(warnings)];
}

const DraftTransportGantt: React.FC<{
  date: string;
  direction: TransportDirection;
  drafts: TransportRun[];
  recorders: RecorderProfile[];
  requirements: DailyTransportRequirement[];
  children: ChildProfile[];
  attendanceRecords: AttendanceRecord[];
  staffScheduleItems: StaffScheduleItem[];
  calendarEvents: CalendarEvent[];
  warnings: string[];
  minimumFacilityStaff: number;
  embedded?: boolean;
}> = ({ date, direction, drafts, recorders, requirements, children, attendanceRecords, staffScheduleItems, calendarEvents, warnings, minimumFacilityStaff, embedded = false }) => {
  const runs = drafts.filter((run) => run.direction === direction && run.stops.length > 0);
  const assignedIds = new Set(runs.flatMap((run) => [run.driverRecorderProfileId, ...run.assistantRecorderProfileIds].filter((id): id is string => Boolean(id))));
  const rows = recorders.filter((recorder) => recorder.active).sort((left, right) => Number(assignedIds.has(right.id)) - Number(assignedIds.has(left.id)) || left.displayName.localeCompare(right.displayName, 'ja'));
  const startMinute = 8 * 60;
  const endMinute = 20 * 60;
  const width = endMinute - startMinute;
  const position = (time: string) => {
    const [hour, minute] = time.split(':').map(Number);
    return Math.max(0, Math.min(100, (((hour * 60 + minute) - startMinute) / width) * 100));
  };
  const timePoints = requirements
    .filter((requirement) => requirement.date === date && (direction === '迎え' ? requirement.pickupEnabled : requirement.dropoffEnabled))
    .map((requirement) => ({
    id: requirement.childId,
    name: children.find((child) => child.id === requirement.childId)?.name || '児童',
    time: direction === '迎え'
      ? requirement.pickupPlannedTime || requirement.pickupTargetTime
      : requirement.dropoffPlannedTime || requirement.dropoffTargetTime,
    })).filter((item): item is { id: string; name: string; time: string } => Boolean(item.time));
  const timePointGroups = Array.from(timePoints.reduce((groups, point) => {
    const current = groups.get(point.time) || [];
    current.push(point);
    groups.set(point.time, current);
    return groups;
  }, new Map<string, typeof timePoints>()).entries())
    .map(([time, points]) => ({ time, points }))
    .sort((left, right) => left.time.localeCompare(right.time));
  return (
    <section className={`${embedded ? 'min-h-full' : 'mx-auto mt-3 max-w-[1600px]'} rounded-2xl border border-slate-300 bg-white p-3 shadow-sm`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[9px] font-black text-teal-700">保存前の配車を即時反映</p><h3 className="text-sm font-black text-slate-950">職員配置ガント・{date} {direction}</h3></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-600">施設内最低 {minimumFacilityStaff}名</span></div>
      {timePointGroups.length > 0 && <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/60 p-2"><div className="grid min-w-0 grid-cols-[7rem_1fr] items-center gap-2"><span className="text-[10px] font-black text-sky-800">児童の{direction}時刻</span><div className="relative h-7 rounded-lg bg-white bg-[linear-gradient(to_right,#bae6fd_1px,transparent_1px)] bg-[size:16.666%_100%]">{timePointGroups.map((group) => <span key={group.time} title={`${group.time} ${group.points.map((point) => point.name).join('・')}`} className="absolute top-1/2 h-4 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-600 ring-2 ring-white" style={{ left: `${position(group.time)}%` }} />)}</div></div><div className="mt-2 flex max-h-20 flex-wrap gap-1 overflow-y-auto pl-0 sm:pl-[7.5rem]">{timePointGroups.map((group) => <span key={group.time} className="rounded-lg border border-sky-200 bg-white px-2 py-1 text-[9px] font-bold text-sky-950"><strong>{group.time}</strong> {group.points.map((point) => point.name).join('・')}</span>)}</div></div>}
      <div className="mt-3 overflow-x-auto"><div className="min-w-[680px]"><div className="ml-28 grid grid-cols-7 text-[9px] font-bold text-slate-400">{[8,10,12,14,16,18,20].map((hour) => <span key={hour}>{hour}:00</span>)}</div><div className="mt-1 max-h-[42dvh] space-y-1 overflow-y-auto pr-1">{rows.map((recorder) => {
        const attendance = attendanceRecords.find((item) => item.date === date && item.recorderProfileId === recorder.id);
        const leave = calendarEvents.find((event) => event.eventType === '職員休み' && event.date <= date && (event.endDate || event.date) >= date && event.recorderProfileIds.includes(recorder.id));
        const workItems = staffScheduleItems.filter((item) => item.date === date && item.recorderProfileId === recorder.id);
        const events = calendarEvents.filter((event) => event.eventType !== '職員休み' && event.date <= date && (event.endDate || event.date) >= date && !event.allDay && event.startTime && event.endTime && event.recorderProfileIds.includes(recorder.id));
        const assigned = runs.filter((run) => run.driverRecorderProfileId === recorder.id || run.assistantRecorderProfileIds.includes(recorder.id));
        return <div key={recorder.id} className="grid grid-cols-[7rem_1fr] items-center gap-2"><span className={`truncate text-[10px] font-black ${leave ? 'text-rose-700' : attendance?.scheduledStartTime ? 'text-slate-800' : 'text-slate-400'}`}>{recorder.displayName}{leave ? '（休み）' : !attendance?.scheduledStartTime ? '（未定）' : ''}</span><div className="relative h-9 overflow-hidden rounded-lg bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px)] bg-[size:16.666%_100%] bg-slate-50">{leave ? <span className="absolute inset-1 flex items-center justify-center rounded-md bg-rose-100 text-[9px] font-black text-rose-800 ring-1 ring-rose-200">休み：{leave.title}</span> : <>{attendance?.scheduledStartTime && attendance.scheduledEndTime && <span className="absolute top-1 h-7 rounded-md bg-emerald-100 ring-1 ring-emerald-200" style={{ left: `${position(attendance.scheduledStartTime)}%`, width: `${Math.max(2, position(attendance.scheduledEndTime) - position(attendance.scheduledStartTime))}%` }} title={`出勤予定 ${attendance.scheduledStartTime}〜${attendance.scheduledEndTime}`} />}{[...workItems.map((item) => ({ id: item.id, title: item.title, start: item.startTime, end: item.endTime })), ...events.map((event) => ({ id: event.id, title: event.title, start: event.startTime!, end: event.endTime! }))].map((item) => <span key={item.id} className="absolute bottom-0.5 h-2.5 rounded-sm bg-amber-400" style={{ left: `${position(item.start)}%`, width: `${Math.max(1, position(item.end) - position(item.start))}%` }} title={`${item.title} ${item.start}〜${item.end}`} />)}{assigned.map((run) => <div key={run.id} title={`${run.name} ${run.startTime}～${run.endTime}`} className={`absolute top-1 h-6 overflow-hidden rounded-md px-2 text-[9px] font-black leading-6 text-white ${direction === '迎え' ? 'bg-sky-600' : 'bg-violet-600'}`} style={{ left: `${position(run.startTime)}%`, width: `${Math.max(2, position(run.endTime) - position(run.startTime))}%` }}>{run.name}</div>)}</>}</div></div>;
      })}</div></div></div>
      {warnings.length > 0 && <details className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3" open={!embedded}><summary className="cursor-pointer text-xs font-black text-amber-950"><AlertTriangle className="mr-1 inline h-4 w-4" />要確認 {warnings.length}件</summary><ul className="mt-2 space-y-1 text-[10px] font-bold text-amber-900">{warnings.map((warning) => <li key={warning}>・{warning}</li>)}</ul></details>}
    </section>
  );
};
