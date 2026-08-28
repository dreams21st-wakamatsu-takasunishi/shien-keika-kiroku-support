import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, Clock3, Save, Send, Settings2, UsersRound, X } from 'lucide-react';
import type {
  AttendanceCorrectionRequest, AttendanceRecord, CalendarEvent, ChildProfile,
  DailyChildPlan, DailyTransportRequirement, RecorderProfile, StaffShiftRequest,
  StaffShiftTemplate, TransportRun,
} from '../types';
import { getLocalDateString } from '../utils/weekdays';
import { AttendancePanel } from './AttendancePanel';
import { StaffShiftManager } from './StaffShiftManager';

type AttendanceTab = 'overview' | 'request' | 'planning' | 'attendance';
type RequestDraft = { date: string; startTime: string; endTime: string; note: string };

interface AttendanceHomePanelProps {
  records: AttendanceRecord[];
  shiftTemplates: StaffShiftTemplate[];
  shiftRequests: StaffShiftRequest[];
  corrections: AttendanceCorrectionRequest[];
  recorderProfiles: RecorderProfile[];
  activeRecorder?: RecorderProfile;
  canManageShifts: boolean;
  canApproveCorrections: boolean;
  qrKioskEnabled: boolean;
  calendarEvents: CalendarEvent[];
  childrenList: ChildProfile[];
  dailyChildPlans: DailyChildPlan[];
  dailyTransportRequirements: DailyTransportRequirement[];
  transportRuns: TransportRun[];
  onSaveRecord: (record: AttendanceRecord) => Promise<void> | void;
  onSaveRecords: (records: AttendanceRecord[]) => Promise<void> | void;
  onDeleteRecord: (record: AttendanceRecord) => Promise<void> | void;
  onSaveShiftRequest: (request: StaffShiftRequest) => Promise<void> | void;
  onSaveShiftRequestDefaults: (recorderProfileId: string, startTime: string, endTime: string) => Promise<void> | void;
  onReviewShiftRequest: (request: StaffShiftRequest, approved: boolean, note?: string) => Promise<void> | void;
  onDeleteShiftRequest: (request: StaffShiftRequest) => Promise<void> | void;
  onPunch: (recorder: RecorderProfile, pin: string, action: '出勤' | '退勤') => Promise<void> | void;
  onRequestCorrection: (record: AttendanceRecord, pin: string, clockIn: string | undefined, clockOut: string | undefined, reason: string) => Promise<void> | void;
  onReviewCorrection: (request: AttendanceCorrectionRequest, approved: boolean, note?: string) => Promise<void> | void;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export const AttendanceHomePanel: React.FC<AttendanceHomePanelProps> = ({
  records, shiftTemplates, shiftRequests, corrections, recorderProfiles, activeRecorder,
  canManageShifts, canApproveCorrections, qrKioskEnabled, calendarEvents, childrenList,
  dailyChildPlans, dailyTransportRequirements, transportRuns, onSaveRecord, onSaveRecords, onDeleteRecord,
  onSaveShiftRequest, onSaveShiftRequestDefaults, onReviewShiftRequest, onDeleteShiftRequest, onPunch,
  onRequestCorrection, onReviewCorrection,
}) => {
  const today = getLocalDateString();
  const [activeTab, setActiveTab] = useState<AttendanceTab>('overview');
  const [selectedDate, setSelectedDate] = useState(today);
  const [requestMonth, setRequestMonth] = useState(today.slice(0, 7));
  const [requestDrafts, setRequestDrafts] = useState<RequestDraft[]>([]);
  const [defaultStart, setDefaultStart] = useState(activeRecorder?.shiftRequestDefaultStartTime || activeRecorder?.partTimeWeekdayStartTime || '09:00');
  const [defaultEnd, setDefaultEnd] = useState(activeRecorder?.shiftRequestDefaultEndTime || activeRecorder?.partTimeWeekdayEndTime || '18:00');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDefaultStart(activeRecorder?.shiftRequestDefaultStartTime || activeRecorder?.partTimeWeekdayStartTime || '09:00');
    setDefaultEnd(activeRecorder?.shiftRequestDefaultEndTime || activeRecorder?.partTimeWeekdayEndTime || '18:00');
    setRequestDrafts([]);
  }, [activeRecorder?.id, activeRecorder?.partTimeWeekdayEndTime, activeRecorder?.partTimeWeekdayStartTime, activeRecorder?.shiftRequestDefaultEndTime, activeRecorder?.shiftRequestDefaultStartTime]);

  const ownSchedule = useMemo(() => records
    .filter((record) => record.recorderProfileId === activeRecorder?.id && record.date.startsWith(requestMonth)), [activeRecorder?.id, records, requestMonth]);
  const ownRequests = useMemo(() => shiftRequests.filter((request) => request.recorderProfileId === activeRecorder?.id && request.requestedDate.startsWith(requestMonth)), [activeRecorder?.id, requestMonth, shiftRequests]);
  const ownLeaveEvents = useMemo(() => calendarEvents.filter((event) => event.eventType === '職員休み'
    && Boolean(activeRecorder?.id && event.recorderProfileIds.includes(activeRecorder.id))
    && event.date <= `${requestMonth}-31`
    && (event.endDate || event.date) >= `${requestMonth}-01`), [activeRecorder?.id, calendarEvents, requestMonth]);
  const pendingRequests = useMemo(() => shiftRequests
    .filter((request) => request.status === '申請中')
    .sort((left, right) => left.requestedDate.localeCompare(right.requestedDate) || left.recorderName.localeCompare(right.recorderName, 'ja')), [shiftRequests]);
  const isPartTime = activeRecorder?.employmentType === 'part_time';
  const requestDates = useMemo(() => getMonthDates(requestMonth), [requestMonth]);
  const firstWeekday = new Date(`${requestMonth}-01T12:00:00`).getDay();

  const toggleRequestDate = (date: string) => {
    const existing = shiftRequests.find((request) => request.recorderProfileId === activeRecorder?.id && request.requestedDate === date);
    if (existing) return setMessage(`${date}は「${existing.status}」で提出済みです。`);
    setRequestDrafts((previous) => previous.some((draft) => draft.date === date)
      ? previous.filter((draft) => draft.date !== date)
      : [...previous, { date, startTime: defaultStart, endTime: defaultEnd, note: '' }].sort((left, right) => left.date.localeCompare(right.date)));
    setMessage('');
  };

  const updateDraft = (date: string, patch: Partial<RequestDraft>) => setRequestDrafts((previous) => previous.map((draft) => draft.date === date ? { ...draft, ...patch } : draft));

  const saveDefaults = async () => {
    if (!activeRecorder) return setMessage('職員名簿との紐づけを確認してください。');
    if (defaultStart >= defaultEnd) return setMessage('希望時間の終了は開始より後にしてください。');
    setBusy(true);
    try {
      await onSaveShiftRequestDefaults(activeRecorder.id, defaultStart, defaultEnd);
      setRequestDrafts((previous) => previous.map((draft) => ({ ...draft, startTime: defaultStart, endTime: defaultEnd })));
      setMessage('希望時間の初期値を保存しました。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '希望時間を保存できませんでした。'); }
    finally { setBusy(false); }
  };

  const submitRequests = async () => {
    if (!activeRecorder) return setMessage('職員名簿との紐づけを確認してください。');
    if (requestDrafts.length === 0) return setMessage('希望日をカレンダーから選択してください。');
    const invalid = requestDrafts.find((draft) => !draft.startTime || !draft.endTime || draft.startTime >= draft.endTime);
    if (invalid) return setMessage(`${invalid.date}の終了時刻は開始時刻より後にしてください。`);
    setBusy(true);
    try {
      for (const [index, draft] of requestDrafts.entries()) {
        const now = new Date().toISOString();
        await onSaveShiftRequest({
          id: globalThis.crypto?.randomUUID?.() || `shift-request-${Date.now()}-${index}`,
          recorderProfileId: activeRecorder.id, recorderName: activeRecorder.displayName,
          requestedDate: draft.date, requestedStartTime: draft.startTime, requestedEndTime: draft.endTime,
          note: draft.note.trim() || undefined, status: '申請中', createdAt: now, updatedAt: now,
        });
      }
      setMessage(`${requestDrafts.length}日分のシフト希望を提出しました。`);
      setRequestDrafts([]);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'シフト希望を提出できませんでした。'); }
    finally { setBusy(false); }
  };

  const tabs: Array<{ id: AttendanceTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }> = [
    { id: 'overview', label: '自分の予定', icon: CalendarClock },
    ...(isPartTime ? [{ id: 'request' as const, label: '希望提出', icon: Send }] : []),
    ...(canManageShifts ? [{ id: 'planning' as const, label: 'シフト作成', icon: UsersRound, badge: pendingRequests.length }] : []),
    { id: 'attendance', label: '打刻・実績', icon: Clock3 },
  ];

  return <div className="space-y-4">
    <nav className={`grid gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm ${tabs.length >= 4 ? 'grid-cols-2 lg:grid-cols-4' : tabs.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`} aria-label="出勤予定の機能">
      {tabs.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black transition-colors ${activeTab === tab.id ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}><tab.icon className="h-4 w-4" />{tab.label}{Boolean(tab.badge) && <span className="rounded-full bg-amber-300 px-1.5 py-0.5 text-[9px] text-amber-950">{tab.badge}</span>}</button>)}
    </nav>

    {message && <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">{message}</p>}

    {activeTab === 'overview' && <section className="rounded-2xl border border-teal-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-black text-teal-700">出勤予定</p><h2 className="mt-1 flex items-center gap-2 text-lg font-black text-slate-950"><CalendarClock className="h-5 w-5 text-teal-600" />自分の予定</h2><p className="mt-1 text-xs text-slate-500">勤務予定と提出したシフト希望を、同じ月間カレンダーで確認します。</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => setRequestMonth(moveMonth(requestMonth, -1))} className="grid h-9 w-9 place-items-center rounded-lg border"><ChevronLeft className="h-4 w-4" /></button><strong className="min-w-24 text-center text-sm">{requestMonth.replace('-', '年')}月</strong><button type="button" onClick={() => setRequestMonth(moveMonth(requestMonth, 1))} className="grid h-9 w-9 place-items-center rounded-lg border"><ChevronRight className="h-4 w-4" /></button></div></div>
      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] font-black text-slate-400">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1">{Array.from({ length: firstWeekday }, (_, index) => <span key={`own-blank-${index}`} />)}{requestDates.map((date) => { const record = ownSchedule.find((item) => item.date === date); const request = ownRequests.find((item) => item.requestedDate === date); const leave = ownLeaveEvents.find((event) => event.date <= date && (event.endDate || event.date) >= date); return <button key={date} type="button" onClick={() => setSelectedDate(date)} className={`min-h-16 rounded-lg border p-1 text-left ${date === selectedDate ? 'ring-2 ring-teal-500' : ''} ${leave ? 'border-rose-300 bg-rose-50 text-rose-950' : record ? 'border-emerald-200 bg-emerald-50' : request ? shiftRequestTone(request.status) : 'border-slate-100 bg-white'}`}><span className="block text-[10px] font-black">{Number(date.slice(8))}</span>{leave ? <span className="mt-0.5 block text-[9px] font-black">休み<br /><span className="text-[8px]">{leave.title}</span></span> : record ? <span className="mt-0.5 block text-[9px] font-black text-emerald-900">{record.scheduledStartTime || '－'}〜{record.scheduledEndTime || '－'}</span> : null}{request && <span className="mt-0.5 block text-[8px] font-black">希望 {request.requestedStartTime || '－'}〜{request.requestedEndTime || '－'}<br />{request.status}</span>}</button>; })}</div>
      <div className="mt-3 flex flex-wrap gap-2 text-[9px] font-black"><span className="rounded-full bg-violet-100 px-2 py-1 text-violet-800">申請中</span><span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">承認済み／勤務予定</span><span className="rounded-full bg-rose-100 px-2 py-1 text-rose-800">休み／却下</span></div>
    </section>}

    {activeTab === 'request' && isPartTime && <section className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><h2 className="flex items-center gap-2 text-lg font-black text-slate-950"><Send className="h-5 w-5 text-violet-600" />複数日のシフト希望を提出</h2><p className="mt-1 text-xs text-slate-500">①カレンダーで日を選択し、②日ごとの時間・メモを確認してまとめて提出します。</p></div><div className="rounded-xl border border-violet-200 bg-violet-50 p-3"><p className="flex items-center gap-1 text-[10px] font-black text-violet-900"><Settings2 className="h-4 w-4" />自分の希望時間の初期値</p><div className="mt-2 flex flex-wrap items-end gap-2"><label className="text-[10px] font-bold">開始<input type="time" value={defaultStart} onChange={(event) => setDefaultStart(event.target.value)} className="mt-1 block min-h-10 rounded-lg border border-violet-200 bg-white px-2" /></label><label className="text-[10px] font-bold">終了<input type="time" value={defaultEnd} onChange={(event) => setDefaultEnd(event.target.value)} className="mt-1 block min-h-10 rounded-lg border border-violet-200 bg-white px-2" /></label><button type="button" disabled={busy} onClick={() => void saveDefaults()} className="flex min-h-10 items-center gap-1 rounded-lg bg-violet-700 px-3 text-[11px] font-black text-white"><Save className="h-4 w-4" />保存</button></div></div></div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(420px,0.8fr)_minmax(520px,1.2fr)]">
        <div className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between"><button type="button" onClick={() => setRequestMonth(moveMonth(requestMonth, -1))} className="grid h-10 w-10 place-items-center rounded-lg border"><ChevronLeft className="h-4 w-4" /></button><strong>{requestMonth.replace('-', '年')}月</strong><button type="button" onClick={() => setRequestMonth(moveMonth(requestMonth, 1))} className="grid h-10 w-10 place-items-center rounded-lg border"><ChevronRight className="h-4 w-4" /></button></div><div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-black text-slate-400">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div><div className="mt-1 grid grid-cols-7 gap-1">{Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} />)}{requestDates.map((date) => { const selected = requestDrafts.some((draft) => draft.date === date); const existing = shiftRequests.find((request) => request.recorderProfileId === activeRecorder?.id && request.requestedDate === date); return <button key={date} type="button" onClick={() => toggleRequestDate(date)} className={`relative min-h-12 rounded-lg border text-xs font-black ${selected ? 'border-violet-600 bg-violet-600 text-white' : existing ? 'border-slate-200 bg-slate-100 text-slate-400' : 'border-slate-200 bg-white text-slate-700 hover:border-violet-300'}`}><span>{Number(date.slice(8))}</span>{existing && <span className="block text-[8px]">{existing.status}</span>}</button>; })}</div></div>
        <div className="min-w-0"><div className="flex items-center justify-between"><h3 className="text-sm font-black text-slate-950">選択日（{requestDrafts.length}日）</h3><button type="button" onClick={() => setRequestDrafts([])} className="text-[10px] font-black text-slate-500">選択を解除</button></div>{requestDrafts.length === 0 ? <p className="mt-3 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">左のカレンダーから希望日を選択してください。</p> : <div className="mt-2 max-h-[430px] space-y-2 overflow-y-auto pr-1">{requestDrafts.map((draft) => <div key={draft.date} className="grid gap-2 rounded-xl border border-violet-100 bg-violet-50/40 p-3 sm:grid-cols-[120px_110px_110px_minmax(160px,1fr)_40px] sm:items-end"><strong className="pb-2 text-xs">{draft.date}</strong><label className="text-[9px] font-bold">開始<input type="time" value={draft.startTime} onChange={(event) => updateDraft(draft.date, { startTime: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border bg-white px-2 text-sm" /></label><label className="text-[9px] font-bold">終了<input type="time" value={draft.endTime} onChange={(event) => updateDraft(draft.date, { endTime: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border bg-white px-2 text-sm" /></label><label className="text-[9px] font-bold">メモ<input value={draft.note} onChange={(event) => updateDraft(draft.date, { note: event.target.value })} placeholder="この日だけの連絡事項" className="mt-1 min-h-10 w-full rounded-lg border bg-white px-2 text-sm" /></label><button type="button" onClick={() => toggleRequestDate(draft.date)} className="grid h-10 w-10 place-items-center rounded-lg border border-rose-200 bg-white text-rose-700"><X className="h-4 w-4" /></button></div>)}</div>}<button type="button" disabled={busy || requestDrafts.length === 0} onClick={() => void submitRequests()} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-700 font-black text-white disabled:opacity-40"><Send className="h-5 w-5" />選択した{requestDrafts.length}日分をまとめて提出</button></div>
      </div>
    </section>}

    {activeTab === 'planning' && canManageShifts && <div className="space-y-4">
      <StaffShiftManager templates={shiftTemplates} records={records} shiftRequests={shiftRequests} recorderProfiles={recorderProfiles} selectedDate={selectedDate} calendarEvents={calendarEvents} childrenList={childrenList} dailyChildPlans={dailyChildPlans} dailyTransportRequirements={dailyTransportRequirements} transportRuns={transportRuns} onSaveRecords={onSaveRecords} onDeleteRecord={onDeleteRecord} onReviewShiftRequest={onReviewShiftRequest} onDeleteShiftRequest={onDeleteShiftRequest} />
    </div>}

    {activeTab === 'attendance' && <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><h3 className="mb-3 flex items-center gap-2 font-black text-slate-900"><Clock3 className="h-5 w-5 text-teal-600" />出退勤・勤務実績</h3><AttendancePanel records={records} shiftTemplates={shiftTemplates} corrections={corrections} recorderProfiles={recorderProfiles} selectedDate={selectedDate} activeRecorder={activeRecorder} canManage={canManageShifts} canApproveCorrections={canApproveCorrections} canManageShifts={canManageShifts} qrKioskEnabled={qrKioskEnabled} showShiftManager={false} onSaveRecord={onSaveRecord} onSaveRecords={onSaveRecords} onPunch={onPunch} onRequestCorrection={onRequestCorrection} onReviewCorrection={onReviewCorrection} /></section>}
  </div>;
};

function getMonthDates(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return Array.from({ length: new Date(year, monthNumber, 0).getDate() }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
}

function moveMonth(month: string, amount: number) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function shiftRequestTone(status: StaffShiftRequest['status']) {
  if (status === '承認') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  if (status === '却下') return 'border-rose-200 bg-rose-50 text-rose-800';
  return 'border-violet-200 bg-violet-50 text-violet-900';
}
