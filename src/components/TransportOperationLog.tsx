import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, LoaderCircle, Save, X } from 'lucide-react';
import type { TransportFieldAction, TransportOperationEvent, TransportRun, TransportStop } from '../types';
import { loadTransportOperationEvents, saveTransportOperationEvent } from '../services/dataService';

interface TransportOperationLogProps {
  serviceDate: string;
  runs: TransportRun[];
  canManage: boolean;
  onClose: () => void;
}

const eventLabel: Partial<Record<TransportFieldAction, string>> = {
  departed: '出発',
  arrived: '到着',
  boarded: '乗車',
  dropped_off: '降車',
  facility_arrived: '事業所到着',
  returned: '帰着',
};

function eventTime(event?: TransportOperationEvent) {
  if (!event?.eventAt) return '';
  const date = new Date(event.eventAt);
  if (Number.isNaN(date.getTime())) return event.eventAt.slice(11, 16);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function latestEvent(
  events: TransportOperationEvent[],
  runId: string,
  eventType: TransportFieldAction,
  stopId?: string,
) {
  return events.filter((event) => event.transportRunId === runId
    && event.eventType === eventType
    && event.stopId === stopId).at(-1);
}

export const TransportOperationLog: React.FC<TransportOperationLogProps> = ({ serviceDate, runs, canManage, onClose }) => {
  const [events, setEvents] = useState<TransportOperationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const reload = async () => {
    setLoading(true);
    setMessage('');
    try {
      setEvents(await loadTransportOperationEvents(runs.map((run) => run.id)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '送迎実績を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, [serviceDate, runs]);

  const completedCount = useMemo(() => runs.reduce((total, run) => total + run.stops.filter((stop) => Boolean(latestEvent(events, run.id, run.direction === '迎え' ? 'boarded' : 'dropped_off', stop.id))).length, 0), [events, runs]);
  const totalStops = useMemo(() => runs.reduce((total, run) => total + run.stops.length, 0), [runs]);

  return <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`${serviceDate}の送迎実績`}>
    <section className="flex max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 sm:p-5">
        <div><p className="text-[10px] font-black text-teal-700">乗車・到着時刻の確認と修正</p><h2 className="mt-1 text-lg font-black text-slate-950">{serviceDate} 送迎実績</h2><p className="mt-1 text-xs font-bold text-slate-500">完了 {completedCount}/{totalStops}地点・{canManage ? '時刻を直接修正できます' : '閲覧のみ'}</p></div>
        <button type="button" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700" aria-label="閉じる"><X className="h-5 w-5" /></button>
      </header>
      <div className="ui-scrollbar flex-1 space-y-4 overflow-y-auto bg-slate-50 p-3 sm:p-5">
        {message && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700" role="alert">{message}</p>}
        {loading ? <p className="p-10 text-center text-sm font-bold text-slate-500"><LoaderCircle className="mx-auto mb-2 h-6 w-6 animate-spin" />読み込み中</p> : runs.length === 0 ? <p className="rounded-xl bg-white p-10 text-center text-sm font-bold text-slate-500">この日の送迎便はありません。</p> : runs.map((run) => {
          const departure = latestEvent(events, run.id, 'departed');
          const finishType: TransportFieldAction = run.direction === '迎え' ? 'facility_arrived' : 'returned';
          const finish = latestEvent(events, run.id, finishType);
          return <article key={run.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="grid gap-3 bg-slate-950 p-4 text-white lg:grid-cols-[minmax(180px,1fr)_180px_180px]">
              <div><span className={`rounded-full px-2 py-1 text-[9px] font-black ${run.direction === '迎え' ? 'bg-sky-400 text-sky-950' : 'bg-violet-400 text-violet-950'}`}>{run.direction}</span><h3 className="mt-2 font-black">{run.name}</h3><p className="mt-1 text-[11px] text-slate-300">{run.vehicleName || '車両未設定'}・{run.driverName || '運転者未設定'}</p></div>
              <div className="rounded-xl bg-white p-2 text-slate-950"><OperationTimeEditor serviceDate={serviceDate} run={run} label="出発" eventType="departed" event={departure} canManage={canManage} onSaved={reload} /></div>
              <div className="rounded-xl bg-white p-2 text-slate-950"><OperationTimeEditor serviceDate={serviceDate} run={run} label={eventLabel[finishType] || '完了'} eventType={finishType} event={finish} canManage={canManage} onSaved={reload} /></div>
            </div>
            <div className="divide-y divide-slate-100">
              {run.stops.map((stop, index) => {
                const arrival = latestEvent(events, run.id, 'arrived', stop.id);
                const completedType: TransportFieldAction = run.direction === '迎え' ? 'boarded' : 'dropped_off';
                const completed = latestEvent(events, run.id, completedType, stop.id);
                return <div key={stop.id} className="grid gap-3 p-3 lg:grid-cols-[minmax(240px,1fr)_180px_180px] lg:items-center">
                  <StopLabel stop={stop} index={index} />
                  <OperationTimeEditor serviceDate={serviceDate} run={run} stop={stop} label="到着" eventType="arrived" event={arrival} canManage={canManage} onSaved={reload} />
                  <OperationTimeEditor serviceDate={serviceDate} run={run} stop={stop} label={eventLabel[completedType] || '完了'} eventType={completedType} event={completed} canManage={canManage} onSaved={reload} />
                </div>;
              })}
            </div>
          </article>;
        })}
      </div>
    </section>
  </div>;
};

const StopLabel = ({ stop, index }: { stop: TransportStop; index: number }) => <div className="flex min-w-0 items-start gap-3">
  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-black text-white">{index + 1}</span>
  <span className="min-w-0"><strong className="block truncate text-sm text-slate-950">{stop.childName || stop.locationName || '乗降地点'}</strong><span className="block truncate text-[10px] font-bold text-slate-500">予定 {stop.plannedTime || '未定'}・{stop.locationName || stop.locationType}</span></span>
</div>;

const OperationTimeEditor = ({ serviceDate, run, stop, label, eventType, event, canManage, onSaved }: {
  serviceDate: string;
  run: TransportRun;
  stop?: TransportStop;
  label: string;
  eventType: TransportFieldAction;
  event?: TransportOperationEvent;
  canManage: boolean;
  onSaved: () => Promise<void>;
}) => {
  const [time, setTime] = useState(eventTime(event));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setTime(eventTime(event)), [event?.id, event?.eventAt]);

  const save = async () => {
    if (!time) return setError('時刻を入力してください。');
    setBusy(true);
    setError('');
    try {
      await saveTransportOperationEvent({
        eventId: event?.id,
        runId: run.id,
        stopId: stop?.id,
        eventType,
        eventAt: new Date(`${serviceDate}T${time}:00`).toISOString(),
        note: '管理画面から時刻を手動修正',
      });
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) return <p className="flex min-h-11 items-center rounded-xl bg-slate-100 px-3 text-xs font-black text-slate-700"><Clock3 className="mr-2 h-4 w-4" />{label} {time || '未記録'}</p>;
  return <div><label className="block text-[9px] font-black text-slate-500">{label}{event ? '（記録済み）' : '（未記録）'}</label><div className="mt-1 flex gap-1"><input type="time" value={time} onChange={(change) => setTime(change.target.value)} className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-2 text-sm font-black text-slate-950" /><button type="button" disabled={busy || !time || time === eventTime(event)} onClick={() => void save()} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-700 text-white disabled:bg-slate-200 disabled:text-slate-400" aria-label={`${label}時刻を保存`}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : event && time === eventTime(event) ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}</button></div>{error && <p className="mt-1 text-[9px] font-bold text-rose-700">{error}</p>}</div>;
};
