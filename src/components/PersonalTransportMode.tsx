import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BusFront,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  ExternalLink,
  HandHelping,
  LogOut,
  MapPin,
  Navigation,
  RefreshCw,
  Route,
  ShieldCheck,
  Undo2,
  Users,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type {
  TransportFieldAction,
  TransportFieldDashboard,
  TransportFieldEvent,
  TransportFieldRun,
  TransportFieldStop,
  UserProfile,
} from '../types';
import {
  cancelTransportFieldAction,
  loadPersonalTransportDashboard,
  recordTransportFieldAction,
  setTransportCover,
} from '../services/dataService';
import { enableDeviceNotifications } from '../utils/deviceNotifications';
import { getLocalDateString } from '../utils/weekdays';
import { PersonalAttendanceQrPunch } from './AttendanceQr';
import { TransportScheduleBoard } from './TransportScheduleBoard';

interface PersonalTransportModeProps {
  currentUser: UserProfile;
  onSignOut: () => void;
  onExit?: () => void;
}

const actionLabels: Record<TransportFieldAction, string> = {
  departed: '出発',
  arrived: '到着',
  boarded: '乗車',
  dropped_off: '降車',
  facility_arrived: '事業所到着',
  returned: '帰着',
  delay: '遅延連絡',
  help_requested: '応援要請',
};

const eventActive = (event: TransportFieldEvent) => !event.cancelledAt;
const findEvent = (events: TransportFieldEvent[], action: TransportFieldAction) =>
  [...events].reverse().find((event) => event.eventType === action && eventActive(event));

function shiftDate(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return getLocalDateString(date);
}

function formatTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 5);
  return new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function buildMapUrl(run: TransportFieldRun) {
  const locations = run.stops.map((stop) => stop.navigationLocation || stop.location).filter(Boolean);
  if (locations.length === 0) return '';
  const destination = locations.at(-1)!;
  const waypoints = locations.slice(0, -1);
  const parameters = new URLSearchParams({ api: '1', destination, travelmode: 'driving' });
  if (waypoints.length > 0) parameters.set('waypoints', waypoints.join('|'));
  return `https://www.google.com/maps/dir/?${parameters.toString()}`;
}

function buildStopMapUrl(stop: TransportFieldStop) {
  const destination = stop.navigationLocation || stop.location;
  if (!destination) return '';
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination, travelmode: 'driving' }).toString()}`;
}

export const PersonalTransportMode: React.FC<PersonalTransportModeProps> = ({ currentUser, onSignOut, onExit }) => {
  const [serviceDate, setServiceDate] = useState(getLocalDateString());
  const [view, setView] = useState<'mine' | 'all'>('mine');
  const [dashboard, setDashboard] = useState<TransportFieldDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [message, setMessage] = useState('');
  const [toast, setToast] = useState('');
  const [lastEvent, setLastEvent] = useState<{ id: string; label: string } | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const assignedRunIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    assignedRunIdsRef.current = new Set(dashboard?.myRuns.filter((run) => run.isAssigned).map((run) => run.id) || []);
  }, [dashboard]);

  const refresh = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      setDashboard(await loadPersonalTransportDashboard(serviceDate));
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '送迎情報を取得できませんでした。');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [serviceDate]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(false), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const handleOnline = () => { setOnline(true); void refresh(false); };
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refresh]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel(`transport-field:${currentUser.organizationId}:${serviceDate}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'transport_runs',
        filter: `organization_id=eq.${currentUser.organizationId}`,
      }, (payload) => {
        const previous = payload.old as { id?: string; driver_recorder_profile_id?: string; assistant_recorder_profile_ids?: string[] };
        const next = payload.new as { id?: string; driver_recorder_profile_id?: string; assistant_recorder_profile_ids?: string[] };
        const runId = next?.id || previous?.id || '';
        const wasAssigned = assignedRunIdsRef.current.has(runId)
          || previous?.driver_recorder_profile_id === currentUser.recorderProfileId
          || previous?.assistant_recorder_profile_ids?.includes(currentUser.recorderProfileId || '');
        const isAssigned = next?.driver_recorder_profile_id === currentUser.recorderProfileId
          || next?.assistant_recorder_profile_ids?.includes(currentUser.recorderProfileId || '');
        if (!wasAssigned && isAssigned) setToast('新しい送迎担当が割り当てられました');
        if (wasAssigned && !isAssigned) setToast('送迎担当が別の職員へ引き継がれました');
        void refresh(false);
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'transport_stop_events',
        filter: `organization_id=eq.${currentUser.organizationId}`,
      }, (payload) => {
        const event = payload.new as { event_type?: TransportFieldAction; transport_run_id?: string; recorder_profile_id?: string };
        if (event.recorder_profile_id !== currentUser.recorderProfileId) {
          setToast(`送迎便：${event.event_type ? actionLabels[event.event_type] : '状況更新'}`);
        }
        void refresh(false);
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'transport_run_covers',
        filter: `organization_id=eq.${currentUser.organizationId}`,
      }, () => void refresh(false))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [currentUser.organizationId, currentUser.recorderProfileId, refresh, serviceDate]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!lastEvent) return;
    const timer = window.setTimeout(() => setLastEvent(null), 8000);
    return () => window.clearTimeout(timer);
  }, [lastEvent]);

  const runs = view === 'mine' ? dashboard?.myRuns || [] : dashboard?.allRuns || [];
  const activeRunId = runs.some((run) => run.id === selectedRunId) ? selectedRunId : runs[0]?.id;
  const today = getLocalDateString();
  const dateLabel = useMemo(() => new Intl.DateTimeFormat('ja-JP', {
    month: 'long', day: 'numeric', weekday: 'short',
  }).format(new Date(`${serviceDate}T12:00:00`)), [serviceDate]);

  const submitAction = async (
    run: TransportFieldRun,
    action: TransportFieldAction,
    stop?: TransportFieldStop,
    note?: string,
  ) => {
    if (!online) {
      setMessage('オフライン中は送迎状況を共有できません。通信を確認し、必要な場合は事業所へ電話連絡してください。');
      return;
    }
    const key = `${run.id}:${stop?.id || 'run'}:${action}`;
    setBusyKey(key);
    setMessage('');
    try {
      const eventId = await recordTransportFieldAction(run.id, stop?.id, action, note);
      setLastEvent({ id: eventId, label: `${run.name}の「${actionLabels[action]}」` });
      setToast(`${actionLabels[action]}を登録しました`);
      await refresh(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '送迎状況を登録できませんでした。');
    } finally {
      setBusyKey('');
    }
  };

  const changeCover = async (run: TransportFieldRun, active: boolean) => {
    const prompt = active
      ? `${run.name}の応援に入りますか？\n送迎先などの詳細閲覧と運行操作が可能になり、履歴に記録されます。`
      : `${run.name}の応援を終了しますか？`;
    if (!window.confirm(prompt)) return;
    setBusyKey(`cover:${run.id}`);
    try {
      await setTransportCover(run.id, active);
      setView('mine');
      setToast(active ? '応援する送迎便へ追加しました' : '応援を終了しました');
      await refresh(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '応援状態を変更できませんでした。');
    } finally {
      setBusyKey('');
    }
  };

  const undoLastAction = async () => {
    if (!lastEvent) return;
    setBusyKey(`undo:${lastEvent.id}`);
    try {
      await cancelTransportFieldAction(lastEvent.id);
      setToast('直前の操作を取り消しました');
      setLastEvent(null);
      await refresh(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作を取り消せませんでした。');
    } finally {
      setBusyKey('');
    }
  };

  const requestNotifications = async () => {
    try {
      const result = await enableDeviceNotifications(currentUser.organizationId);
      setToast(result.pushEnabled ? 'バックグラウンド通知を有効にしました' : 'アプリを開いている間の通知を有効にしました');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '通知を有効にできませんでした。');
    }
  };

  return (
    <div className="min-h-dvh bg-slate-100 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-slate-900">
      <header className="app-safe-top sticky top-0 z-40 border-b border-slate-800 bg-slate-950 text-white shadow-lg">
        <div className="mx-auto flex min-h-16 max-w-3xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-600"><BusFront className="h-6 w-6" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold tracking-widest text-teal-300">個人端末・送迎モード</p>
            <h1 className="truncate text-base font-black">{currentUser.displayName}</h1>
          </div>
          {onExit && (
            <button type="button" onClick={onExit} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-700" aria-label="管理画面へ戻る" title="管理画面へ戻る"><Undo2 className="h-5 w-5" /></button>
          )}
          <button type="button" onClick={() => void requestNotifications()} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-700" aria-label="通知を有効にする"><Bell className="h-5 w-5" /></button>
          <button type="button" onClick={onSignOut} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-700" aria-label="ログアウト"><LogOut className="h-5 w-5" /></button>
        </div>
      </header>

      {toast && (
        <div className="fixed left-1/2 top-[max(5rem,calc(env(safe-area-inset-top)+4rem))] z-[100] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-2xl" role="status">
          <CheckCircle2 className="mr-2 inline h-5 w-5 text-teal-300" />{toast}
        </div>
      )}

      <main className="mx-auto max-w-3xl space-y-3 p-3 sm:p-4">
        {!online && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm font-bold text-rose-800">
            <AlertTriangle className="mr-2 inline h-5 w-5" />オフラインです。運行操作は送信されません。
          </div>
        )}

        {serviceDate === getLocalDateString() && <PersonalAttendanceQrPunch currentUser={currentUser} />}

        <section className="rounded-2xl bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setServiceDate((value) => shiftDate(value, -1))} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200" aria-label="前日"><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" onClick={() => setServiceDate(today)} className="min-w-0 flex-1 text-center">
              <span className="block text-sm font-black">{dateLabel}</span>
              <span className="text-[10px] font-bold text-teal-700">{serviceDate === today ? '本日' : '本日に戻る'}</span>
            </button>
            <button type="button" onClick={() => setServiceDate((value) => shiftDate(value, 1))} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200" aria-label="翌日"><ChevronRight className="h-5 w-5" /></button>
          </div>
          <div className="mt-3 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            <ModeButton active={view === 'mine'} onClick={() => setView('mine')} icon={Navigation} label={`自分の送迎 ${dashboard?.myRuns.length || 0}`} />
            <ModeButton active={view === 'all'} onClick={() => setView('all')} icon={Users} label={`全体 ${dashboard?.allRuns.length || 0}`} />
          </div>
        </section>

        {message && <p className="rounded-xl border border-rose-200 bg-white p-3 text-sm font-bold text-rose-700" role="alert">{message}</p>}

        {lastEvent && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
            <span><strong>{lastEvent.label}</strong>を登録しました。</span>
            <button type="button" disabled={busyKey === `undo:${lastEvent.id}`} onClick={() => void undoLastAction()} className="flex min-h-10 shrink-0 items-center gap-1 rounded-lg bg-white px-3 font-black shadow-sm"><Undo2 className="h-4 w-4" />取り消す</button>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500"><RefreshCw className="mx-auto mb-3 h-7 w-7 animate-spin" />送迎情報を読み込んでいます</div>
        ) : runs.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm"><BusFront className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-600">{view === 'mine' ? '担当する送迎はありません' : '登録された送迎便はありません'}</p>{view === 'mine' && <button type="button" onClick={() => setView('all')} className="mt-4 min-h-11 rounded-xl border border-teal-300 px-4 text-sm font-black text-teal-800">全体の送迎を確認</button>}</div>
        ) : (
          <div className="space-y-3">
            <TransportScheduleBoard runs={runs} selectedRunId={activeRunId} onSelectRun={setSelectedRunId} compact />
            <div className="flex items-center justify-between gap-2 px-1"><h2 className="text-sm font-black text-slate-900">選択中の送迎</h2><span className="text-[10px] font-bold text-slate-500">一覧または時間表から便を選択</span></div>
            {runs.filter((run) => run.id === activeRunId).map((run) => view === 'all' && !run.isAssigned && !run.isCovering
              ? <TransportSummaryCard key={run.id} run={run} busy={busyKey === `cover:${run.id}`} onCover={() => void changeCover(run, true)} />
              : <AssignedTransportCard key={run.id} run={run} busyKey={busyKey} onAction={submitAction} onEndCover={run.isCovering && !run.isAssigned ? () => void changeCover(run, false) : undefined} />)}
          </div>
        )}

        <section className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-[11px] leading-relaxed text-teal-950">
          <ShieldCheck className="mr-1 inline h-4 w-4" />この端末では支援経過記録・過去記録・全児童名簿を表示しません。送迎操作は職員名、端末、サーバー時刻とともに記録されます。
        </section>
      </main>
    </div>
  );
};

const ModeButton = ({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) => (
  <button type="button" onClick={onClick} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg text-xs font-black ${active ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600'}`}><Icon className="h-4 w-4" />{label}</button>
);

const TransportSummaryCard: React.FC<{ run: TransportFieldRun; busy: boolean; onCover: () => void }> = ({ run, busy, onCover }) => {
  const mapUrl = buildMapUrl(run);
  return <article className={`rounded-2xl border bg-white p-4 shadow-sm ${run.hasHelpRequest ? 'border-rose-400' : run.hasDelay ? 'border-amber-400' : 'border-slate-200'}`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2"><h2 className="font-black">{run.name}</h2><StatusBadge run={run} /></div>
        <p className="mt-1 text-xs text-slate-600">{run.direction}・{String(run.startTime).slice(0, 5)}〜{String(run.endTime).slice(0, 5)}</p>
      </div>
      <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black">{run.passengerCount}名</span>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
      <p className="rounded-lg bg-slate-50 p-2"><span className="block text-[10px] text-slate-500">担当</span><strong>{run.driverName || '未設定'}</strong></p>
      <p className="rounded-lg bg-slate-50 p-2"><span className="block text-[10px] text-slate-500">車両</span><strong>{run.vehicleName || '未設定'}</strong></p>
    </div>
    <ol className="mt-3 space-y-2">
      {run.stops.map((stop, index) => <li key={stop.id} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-900 text-[10px] font-black text-white">{index + 1}</span><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-950">{stop.plannedTime || '時刻未定'}　{stop.childName || stop.locationName || '乗降地点'}</strong><span className="mt-0.5 block truncate text-[10px] font-bold text-slate-500">{stop.locationName || stop.locationType}{stop.location ? `・${stop.location}` : ''}</span>{stop.permanentNote && <span className="mt-1 block rounded-md bg-amber-100 px-2 py-1 text-[9px] font-black text-amber-950">恒常連絡：{stop.permanentNote}</span>}</span></li>)}
    </ol>
    {(run.hasHelpRequest || run.hasDelay) && <p className={`mt-3 rounded-lg p-2 text-xs font-black ${run.hasHelpRequest ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-900'}`}>{run.hasHelpRequest ? '応援要請があります' : '遅延連絡があります'}</p>}
    {mapUrl && <a href={mapUrl} target="_blank" rel="noreferrer" className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 text-xs font-black text-sky-800"><Route className="h-4 w-4" />経路を地図で確認<ExternalLink className="h-3.5 w-3.5" /></a>}
    <button type="button" disabled={busy} onClick={onCover} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 text-sm font-black text-white disabled:bg-slate-400"><HandHelping className="h-5 w-5" />この便をカバーする</button>
  </article>
};

const AssignedTransportCard: React.FC<{
  run: TransportFieldRun;
  busyKey: string;
  onAction: (run: TransportFieldRun, action: TransportFieldAction, stop?: TransportFieldStop, note?: string) => void;
  onEndCover?: () => void;
}> = ({ run, busyKey, onAction, onEndCover }) => {
  const mapUrl = buildMapUrl(run);
  const departed = findEvent(run.runEvents, 'departed');
  const finished = findEvent(run.runEvents, run.direction === '迎え' ? 'facility_arrived' : 'returned');
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-slate-950 p-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black">{run.name}</h2>{run.isCovering && !run.isAssigned && <span className="rounded-full bg-amber-300 px-2 py-1 text-[9px] font-black text-amber-950">応援中</span>}</div><p className="mt-1 text-xs text-slate-300">{run.direction}・{run.vehicleName || '車両未設定'}・{run.driverName || '担当未設定'}</p></div>
          <StatusBadge run={run} dark />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {mapUrl && <a href={mapUrl} target="_blank" rel="noreferrer" className="flex min-h-10 items-center gap-1 rounded-lg bg-white/10 px-3 text-xs font-bold"><Route className="h-4 w-4" />地図を開く<ExternalLink className="h-3 w-3" /></a>}
          {onEndCover && <button type="button" onClick={onEndCover} className="min-h-10 rounded-lg border border-white/20 px-3 text-xs font-bold">応援を終了</button>}
        </div>
      </div>

      <div className="space-y-3 p-3">
        {!departed && <ActionButton label="送迎を出発" icon={Navigation} busy={busyKey === `${run.id}:run:departed`} onClick={() => onAction(run, 'departed')} />}
        {departed && <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-2 text-xs font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" />{formatTime(departed.eventAt)} 出発</p>}

        <ol className="space-y-3">
          {run.stops.map((stop, index) => <TransportStopCard key={stop.id} run={run} stop={stop} index={index} busyKey={busyKey} onAction={onAction} />)}
        </ol>

        {departed && !finished && (
          <ActionButton
            label={run.direction === '迎え' ? '事業所へ到着' : '事業所へ帰着'}
            icon={CheckCircle2}
            busy={busyKey === `${run.id}:run:${run.direction === '迎え' ? 'facility_arrived' : 'returned'}`}
            onClick={() => onAction(run, run.direction === '迎え' ? 'facility_arrived' : 'returned')}
          />
        )}
        {finished && <p className="rounded-xl bg-emerald-600 p-3 text-center text-sm font-black text-white">{formatTime(finished.eventAt)} {run.direction === '迎え' ? '事業所到着' : '帰着'}・運行完了</p>}

        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
          <button type="button" disabled={busyKey !== ''} onClick={() => onAction(run, 'delay')} className="min-h-11 rounded-xl border border-amber-300 bg-amber-50 text-xs font-black text-amber-900"><Clock3 className="mr-1 inline h-4 w-4" />遅れています</button>
          <button type="button" disabled={busyKey !== ''} onClick={() => window.confirm('他の職員へ応援を要請しますか？') && onAction(run, 'help_requested')} className="min-h-11 rounded-xl border border-rose-300 bg-rose-50 text-xs font-black text-rose-800"><HandHelping className="mr-1 inline h-4 w-4" />応援が必要</button>
        </div>
      </div>
    </article>
  );
};

const TransportStopCard: React.FC<{
  run: TransportFieldRun;
  stop: TransportFieldStop;
  index: number;
  busyKey: string;
  onAction: (run: TransportFieldRun, action: TransportFieldAction, stop?: TransportFieldStop) => void;
}> = ({ run, stop, index, busyKey, onAction }) => {
  const arrived = findEvent(stop.events || [], 'arrived');
  const completedAction: TransportFieldAction = run.direction === '迎え' ? 'boarded' : 'dropped_off';
  const completed = findEvent(stop.events || [], completedAction);
  const stopMapUrl = buildStopMapUrl(stop);
  return (
    <li className={`rounded-xl border p-3 ${completed ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200'}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black ${completed ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{completed ? <CheckCircle2 className="h-5 w-5" /> : index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-black">{stop.childName || stop.locationName || `${index + 1}番目の乗降`}</h3><span className="text-xs font-black text-teal-800">予定 {stop.plannedTime || '—'}</span></div>
          <p className="mt-1 flex items-start gap-1 text-xs text-slate-600"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{stop.locationName || stop.locationType}{stop.location ? `・${stop.location}` : ''}</span></p>
          {stopMapUrl && <a href={stopMapUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 text-[11px] font-black text-sky-800"><Route className="h-3.5 w-3.5" />この地点だけ地図を開く<ExternalLink className="h-3 w-3" /></a>}
          {stop.permanentNote && <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] font-black text-amber-950">恒常連絡：{stop.permanentNote}</p>}
          {stop.note && <p className="mt-2 rounded-lg bg-slate-100 p-2 text-[11px] font-bold text-slate-700">当日の連絡：{stop.note}</p>}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {arrived ? <EventDone label="到着" event={arrived} /> : <ActionButton compact label="到着" icon={MapPin} busy={busyKey === `${run.id}:${stop.id}:arrived`} onClick={() => onAction(run, 'arrived', stop)} />}
        {completed ? <EventDone label={actionLabels[completedAction]} event={completed} /> : <ActionButton compact label={actionLabels[completedAction]} icon={CircleDot} disabled={!arrived} busy={busyKey === `${run.id}:${stop.id}:${completedAction}`} onClick={() => onAction(run, completedAction, stop)} />}
      </div>
    </li>
  );
};

const EventDone = ({ label, event }: { label: string; event: TransportFieldEvent }) => <p className="flex min-h-11 items-center justify-center rounded-xl bg-emerald-100 px-2 text-xs font-black text-emerald-800"><CheckCircle2 className="mr-1 h-4 w-4" />{formatTime(event.eventAt)} {label}</p>;

const ActionButton = ({ label, icon: Icon, busy, disabled, compact, onClick }: { label: string; icon: React.ElementType; busy: boolean; disabled?: boolean; compact?: boolean; onClick: () => void }) => (
  <button type="button" disabled={busy || disabled} onClick={onClick} className={`${compact ? 'min-h-11 text-xs' : 'min-h-13 text-sm'} flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-3 font-black text-white disabled:bg-slate-300 disabled:text-slate-500`}>
    {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Icon className="h-5 w-5" />}{label}
  </button>
);

const StatusBadge = ({ run, dark = false }: { run: TransportFieldRun; dark?: boolean }) => (
  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${run.hasHelpRequest ? 'bg-rose-500 text-white' : run.hasDelay ? 'bg-amber-300 text-amber-950' : dark ? 'bg-white/15 text-white' : 'bg-sky-100 text-sky-800'}`}>
    {run.hasHelpRequest ? '応援要請' : run.hasDelay ? '遅延' : run.status}
  </span>
);
