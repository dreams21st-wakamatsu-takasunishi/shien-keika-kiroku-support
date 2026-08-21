import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Clock3, QrCode, RefreshCw, X } from 'lucide-react';
import type { AttendanceQrChallenge, AttendanceRecord, UserProfile } from '../types';
import { issueAttendanceQrChallenge, punchAttendanceWithQr } from '../services/dataService';

const QR_PREFIX = 'shien-attendance:v1:';

function qrPayload(token: string) {
  return `${QR_PREFIX}${token}`;
}

function parseQrToken(value: string) {
  const normalized = value.trim();
  if (!normalized.startsWith(QR_PREFIX)) return '';
  const token = normalized.slice(QR_PREFIX.length);
  return /^[a-f0-9]{64}$/i.test(token) ? token : '';
}

function attendanceErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || '');
  if (raw.includes('ATTENDANCE_QR_EXPIRED')) return 'QRコードの有効期限が切れています。玄関端末の新しいQRコードを読み取ってください。';
  if (raw.includes('ATTENDANCE_QR_INVALID')) return 'このQRコードは打刻に使用できません。玄関端末に表示中のQRコードを読み取ってください。';
  if (raw.includes('ATTENDANCE_SHARED_DEVICE_REQUIRED')) return '玄関QRは、承認済みの「施設共用端末」で表示してください。端末管理から種類と承認状態を確認してください。';
  if (raw.includes('ATTENDANCE_PERSONAL_DEVICE_REQUIRED')) return '承認済みの個人端末からのみ打刻できます。端末登録を確認してください。';
  if (raw.includes('ATTENDANCE_ALREADY_CLOCKED_IN')) return '本日はすでに出勤打刻されています。';
  if (raw.includes('ATTENDANCE_ALREADY_CLOCKED_OUT')) return '本日はすでに退勤打刻されています。';
  if (raw.includes('ATTENDANCE_NOT_CLOCKED_IN')) return '出勤打刻が確認できないため退勤できません。';
  return raw || '打刻できませんでした。';
}

export function AttendanceQrKiosk({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [challenge, setChallenge] = useState<AttendanceQrChallenge | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const issue = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await issueAttendanceQrChallenge();
      const qr = await import('qrcode');
      const dataUrl = await qr.toDataURL(qrPayload(next.token), {
        width: 560,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#020617', light: '#ffffff' },
      });
      setChallenge(next);
      setImageUrl(dataUrl);
      setNow(Date.now());
    } catch (cause) {
      setError(attendanceErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void issue();
  }, [issue, open]);

  useEffect(() => {
    if (!open || !challenge) return;
    const refreshTimer = window.setTimeout(() => void issue(), challenge.refreshAfterSeconds * 1000);
    const countdownTimer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(refreshTimer);
      window.clearInterval(countdownTimer);
    };
  }, [challenge, issue, open]);

  if (!enabled) return null;
  const remainingSeconds = challenge
    ? Math.max(0, Math.ceil((new Date(challenge.expiresAt).getTime() - now) / 1000))
    : 0;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-black text-white">
        <QrCode className="h-5 w-5" />玄関用QRを表示
      </button>
      {open && (
        <div className="fixed inset-0 z-[180] flex flex-col bg-slate-950 p-4 text-white sm:p-6" role="dialog" aria-modal="true" aria-label="玄関用出退勤QRコード">
          <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
            <div><p className="text-xs font-black tracking-widest text-sky-300">玄関・出退勤打刻</p><h2 className="mt-1 text-xl font-black sm:text-3xl">個人端末でQRコードを読み取ってください</h2></div>
            <button type="button" onClick={() => setOpen(false)} className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-slate-700" aria-label="QR表示を閉じる"><X className="h-6 w-6" /></button>
          </header>
          <main className="mx-auto grid min-h-0 w-full max-w-5xl flex-1 place-items-center py-4">
            <section className="w-full max-w-xl rounded-3xl bg-white p-5 text-center text-slate-950 shadow-2xl sm:p-8">
              {loading && !imageUrl ? <div className="grid min-h-80 place-items-center"><RefreshCw className="h-12 w-12 animate-spin text-sky-700" /></div> : imageUrl ? <img src={imageUrl} alt="出退勤打刻用QRコード" className="mx-auto aspect-square w-full max-w-[min(60dvh,520px)]" /> : null}
              {error ? <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700"><AlertTriangle className="mr-1 inline h-5 w-5" />{error}</p> : <p className="mt-3 flex items-center justify-center gap-2 text-sm font-black text-slate-700"><Clock3 className="h-5 w-5 text-sky-700" />あと{remainingSeconds}秒有効・自動で切り替わります</p>}
              <button type="button" disabled={loading} onClick={() => void issue()} className="mt-4 min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-black disabled:opacity-50"><RefreshCw className={`mr-2 inline h-4 w-4 ${loading ? 'animate-spin' : ''}`} />今すぐ更新</button>
            </section>
          </main>
          <p className="text-center text-xs font-bold text-slate-400">QR画像を保存しても、有効期限後は打刻できません。</p>
        </div>
      )}
    </>
  );
}

export function PersonalAttendanceQrPunch({ currentUser }: { currentUser: UserProfile }) {
  const [action, setAction] = useState<'出勤' | '退勤' | null>(null);
  const [lastRecord, setLastRecord] = useState<AttendanceRecord | null>(null);
  const [message, setMessage] = useState('');

  const punch = async (token: string) => {
    if (!action || !currentUser.recorderProfileId) throw new Error('職員情報を確認できません。');
    try {
      const record = await punchAttendanceWithQr(currentUser.recorderProfileId, currentUser.displayName, token, action);
      setLastRecord(record);
      setMessage(`${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}に${action}として打刻しました。`);
      setAction(null);
    } catch (error) {
      throw new Error(attendanceErrorMessage(error));
    }
  };

  return (
    <section className="rounded-2xl border border-sky-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-800"><Clock3 className="h-5 w-5" /></span><div><h2 className="font-black text-slate-950">出退勤を打刻</h2><p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">操作を選び、玄関端末のQRコードを読み取ります。読み取った時点のサーバー時刻で記録されます。</p></div></div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => { setMessage(''); setAction('出勤'); }} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sky-700 text-sm font-black text-white"><Camera className="h-5 w-5" />出勤</button>
        <button type="button" onClick={() => { setMessage(''); setAction('退勤'); }} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-black text-white"><Camera className="h-5 w-5" />退勤</button>
      </div>
      {message && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800"><CheckCircle2 className="mr-1 inline h-5 w-5" />{message}</p>}
      {lastRecord && <p className="mt-2 text-[10px] font-bold text-slate-500">本日の状態：{lastRecord.status}／出勤 {formatAttendanceTime(lastRecord.clockInAt)}／退勤 {formatAttendanceTime(lastRecord.clockOutAt)}</p>}
      {action && <AttendanceQrScanner action={action} onClose={() => setAction(null)} onScanned={punch} />}
    </section>
  );
}

function AttendanceQrScanner({ action, onClose, onScanned }: { action: '出勤' | '退勤'; onClose: () => void; onScanned: (token: string) => Promise<void> }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const processingRef = useRef(false);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    let active = true;
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('この端末ではカメラを利用できません。ブラウザーとカメラ権限を確認してください。');
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        if (!active || !videoRef.current) return;
        const reader = new BrowserQRCodeReader();
        controlsRef.current = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result) => {
            if (!result || processingRef.current) return;
            const token = parseQrToken(result.getText());
            if (!token) {
              setError('打刻用ではないQRコードです。玄関端末のQRコードを読み取ってください。');
              return;
            }
            processingRef.current = true;
            setProcessing(true);
            setError('');
            void onScanned(token).catch((cause) => {
              processingRef.current = false;
              setProcessing(false);
              setError(attendanceErrorMessage(cause));
            });
          },
        );
      } catch (cause) {
        if (active) setError(attendanceErrorMessage(cause));
      }
    };
    void start();
    return () => {
      active = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [onScanned]);

  return (
    <div className="fixed inset-0 z-[190] flex flex-col bg-slate-950 text-white" role="dialog" aria-modal="true" aria-label={`${action}用QRコードを読み取る`}>
      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-[max(.75rem,env(safe-area-inset-top))]"><div><p className="text-xs font-black text-sky-300">{action}として打刻</p><h2 className="text-lg font-black">玄関端末のQRコードを枠内へ</h2></div><button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-700" aria-label="カメラを閉じる"><X className="h-6 w-6" /></button></header>
      <main className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-slate-950/25"><div className="aspect-square w-[min(72vw,420px)] rounded-3xl border-4 border-white shadow-[0_0_0_999px_rgba(2,6,23,.38)]" /></div>
        {processing && <div className="absolute inset-x-4 bottom-5 rounded-xl bg-sky-700 p-3 text-center text-sm font-black"><RefreshCw className="mr-2 inline h-5 w-5 animate-spin" />{action}を記録しています…</div>}
        {error && <p className="absolute inset-x-4 bottom-5 rounded-xl bg-rose-700 p-3 text-center text-sm font-black"><AlertTriangle className="mr-1 inline h-5 w-5" />{error}</p>}
      </main>
    </div>
  );
}

function formatAttendanceTime(value?: string) {
  return value ? new Date(value).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '未打刻';
}
