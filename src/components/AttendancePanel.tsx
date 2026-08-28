import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  LogIn,
  LogOut,
  PencilLine,
  ShieldCheck,
  X,
} from 'lucide-react';
import type {
  AttendanceCorrectionRequest,
  AttendanceRecord,
  AttendanceStatus,
  RecorderProfile,
  StaffShiftTemplate,
} from '../types';
import { AttendanceQrKiosk } from './AttendanceQr';
import { StaffShiftManager } from './StaffShiftManager';

type PunchAction = '出勤' | '退勤';

interface AttendancePanelProps {
  records: AttendanceRecord[];
  shiftTemplates: StaffShiftTemplate[];
  corrections: AttendanceCorrectionRequest[];
  recorderProfiles: RecorderProfile[];
  selectedDate: string;
  activeRecorder?: RecorderProfile;
  canManage: boolean;
  canApproveCorrections: boolean;
  canManageShifts: boolean;
  qrKioskEnabled: boolean;
  onSaveRecord: (record: AttendanceRecord) => Promise<void> | void;
  onSaveRecords: (records: AttendanceRecord[]) => Promise<void> | void;
  onPunch: (recorder: RecorderProfile, pin: string, action: PunchAction) => Promise<void> | void;
  onRequestCorrection: (
    record: AttendanceRecord,
    pin: string,
    requestedClockInAt: string | undefined,
    requestedClockOutAt: string | undefined,
    reason: string,
  ) => Promise<void> | void;
  onReviewCorrection: (request: AttendanceCorrectionRequest, approved: boolean, note?: string) => Promise<void> | void;
  showShiftManager?: boolean;
}

interface ScheduleForm {
  recorderProfileId: string;
  status: AttendanceStatus;
  scheduledStartTime: string;
  scheduledEndTime: string;
  scheduledBreakMinutes: number;
  note: string;
}

const DAY_STATUSES: AttendanceStatus[] = ['勤務予定', '遅刻', '早退', '欠勤', '研修'];

export const AttendancePanel: React.FC<AttendancePanelProps> = ({
  records,
  shiftTemplates,
  corrections,
  recorderProfiles,
  selectedDate,
  activeRecorder,
  canManage,
  canApproveCorrections,
  canManageShifts,
  qrKioskEnabled,
  onSaveRecord,
  onSaveRecords,
  onPunch,
  onRequestCorrection,
  onReviewCorrection,
  showShiftManager = true,
}) => {
  const activeRecorders = useMemo(() => recorderProfiles.filter((profile) => profile.active), [recorderProfiles]);
  const [selectedRecorderId, setSelectedRecorderId] = useState(activeRecorder?.id || activeRecorders[0]?.id || '');
  const [pin, setPin] = useState('');
  const [busyAction, setBusyAction] = useState<PunchAction | ''>('');
  const [error, setError] = useState('');
  const [scheduleForm, setScheduleForm] = useState<ScheduleForm | null>(null);
  const [correctionRecord, setCorrectionRecord] = useState<AttendanceRecord | null>(null);
  const [correctionIn, setCorrectionIn] = useState('');
  const [correctionOut, setCorrectionOut] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionPin, setCorrectionPin] = useState('');
  const [showUnscheduledStaff, setShowUnscheduledStaff] = useState(false);
  const dayRecords = useMemo(
    () => activeRecorders.map((recorder) => ({
      recorder,
      record: records.find((record) => record.date === selectedDate && record.recorderProfileId === recorder.id),
    })),
    [activeRecorders, records, selectedDate],
  );
  const selectedRecorder = activeRecorders.find((recorder) => recorder.id === selectedRecorderId);
  const selectedRecord = records.find(
    (record) => record.date === selectedDate && record.recorderProfileId === selectedRecorderId,
  );
  const monthPrefix = selectedDate.slice(0, 7);
  const monthlyRecords = records.filter((record) => record.date.startsWith(monthPrefix));
  const pendingCorrections = corrections.filter((request) => request.status === '申請中');
  const monthlyWorkingMinutes = monthlyRecords.reduce((total, record) => total + getWorkingMinutes(record), 0);
  const currentTime = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });
  const forgottenPunches = selectedDate === new Date().toLocaleDateString('sv-SE')
    ? dayRecords.filter(({ record }) => record?.scheduledStartTime && record.scheduledStartTime < currentTime && !record.clockInAt)
    : [];
  const scheduledDayRecords = dayRecords.filter(({ record }) => Boolean(record));
  const visibleDayRecords = showUnscheduledStaff ? dayRecords : scheduledDayRecords;
  const unscheduledStaffCount = dayRecords.length - scheduledDayRecords.length;

  const punch = async (action: PunchAction) => {
    if (!selectedRecorder) return setError('指導員を選択してください。');
    if (!/^\d{4,8}$/.test(pin)) return setError('個人PINを4〜8桁の数字で入力してください。');
    setError('');
    setBusyAction(action);
    try {
      await onPunch(selectedRecorder, pin, action);
      setPin('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '打刻できませんでした。');
    } finally {
      setBusyAction('');
    }
  };

  const availableActions = getAvailableActions(selectedRecord);

  const saveSchedule = async () => {
    if (!scheduleForm) return;
    const recorder = activeRecorders.find((profile) => profile.id === scheduleForm.recorderProfileId);
    if (!recorder) return setError('職員を選択してください。');
    if (scheduleForm.scheduledStartTime && scheduleForm.scheduledEndTime
      && scheduleForm.scheduledStartTime >= scheduleForm.scheduledEndTime) {
      return setError('終了時刻は開始時刻より後にしてください。');
    }
    const existing = records.find((record) => record.date === selectedDate && record.recorderProfileId === recorder.id);
    if (isClockedRecord(existing)) return setError('打刻済みの勤務予定は編集できません。打刻修正申請を使用してください。');
    const now = new Date().toISOString();
    await onSaveRecord({
      id: existing?.id || createUuid(),
      recorderProfileId: recorder.id,
      recorderName: recorder.displayName,
      date: selectedDate,
      scheduledStartTime: scheduleForm.scheduledStartTime || undefined,
      scheduledEndTime: scheduleForm.scheduledEndTime || undefined,
      scheduledBreakMinutes: scheduleForm.scheduledBreakMinutes,
      status: scheduleForm.status,
      clockInAt: existing?.clockInAt,
      clockOutAt: existing?.clockOutAt,
      breakPeriods: existing?.breakPeriods || [],
      note: scheduleForm.note.trim() || undefined,
      deviceId: existing?.deviceId,
      lastActionByRecorderId: existing?.lastActionByRecorderId,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    setScheduleForm(null);
  };

  const openSchedule = (recorder: RecorderProfile, record?: AttendanceRecord) => {
    setError('');
    if (isClockedRecord(record)) {
      setError(`${recorder.displayName}さんは打刻済みです。勤務予定は閲覧のみとなり、変更できません。`);
      return;
    }
    setScheduleForm({
      recorderProfileId: recorder.id,
      status: record?.status || '勤務予定',
      scheduledStartTime: record?.scheduledStartTime || '09:00',
      scheduledEndTime: record?.scheduledEndTime || '18:00',
      scheduledBreakMinutes: record?.scheduledBreakMinutes || 0,
      note: record?.note || '',
    });
  };

  const openCorrection = (record: AttendanceRecord) => {
    setCorrectionRecord(record);
    setCorrectionIn(toLocalInput(record.clockInAt));
    setCorrectionOut(toLocalInput(record.clockOutAt));
    setCorrectionReason('');
    setCorrectionPin('');
    setError('');
  };

  const submitCorrection = async () => {
    if (!correctionRecord) return;
    if (!/^\d{4,8}$/.test(correctionPin)) return setError('個人PINを4〜8桁の数字で入力してください。');
    if (!correctionReason.trim()) return setError('修正理由を入力してください。');
    await onRequestCorrection(
      correctionRecord,
      correctionPin,
      correctionIn ? new Date(correctionIn).toISOString() : undefined,
      correctionOut ? new Date(correctionOut).toISOString() : undefined,
      correctionReason,
    );
    setCorrectionRecord(null);
  };

  const exportCsv = () => {
    const header = ['日付', '職員名', '状態', '予定開始', '予定終了', '出勤', '退勤', '休憩分', '実働分', '備考'];
    const rows = monthlyRecords
      .sort((left, right) => `${left.date}${left.recorderName}`.localeCompare(`${right.date}${right.recorderName}`))
      .map((record) => [
        record.date,
        record.recorderName,
        record.status,
        record.scheduledStartTime || '',
        record.scheduledEndTime || '',
        formatDateTime(record.clockInAt),
        formatDateTime(record.clockOutAt),
        String(getBreakMinutes(record)),
        String(getWorkingMinutes(record)),
        record.note || '',
      ]);
    const csv = `\ufeff${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `勤務集計_${monthPrefix}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {showShiftManager && canManageShifts && (
        <StaffShiftManager
          templates={shiftTemplates}
          records={records}
          recorderProfiles={recorderProfiles}
          selectedDate={selectedDate}
          onSaveRecords={onSaveRecords}
        />
      )}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-black text-slate-900"><Clock3 className="h-5 w-5 text-teal-600" />出退勤を打刻</h3>
            <p className="mt-1 text-xs text-slate-500">本人の職員アカウントと個人PINで打刻します。休憩開始・終了の個別打刻は使用しません。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AttendanceQrKiosk enabled={qrKioskEnabled} canRegister={canManage} />
            <button type="button" onClick={exportCsv} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-700">
              <Download className="h-4 w-4" />{monthPrefix} CSV
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <label className="text-sm font-bold text-slate-700">指導員
            <select value={selectedRecorderId} onChange={(event) => setSelectedRecorderId(event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base">
              {activeRecorders.map((recorder) => <option key={recorder.id} value={recorder.id}>{recorder.displayName}{recorder.pinConfigured === false ? '（PIN未設定）' : ''}</option>)}
            </select>
          </label>
          <label className="text-sm font-bold text-slate-700">個人PIN
            <input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" type="password" autoComplete="off" placeholder="4〜8桁" className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 px-3 text-center text-lg tracking-[.35em]" />
          </label>
        </div>
        {selectedRecord && (
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
            現在：<strong>{selectedRecord.status}</strong>　出勤 {formatDateTime(selectedRecord.clockInAt) || '未打刻'} ／ 退勤 {formatDateTime(selectedRecord.clockOutAt) || '未打刻'}
          </p>
        )}
        {error && <p className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700"><AlertTriangle className="h-4 w-4" />{error}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {availableActions.map((action) => (
            <button key={action} type="button" disabled={Boolean(busyAction)} onClick={() => punch(action)} className={`flex min-h-14 items-center justify-center gap-2 rounded-xl px-3 text-base font-black disabled:opacity-50 ${action === '退勤' ? 'bg-slate-900 text-white' : 'bg-teal-600 text-white'}`}>
              {action === '出勤' ? <LogIn className="h-5 w-5" /> : <LogOut className="h-5 w-5" />}{busyAction === action ? '処理中…' : action}
            </button>
          ))}
          {availableActions.length === 0 && <p className="col-span-full rounded-xl bg-emerald-50 p-3 text-center text-sm font-bold text-emerald-800">本日の打刻は完了しています。</p>}
        </div>
      </section>

      <section className="grid grid-cols-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <MiniSummary label={`${monthPrefix} 延べ勤務日数`} value={`${new Set(monthlyRecords.filter((record) => record.clockInAt).map((record) => `${record.recorderProfileId}:${record.date}`)).size}日`} />
        <MiniSummary label="実働合計" value={formatMinutes(monthlyWorkingMinutes)} />
      </section>

      {forgottenPunches.length > 0 && <p className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-black text-rose-800"><AlertTriangle className="h-5 w-5" />打刻忘れの可能性：{forgottenPunches.map(({ recorder }) => recorder.displayName).join('、')}</p>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="font-black text-slate-900">{selectedDate} の勤務状況</h3><p className="mt-1 text-xs text-slate-500">勤務予定・出勤状態・実働時間を一覧で確認できます。</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">予定 {scheduledDayRecords.length}名／出勤中 {dayRecords.filter(({ record }) => record && ['出勤中', '休憩中', '遅刻', '早退'].includes(record.status)).length}名</span>
            {unscheduledStaffCount > 0 && <button type="button" onClick={() => setShowUnscheduledStaff((current) => !current)} className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 text-[11px] font-black text-slate-700">{showUnscheduledStaff ? '予定ありのみ' : `未登録も表示（${unscheduledStaffCount}名）`}</button>}
          </div>
        </div>
        <div className="hidden grid-cols-[minmax(120px,1.2fr)_110px_130px_130px_110px_auto] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-black text-slate-500 lg:grid">
          <span>職員</span><span>状態</span><span>予定</span><span>出退勤</span><span>休憩／実働</span><span className="text-right">操作</span>
        </div>
        <div className="divide-y divide-slate-100">
          {visibleDayRecords.map(({ recorder, record }) => (
            <div key={recorder.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3 py-2 lg:grid-cols-[minmax(120px,1.2fr)_110px_130px_130px_110px_auto]">
              <strong className="truncate text-sm text-slate-900">{recorder.displayName}</strong>
              <span className="lg:hidden"><StatusBadge status={record?.status} /></span>
              <span className="hidden lg:block"><StatusBadge status={record?.status} /></span>
              <div className="col-span-2 grid gap-0.5 text-xs font-bold text-slate-700 lg:contents">
                <span className="truncate text-[11px] text-slate-600 lg:text-xs">予定 {record?.scheduledStartTime ? `${record.scheduledStartTime}〜${record.scheduledEndTime || '－'}` : '未登録'}</span>
                <span className="truncate text-[11px] text-slate-600 lg:text-xs">実績 {formatTime(record?.clockInAt) || '－'}〜{formatTime(record?.clockOutAt) || '－'}</span>
                <span className="text-[10px] text-slate-500 lg:text-xs">休憩 {record ? getBreakMinutes(record) : 0}分／実働 {record ? getWorkingMinutes(record) : 0}分</span>
              </div>
              <div className="col-span-2 flex flex-wrap justify-end gap-1.5 lg:col-span-1 lg:flex-nowrap">
                {record && (activeRecorder?.id === recorder.id || canManage) && <button type="button" onClick={() => openCorrection(record)} className="min-h-9 rounded-lg border border-slate-300 px-2.5 text-[11px] font-bold">修正申請</button>}
                {canManage && (isClockedRecord(record)
                  ? <span className="inline-flex min-h-9 items-center rounded-lg bg-slate-100 px-2.5 text-[10px] font-bold text-slate-500">打刻後・閲覧のみ</span>
                  : <button type="button" onClick={() => openSchedule(recorder, record)} className="min-h-9 rounded-lg bg-slate-900 px-2.5 text-[11px] font-bold text-white"><PencilLine className="mr-1 inline h-3.5 w-3.5" />予定編集</button>)}
              </div>
            </div>
          ))}
          {visibleDayRecords.length === 0 && <div className="p-5 text-center text-sm text-slate-500">この日の出勤予定は未登録です。{unscheduledStaffCount > 0 && <button type="button" onClick={() => setShowUnscheduledStaff(true)} className="ml-2 font-black text-teal-700 underline">全職員を表示</button>}</div>}
        </div>
      </section>

      {canManage && !canApproveCorrections && pendingCorrections.length > 0 && (
        <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-bold text-sky-900"><ShieldCheck className="mr-2 inline h-5 w-5" />打刻修正の承認待ちが{pendingCorrections.length}件あります。承認・却下は管理者が行います。</p>
      )}

      {canApproveCorrections && pendingCorrections.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="flex items-center gap-2 font-black text-amber-950"><ShieldCheck className="h-5 w-5" />打刻修正の承認待ち（{pendingCorrections.length}件）</h3>
          <div className="mt-3 space-y-2">
            {pendingCorrections.map((request) => (
              <div key={request.id} className="rounded-xl bg-white p-3 shadow-sm">
                <strong>{request.recorderName}</strong><span className="ml-2 text-xs text-slate-500">{formatDateTime(request.requestedClockInAt)}〜{formatDateTime(request.requestedClockOutAt)}</span>
                <p className="mt-1 text-sm text-slate-700">理由：{request.reason}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => onReviewCorrection(request, true)} className="min-h-10 rounded-lg bg-teal-600 px-4 text-sm font-bold text-white">承認</button>
                  <button type="button" onClick={() => onReviewCorrection(request, false)} className="min-h-10 rounded-lg border border-rose-300 px-4 text-sm font-bold text-rose-700">却下</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {scheduleForm && (
        <Modal title="勤務予定を編集" onClose={() => setScheduleForm(null)}>
          <label className="block text-sm font-bold">職員<select value={scheduleForm.recorderProfileId} onChange={(event) => setScheduleForm({ ...scheduleForm, recorderProfileId: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3">{activeRecorders.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-bold">開始<input type="time" value={scheduleForm.scheduledStartTime} onChange={(event) => setScheduleForm({ ...scheduleForm, scheduledStartTime: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
            <label className="text-sm font-bold">終了<input type="time" value={scheduleForm.scheduledEndTime} onChange={(event) => setScheduleForm({ ...scheduleForm, scheduledEndTime: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
          </div>
          <label className="block text-sm font-bold">予定休憩（分）<input type="number" min="0" max="480" step="5" value={scheduleForm.scheduledBreakMinutes} onChange={(event) => setScheduleForm({ ...scheduleForm, scheduledBreakMinutes: Number(event.target.value) })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
          <label className="block text-sm font-bold">状態<select value={scheduleForm.status} onChange={(event) => setScheduleForm({ ...scheduleForm, status: event.target.value as AttendanceStatus })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3">{DAY_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label className="block text-sm font-bold">備考<textarea value={scheduleForm.note} onChange={(event) => setScheduleForm({ ...scheduleForm, note: event.target.value })} className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 p-3" /></label>
          <button type="button" onClick={saveSchedule} className="min-h-12 w-full rounded-xl bg-teal-600 font-black text-white">保存</button>
        </Modal>
      )}

      {correctionRecord && (
        <Modal title="打刻修正を申請" onClose={() => setCorrectionRecord(null)}>
          <p className="rounded-xl bg-slate-50 p-3 text-sm">{correctionRecord.recorderName}／{correctionRecord.date}</p>
          <label className="block text-sm font-bold">出勤時刻<input type="datetime-local" value={correctionIn} onChange={(event) => setCorrectionIn(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
          <label className="block text-sm font-bold">退勤時刻<input type="datetime-local" value={correctionOut} onChange={(event) => setCorrectionOut(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
          <label className="block text-sm font-bold">修正理由<textarea value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 p-3" /></label>
          <label className="block text-sm font-bold">個人PIN<input type="password" inputMode="numeric" value={correctionPin} onChange={(event) => setCorrectionPin(event.target.value.replace(/\D/g, '').slice(0, 8))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
          <button type="button" onClick={submitCorrection} className="min-h-12 w-full rounded-xl bg-teal-600 font-black text-white">申請する</button>
        </Modal>
      )}
    </div>
  );
};

const StatusBadge = ({ status }: { status?: AttendanceStatus }) => (
  <span className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${status === '出勤中' || status === '休憩中' ? 'bg-emerald-100 text-emerald-800' : status === '欠勤' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'}`}>{status || '未登録'}</span>
);

const MiniSummary = ({ label, value }: { label: string; value: string }) => <div className="border-r border-slate-100 p-3 text-center"><span className="block text-[10px] font-bold text-slate-500">{label}</span><strong className="mt-1 block text-base text-slate-950">{value}</strong></div>;

const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
    <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl">
      <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-black">{title}</h3><button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100"><X className="h-5 w-5" /></button></div>
      <div className="space-y-4">{children}</div>
    </div>
  </div>
);

function getAvailableActions(record?: AttendanceRecord): PunchAction[] {
  if (!record?.clockInAt || ['勤務予定', '遅刻', '早退'].includes(record.status) && !record.clockInAt) return ['出勤'];
  if (record.clockOutAt || record.status === '退勤済み') return [];
  return ['退勤'];
}

function isClockedRecord(record?: AttendanceRecord) {
  return Boolean(record?.clockInAt || record?.clockOutAt || (record && ['出勤中', '休憩中', '退勤済み'].includes(record.status)));
}

function getBreakMinutes(record: AttendanceRecord) {
  const fallbackEnd = record.date === new Date().toLocaleDateString('sv-SE')
    ? Date.now()
    : new Date(`${record.date}T23:59:59`).getTime();
  return record.breakPeriods.reduce((total, period) => {
    const start = new Date(period.startedAt).getTime();
    const end = period.endedAt ? new Date(period.endedAt).getTime() : fallbackEnd;
    return total + Math.max(0, Math.round((end - start) / 60000));
  }, 0);
}

function getWorkingMinutes(record: AttendanceRecord) {
  if (!record.clockInAt) return 0;
  const end = record.clockOutAt
    ? new Date(record.clockOutAt).getTime()
    : record.date === new Date().toLocaleDateString('sv-SE')
      ? Date.now()
      : new Date(`${record.date}T23:59:59`).getTime();
  return Math.max(0, Math.round((end - new Date(record.clockInAt).getTime()) / 60000) - getBreakMinutes(record));
}

function formatTime(value?: string) { return value ? new Date(value).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : ''; }
function formatDateTime(value?: string) { return value ? new Date(value).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; }
function formatMinutes(minutes: number) { return `${Math.floor(minutes / 60)}時間${minutes % 60}分`; }
function toLocalInput(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
function csvCell(value: string) { return `"${value.replace(/"/g, '""')}"`; }
function createUuid() { return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `attendance-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
