import React, { useMemo, useState } from 'react';
import { CalendarClock, Check, Clock3, Send, X } from 'lucide-react';
import type {
  AttendanceCorrectionRequest,
  AttendanceRecord,
  RecorderProfile,
  StaffShiftRequest,
  StaffShiftTemplate,
} from '../types';
import { getLocalDateString } from '../utils/weekdays';
import { AttendancePanel } from './AttendancePanel';

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
  onSaveRecord: (record: AttendanceRecord) => Promise<void> | void;
  onSaveRecords: (records: AttendanceRecord[]) => Promise<void> | void;
  onSaveShiftRequest: (request: StaffShiftRequest) => Promise<void> | void;
  onReviewShiftRequest: (request: StaffShiftRequest, approved: boolean, note?: string) => Promise<void> | void;
  onPunch: (recorder: RecorderProfile, pin: string, action: '出勤' | '退勤' | '休憩開始' | '休憩終了') => Promise<void> | void;
  onRequestCorrection: (record: AttendanceRecord, pin: string, clockIn: string | undefined, clockOut: string | undefined, reason: string) => Promise<void> | void;
  onReviewCorrection: (request: AttendanceCorrectionRequest, approved: boolean, note?: string) => Promise<void> | void;
}

export const AttendanceHomePanel: React.FC<AttendanceHomePanelProps> = ({
  records,
  shiftTemplates,
  shiftRequests,
  corrections,
  recorderProfiles,
  activeRecorder,
  canManageShifts,
  canApproveCorrections,
  qrKioskEnabled,
  onSaveRecord,
  onSaveRecords,
  onSaveShiftRequest,
  onReviewShiftRequest,
  onPunch,
  onRequestCorrection,
  onReviewCorrection,
}) => {
  const today = getLocalDateString();
  const [selectedDate, setSelectedDate] = useState(today);
  const [requestDate, setRequestDate] = useState(today);
  const [requestStart, setRequestStart] = useState(activeRecorder?.partTimeWeekdayStartTime || '09:00');
  const [requestEnd, setRequestEnd] = useState(activeRecorder?.partTimeWeekdayEndTime || '18:00');
  const [requestNote, setRequestNote] = useState('');
  const [message, setMessage] = useState('');
  const ownSchedule = useMemo(() => records
    .filter((record) => record.recorderProfileId === activeRecorder?.id && record.date >= today)
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(0, 14), [activeRecorder?.id, records, today]);
  const ownRequests = shiftRequests.filter((request) => request.recorderProfileId === activeRecorder?.id).slice(0, 8);
  const pendingRequests = shiftRequests.filter((request) => request.status === '申請中');
  const isPartTime = activeRecorder?.employmentType === 'part_time';

  const submitRequest = async () => {
    if (!activeRecorder) return setMessage('職員名簿との紐づけを確認してください。');
    if (!requestDate) return setMessage('希望日を選択してください。');
    if (requestStart >= requestEnd) return setMessage('終了時刻は開始時刻より後にしてください。');
    const existingRequest = shiftRequests.find((request) => request.recorderProfileId === activeRecorder.id && request.requestedDate === requestDate);
    if (existingRequest) return setMessage(`${requestDate}の希望は「${existingRequest.status}」で登録済みです。変更が必要な場合はシフト管理者へ連絡してください。`);
    const now = new Date().toISOString();
    try {
      await onSaveShiftRequest({
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `shift-request-${Date.now()}`,
        recorderProfileId: activeRecorder.id,
        recorderName: activeRecorder.displayName,
        requestedDate: requestDate,
        requestedStartTime: requestStart,
        requestedEndTime: requestEnd,
        note: requestNote.trim() || undefined,
        status: '申請中',
        createdAt: now,
        updatedAt: now,
      });
      setRequestNote('');
      setMessage('シフト希望を提出しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'シフト希望を提出できませんでした。');
    }
  };

  return <div className="space-y-4">
    <section className="rounded-2xl border border-teal-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-[10px] font-black text-teal-700">ホーム</p><h2 className="mt-1 flex items-center gap-2 text-lg font-black text-slate-950"><CalendarClock className="h-5 w-5 text-teal-600" />自分の出勤予定</h2><p className="mt-1 text-xs text-slate-500">直近の勤務予定と申請状況を確認します。</p></div>
        <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 px-3 text-sm" />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ownSchedule.map((record) => <button key={record.id} type="button" onClick={() => setSelectedDate(record.date)} className={`rounded-xl border p-3 text-left ${record.date === selectedDate ? 'border-teal-500 bg-teal-50' : 'border-slate-200 bg-slate-50'}`}><span className="block text-xs font-black text-slate-900">{record.date}</span><span className="mt-1 block text-sm font-bold text-slate-700">{record.status}　{record.scheduledStartTime || '－'}〜{record.scheduledEndTime || '－'}</span></button>)}
        {ownSchedule.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">今後の出勤予定は未登録です。</p>}
      </div>
    </section>

    {isPartTime && <section className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
      <h3 className="flex items-center gap-2 font-black text-slate-950"><Send className="h-5 w-5 text-violet-600" />シフト希望を提出</h3>
      <p className="mt-1 text-xs text-slate-500">希望日は管理者・児発管・教室長の確認後に出勤予定へ反映されます。</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <label className="text-xs font-bold">希望日<input type="date" value={requestDate} onChange={(event) => setRequestDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border px-3" /></label>
        <label className="text-xs font-bold">開始<input type="time" value={requestStart} onChange={(event) => setRequestStart(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border px-3" /></label>
        <label className="text-xs font-bold">終了<input type="time" value={requestEnd} onChange={(event) => setRequestEnd(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border px-3" /></label>
        <button type="button" onClick={() => void submitRequest()} className="self-end min-h-11 rounded-xl bg-violet-600 px-4 text-sm font-black text-white">提出</button>
      </div>
      <label className="mt-2 block text-xs font-bold">備考<input value={requestNote} onChange={(event) => setRequestNote(event.target.value)} placeholder="時間帯の希望や連絡事項" className="mt-1 min-h-11 w-full rounded-xl border px-3" /></label>
      {ownRequests.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{ownRequests.map((request) => <span key={request.id} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-700">{request.requestedDate} {request.requestedStartTime}〜{request.requestedEndTime}・{request.status}</span>)}</div>}
    </section>}

    {canManageShifts && pendingRequests.length > 0 && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="font-black text-amber-950">シフト希望の確認（{pendingRequests.length}件）</h3>
      <div className="mt-3 space-y-2">{pendingRequests.map((request) => <div key={request.id} className="flex flex-col gap-2 rounded-xl bg-white p-3 sm:flex-row sm:items-center"><span className="min-w-0 flex-1"><strong className="block text-sm">{request.recorderName}</strong><span className="text-xs text-slate-600">{request.requestedDate} {request.requestedStartTime}〜{request.requestedEndTime}{request.note ? `／${request.note}` : ''}</span></span><div className="flex gap-2"><button type="button" onClick={() => void onReviewShiftRequest(request, true)} className="flex min-h-10 items-center gap-1 rounded-lg bg-teal-600 px-3 text-xs font-black text-white"><Check className="h-4 w-4" />承認</button><button type="button" onClick={() => void onReviewShiftRequest(request, false)} className="flex min-h-10 items-center gap-1 rounded-lg border border-rose-300 px-3 text-xs font-black text-rose-700"><X className="h-4 w-4" />却下</button></div></div>)}</div>
    </section>}

    {message && <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">{message}</p>}

    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <h3 className="mb-3 flex items-center gap-2 font-black text-slate-900"><Clock3 className="h-5 w-5 text-teal-600" />出退勤・勤務管理</h3>
      <AttendancePanel records={records} shiftTemplates={shiftTemplates} corrections={corrections} recorderProfiles={recorderProfiles} selectedDate={selectedDate} activeRecorder={activeRecorder} canManage={canManageShifts} canApproveCorrections={canApproveCorrections} canManageShifts={canManageShifts} qrKioskEnabled={qrKioskEnabled} onSaveRecord={onSaveRecord} onSaveRecords={onSaveRecords} onPunch={onPunch} onRequestCorrection={onRequestCorrection} onReviewCorrection={onReviewCorrection} />
    </section>
  </div>;
};
