import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BusFront,
  CarFront,
  CheckCircle2,
  GripVertical,
  MapPin,
  PencilLine,
  Plus,
  Trash2,
  UserRoundCheck,
  X,
} from "lucide-react";
import type {
  ChildProfile,
  RecorderProfile,
  TransportDirection,
  TransportRun,
  TransportRunStatus,
  TransportStop,
  Vehicle,
} from "../types";

interface TransportPanelProps {
  runs: TransportRun[];
  vehicles: Vehicle[];
  recorderProfiles: RecorderProfile[];
  childrenList: ChildProfile[];
  selectedDate: string;
  canManage: boolean;
  activeRecorder?: RecorderProfile;
  warningsByRunId?: Map<string, string[]>;
  focusRunId?: string;
  onSaveRun: (run: TransportRun) => Promise<void> | void;
  onDeleteRun: (runId: string) => Promise<void> | void;
  onSaveVehicle: (vehicle: Vehicle) => Promise<void> | void;
  onDeleteVehicle: (vehicleId: string) => Promise<void> | void;
  onUpdateStatus: (
    run: TransportRun,
    recorder: RecorderProfile,
    pin: string,
    status: TransportRunStatus,
  ) => Promise<void> | void;
}

type ViewMode = "runs" | "vehicles";

export const TransportPanel: React.FC<TransportPanelProps> = ({
  runs,
  vehicles,
  recorderProfiles,
  childrenList,
  selectedDate,
  canManage,
  activeRecorder,
  warningsByRunId = new Map(),
  focusRunId,
  onSaveRun,
  onDeleteRun,
  onSaveVehicle,
  onDeleteVehicle,
  onUpdateStatus,
}) => {
  const [view, setView] = useState<ViewMode>("runs");
  const [runForm, setRunForm] = useState<TransportRun | null>(null);
  const [vehicleForm, setVehicleForm] = useState<Vehicle | null>(null);
  const [statusRun, setStatusRun] = useState<TransportRun | null>(null);
  const [statusRecorderId, setStatusRecorderId] = useState(
    activeRecorder?.id || "",
  );
  const [statusPin, setStatusPin] = useState("");
  const [error, setError] = useState("");
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

  const openNewRun = () => {
    const now = new Date().toISOString();
    setError("");
    setRunForm({
      id: createUuid(),
      date: selectedDate,
      name: "迎え便",
      direction: "迎え",
      startTime: "13:00",
      endTime: "14:00",
      assistantRecorderProfileIds: [],
      stops: [],
      status: "未出発",
      createdAt: now,
      updatedAt: now,
    });
  };

  const saveRun = async () => {
    if (!runForm) return;
    if (!runForm.name.trim()) return setError("便名を入力してください。");
    if (runForm.startTime >= runForm.endTime)
      return setError("終了時刻は開始時刻より後にしてください。");
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
      updatedAt: new Date().toISOString(),
    });
    setRunForm(null);
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
      stops: runForm.stops.map((stop, current) =>
        current === index ? { ...stop, ...patch } : stop,
      ),
    });
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
      <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="grid grid-cols-2 gap-1">
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
              <button
                type="button"
                onClick={openNewRun}
                className="flex min-h-11 items-center gap-2 rounded-xl bg-teal-600 px-4 text-sm font-black text-white"
              >
                <Plus className="h-5 w-5" />
                便を追加
              </button>
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
                            <span className="block text-xs text-slate-500">
                              {stop.location || "場所未登録"}
                            </span>
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
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => {
                            setRunForm({
                              ...run,
                              stops: run.stops.map((stop) => ({ ...stop })),
                            });
                            setError("");
                          }}
                          className="min-h-10 rounded-xl border border-slate-300 px-3 text-xs font-bold"
                        >
                          <PencilLine className="mr-1 inline h-4 w-4" />
                          編集
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
      ) : (
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
                  setRunForm({
                    ...runForm,
                    direction: event.target.value as TransportDirection,
                  })
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
              {runForm.stops.map((stop, index) => (
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
                    <button
                      type="button"
                      onClick={() => moveStop(index, index - 1)}
                      className="grid h-9 w-9 place-items-center rounded-lg bg-white"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStop(index, index + 1)}
                      className="grid h-9 w-9 place-items-center rounded-lg bg-white"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setRunForm({
                          ...runForm,
                          stops: runForm.stops.filter(
                            (_, current) => current !== index,
                          ),
                        })
                      }
                      className="grid h-9 w-9 place-items-center rounded-lg bg-white text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <select
                      value={stop.childId || ""}
                      onChange={(event) => {
                        const child = childrenList.find(
                          (candidate) => candidate.id === event.target.value,
                        );
                        updateStop(index, {
                          childId: child?.id,
                          childName: child?.name,
                          location:
                            stop.location ||
                            (runForm.direction === "迎え"
                              ? child?.pickupLocation
                              : child?.dropoffLocation) ||
                            "",
                        });
                      }}
                      className="min-h-11 rounded-lg border border-slate-300 px-2"
                    >
                      <option value="">児童を選択</option>
                              {childrenList.map((child) => (
                          <option key={child.id} value={child.id}>
                            {child.name}
                          </option>
                        ))}
                    </select>
                    <input
                      type="time"
                      value={stop.plannedTime || ""}
                      onChange={(event) =>
                        updateStop(index, { plannedTime: event.target.value })
                      }
                      className="min-h-11 rounded-lg border border-slate-300 px-2"
                    />
                    <select
                      value={stop.locationType}
                      onChange={(event) =>
                        updateStop(index, {
                          locationType: event.target
                            .value as TransportStop["locationType"],
                        })
                      }
                      className="min-h-11 rounded-lg border border-slate-300 px-2"
                    >
                      <option>学校</option>
                      <option>自宅</option>
                      <option>事業所</option>
                      <option>その他</option>
                    </select>
                  </div>
                  <label className="mt-2 block text-xs font-bold">
                    乗降場所
                    <input
                      value={stop.location}
                      onChange={(event) =>
                        updateStop(index, { location: event.target.value })
                      }
                      className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3"
                    />
                  </label>
                </div>
              ))}
            </div>
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
function createUuid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `transport-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
