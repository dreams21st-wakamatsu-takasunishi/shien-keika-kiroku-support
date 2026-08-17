import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BusFront,
  CarFront,
  CheckCircle2,
  ExternalLink,
  GripVertical,
  LoaderCircle,
  MapPinned,
  MapPin,
  Navigation,
  PencilLine,
  Plus,
  Route,
  Settings2,
  Trash2,
  UserRoundCheck,
  UserRoundPlus,
  ArrowRightLeft,
  X,
} from "lucide-react";
import type {
  ChildProfile,
  AttendanceRecord,
  CalendarEvent,
  DailyChildPlan,
  DailyTransportRequirement,
  RecorderProfile,
  SchoolProfile,
  StaffScheduleItem,
  TransportDirection,
  TransportRun,
  TransportAssignmentChangeInput,
  TransportAreaZone,
  TransportMapLocation,
  TransportPlanDay,
  TransportRouteOptimizationResult,
  TransportRouteSettings,
  TransportRunStatus,
  TransportLocationType,
  TransportStop,
  Vehicle,
} from "../types";
import { optimizeTransportRoute } from "../services/dataService";
import {
  getSuggestedTransportLocation,
  getTransportLocationOptions,
} from "../utils/transportLocations";
import { DailyTransportPlanner } from "./DailyTransportPlanner";
import { inferTransportArea, resolvedTransportArea } from "../utils/transportArea";

const TransportMapPanel = React.lazy(() => import('./TransportMapPanel')
  .then((module) => ({ default: module.TransportMapPanel })));

const TRANSPORT_LOCATION_TYPES: TransportLocationType[] = [
  "自宅",
  "学校",
  "学童",
  "習い事",
  "親族宅",
  "事業所",
  "その他",
];

function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA < endB && startB < endA;
}

function assignmentAvailabilityLabel(
  recorder: RecorderProfile,
  date: string,
  attendance: AttendanceRecord[],
  runs: TransportRun[],
  currentRun: TransportRun,
) {
  const work = attendance.find((record) => record.date === date && record.recorderProfileId === recorder.id);
  if (work && ['欠勤', '有給', '公休'].includes(work.status)) return `${recorder.displayName}（${work.status}）`;
  const overlap = runs.find((run) => run.id !== currentRun.id
    && rangesOverlap(run.startTime, run.endTime, currentRun.startTime, currentRun.endTime)
    && (run.driverRecorderProfileId === recorder.id || run.assistantRecorderProfileIds.includes(recorder.id)));
  if (overlap) return `${recorder.displayName}（${overlap.name}と重複）`;
  if (!work) return `${recorder.displayName}（出勤未確認）`;
  if (work.status === '休憩中') return `${recorder.displayName}（休憩中）`;
  return `${recorder.displayName}（対応可能）`;
}

interface TransportPanelProps {
  runs: TransportRun[];
  vehicles: Vehicle[];
  routeSettings: TransportRouteSettings;
  mapLocations: TransportMapLocation[];
  areaZones: TransportAreaZone[];
  recorderProfiles: RecorderProfile[];
  childrenList: ChildProfile[];
  schools: SchoolProfile[];
  dailyChildPlans: DailyChildPlan[];
  transportPlanDays: TransportPlanDay[];
  dailyTransportRequirements: DailyTransportRequirement[];
  staffScheduleItems: StaffScheduleItem[];
  attendanceRecords: AttendanceRecord[];
  calendarEvents: CalendarEvent[];
  selectedDate: string;
  canManage: boolean;
  activeRecorder?: RecorderProfile;
  warningsByRunId?: Map<string, string[]>;
  focusRunId?: string;
  onSaveRun: (run: TransportRun) => Promise<void> | void;
  onChangeAssignment: (change: TransportAssignmentChangeInput) => Promise<void> | void;
  onDeleteRun: (runId: string) => Promise<void> | void;
  onSaveVehicle: (vehicle: Vehicle) => Promise<void> | void;
  onDeleteVehicle: (vehicleId: string) => Promise<void> | void;
  onSaveRouteSettings: (settings: TransportRouteSettings) => Promise<void> | void;
  onSaveMapLocation: (location: TransportMapLocation) => Promise<void> | void;
  onSaveAreaZone: (zone: TransportAreaZone) => Promise<void> | void;
  onDeleteAreaZone: (zoneId: string) => Promise<void> | void;
  onUpdateStatus: (
    run: TransportRun,
    recorder: RecorderProfile,
    pin: string,
    status: TransportRunStatus,
  ) => Promise<void> | void;
}

type ViewMode = "runs" | "vehicles" | "map";

export const TransportPanel: React.FC<TransportPanelProps> = ({
  runs,
  vehicles,
  routeSettings,
  mapLocations,
  areaZones,
  recorderProfiles,
  childrenList,
  schools,
  dailyChildPlans,
  transportPlanDays,
  dailyTransportRequirements,
  staffScheduleItems,
  attendanceRecords,
  calendarEvents,
  selectedDate,
  canManage,
  activeRecorder,
  warningsByRunId = new Map(),
  focusRunId,
  onSaveRun,
  onChangeAssignment,
  onDeleteRun,
  onSaveVehicle,
  onDeleteVehicle,
  onSaveRouteSettings,
  onSaveMapLocation,
  onSaveAreaZone,
  onDeleteAreaZone,
  onUpdateStatus,
}) => {
  const [view, setView] = useState<ViewMode>("runs");
  const [runForm, setRunForm] = useState<TransportRun | null>(null);
  const [dayPlannerOpen, setDayPlannerOpen] = useState(false);
  const [vehicleForm, setVehicleForm] = useState<Vehicle | null>(null);
  const [statusRun, setStatusRun] = useState<TransportRun | null>(null);
  const [statusRecorderId, setStatusRecorderId] = useState(
    activeRecorder?.id || "",
  );
  const [statusPin, setStatusPin] = useState("");
  const [error, setError] = useState("");
  const [routeSettingsForm, setRouteSettingsForm] = useState<TransportRouteSettings | null>(null);
  const [routeOrigin, setRouteOrigin] = useState("");
  const [routeDestination, setRouteDestination] = useState("");
  const [routePreview, setRoutePreview] = useState<TransportRouteOptimizationResult | null>(null);
  const [optimizingRoute, setOptimizingRoute] = useState(false);
  const [savingRouteSettings, setSavingRouteSettings] = useState(false);
  const [routeMessage, setRouteMessage] = useState("");
  const [assignmentRun, setAssignmentRun] = useState<TransportRun | null>(null);
  const [assignmentMode, setAssignmentMode] = useState<'assist' | 'reassign'>('assist');
  const [assignmentActorId, setAssignmentActorId] = useState(activeRecorder?.id || '');
  const [assignmentPin, setAssignmentPin] = useState('');
  const [assignmentDriverId, setAssignmentDriverId] = useState('');
  const [assignmentAssistantIds, setAssignmentAssistantIds] = useState<string[]>([]);
  const [assignmentReason, setAssignmentReason] = useState('支援対応');
  const [assignmentNote, setAssignmentNote] = useState('');
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentNotice, setAssignmentNotice] = useState('');
  const assignmentSnapshotRef = useRef<Map<string, string> | undefined>(undefined);
  const activeRecorders = useMemo(
    () => recorderProfiles.filter((profile) => profile.active),
    [recorderProfiles],
  );
  const dayRuns = useMemo(
    () =>
      runs
        .filter((run) => run.date === selectedDate)
        .sort((left, right) => left.startTime.localeCompare(right.startTime)),
    [runs, selectedDate],
  );

  useEffect(() => {
    const next = new Map(dayRuns.map((run) => [run.id, `${run.driverRecorderProfileId || ''}|${run.assistantRecorderProfileIds.join(',')}`]));
    const previous = assignmentSnapshotRef.current;
    assignmentSnapshotRef.current = next;
    if (!previous) return;
    const changed = dayRuns.find((run) => previous.has(run.id) && previous.get(run.id) !== next.get(run.id));
    if (!changed) return;
    setAssignmentNotice(`${changed.name}の送迎担当が更新されました。`);
    const timer = window.setTimeout(() => setAssignmentNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [dayRuns]);

  const openAssignmentDialog = (run: TransportRun, mode: 'assist' | 'reassign') => {
    setAssignmentRun(run);
    setAssignmentMode(mode);
    setAssignmentActorId(activeRecorder?.id || run.driverRecorderProfileId || '');
    setAssignmentPin('');
    setAssignmentDriverId(run.driverRecorderProfileId || '');
    setAssignmentAssistantIds([...run.assistantRecorderProfileIds]);
    setAssignmentReason(mode === 'assist' ? '支援対応' : '体調不良');
    setAssignmentNote('');
    setError('');
  };

  const submitAssignmentChange = async () => {
    if (!assignmentRun) return;
    if (!assignmentActorId || !assignmentPin) return setError('操作する職員と個人PINを入力してください。');
    if (assignmentMode === 'reassign' && !assignmentDriverId) return setError('変更後の運転担当者を選択してください。');
    const assistants = assignmentAssistantIds.filter((id) => id !== assignmentDriverId);
    const beforeDriver = assignmentRun.driverName || '未設定';
    const afterDriver = activeRecorders.find((profile) => profile.id === assignmentDriverId)?.displayName || '未設定';
    const changeLabel = assignmentMode === 'assist'
      ? `「${assignmentRun.name}」へ応援職員を追加・変更しますか？`
      : `「${assignmentRun.name}」の運転担当を ${beforeDriver} から ${afterDriver} へ変更しますか？`;
    if (!window.confirm(`${changeLabel}\n進行中の乗降状況はそのまま引き継がれます。`)) return;
    setAssignmentSaving(true);
    setError('');
    try {
      await onChangeAssignment({
        runId: assignmentRun.id,
        actorRecorderProfileId: assignmentActorId,
        actorPin: assignmentPin,
        driverRecorderProfileId: assignmentDriverId || undefined,
        assistantRecorderProfileIds: assistants,
        reason: `${assignmentReason}${assignmentNote.trim() ? `：${assignmentNote.trim()}` : ''}`,
      });
      setAssignmentRun(null);
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : '送迎担当を変更できませんでした。');
    } finally {
      setAssignmentSaving(false);
    }
  };

  const openRunEditor = (run: TransportRun) => {
    setRunForm({
      ...run,
      stops: run.stops.map((stop) => ({ ...stop })),
    });
    setRouteOrigin(run.routeOrigin || routeSettings.facilityAddress);
    setRouteDestination(run.routeDestination || routeSettings.facilityAddress);
    setRoutePreview(null);
    setRouteMessage("");
    setError("");
  };

  const saveRun = async () => {
    if (!runForm) return;
    if (!runForm.name.trim()) return setError("便名を入力してください。");
    if (runForm.startTime >= runForm.endTime)
      return setError("終了時刻は開始時刻より後にしてください。");
    if (runForm.stops.some((stop) => !stop.childId))
      return setError("児童が未選択の乗降地点があります。");
    if (runForm.stops.some((stop) => !stop.location.trim()))
      return setError("乗降場所が未入力の児童がいます。");
    await onSaveRun({
      ...runForm,
      name: runForm.name.trim(),
      driverName: activeRecorders.find(
        (profile) => profile.id === runForm.driverRecorderProfileId,
      )?.displayName,
      vehicleName: vehicles.find((vehicle) => vehicle.id === runForm.vehicleId)
        ?.name,
      stops: runForm.stops.map((stop, index) => ({
        ...stop,
        order: index + 1,
      })),
      routeOrigin: routeOrigin.trim() || undefined,
      routeDestination: routeDestination.trim() || undefined,
      updatedAt: new Date().toISOString(),
    });
    setRunForm(null);
    setRoutePreview(null);
  };

  const addStop = () => {
    if (!runForm) return;
    setRunForm({
      ...runForm,
      stops: [
        ...runForm.stops,
        {
          id: createUuid(),
          locationType: "学校",
          location: "",
          order: runForm.stops.length + 1,
        },
      ],
    });
  };

  const updateStop = (index: number, patch: Partial<TransportStop>) => {
    if (!runForm) return;
    setRunForm({
      ...runForm,
      routeOptimizedAt: undefined,
      stops: runForm.stops.map((stop, current) =>
        current === index ? { ...stop, ...patch } : stop,
      ),
    });
    setRoutePreview(null);
    setRouteMessage("");
  };

  const selectStopChild = (index: number, childId: string) => {
    if (!runForm) return;
    const child = childrenList.find((candidate) => candidate.id === childId);
    if (child?.serviceSuspended) return;
    const suggestion = child
      ? getSuggestedTransportLocation(child, runForm.direction, runForm.date)
      : undefined;
    updateStop(index, {
      childId: child?.id,
      childName: child?.name,
      locationProfileId: suggestion?.id,
      locationName: suggestion?.name,
      locationType:
        suggestion?.type || (runForm.direction === "迎え" ? "学校" : "自宅"),
      location: suggestion?.address || "",
      area: resolvedTransportArea(suggestion?.address, suggestion?.area),
      note: suggestion?.note,
    });
  };

  const selectStopLocation = (index: number, locationId: string) => {
    if (!runForm) return;
    const stop = runForm.stops[index];
    if (locationId === "one-time") {
      updateStop(index, {
        locationProfileId: undefined,
        locationName: "今回のみの送迎先",
        location: "",
        area: undefined,
        note: undefined,
      });
      return;
    }
    const child = childrenList.find((candidate) => candidate.id === stop.childId);
    const location = child
      ? getTransportLocationOptions(child, runForm.direction, runForm.date).find(
          (option) => option.id === locationId,
        )
      : undefined;
    if (!location) return;
    updateStop(index, {
      locationProfileId: location.id,
      locationName: location.name,
      locationType: location.type,
      location: location.address,
      area: resolvedTransportArea(location.address, location.area),
      note: location.note,
    });
  };

  const changeDirection = (direction: TransportDirection) => {
    if (!runForm) return;
    setRunForm({
      ...runForm,
      direction,
      name:
        runForm.name === "迎え便" || runForm.name === "送り便"
          ? `${direction}便`
          : runForm.name,
      stops: runForm.stops.map((stop) => {
        const child = childrenList.find(
          (candidate) => candidate.id === stop.childId,
        );
        const suggestion = child
          ? getSuggestedTransportLocation(child, direction, runForm.date)
          : undefined;
        return {
          ...stop,
          locationProfileId: suggestion?.id,
          locationName: suggestion?.name,
          locationType:
            suggestion?.type || (direction === "迎え" ? "学校" : "自宅"),
          location: suggestion?.address || "",
          note: suggestion?.note,
        };
      }),
    });
    setRoutePreview(null);
    setRouteMessage("");
  };

  const moveStop = (from: number, to: number) => {
    if (!runForm || to < 0 || to >= runForm.stops.length || from === to) return;
    const next = [...runForm.stops];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setRunForm({ ...runForm, stops: next });
  };

  const saveVehicle = async () => {
    if (!vehicleForm) return;
    if (!vehicleForm.name.trim()) return setError("車両名を入力してください。");
    if (vehicleForm.capacity < 1)
      return setError("乗車定員は1名以上にしてください。");
    await onSaveVehicle({
      ...vehicleForm,
      name: vehicleForm.name.trim(),
      updatedAt: new Date().toISOString(),
    });
    setVehicleForm(null);
  };

  const saveRouteSettings = async () => {
    if (!routeSettingsForm) return;
    if (!routeSettingsForm.facilityAddress.trim()) return setError("事業所住所を入力してください。");
    setSavingRouteSettings(true);
    setError("");
    try {
      await onSaveRouteSettings({
        ...routeSettingsForm,
        facilityAddress: routeSettingsForm.facilityAddress.trim(),
        stopDurationMinutes: Math.max(0, Math.min(30, Math.round(routeSettingsForm.stopDurationMinutes))),
      });
      setRouteOrigin(routeSettingsForm.facilityAddress.trim());
      setRouteDestination(routeSettingsForm.facilityAddress.trim());
      setRouteSettingsForm(null);
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : "経路設定を保存できませんでした。");
    } finally {
      setSavingRouteSettings(false);
    }
  };

  const requestRouteOptimization = async () => {
    if (!runForm) return;
    if (!routeOrigin.trim() || !routeDestination.trim()) return setError("出発地点と終着地点を入力してください。");
    if (runForm.stops.length === 0) return setError("乗降場所を1件以上登録してください。");
    if (runForm.stops.length > 10) return setError("費用管理のため、自動最適化は1便10地点までです。");
    if (runForm.stops.some((stop) => !stop.location.trim())) return setError("乗降場所が未入力の地点があります。");
    setOptimizingRoute(true);
    setRoutePreview(null);
    setRouteMessage("");
    setError("");
    try {
      const result = await optimizeTransportRoute({
        transportRunId: runForm.id,
        serviceDate: runForm.date,
        departureTime: runForm.startTime,
        origin: routeOrigin.trim(),
        destination: routeDestination.trim(),
        stops: runForm.stops.map((stop) => ({
          id: stop.id,
          label: stop.childName || stop.locationType,
          location: stop.location.trim(),
        })),
        avoidTolls: routeSettings.avoidTolls,
        avoidHighways: routeSettings.avoidHighways,
      });
      setRoutePreview(result);
    } catch (optimizationError) {
      setError(optimizationError instanceof Error ? optimizationError.message : "経路候補を作成できませんでした。");
    } finally {
      setOptimizingRoute(false);
    }
  };

  const applyOptimizedRoute = () => {
    if (!runForm || !routePreview) return;
    const currentStops = new Map(runForm.stops.map((stop) => [stop.id, stop]));
    const orderedStops = routePreview.optimizedStopIds
      .map((id) => currentStops.get(id))
      .filter((stop): stop is TransportStop => Boolean(stop));
    if (orderedStops.length !== runForm.stops.length) return setError("経路候補と現在の乗降地点が一致しません。もう一度候補を作成してください。");
    let elapsedSeconds = 0;
    const stops = orderedStops.map((stop, index) => {
      if (index > 0) elapsedSeconds += routeSettings.stopDurationMinutes * 60;
      elapsedSeconds += routePreview.legs[index]?.durationSeconds || 0;
      return {
        ...stop,
        order: index + 1,
        plannedTime: addMinutesToTime(runForm.startTime, Math.round(elapsedSeconds / 60)),
      };
    });
    const totalMinutes = Math.round(routePreview.totalDurationSeconds / 60)
      + routeSettings.stopDurationMinutes * orderedStops.length;
    setRunForm({
      ...runForm,
      stops,
      endTime: addMinutesToTime(runForm.startTime, totalMinutes),
      routeOrigin: routeOrigin.trim(),
      routeDestination: routeDestination.trim(),
      routeOptimizedAt: new Date().toISOString(),
    });
    setRoutePreview(null);
    setRouteMessage("最適化した順番と到着予定時刻を反映しました。最後に「送迎便を保存」を押してください。");
    setError("");
  };

  const submitStatus = async (status: TransportRunStatus) => {
    if (!statusRun) return;
    const recorder = activeRecorders.find(
      (profile) => profile.id === statusRecorderId,
    );
    if (!recorder) return setError("指導員を選択してください。");
    if (!/^\d{4,8}$/.test(statusPin))
      return setError("個人PINを4〜8桁で入力してください。");
    await onUpdateStatus(statusRun, recorder, statusPin, status);
    setStatusPin("");
    setStatusRun(null);
  };

  return (
    <div className="space-y-4">
      {assignmentNotice && <div className="fixed left-1/2 top-[max(5rem,calc(env(safe-area-inset-top)+4rem))] z-[95] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-2xl" role="status"><CheckCircle2 className="mr-2 inline h-5 w-5 text-teal-300" />{assignmentNotice}</div>}
      <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="grid grid-cols-3 gap-1">
          <button
            type="button"
            onClick={() => setView("runs")}
            className={`min-h-11 rounded-xl text-sm font-black ${view === "runs" ? "bg-slate-900 text-white" : "text-slate-600"}`}
          >
            <BusFront className="mr-2 inline h-5 w-5" />
            送迎便
          </button>
          <button
            type="button"
            onClick={() => setView("vehicles")}
            className={`min-h-11 rounded-xl text-sm font-black ${view === "vehicles" ? "bg-slate-900 text-white" : "text-slate-600"}`}
          >
            <CarFront className="mr-2 inline h-5 w-5" />
            車両台帳
          </button>
          <button
            type="button"
            onClick={() => setView("map")}
            className={`min-h-11 rounded-xl text-sm font-black ${view === "map" ? "bg-slate-900 text-white" : "text-slate-600"}`}
          >
            <MapPinned className="mr-2 inline h-5 w-5" />
            送迎マップ
          </button>
        </div>
      </section>

      {view === "runs" ? (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
            <div>
              <h3 className="font-black text-slate-900">
                {selectedDate} の送迎
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                運転者・添乗員・車両・乗降順をまとめて管理します。
              </p>
            </div>
            {canManage && (
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRouteSettingsForm({ ...routeSettings });
                    setError("");
                  }}
                  className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-black text-slate-700"
                >
                  <Settings2 className="h-4 w-4" />
                  経路設定
                </button>
                <button
                  type="button"
                  onClick={() => setDayPlannerOpen(true)}
                  className="flex min-h-11 items-center gap-2 rounded-xl bg-teal-600 px-4 text-sm font-black text-white"
                >
                  <Plus className="h-5 w-5" />
                  一日の送迎を組む
                </button>
              </div>
            )}
          </div>
          {dayRuns.length === 0 ? (
            <Empty text="送迎便は登録されていません。" />
          ) : (
            <div className="grid gap-3 p-3 lg:grid-cols-2">
              {dayRuns.map((run) => {
                const warnings = warningsByRunId.get(run.id) || [];
                const assigned =
                  activeRecorder &&
                  (run.driverRecorderProfileId === activeRecorder.id ||
                    run.assistantRecorderProfileIds.includes(
                      activeRecorder.id,
                    ));
                return (
                  <article
                    key={run.id}
                    className={`rounded-2xl border p-4 ${focusRunId === run.id ? "border-teal-500 ring-2 ring-teal-100" : warnings.length > 0 ? "border-amber-300" : "border-slate-200"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-black ${run.direction === "迎え" ? "bg-sky-100 text-sky-800" : "bg-violet-100 text-violet-800"}`}
                        >
                          {run.direction}
                        </span>
                        <h4 className="mt-2 text-lg font-black text-slate-900">
                          {run.name}
                        </h4>
                        <p className="text-sm text-slate-500">
                          {run.startTime}〜{run.endTime}・
                          {run.vehicleName || "車両未設定"}
                        </p>
                      </div>
                      <StatusBadge status={run.status} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm">
                      <span>
                        <strong className="block text-[10px] text-slate-400">
                          運転
                        </strong>
                        {run.driverName || "未設定"}
                      </span>
                      <span>
                        <strong className="block text-[10px] text-slate-400">
                          添乗
                        </strong>
                        {run.assistantRecorderProfileIds
                          .map(
                            (id) =>
                              activeRecorders.find(
                                (profile) => profile.id === id,
                              )?.displayName,
                          )
                          .filter(Boolean)
                          .join("、") || "なし"}
                      </span>
                    </div>
                    <ol className="mt-3 space-y-2">
                      {run.stops.map((stop, index) => (
                        <li
                          key={stop.id}
                          className="flex items-start gap-2 text-sm"
                        >
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-black text-white">
                            {index + 1}
                          </span>
                          <span>
                            <strong>
                              {stop.plannedTime || "時刻未定"}{" "}
                              {stop.childName || stop.locationType}
                            </strong>
                            {stop.locationName && (
                              <span className="ml-1 text-[10px] font-bold text-teal-700">
                                {stop.locationName}
                              </span>
                            )}
                            <span className="block text-xs text-slate-500">
                              {stop.location || "場所未登録"}
                            </span>
                            {stop.note && (
                              <span className="block text-[10px] font-bold text-amber-700">
                                注意：{stop.note}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ol>
                    {warnings.length > 0 && (
                      <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900">
                        {warnings.map((warning) => (
                          <p key={warning} className="flex gap-1">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            {warning}
                          </p>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(run.routeOrigin || routeSettings.facilityAddress)
                        && (run.routeDestination || routeSettings.facilityAddress)
                        && run.stops.length > 0 && (
                        <a
                          href={buildGoogleMapsUrl(
                            run.routeOrigin || routeSettings.facilityAddress,
                            run.routeDestination || routeSettings.facilityAddress,
                            run.stops.map((stop) => stop.location).filter(Boolean),
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="flex min-h-10 items-center rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-black text-sky-800"
                        >
                          <Navigation className="mr-1 h-4 w-4" />
                          地図で確認
                        </a>
                      )}
                      {(assigned || canManage) &&
                        run.status !== "帰着" &&
                        run.status !== "事業所到着" && (
                          <button
                            type="button"
                            onClick={() => {
                              setStatusRun(run);
                              setStatusRecorderId(
                                activeRecorder?.id ||
                                  run.driverRecorderProfileId ||
                                  "",
                              );
                              setError("");
                            }}
                            className="min-h-10 rounded-xl bg-teal-600 px-3 text-xs font-black text-white"
                          >
                            <UserRoundCheck className="mr-1 inline h-4 w-4" />
                            運行状態を更新
                          </button>
                        )}
                      {(assigned || canManage) && run.status !== "帰着" && run.status !== "事業所到着" && (
                        <button
                          type="button"
                          onClick={() => openAssignmentDialog(run, 'assist')}
                          className="min-h-10 rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-black text-sky-800"
                        >
                          <UserRoundPlus className="mr-1 inline h-4 w-4" />
                          応援を追加
                        </button>
                      )}
                      {(assigned || canManage) && run.status !== "帰着" && run.status !== "事業所到着" && (
                        <button
                          type="button"
                          onClick={() => openAssignmentDialog(run, 'reassign')}
                          className="min-h-10 rounded-xl border border-violet-200 bg-violet-50 px-3 text-xs font-black text-violet-800"
                        >
                          <ArrowRightLeft className="mr-1 inline h-4 w-4" />
                          担当変更
                        </button>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => openRunEditor(run)}
                          className="min-h-10 rounded-xl border border-slate-300 px-3 text-xs font-bold"
                        >
                          <PencilLine className="mr-1 inline h-4 w-4" />
                          詳細・経路
                        </button>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`${run.name}を削除しますか？`))
                              onDeleteRun(run.id);
                          }}
                          className="min-h-10 rounded-xl border border-rose-200 px-3 text-xs font-bold text-rose-700"
                        >
                          <Trash2 className="mr-1 inline h-4 w-4" />
                          削除
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : view === "vehicles" ? (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
            <div>
              <h3 className="font-black">車両台帳</h3>
              <p className="mt-1 text-xs text-slate-500">
                定員・設備・点検期限・利用可否を管理します。
              </p>
            </div>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  const now = new Date().toISOString();
                  setVehicleForm({
                    id: createUuid(),
                    name: "",
                    capacity: 7,
                    wheelchairAccessible: false,
                    vehicleKind: 'facility',
                    assignmentPriority: 100,
                    autoAssignmentPolicy: 'always',
                    available: true,
                    createdAt: now,
                    updatedAt: now,
                  });
                }}
                className="min-h-11 rounded-xl bg-teal-600 px-4 text-sm font-black text-white"
              >
                <Plus className="mr-1 inline h-5 w-5" />
                車両追加
              </button>
            )}
          </div>
          <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((vehicle) => (
              <article
                key={vehicle.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-black">{vehicle.name}</h4>
                    <p className="text-xs text-slate-500">
                      {vehicle.registrationNumber || "ナンバー未登録"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-black ${vehicle.available ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}
                  >
                    {vehicle.available ? "使用可" : "使用不可"}
                  </span>
                </div>
                <p className="mt-3 text-sm">
                  定員 {vehicle.capacity}名
                  {vehicle.wheelchairAccessible ? "・車椅子対応" : ""}
                </p>
                <p className="mt-1 text-xs font-bold text-slate-600">
                  {vehicle.vehicleKind === 'private' ? '自家用車' : vehicle.vehicleKind === 'reserve' ? '予備車' : '通常使用車'}
                  ・優先 {vehicle.assignmentPriority || 100}
                  ・{vehicle.autoAssignmentPolicy === 'manual_only' ? '手動のみ' : vehicle.autoAssignmentPolicy === 'when_needed' ? '不足時のみ' : '自動配車'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  点検・車検期限：{vehicle.inspectionDueDate || "未登録"}
                </p>
                {canManage && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setVehicleForm({ ...vehicle })}
                      className="min-h-10 flex-1 rounded-lg border border-slate-300 text-sm font-bold"
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`${vehicle.name}を削除しますか？`))
                          onDeleteVehicle(vehicle.id);
                      }}
                      className="min-h-10 rounded-lg border border-rose-200 px-3 text-rose-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </article>
            ))}
            {vehicles.length === 0 && (
              <p className="col-span-full py-8 text-center text-sm text-slate-400">
                車両は登録されていません。
              </p>
            )}
          </div>
        </section>
      ) : (
        <React.Suspense fallback={<section className="grid min-h-72 place-items-center rounded-2xl border border-slate-200 bg-white"><span className="flex items-center gap-2 text-sm font-black text-slate-600"><LoaderCircle className="h-5 w-5 animate-spin" />送迎マップを読み込んでいます</span></section>}>
          <TransportMapPanel
            childrenList={childrenList}
            schools={schools}
            facilityAddress={routeSettings.facilityAddress}
            locations={mapLocations}
            zones={areaZones}
            canManage={canManage}
            onSaveLocation={onSaveMapLocation}
            onSaveZone={onSaveAreaZone}
            onDeleteZone={onDeleteAreaZone}
          />
        </React.Suspense>
      )}

      {runForm && (
        <Modal title="送迎便を編集" onClose={() => setRunForm(null)} wide>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold">
              便名
              <input
                value={runForm.name}
                onChange={(event) =>
                  setRunForm({ ...runForm, name: event.target.value })
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
              />
            </label>
            <label className="text-sm font-bold">
              区分
              <select
                value={runForm.direction}
                onChange={(event) =>
                  changeDirection(event.target.value as TransportDirection)
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
              >
                <option>迎え</option>
                <option>送り</option>
              </select>
            </label>
            <label className="text-sm font-bold">
              開始
              <input
                type="time"
                value={runForm.startTime}
                onChange={(event) =>
                  setRunForm({ ...runForm, startTime: event.target.value })
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
              />
            </label>
            <label className="text-sm font-bold">
              終了
              <input
                type="time"
                value={runForm.endTime}
                onChange={(event) =>
                  setRunForm({ ...runForm, endTime: event.target.value })
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
              />
            </label>
            <label className="text-sm font-bold">
              運転者
              <select
                value={runForm.driverRecorderProfileId || ""}
                onChange={(event) =>
                  setRunForm({
                    ...runForm,
                    driverRecorderProfileId: event.target.value || undefined,
                  })
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
              >
                <option value="">未設定</option>
                {activeRecorders.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-bold">
              車両
              <select
                value={runForm.vehicleId || ""}
                onChange={(event) =>
                  setRunForm({
                    ...runForm,
                    vehicleId: event.target.value || undefined,
                  })
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
              >
                <option value="">未設定</option>
                {vehicles.map((vehicle) => (
                  <option
                    key={vehicle.id}
                    value={vehicle.id}
                    disabled={!vehicle.available}
                  >
                    {vehicle.name}
                    {!vehicle.available ? "（使用不可）" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset>
            <legend className="text-sm font-bold">
              添乗職員（複数選択可）
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {activeRecorders
                .filter(
                  (profile) => profile.id !== runForm.driverRecorderProfileId,
                )
                .map((profile) => (
                  <label
                    key={profile.id}
                    className={`cursor-pointer rounded-full border px-3 py-2 text-sm font-bold ${runForm.assistantRecorderProfileIds.includes(profile.id) ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-300"}`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={runForm.assistantRecorderProfileIds.includes(
                        profile.id,
                      )}
                      onChange={() =>
                        setRunForm({
                          ...runForm,
                          assistantRecorderProfileIds: toggle(
                            runForm.assistantRecorderProfileIds,
                            profile.id,
                          ),
                        })
                      }
                    />
                    {profile.displayName}
                  </label>
                ))}
            </div>
          </fieldset>
          <section className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-black">乗降順</h4>
                <p className="text-xs text-slate-500">
                  PCはドラッグ、タブレットは上下ボタンで並べ替えできます。
                </p>
              </div>
              <button
                type="button"
                onClick={addStop}
                className="min-h-10 rounded-lg bg-slate-900 px-3 text-sm font-bold text-white"
              >
                <Plus className="mr-1 inline h-4 w-4" />
                追加
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {runForm.stops.map((stop, index) => {
                const child = childrenList.find(
                  (candidate) => candidate.id === stop.childId,
                );
                const locationOptions = child
                  ? getTransportLocationOptions(
                      child,
                      runForm.direction,
                      runForm.date,
                    )
                  : [];
                const selectedLocation =
                  locationOptions.find(
                    (option) => option.id === stop.locationProfileId,
                  ) ||
                  locationOptions.find(
                    (option) => option.address === stop.location,
                  );
                return (
                  <div
                    key={stop.id}
                    draggable
                    onDragStart={(event) =>
                      event.dataTransfer.setData("text/plain", String(index))
                    }
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) =>
                      moveStop(
                        Number(event.dataTransfer.getData("text/plain")),
                        index,
                      )
                    }
                    className="rounded-xl bg-slate-50 p-3"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <GripVertical className="h-5 w-5 text-slate-400" />
                      <strong className="mr-auto text-sm">{index + 1}番目</strong>
                      <button type="button" onClick={() => moveStop(index, index - 1)} className="grid h-9 w-9 place-items-center rounded-lg bg-white" aria-label="一つ上へ">
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => moveStop(index, index + 1)} className="grid h-9 w-9 place-items-center rounded-lg bg-white" aria-label="一つ下へ">
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setRunForm({
                            ...runForm,
                            routeOptimizedAt: undefined,
                            stops: runForm.stops.filter(
                              (_, current) => current !== index,
                            ),
                          })
                        }
                        className="grid h-9 w-9 place-items-center rounded-lg bg-white text-rose-600"
                        aria-label="乗降地点を削除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <label className="text-[10px] font-black text-slate-500">児童
                        <select value={stop.childId || ""} onChange={(event) => selectStopChild(index, event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900">
                          <option value="">児童を選択</option>
                          {childrenList.filter((candidate) => !candidate.serviceSuspended).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                        </select>
                      </label>
                      <label className="text-[10px] font-black text-slate-500">予定時刻
                        <input type="time" value={stop.plannedTime || ""} onChange={(event) => updateStop(index, { plannedTime: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900" />
                      </label>
                      <label className="text-[10px] font-black text-slate-500">場所の種類
                        <select value={stop.locationType} onChange={(event) => updateStop(index, { locationType: event.target.value as TransportStop["locationType"] })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900">
                          {TRANSPORT_LOCATION_TYPES.map((type) => <option key={type}>{type}</option>)}
                        </select>
                      </label>
                    </div>

                    {child && (
                      <label className="mt-2 block text-xs font-bold">
                        この便の送迎先
                        <select
                          value={selectedLocation?.id || "one-time"}
                          onChange={(event) => selectStopLocation(index, event.target.value)}
                          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
                        >
                          {locationOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.recommended ? "★ " : ""}{option.name}{!option.activeOnDate ? "（設定期間外・手動）" : ""}
                            </option>
                          ))}
                          <option value="one-time">今回のみ別の場所を入力</option>
                        </select>
                        {selectedLocation?.recommended && <span className="mt-1 block text-[10px] font-bold text-teal-700">選択日・曜日・送迎方向から自動提案しました。</span>}
                      </label>
                    )}

                    <label className="mt-2 block text-xs font-bold">
                      住所・乗降場所
                      <input value={stop.location} onChange={(event) => { const location = event.target.value; updateStop(index, { locationProfileId: undefined, locationName: "今回のみの送迎先", location, area: inferTransportArea(location) }); }} placeholder="都道府県・市区町村・番地、入口など" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3" />
                    </label>
                    <label className="mt-2 block text-xs font-bold">
                      乗降時の注意（任意）
                      <input value={stop.note || ""} onChange={(event) => updateStop(index, { note: event.target.value })} placeholder="例：到着前に連絡、北側入口で乗降" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3" />
                    </label>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="rounded-xl border border-sky-200 bg-sky-50/70 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h4 className="flex items-center gap-2 font-black text-sky-950"><Route className="h-5 w-5" />経路最適化</h4>
                <p className="mt-1 text-xs leading-relaxed text-sky-900">Google Routes APIで移動時間を基準に乗降順を提案します。候補を確認するまでは現在の順番を変更しません。</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRouteOrigin(routeSettings.facilityAddress);
                  setRouteDestination(routeSettings.facilityAddress);
                }}
                className="min-h-10 shrink-0 rounded-lg border border-sky-300 bg-white px-3 text-xs font-black text-sky-900"
              >
                  事業所住所を反映
              </button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-700">出発地点
                <input value={routeOrigin} onChange={(event) => { setRouteOrigin(event.target.value); setRoutePreview(null); }} placeholder="例：福岡県北九州市…" className="mt-1 min-h-11 w-full rounded-lg border border-sky-200 bg-white px-3 text-sm" />
              </label>
              <label className="text-xs font-bold text-slate-700">終着地点
                <input value={routeDestination} onChange={(event) => { setRouteDestination(event.target.value); setRoutePreview(null); }} placeholder="通常は事業所住所" className="mt-1 min-h-11 w-full rounded-lg border border-sky-200 bg-white px-3 text-sm" />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-600">
              <span className="rounded-full bg-white px-3 py-1.5">停車時間 {routeSettings.stopDurationMinutes}分</span>
              {routeSettings.avoidTolls && <span className="rounded-full bg-white px-3 py-1.5">有料道路を避ける</span>}
              {routeSettings.avoidHighways && <span className="rounded-full bg-white px-3 py-1.5">高速道路を避ける</span>}
              <span>1便10地点まで・実行時のみAPIを使用</span>
            </div>
            <button
              type="button"
              disabled={optimizingRoute || runForm.stops.length === 0}
              onClick={() => void requestRouteOptimization()}
              className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-black text-white disabled:opacity-50"
            >
              {optimizingRoute ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Route className="h-5 w-5" />}
              {optimizingRoute ? "経路を計算中…" : "経路候補を作成"}
            </button>
            {routePreview && (
              <div className="mt-3 rounded-xl border border-sky-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-black text-sky-700">最適化候補</p>
                    <p className="mt-1 font-black text-slate-950">{formatDistance(routePreview.totalDistanceMeters)}・走行約{formatDuration(routePreview.totalDurationSeconds)}</p>
                    <p className="mt-1 text-[10px] text-slate-500">停車時間は含みません。</p>
                  </div>
                  <a
                    href={buildGoogleMapsUrl(
                      routeOrigin,
                      routeDestination,
                      routePreview.optimizedStopIds.map((id) => runForm.stops.find((stop) => stop.id === id)?.location || "").filter(Boolean),
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-10 items-center rounded-lg border border-sky-200 px-3 text-xs font-black text-sky-800"
                  >
                    <ExternalLink className="mr-1 h-4 w-4" />Googleマップ
                  </a>
                </div>
                <ol className="mt-3 grid gap-2 sm:grid-cols-2">
                  {routePreview.optimizedStopIds.map((id, index) => {
                    const stop = runForm.stops.find((candidate) => candidate.id === id);
                    return <li key={id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sky-700 font-black text-white">{index + 1}</span><span className="min-w-0"><strong className="block truncate">{stop?.childName || stop?.locationType || "乗降地点"}</strong><span className="block truncate text-slate-500">{stop?.location}</span></span></li>;
                  })}
                </ol>
                {routePreview.warnings.map((warning) => <p key={warning} className="mt-2 text-[10px] font-bold text-amber-800">※ {warning}</p>)}
                <button type="button" onClick={applyOptimizedRoute} className="mt-3 min-h-12 w-full rounded-xl bg-teal-600 px-4 text-sm font-black text-white">この順番と予定時刻を反映</button>
              </div>
            )}
            {routeMessage && <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold leading-relaxed text-emerald-900">{routeMessage}</p>}
            <p className="mt-3 text-[10px] leading-relaxed text-slate-500">住所は経路計算時にGoogleへ送信されます。児童名・連絡事項・支援記録は送信しません。住所は正確性を確認してから運行してください。</p>
          </section>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold">
              保護者への連絡事項
              <textarea
                value={runForm.guardianNote || ""}
                onChange={(event) =>
                  setRunForm({ ...runForm, guardianNote: event.target.value })
                }
                className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 p-3"
              />
            </label>
            <label className="text-sm font-bold">
              運行メモ
              <textarea
                value={runForm.operationNote || ""}
                onChange={(event) =>
                  setRunForm({ ...runForm, operationNote: event.target.value })
                }
                className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 p-3"
              />
            </label>
          </div>
          {error && <ErrorMessage text={error} />}
          <button
            type="button"
            onClick={saveRun}
            className="min-h-12 w-full rounded-xl bg-teal-600 font-black text-white"
          >
            送迎便を保存
          </button>
        </Modal>
      )}

      {routeSettingsForm && (
        <Modal title="送迎経路設定" onClose={() => setRouteSettingsForm(null)}>
          <label className="block text-sm font-bold">事業所住所
            <input value={routeSettingsForm.facilityAddress} onChange={(event) => setRouteSettingsForm({ ...routeSettingsForm, facilityAddress: event.target.value })} placeholder="都道府県・市区町村・番地まで入力" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" />
          </label>
          <label className="block text-sm font-bold">1地点あたりの停車時間（分）
            <input type="number" min="0" max="30" value={routeSettingsForm.stopDurationMinutes} onChange={(event) => setRouteSettingsForm({ ...routeSettingsForm, stopDurationMinutes: Number(event.target.value) })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" />
            <span className="mt-1 block text-[10px] font-normal text-slate-500">到着予定時刻の計算に使用します。乗降・確認に必要な平均時間を設定してください。</span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-bold">休日の開所時刻<input type="time" value={routeSettingsForm.holidayOpeningTime} onChange={(event) => setRouteSettingsForm({ ...routeSettingsForm, holidayOpeningTime: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /><span className="mt-1 block text-[10px] font-normal text-slate-500">休日の自動配車は原則この時刻以降に出発します。</span></label>
            <label className="block text-sm font-bold">長期休暇の来所目標<input type="time" value={routeSettingsForm.holidayArrivalTime} onChange={(event) => setRouteSettingsForm({ ...routeSettingsForm, holidayArrivalTime: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
            <label className="block text-sm font-bold">学校待機許容（分）<input type="number" min="0" max="60" value={routeSettingsForm.schoolWaitToleranceMinutes} onChange={(event) => setRouteSettingsForm({ ...routeSettingsForm, schoolWaitToleranceMinutes: Number(event.target.value) })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
            <label className="block text-sm font-bold">施設内の最低職員数<input type="number" min="0" max="30" value={routeSettingsForm.minimumFacilityStaff} onChange={(event) => setRouteSettingsForm({ ...routeSettingsForm, minimumFacilityStaff: Number(event.target.value) })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
          </div>
          <fieldset className="rounded-xl border border-violet-200 bg-violet-50 p-3">
            <legend className="px-1 text-sm font-black text-violet-950">退所予定時刻の基本設定</legend>
            <p className="mb-3 text-[10px] leading-relaxed text-violet-800">児童の所属区分と当日の利用形態から自動設定します。早退・延長は日別利用予定で当日だけ変更できます。</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-bold text-violet-950">平日・小学部<input type="time" value={routeSettingsForm.weekdayElementaryDepartureTime} onChange={(event) => setRouteSettingsForm({ ...routeSettingsForm, weekdayElementaryDepartureTime: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm" /></label>
              <label className="block text-xs font-bold text-violet-950">平日・キャリアズ<input type="time" value={routeSettingsForm.weekdayCareersDepartureTime} onChange={(event) => setRouteSettingsForm({ ...routeSettingsForm, weekdayCareersDepartureTime: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm" /></label>
              <label className="block text-xs font-bold text-violet-950">休日・共通<input type="time" value={routeSettingsForm.holidayDepartureTime} onChange={(event) => setRouteSettingsForm({ ...routeSettingsForm, holidayDepartureTime: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm" /></label>
            </div>
          </fieldset>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-bold"><input type="checkbox" checked={routeSettingsForm.avoidTolls} onChange={(event) => setRouteSettingsForm({ ...routeSettingsForm, avoidTolls: event.target.checked })} />有料道路を避ける</label>
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-bold"><input type="checkbox" checked={routeSettingsForm.avoidHighways} onChange={(event) => setRouteSettingsForm({ ...routeSettingsForm, avoidHighways: event.target.checked })} />高速道路を避ける</label>
          </div>
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">経路は安全性、道路規制、当日の交通状況を保証するものではありません。運転者が最終確認してください。</p>
          {error && <ErrorMessage text={error} />}
          <button type="button" disabled={savingRouteSettings} onClick={() => void saveRouteSettings()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-600 font-black text-white disabled:opacity-60">{savingRouteSettings && <LoaderCircle className="h-5 w-5 animate-spin" />}{savingRouteSettings ? "保存中…" : "経路設定を保存"}</button>
        </Modal>
      )}

      {vehicleForm && (
        <Modal title="車両を編集" onClose={() => setVehicleForm(null)}>
          <label className="block text-sm font-bold">
            車両名
            <input
              value={vehicleForm.name}
              onChange={(event) =>
                setVehicleForm({ ...vehicleForm, name: event.target.value })
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
            />
          </label>
          <label className="block text-sm font-bold">
            ナンバー
            <input
              value={vehicleForm.registrationNumber || ""}
              onChange={(event) =>
                setVehicleForm({
                  ...vehicleForm,
                  registrationNumber: event.target.value,
                })
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
            />
          </label>
          <label className="block text-sm font-bold">
            乗車定員
            <input
              type="number"
              min="1"
              value={vehicleForm.capacity}
              onChange={(event) =>
                setVehicleForm({
                  ...vehicleForm,
                  capacity: Number(event.target.value),
                })
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-bold">
              車両区分
              <select value={vehicleForm.vehicleKind || 'facility'} onChange={(event) => setVehicleForm({ ...vehicleForm, vehicleKind: event.target.value as Vehicle['vehicleKind'], autoAssignmentPolicy: event.target.value === 'private' ? 'manual_only' : vehicleForm.autoAssignmentPolicy || 'always' })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3">
                <option value="facility">通常使用車</option>
                <option value="reserve">予備車</option>
                <option value="private">職員の自家用車</option>
              </select>
            </label>
            <label className="block text-sm font-bold">
              使用優先順
              <input type="number" min="1" max="999" value={vehicleForm.assignmentPriority || 100} onChange={(event) => setVehicleForm({ ...vehicleForm, assignmentPriority: Number(event.target.value) })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" />
              <span className="mt-1 block text-[10px] font-normal text-slate-500">小さい数値の車両から使用します。</span>
            </label>
          </div>
          <label className="block text-sm font-bold">
            自動配車での使用
            <select value={vehicleForm.autoAssignmentPolicy || 'always'} onChange={(event) => setVehicleForm({ ...vehicleForm, autoAssignmentPolicy: event.target.value as Vehicle['autoAssignmentPolicy'] })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3">
              <option value="always">優先順に自動使用</option>
              <option value="when_needed">通常車で不足した場合のみ</option>
              <option value="manual_only">自動では使用しない</option>
            </select>
          </label>
          {vehicleForm.vehicleKind === 'private' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-bold">所有職員<select value={vehicleForm.ownerRecorderProfileId || ''} onChange={(event) => setVehicleForm({ ...vehicleForm, ownerRecorderProfileId: event.target.value || undefined })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3"><option value="">未設定</option>{recorderProfiles.filter((profile) => profile.active).map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}</select></label>
              <label className="block text-sm font-bold">保険期限<input type="date" value={vehicleForm.insuranceDueDate || ''} onChange={(event) => setVehicleForm({ ...vehicleForm, insuranceDueDate: event.target.value || undefined })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
            </div>
          )}
          <label className="block text-sm font-bold">
            点検・車検期限
            <input
              type="date"
              value={vehicleForm.inspectionDueDate || ""}
              onChange={(event) =>
                setVehicleForm({
                  ...vehicleForm,
                  inspectionDueDate: event.target.value || undefined,
                })
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-3">
              <input
                type="checkbox"
                checked={vehicleForm.wheelchairAccessible}
                onChange={(event) =>
                  setVehicleForm({
                    ...vehicleForm,
                    wheelchairAccessible: event.target.checked,
                  })
                }
              />
              車椅子対応
            </label>
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-3">
              <input
                type="checkbox"
                checked={vehicleForm.available}
                onChange={(event) =>
                  setVehicleForm({
                    ...vehicleForm,
                    available: event.target.checked,
                  })
                }
              />
              使用可能
            </label>
          </div>
          <label className="block text-sm font-bold">
            補足
            <textarea
              value={vehicleForm.note || ""}
              onChange={(event) =>
                setVehicleForm({ ...vehicleForm, note: event.target.value })
              }
              className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 p-3"
            />
          </label>
          {error && <ErrorMessage text={error} />}
          <button
            type="button"
            onClick={saveVehicle}
            className="min-h-12 w-full rounded-xl bg-teal-600 font-black text-white"
          >
            車両を保存
          </button>
        </Modal>
      )}

      {assignmentRun && (
        <Modal
          title={assignmentMode === 'assist' ? '応援職員を追加' : '送迎担当を変更'}
          onClose={() => !assignmentSaving && setAssignmentRun(null)}
        >
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-black text-teal-700">{assignmentRun.date}・{assignmentRun.direction}</p>
            <h4 className="mt-1 text-base font-black text-slate-950">{assignmentRun.name}</h4>
            <p className="mt-1 text-xs text-slate-600">{assignmentRun.startTime}～{assignmentRun.endTime}・現在の運転 {assignmentRun.driverName || '未設定'}</p>
          </section>

          {assignmentMode === 'reassign' && (
            <label className="block text-sm font-black text-slate-800">変更後の運転担当者
              <select value={assignmentDriverId} onChange={(event) => { const driverId = event.target.value; setAssignmentDriverId(driverId); setAssignmentAssistantIds((ids) => ids.filter((id) => id !== driverId)); }} className="mt-1 min-h-12 w-full rounded-xl border border-violet-300 bg-violet-50 px-3 text-sm font-bold">
                <option value="">選択してください</option>
                {activeRecorders.map((profile) => <option key={profile.id} value={profile.id}>{assignmentAvailabilityLabel(profile, selectedDate, attendanceRecords, dayRuns, assignmentRun)}</option>)}
              </select>
            </label>
          )}

          <fieldset>
            <legend className="text-sm font-black text-slate-800">{assignmentMode === 'assist' ? '追加する応援職員' : '添乗・応援職員'}</legend>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">対応可能状態を確認し、必要な職員だけを選択してください。運転担当者は重複選択できません。</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {activeRecorders.filter((profile) => profile.id !== assignmentDriverId).map((profile) => {
                const selected = assignmentAssistantIds.includes(profile.id);
                return <label key={profile.id} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-bold ${selected ? 'border-sky-400 bg-sky-50 text-sky-950' : 'border-slate-200 bg-white text-slate-600'}`}><input type="checkbox" checked={selected} onChange={() => setAssignmentAssistantIds((ids) => selected ? ids.filter((id) => id !== profile.id) : [...ids, profile.id])} className="h-4 w-4 accent-sky-600" /><span>{assignmentAvailabilityLabel(profile, selectedDate, attendanceRecords, dayRuns, assignmentRun)}</span></label>;
              })}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-black text-slate-800">変更理由
              <select value={assignmentReason} onChange={(event) => setAssignmentReason(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
                {['支援対応', '体調不良', '車両対応', '遅延対応', '休憩調整', 'その他'].map((reason) => <option key={reason}>{reason}</option>)}
              </select>
            </label>
            <label className="block text-sm font-black text-slate-800">補足（任意）
              <input value={assignmentNote} onChange={(event) => setAssignmentNote(event.target.value)} maxLength={200} placeholder="交代理由や引継事項" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" />
            </label>
          </div>

          <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-black text-amber-950">操作する職員を記録します</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-bold text-amber-950">職員
                <select value={assignmentActorId} onChange={(event) => setAssignmentActorId(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm"><option value="">選択してください</option>{activeRecorders.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}</select>
              </label>
              <label className="text-xs font-bold text-amber-950">個人PIN
                <input type="password" inputMode="numeric" value={assignmentPin} onChange={(event) => setAssignmentPin(event.target.value.replace(/\D/g, '').slice(0, 8))} className="mt-1 min-h-11 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm" />
              </label>
            </div>
          </section>

          <p className="rounded-xl bg-teal-50 p-3 text-[11px] leading-relaxed text-teal-900">乗降順・運行状況・登録済み時刻は変更せず、新しい担当者へ引き継ぎます。確定後は開いている各端末へ即時反映されます。</p>
          {error && <ErrorMessage text={error} />}
          <button type="button" disabled={assignmentSaving} onClick={() => void submitAssignmentChange()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 text-sm font-black text-white disabled:opacity-60">{assignmentSaving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : assignmentMode === 'assist' ? <UserRoundPlus className="h-5 w-5" /> : <ArrowRightLeft className="h-5 w-5" />}{assignmentSaving ? '変更中…' : assignmentMode === 'assist' ? '応援職員を反映' : '担当変更を確定'}</button>
        </Modal>
      )}

      {statusRun && (
        <Modal
          title={`${statusRun.name}の運行状態`}
          onClose={() => setStatusRun(null)}
        >
          <label className="block text-sm font-bold">
            更新する指導員
            <select
              value={statusRecorderId}
              onChange={(event) => setStatusRecorderId(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
            >
              <option value="">選択してください</option>
              {activeRecorders.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-bold">
            個人PIN
            <input
              type="password"
              inputMode="numeric"
              value={statusPin}
              onChange={(event) =>
                setStatusPin(event.target.value.replace(/\D/g, "").slice(0, 8))
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
            />
          </label>
          <p className="text-sm text-slate-600">
            現在：<strong>{statusRun.status}</strong>
          </p>
          {error && <ErrorMessage text={error} />}
          <div className="grid grid-cols-2 gap-2">
            {getNextStatuses(statusRun).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => submitStatus(status)}
                className="min-h-12 rounded-xl bg-teal-600 px-3 text-sm font-black text-white"
              >
                <CheckCircle2 className="mr-1 inline h-5 w-5" />
                {status}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {dayPlannerOpen && (
        <DailyTransportPlanner
          date={selectedDate}
          runs={dayRuns}
          vehicles={vehicles}
          recorderProfiles={recorderProfiles}
          childrenList={childrenList}
          dailyChildPlans={dailyChildPlans}
          transportPlanDay={transportPlanDays.find((day) => day.date === selectedDate)}
          dailyTransportRequirements={dailyTransportRequirements.filter((requirement) => requirement.date === selectedDate)}
          routeSettings={routeSettings}
          transportMapLocations={mapLocations}
          transportAreaZones={areaZones}
          staffScheduleItems={staffScheduleItems}
          attendanceRecords={attendanceRecords}
          calendarEvents={calendarEvents}
          onSaveRun={onSaveRun}
          onDeleteRun={onDeleteRun}
          onClose={() => setDayPlannerOpen(false)}
        />
      )}
    </div>
  );
};

const Modal = ({
  title,
  onClose,
  wide,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) => (
  <div
    className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-4"
    role="dialog"
    aria-modal="true"
  >
    <div
      className={`max-h-[94dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl ${wide ? "max-w-3xl" : "max-w-lg"}`}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-black">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="grid h-10 w-10 place-items-center rounded-full bg-slate-100"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  </div>
);
const Empty = ({ text }: { text: string }) => (
  <div className="p-10 text-center">
    <MapPin className="mx-auto h-9 w-9 text-slate-300" />
    <p className="mt-2 text-sm text-slate-400">{text}</p>
  </div>
);
const ErrorMessage = ({ text }: { text: string }) => (
  <p className="flex gap-2 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">
    <AlertTriangle className="h-5 w-5 shrink-0" />
    {text}
  </p>
);
const StatusBadge = ({ status }: { status: TransportRunStatus }) => (
  <span
    className={`rounded-full px-2.5 py-1 text-[10px] font-black ${status === "未出発" ? "bg-slate-100 text-slate-700" : ["事業所到着", "帰着"].includes(status) ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"}`}
  >
    {status}
  </span>
);
function toggle(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((current) => current !== value)
    : [...values, value];
}
function getNextStatuses(run: TransportRun): TransportRunStatus[] {
  if (run.status === "未出発") return ["出発済み"];
  if (run.status === "出発済み")
    return run.direction === "迎え"
      ? ["乗車済み", "事業所到着"]
      : ["降車済み", "帰着"];
  if (run.status === "乗車済み") return ["事業所到着"];
  if (run.status === "降車済み") return ["帰着"];
  return [];
}
function addMinutesToTime(value: string, minutes: number) {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  const total = (hour * 60 + minute + Math.max(0, minutes)) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.max(0, Math.round(meters))}m`;
  return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)}km`;
}
function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}時間${remainder}分` : `${hours}時間`;
}
function buildGoogleMapsUrl(origin: string, destination: string, waypoints: string[]) {
  const parameters = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "driving",
  });
  if (waypoints.length > 0) parameters.set("waypoints", waypoints.join("|"));
  return `https://www.google.com/maps/dir/?${parameters.toString()}`;
}
function createUuid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `transport-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
