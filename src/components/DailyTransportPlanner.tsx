import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Plus, Save, Trash2, Users, X } from 'lucide-react';
import type { ChildProfile, RecorderProfile, TransportDirection, TransportLocationType, TransportRun, TransportStop, Vehicle } from '../types';
import { getSuggestedTransportLocation, getTransportLocationOptions } from '../utils/transportLocations';

interface DailyTransportPlannerProps {
  date: string;
  runs: TransportRun[];
  vehicles: Vehicle[];
  recorderProfiles: RecorderProfile[];
  childrenList: ChildProfile[];
  onSaveRun: (run: TransportRun) => Promise<void> | void;
  onDeleteRun: (runId: string) => Promise<void> | void;
  onClose: () => void;
}

const LOCATION_TYPES: TransportLocationType[] = ['自宅', '学校', '学童', '習い事', '親族宅', '事業所', 'その他'];

const createUuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createRun = (date: string, direction: TransportDirection, sequence: number): TransportRun => {
  const now = new Date().toISOString();
  return {
    id: createUuid(),
    date,
    name: `${direction}${sequence}便`,
    direction,
    startTime: direction === '迎え' ? '13:00' : '17:00',
    endTime: direction === '迎え' ? '14:00' : '18:00',
    assistantRecorderProfileIds: [],
    stops: [],
    status: '未出発',
    createdAt: now,
    updatedAt: now,
  };
};

export const DailyTransportPlanner: React.FC<DailyTransportPlannerProps> = ({
  date,
  runs,
  vehicles,
  recorderProfiles,
  childrenList,
  onSaveRun,
  onDeleteRun,
  onClose,
}) => {
  const [drafts, setDrafts] = useState<TransportRun[]>(() => runs
    .map((run) => ({ ...run, stops: run.stops.map((stop) => ({ ...stop })), assistantRecorderProfileIds: [...run.assistantRecorderProfileIds] }))
    .sort((left, right) => left.startTime.localeCompare(right.startTime)));
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const activeRecorders = useMemo(() => recorderProfiles.filter((profile) => profile.active), [recorderProfiles]);

  const updateRun = (runId: string, patch: Partial<TransportRun>) => {
    setDrafts((current) => current.map((run) => run.id === runId ? { ...run, ...patch } : run));
  };

  const updateStop = (runId: string, stopIndex: number, patch: Partial<TransportStop>) => {
    setDrafts((current) => current.map((run) => run.id === runId
      ? { ...run, routeOptimizedAt: undefined, stops: run.stops.map((stop, index) => index === stopIndex ? { ...stop, ...patch } : stop) }
      : run));
  };

  const addRun = (direction: TransportDirection) => {
    const count = drafts.filter((run) => run.direction === direction).length + 1;
    setDrafts((current) => [...current, createRun(date, direction, count)]);
  };

  const removeRun = (run: TransportRun) => {
    if (!window.confirm(`${run.name}を当日の送迎計画から外しますか？`)) return;
    if (runs.some((saved) => saved.id === run.id)) setDeletedIds((current) => [...current, run.id]);
    setDrafts((current) => current.filter((candidate) => candidate.id !== run.id));
  };

  const addStop = (run: TransportRun) => {
    updateRun(run.id, {
      stops: [...run.stops, { id: createUuid(), locationType: run.direction === '迎え' ? '学校' : '自宅', location: '', order: run.stops.length + 1 }],
      routeOptimizedAt: undefined,
    });
  };

  const selectChild = (run: TransportRun, stopIndex: number, childId: string) => {
    const child = childrenList.find((candidate) => candidate.id === childId);
    if (!child) return updateStop(run.id, stopIndex, { childId: undefined, childName: undefined, location: '', locationName: undefined, locationProfileId: undefined });
    const suggestion = getSuggestedTransportLocation(child, run.direction, date);
    updateStop(run.id, stopIndex, {
      childId: child.id,
      childName: child.name,
      location: suggestion?.address || '',
      locationType: suggestion?.type || (run.direction === '迎え' ? '学校' : '自宅'),
      locationName: suggestion?.name,
      locationProfileId: suggestion?.source === 'registered' ? suggestion.id : undefined,
      note: suggestion?.note || '',
    });
  };

  const selectLocation = (run: TransportRun, stopIndex: number, optionId: string) => {
    const stop = run.stops[stopIndex];
    if (!optionId) {
      updateStop(run.id, stopIndex, { locationProfileId: undefined, locationName: '今回のみの送迎先' });
      return;
    }
    const child = childrenList.find((candidate) => candidate.id === stop.childId);
    const option = child ? getTransportLocationOptions(child, run.direction, date).find((candidate) => candidate.id === optionId) : undefined;
    if (!option) return;
    updateStop(run.id, stopIndex, {
      location: option.address,
      locationType: option.type,
      locationName: option.name,
      locationProfileId: option.source === 'registered' ? option.id : undefined,
      note: option.note || '',
    });
  };

  const moveStop = (run: TransportRun, index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= run.stops.length) return;
    const next = [...run.stops];
    [next[index], next[target]] = [next[target], next[index]];
    updateRun(run.id, { stops: next.map((stop, order) => ({ ...stop, order: order + 1 })), routeOptimizedAt: undefined });
  };

  const copyPreviousLocation = (run: TransportRun, stopIndex: number) => {
    const previous = run.stops[stopIndex - 1];
    if (!previous) return;
    updateStop(run.id, stopIndex, {
      location: previous.location,
      locationType: previous.locationType,
      locationName: previous.locationName ? `${previous.locationName}（同一場所）` : '前の児童と同じ場所',
      locationProfileId: undefined,
      note: previous.note,
    });
  };

  const saveAll = async () => {
    const invalidRun = drafts.find((run) => !run.name.trim() || run.startTime >= run.endTime);
    if (invalidRun) return setError(`${invalidRun.name || '名称未設定の便'}の便名または時刻を確認してください。`);
    const invalidStopRun = drafts.find((run) => run.stops.some((stop) => !stop.childId || !stop.location.trim()));
    if (invalidStopRun) return setError(`${invalidStopRun.name}に児童または乗降場所が未入力の地点があります。`);
    setSaving(true);
    setError('');
    try {
      for (const run of drafts) {
        await onSaveRun({
          ...run,
          name: run.name.trim(),
          driverName: activeRecorders.find((profile) => profile.id === run.driverRecorderProfileId)?.displayName,
          vehicleName: vehicles.find((vehicle) => vehicle.id === run.vehicleId)?.name,
          stops: run.stops.map((stop, index) => ({ ...stop, order: index + 1 })),
          updatedAt: new Date().toISOString(),
        });
      }
      for (const id of deletedIds) await onDeleteRun(id);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '当日の送迎を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ui-fade-in fixed inset-0 z-[100] flex flex-col bg-slate-100" role="dialog" aria-modal="true" aria-label={`${date}の全送迎を編集`}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2.5 shadow-sm sm:px-5">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-teal-700">一日送迎ボード</p>
          <h2 className="truncate text-base font-black text-slate-950 sm:text-xl">{date} の全送迎を組む</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="閉じる" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100"><X className="h-5 w-5" /></button>
      </header>

      <div className="ui-scrollbar flex-1 overflow-y-auto p-2 sm:p-4">
        <div className="mx-auto max-w-7xl space-y-3">
          <div className="flex flex-col gap-2 rounded-2xl border border-sky-200 bg-sky-50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-bold leading-relaxed text-sky-900">全便をこの画面で編集できます。兄弟など同じ送迎先は「前と同じ場所」を使い、突発的な送迎先は住所を直接変更してください。</p>
            <div className="grid shrink-0 grid-cols-2 gap-2">
              <button type="button" onClick={() => addRun('迎え')} className="min-h-11 rounded-xl bg-sky-600 px-3 text-xs font-black text-white"><Plus className="mr-1 inline h-4 w-4" />迎え便</button>
              <button type="button" onClick={() => addRun('送り')} className="min-h-11 rounded-xl bg-violet-600 px-3 text-xs font-black text-white"><Plus className="mr-1 inline h-4 w-4" />送り便</button>
            </div>
          </div>

          {drafts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Users className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-2 text-sm font-bold text-slate-500">上のボタンから迎え便・送り便を追加してください。</p></div>
          ) : drafts.map((run) => (
            <section key={run.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className={`border-b p-3 ${run.direction === '迎え' ? 'border-sky-200 bg-sky-50' : 'border-violet-200 bg-violet-50'}`}>
                <div className="grid gap-2 sm:grid-cols-[minmax(9rem,1fr)_auto_auto_auto_auto] sm:items-end">
                  <label className="text-[10px] font-black text-slate-600">便名<input value={run.name} onChange={(event) => updateRun(run.id, { name: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-black" /></label>
                  <label className="text-[10px] font-black text-slate-600">区分<select value={run.direction} onChange={(event) => updateRun(run.id, { direction: event.target.value as TransportDirection, routeOptimizedAt: undefined })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-bold"><option>迎え</option><option>送り</option></select></label>
                  <label className="text-[10px] font-black text-slate-600">開始<input type="time" value={run.startTime} onChange={(event) => updateRun(run.id, { startTime: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-bold" /></label>
                  <label className="text-[10px] font-black text-slate-600">終了<input type="time" value={run.endTime} onChange={(event) => updateRun(run.id, { endTime: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-bold" /></label>
                  <button type="button" onClick={() => removeRun(run)} className="min-h-10 rounded-lg border border-rose-200 bg-white px-3 text-xs font-black text-rose-700"><Trash2 className="mr-1 inline h-4 w-4" />便を削除</button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="text-[10px] font-black text-slate-600">運転者<select value={run.driverRecorderProfileId || ''} onChange={(event) => updateRun(run.id, { driverRecorderProfileId: event.target.value || undefined })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-bold"><option value="">未設定</option>{activeRecorders.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}</select></label>
                  <label className="text-[10px] font-black text-slate-600">車両<select value={run.vehicleId || ''} onChange={(event) => updateRun(run.id, { vehicleId: event.target.value || undefined })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-bold"><option value="">未設定</option>{vehicles.filter((vehicle) => vehicle.available || vehicle.id === run.vehicleId).map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}（定員{vehicle.capacity}名）</option>)}</select></label>
                </div>
                <details className="mt-2 rounded-xl border border-white/80 bg-white/70 p-2 text-xs">
                  <summary className="cursor-pointer font-black text-slate-700">添乗員・運行メモを設定</summary>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <fieldset>
                      <legend className="text-[10px] font-black text-slate-500">添乗員（複数選択可）</legend>
                      <div className="mt-1 flex flex-wrap gap-1.5">{activeRecorders.map((profile) => { const checked = run.assistantRecorderProfileIds.includes(profile.id); return <label key={profile.id} className={`flex min-h-9 items-center gap-1 rounded-lg border px-2 text-xs font-bold ${checked ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 bg-white text-slate-600'}`}><input type="checkbox" checked={checked} onChange={() => updateRun(run.id, { assistantRecorderProfileIds: checked ? run.assistantRecorderProfileIds.filter((id) => id !== profile.id) : [...run.assistantRecorderProfileIds, profile.id] })} />{profile.displayName}</label>; })}</div>
                    </fieldset>
                    <label className="text-[10px] font-black text-slate-500">運行メモ<textarea rows={2} value={run.operationNote || ''} onChange={(event) => updateRun(run.id, { operationNote: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm font-medium" /></label>
                  </div>
                </details>
              </div>

              <div className="space-y-2 p-2 sm:p-3">
                {run.stops.map((stop, stopIndex) => {
                  const child = childrenList.find((candidate) => candidate.id === stop.childId);
                  const locationOptions = child ? getTransportLocationOptions(child, run.direction, date) : [];
                  const selectedLocationId = stop.locationProfileId || locationOptions.find((option) => option.address === stop.location && option.type === stop.locationType)?.id || '';
                  return (
                    <article key={stop.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-black text-white">{stopIndex + 1}</span>
                        <select aria-label={`${run.name}の${stopIndex + 1}人目`} value={stop.childId || ''} onChange={(event) => selectChild(run, stopIndex, event.target.value)} className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-sm font-black"><option value="">児童を選択</option>{childrenList.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select>
                        <button type="button" aria-label="上へ" disabled={stopIndex === 0} onClick={() => moveStop(run, stopIndex, -1)} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-slate-600 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                        <button type="button" aria-label="下へ" disabled={stopIndex === run.stops.length - 1} onClick={() => moveStop(run, stopIndex, 1)} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-slate-600 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                        <button type="button" aria-label="地点を削除" onClick={() => updateRun(run.id, { stops: run.stops.filter((_, index) => index !== stopIndex) })} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-700"><Trash2 className="h-4 w-4" /></button>
                      </div>
                      {child && (
                        <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(9rem,0.8fr)_7rem_minmax(12rem,1.5fr)_7rem]">
                          <label className="text-[10px] font-black text-slate-500">登録送迎先<select value={selectedLocationId} onChange={(event) => selectLocation(run, stopIndex, event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold"><option value="">直接入力・今回のみ</option>{locationOptions.map((option) => <option key={option.id} value={option.id}>{option.recommended ? '★ ' : ''}{option.name}{!option.activeOnDate ? '（期間外）' : ''}</option>)}</select></label>
                          <label className="text-[10px] font-black text-slate-500">種類<select value={stop.locationType} onChange={(event) => updateStop(run.id, stopIndex, { locationType: event.target.value as TransportLocationType, locationProfileId: undefined })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold">{LOCATION_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
                          <label className="text-[10px] font-black text-slate-500">住所・乗降場所<input value={stop.location} onChange={(event) => updateStop(run.id, stopIndex, { location: event.target.value, locationProfileId: undefined, locationName: '今回のみの送迎先' })} placeholder="住所または施設名" className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></label>
                          <label className="text-[10px] font-black text-slate-500">予定時刻<input type="time" value={stop.plannedTime || ''} onChange={(event) => updateStop(run.id, stopIndex, { plannedTime: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold" /></label>
                        </div>
                      )}
                      {stopIndex > 0 && child && <button type="button" onClick={() => copyPreviousLocation(run, stopIndex)} className="mt-2 min-h-9 rounded-lg border border-teal-200 bg-teal-50 px-3 text-xs font-black text-teal-800"><Copy className="mr-1 inline h-4 w-4" />前の児童と同じ場所</button>}
                    </article>
                  );
                })}
                <button type="button" onClick={() => addStop(run)} className="min-h-11 w-full rounded-xl border-2 border-dashed border-teal-300 bg-teal-50 text-xs font-black text-teal-800"><Plus className="mr-1 inline h-4 w-4" />児童・乗降地点を追加</button>
              </div>
            </section>
          ))}
          <p className="rounded-xl bg-white p-3 text-[10px] font-bold leading-relaxed text-slate-500">経路最適化は保存後、各便カードの「詳細編集」から便ごとに実行できます。自動提案後も順番・住所は手動で変更できます。</p>
        </div>
      </div>

      <footer className="shrink-0 border-t border-slate-200 bg-white p-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)]">
        <div className="mx-auto flex max-w-7xl flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5 text-xs font-bold text-rose-700">{error}</div>
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
            <button type="button" onClick={onClose} className="min-h-12 rounded-xl border border-slate-300 px-5 text-sm font-black text-slate-600">キャンセル</button>
            <button type="button" disabled={saving} onClick={() => void saveAll()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 text-sm font-black text-white disabled:opacity-50">{saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save className="h-5 w-5" />}{saving ? '保存中…' : `全${drafts.length}便を保存`}</button>
          </div>
        </div>
      </footer>
    </div>
  );
};
