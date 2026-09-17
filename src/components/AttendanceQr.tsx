import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Clock3, QrCode, RefreshCw, X } from 'lucide-react';
import type { AttendanceQrChallenge, UserProfile } from '../types';
import { registerAttendanceKioskDevice } from '../services/dataService';
import { getPersonalStaffQrStatus, issuePersonalStaffQr, revokePersonalStaffQr, scanPersonalStaffQr, staffQrError } from '../services/staffQrService';
import type { StaffQrAttendanceResult } from '../services/staffQrService';
import { attendanceQrPayload } from '../utils/attendanceQr';
import { AttendanceQrScanner } from './AttendanceQrScanner';

const timeLabel = (value: string | number) => new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}).format(new Date(value));

/** Available even before login: the server requires the registered shared device. */
export function FacilityQrPunchControls({ disabled = false }: { disabled?: boolean }) {
  const [action, setAction] = useState<'出勤' | '退勤' | null>(null);
  const [result, setResult] = useState<StaffQrAttendanceResult | null>(null);
  const punch = async (token: string) => {
    if (!action) return;
    const data = await scanPersonalStaffQr(token, action);
    if (!data.attendance || data.attendance.action !== action) throw new Error('打刻結果を確認できません。勤務実績を確認してください。');
    setResult(data.attendance);
    setAction(null);
  };
  return <>
    <div className="grid grid-cols-2 gap-2">
      {(['出勤', '退勤'] as const).map((item) => <button key={item} type="button" disabled={disabled} onClick={() => { setResult(null); setAction(item); }} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-black text-white disabled:opacity-50 ${item === '出勤' ? 'bg-sky-700' : 'bg-slate-800'}`}><Camera className="h-5 w-5" />{item}を読み取る</button>)}
    </div>
    {result && <div role="status" className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-900"><CheckCircle2 className="mr-1 inline h-5 w-5" />{result.displayName}さん：{timeLabel(result.scannedAt)}に{result.action}を記録しました。<p className="mt-1 text-xs">出勤 {result.clockInAt ? timeLabel(result.clockInAt) : '未打刻'} ／ 退勤 {result.clockOutAt ? timeLabel(result.clockOutAt) : '未打刻'}</p></div>}
    {action && <AttendanceQrScanner action={action} onClose={() => setAction(null)} onScanned={punch} />}
  </>;
}

export function AttendanceQrKiosk({ enabled, canRegister }: { enabled: boolean; canRegister: boolean }) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);
  const register = async () => {
    if (!window.confirm('この端末を承認済み施設共用端末として登録しますか？個人端末として登録済みの場合は施設共用に切り替わります。')) return;
    setRegistering(true);
    try { await registerAttendanceKioskDevice(); setMessage('施設共用端末として登録しました。本人用QRを読み取れます。'); }
    catch (error) { setMessage(staffQrError(error)); }
    finally { setRegistering(false); }
  };
  if (!enabled) return null;
  return <>
    <button type="button" onClick={() => setOpen(true)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-black text-white"><Camera className="h-5 w-5" />事業所で本人用QRを読み取る</button>
    {open && <div role="dialog" aria-modal="true" aria-label="事業所のQR打刻" className="fixed inset-0 z-[180] flex flex-col overflow-y-auto bg-slate-950 p-4 text-white sm:p-6">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3"><h2 className="text-xl font-black">事業所のQR打刻</h2><button type="button" onClick={() => setOpen(false)} aria-label="QR打刻画面を閉じる" className="grid h-12 w-12 place-items-center rounded-xl border border-slate-600"><X /></button></header>
      <section className="m-auto w-full max-w-xl space-y-5 rounded-3xl bg-white p-5 text-slate-950 sm:p-8">
        <div className="rounded-2xl bg-slate-100 p-4 text-center"><p className="text-sm font-bold">{new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'full' }).format(now)}</p><p className="mt-1 font-mono text-4xl font-black tabular-nums">{timeLabel(now)}</p><p className="mt-1 text-xs text-slate-500">表示は端末時計・打刻はサーバー時刻</p></div>
        <p className="text-sm font-bold leading-relaxed">出勤・退勤を選び、職員の個人端末に表示した本人用QRを、この端末のカメラで読み取ってください。</p>
        <FacilityQrPunchControls disabled={registering} />
        <p className="text-xs leading-relaxed text-slate-600">打刻だけではログイン中の職員は切り替わりません。ログインに使う場合はログアウト後の「本人用QRでログイン」を選んでください。</p>
        {canRegister && <details className="border-t border-slate-200 pt-3"><summary className="cursor-pointer text-sm font-bold">初回の事業所端末登録</summary><button type="button" disabled={registering} onClick={() => void register()} className="mt-3 min-h-11 rounded-xl border border-sky-700 px-3 text-sm font-black text-sky-800 disabled:opacity-50">{registering ? '登録中…' : 'この端末を施設共用端末として登録'}</button><p className="mt-2 text-xs">ログアウト後も同じブラウザーで読み取りできます。</p></details>}
        {message && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
      </section>
    </div>}
  </>;
}

function PersonalQrDisplay({ onClose }: { onClose: () => void }) {
  const [challenge, setChallenge] = useState<(AttendanceQrChallenge & { displayName: string }) | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [receipt, setReceipt] = useState('');
  const [now, setNow] = useState(Date.now());
  const alive = useRef(false);
  const busy = useRef(false);
  const generation = useRef(0);
  const token = useRef('');
  const offset = useRef(0);

  const issue = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const sequence = ++generation.current;
    setLoading(true); setError(''); setReceipt(''); setStatusError(''); setImageUrl(''); setChallenge(null);
    try {
      const next = await issuePersonalStaffQr();
      if (!alive.current || sequence !== generation.current) { void revokePersonalStaffQr(next.token).catch(() => {}); return; }
      token.current = next.token;
      const qr = await import('qrcode');
      const image = await qr.toDataURL(attendanceQrPayload(next.token), { width: 480, margin: 2, errorCorrectionLevel: 'M' });
      if (!alive.current || sequence !== generation.current) return;
      offset.current = Date.parse(next.serverNow) - Date.now();
      setNow(Date.now() + offset.current); setChallenge(next); setImageUrl(image);
    } catch (cause) { if (alive.current && sequence === generation.current) setError(staffQrError(cause)); }
    finally { busy.current = false; if (alive.current) setLoading(false); }
  }, []);

  useEffect(() => {
    alive.current = true;
    // Defer so React StrictMode's setup/cleanup probe cannot issue two QRs.
    const initial = window.setTimeout(() => void issue(), 0);
    const hide = () => {
      if (!document.hidden) return;
      generation.current++;
      if (token.current) void revokePersonalStaffQr(token.current).catch(() => {});
      token.current = ''; setChallenge(null); setImageUrl(''); setError('安全のためQRを非表示にしました。「新しいQRを表示」を押してください。');
    };
    document.addEventListener('visibilitychange', hide);
    const timer = window.setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => {
      alive.current = false; generation.current++;
      document.removeEventListener('visibilitychange', hide); clearInterval(timer); clearTimeout(initial);
      if (token.current) void revokePersonalStaffQr(token.current).catch(() => {});
    };
  }, [issue]);

  useEffect(() => {
    if (!challenge) return;
    const sequence = generation.current;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await getPersonalStaffQrStatus(challenge.token);
        if (!active || sequence !== generation.current) return;
        setStatusError('');
        if (result.usedAt && result.action) {
          setReceipt(result.action === 'ログイン'
            ? 'ログイン用QRを受け付けました。事業所端末でログイン結果を確認してください。'
            : `${timeLabel(result.usedAt)}に${result.action}を記録しました。`);
          setImageUrl(''); setChallenge(null); return;
        }
      } catch { if (active) setStatusError('結果を確認できません。通信と事業所端末の表示を確認してください。'); }
      if (active) timer = setTimeout(() => void poll(), 3000);
    };
    timer = setTimeout(() => void poll(), 1500);
    const refresh = setTimeout(() => void issue(), challenge.refreshAfterSeconds * 1000);
    return () => { active = false; clearTimeout(timer); clearTimeout(refresh); };
  }, [challenge, issue]);
  const seconds = challenge ? Math.max(0, Math.ceil((Date.parse(challenge.expiresAt) - now) / 1000)) : 0;

  return <div role="dialog" aria-modal="true" aria-label="本人用QRコード" className="fixed inset-0 z-[180] overflow-y-auto bg-slate-950 p-4 text-white sm:p-6">
    <header className="mx-auto flex max-w-xl items-center justify-between gap-3"><h2 className="text-lg font-black">本人用QRコード</h2><button type="button" onClick={onClose} aria-label="本人用QRを閉じる" className="grid h-11 w-11 place-items-center rounded-xl border border-slate-600"><X /></button></header>
    <section className="mx-auto mt-4 max-w-xl rounded-3xl bg-white p-4 text-center text-slate-950 sm:p-6">
      <p className="text-lg font-black">{challenge?.displayName || '事業所端末に読み取らせてください'}</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">事業所側で「ログイン・出勤・退勤」を選択します。<br />この端末でのカメラ操作は不要です。</p>
      {loading && <div role="status" className="grid h-48 place-items-center"><RefreshCw className="h-10 w-10 animate-spin text-sky-700" /></div>}
      {!loading && imageUrl && seconds > 0 && <img src={imageUrl} alt="ログイン・出退勤用の本人用QR" className="mx-auto my-3 aspect-square w-full max-w-[min(48dvh,400px)]" />}
      {challenge && <p className="mt-3 text-sm font-bold text-slate-600"><Clock3 className="mr-1 inline h-4 w-4" />{seconds > 0 ? `あと${seconds}秒有効・自動更新` : '有効期限切れです。新しいQRを表示してください。'}</p>}
      {receipt && <p role="status" className="my-5 rounded-xl bg-emerald-50 p-4 font-bold text-emerald-800"><CheckCircle2 className="mx-auto mb-2 h-9 w-9" />{receipt}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-800"><AlertTriangle className="mr-1 inline h-5 w-5" />{error}</p>}
      {statusError && <p role="alert" className="mt-3 text-xs text-amber-800">{statusError}</p>}
      <button type="button" disabled={loading} onClick={() => void issue()} className="mt-4 min-h-12 w-full rounded-xl bg-sky-700 px-3 text-sm font-black text-white disabled:opacity-50"><RefreshCw className="mr-2 inline h-4 w-4" />新しいQRを表示</button>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">QRは1回限り・2分間有効です。ログインと打刻を続けて行う場合は新しいQRを表示してください。QRの画像を他の人に送らないでください。</p>
    </section>
  </div>;
}

export function PersonalStaffQr({ currentUser }: { currentUser: UserProfile }) {
  const [open, setOpen] = useState(false);
  return <section className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm">
    <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-800"><QrCode className="h-6 w-6" /></span><div><h2 className="font-black text-slate-950">出退勤・事業所端末へのログイン</h2><p className="mt-1 text-xs leading-relaxed text-slate-600">{currentUser.displayName}さんの本人用QRを表示し、事業所の端末で読み取ります。</p></div></div>
    <button type="button" onClick={() => setOpen(true)} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-700 text-sm font-black text-white"><QrCode className="h-5 w-5" />本人用QRを表示</button>
    {open && <PersonalQrDisplay onClose={() => setOpen(false)} />}
  </section>;
}
