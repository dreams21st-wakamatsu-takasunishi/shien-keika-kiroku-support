import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, LoaderCircle, Printer, ShieldCheck, X } from 'lucide-react';
import QRCode from 'qrcode';
import type { LessonLink } from '../learning/contracts';
import type { LessonAccountAudit, LessonAccountCheck, LessonAccountStatus } from '../learning/accounts';
import { checkLessonAccount, loadLessonAccountAudits, verifyLessonLoginCard } from '../services/lessonLearningService';

const labels: Record<LessonAccountStatus, string> = { ready: '教室ログインの設定を確認済み', missing: 'Auth連携がありません', 'email-only': 'メールログインのみ・教室ログイン設定は要確認', review: 'Authと児童の対応を要確認', disabled: '教室ログインのAuthが停止中', unconfigured: '教室ログインのサーバー設定が未完了' };
const outcomes: Record<LessonAccountAudit['outcome'], string> = { started: '確認中・結果未確定', checked: '設定を確認', verified: '合言葉一致', denied: '確認不可', failed: '処理失敗' };
const stamp = (value: string) => new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
type Card = { loginNumber: string; loginUrl: string; passcode: string; expiresAt: string };

function LoginCard({ card, name, close }: { card: Card; name: string; close: () => void }) {
  const [qr, setQr] = useState('');
  const [hideName, setHideName] = useState(true);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => { let active = true; const previous = document.activeElement; void QRCode.toDataURL(card.loginUrl, { width: 144, margin: 1 }).then(value => { if (active) setQr(value); }).catch(() => {}); button.current?.focus(); return () => { active = false; if (previous instanceof HTMLElement) previous.focus(); }; }, [card.loginUrl]);
  return createPortal(<div id="lesson-verified-login-card" role="dialog" aria-modal="true" aria-label="確認済みログインカード" onClick={event => { if (event.target === event.currentTarget) close(); }} onKeyDown={event => {
    if (event.key === 'Escape') close();
    if (event.key === 'Tab') {
      const nodes = [...event.currentTarget.querySelectorAll('button,input')] as HTMLElement[], first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }} className="fixed inset-0 z-[200] flex items-start justify-center overflow-auto bg-black/50 p-4 sm:items-center">
    <style>{`@media print { html:has(#lesson-verified-login-card), body:has(#lesson-verified-login-card) { background:white !important; } body > *:not(#lesson-verified-login-card) { display:none !important; } #lesson-verified-login-card, #lesson-verified-login-card * { visibility:visible !important; } #lesson-verified-login-card { position:static !important; display:block !important; background:white !important; padding:0 !important; overflow:visible !important; } #lesson-verified-login-card .lesson-card-tools { display:none !important; } #lesson-verified-login-card .lesson-card-frame { width:100% !important; max-width:none !important; padding:0 !important; box-shadow:none !important; } #lesson-verified-login-card .lesson-card-sheet { width:140mm !important; max-width:100% !important; margin:12mm auto !important; box-shadow:none !important; break-inside:avoid; } }`}</style>
    <div className="lesson-card-frame w-full max-w-lg rounded-lg bg-white p-5 shadow-lg">
      <div className="lesson-card-tools mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hideName} onChange={event => setHideName(event.target.checked)} />氏名を印刷しない</label>
        <div className="flex gap-2"><button type="button" ref={button} onClick={() => { if (Date.parse(card.expiresAt) > Date.now()) window.print(); else close(); }} className="flex min-h-10 items-center gap-2 rounded-lg bg-teal-700 px-3 text-sm font-bold text-white"><Printer className="h-4 w-4" />印刷</button><button type="button" onClick={close} aria-label="カードを閉じて合言葉を消去" title="カードを閉じて合言葉を消去" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300"><X className="h-5 w-5" /></button></div>
      </div>
      <section className="lesson-card-sheet space-y-5 rounded-lg border-2 border-dashed border-teal-600 bg-white p-5 text-slate-950">
        <h4 className="text-2xl font-bold text-teal-800">Dレッスン</h4><p className="text-sm font-bold">ログインカード</p>
        {!hideName && <p className="break-words text-base font-bold">{name}</p>}
        <dl className="grid grid-cols-[95px_minmax(0,1fr)] items-center gap-3"><dt className="text-sm font-bold">児童番号</dt><dd className="break-all font-mono text-2xl font-bold">{card.loginNumber}</dd><dt className="text-sm font-bold">あいことば</dt><dd className="break-all font-mono text-2xl font-bold">{card.passcode}</dd></dl>
        <div className="flex flex-wrap items-center gap-3">{qr && <img src={qr} alt="Dレッスンを開くQRコード" width={144} height={144} />}<p className="min-w-0 flex-1 break-all text-xs text-slate-600">{card.loginUrl}</p></div>
      </section>
      <p className="lesson-card-tools mt-3 text-xs text-slate-600">画面表示は10分以内です。閉じる・児童切替・別タブへの移動で合言葉を消去します。</p>
    </div>
  </div>, document.body);
}

export function LessonAccountPanel({ link, name }: { link: LessonLink; name: string }) {
  const [result, setResult] = useState<LessonAccountCheck | null>(null);
  const [audits, setAudits] = useState<LessonAccountAudit[]>([]);
  const [passcode, setPasscode] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const version = useRef(0);
  const clearSecrets = () => { setCard(null); setPasscode(''); setConfirmed(false); };
  useEffect(() => {
    const hidden = () => { if (document.visibilityState === 'hidden') { version.current++; setBusy(false); clearSecrets(); } };
    document.addEventListener('visibilitychange', hidden);
    return () => { version.current++; document.removeEventListener('visibilitychange', hidden); };
  }, []);
  useEffect(() => {
    if (!card) return;
    const timer = window.setTimeout(clearSecrets, Math.max(0, Date.parse(card.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [card]);
  const run = async (verify: boolean) => {
    const request = ++version.current, secret = passcode;
    setBusy(true); setError(''); setCard(null); setResult(null); setAudits([]); setPasscode(''); setConfirmed(false);
    try {
      const next = verify ? await verifyLessonLoginCard(link, secret) : await checkLessonAccount(link);
      if (version.current !== request) return;
      setResult(next);
      if (verify && next.card && next.expiresAt && Date.parse(next.expiresAt) > Date.now()) setCard({ ...next.card, passcode: secret, expiresAt: next.expiresAt });
      const history = await loadLessonAccountAudits(link);
      if (version.current === request) setAudits(history);
    } catch (error) {
      if (version.current === request) { setCard(null); setResult(null); setError(error instanceof Error ? error.message : 'アカウントを確認できませんでした。'); }
    } finally { if (version.current === request) setBusy(false); }
  };
  return <section aria-label="学習アカウント確認" className="space-y-4 border-y border-slate-200 py-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-4 w-4 text-teal-700" />Auth・教室ログイン確認</h4><button type="button" onClick={() => void run(false)} disabled={busy} className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}アカウント設定を確認</button></div>
    {error && <p role="alert" className="border-l-4 border-rose-500 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
    {result && <>
      <p role="status" className={`border-l-4 p-3 text-sm ${result.account.status === 'ready' ? 'border-teal-500 bg-teal-50 text-teal-950' : 'border-amber-500 bg-amber-50 text-amber-950'}`}>{labels[result.account.status]}</p>
      <p className="text-xs text-slate-600">確認日時: {stamp(result.checkedAt)} / 児童番号: {result.account.loginNumber || '未登録'}</p>
      {result.account.status === 'ready' && <form aria-label="ログインカードの確認" onSubmit={event => { event.preventDefault(); if (confirmed && /^\d{6,12}$/.test(passcode)) void run(true); }} className="space-y-3">
        <label className="flex max-w-sm flex-col gap-1 text-sm font-bold">現在の合言葉<input type="password" aria-label="現在の合言葉" inputMode="numeric" autoComplete="off" value={passcode} maxLength={12} onChange={event => { setPasscode(event.target.value.replace(/\D/g, '')); setConfirmed(false); }} disabled={busy} className="min-h-10 rounded-lg border border-slate-300 px-3" /></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-teal-700" />{name}さんの合言葉であることを確認しました</label>
        <button type="submit" disabled={busy || !confirmed || !/^\d{6,12}$/.test(passcode)} className="flex min-h-10 items-center gap-2 rounded-lg bg-teal-700 px-3 text-sm font-bold text-white disabled:opacity-50"><KeyRound className="h-4 w-4" />合言葉を確認してカード表示</button>
      </form>}
    </>}
    <p className="text-xs text-slate-600">合言葉の取得・変更、新規Auth作成は行いません。カードには入力した合言葉の一致を確認できた場合のみ表示します。</p>
    {audits.length > 0 && <details><summary className="cursor-pointer text-sm font-bold">アカウント確認の操作履歴</summary><ul className="mt-2 divide-y divide-slate-100 text-xs">{audits.map(audit => <li key={audit.id} className="flex flex-wrap gap-2 py-2"><time dateTime={audit.at}>{stamp(audit.at)}</time><span>{audit.action === 'inspect' ? 'Auth設定確認' : 'カード用合言葉確認'}</span><span>{outcomes[audit.outcome]}</span></li>)}</ul></details>}
    {card && <LoginCard card={card} name={name} close={clearSecrets} />}
  </section>;
}
