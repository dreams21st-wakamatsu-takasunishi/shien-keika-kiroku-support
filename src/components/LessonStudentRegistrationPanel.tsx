import React, { useEffect, useRef, useState } from 'react';
import { LoaderCircle, RefreshCw, UserPlus } from 'lucide-react';
import type { RegistrationConfig } from '../learning/studentRegistration';
import { loadStudentRegistrationConfig, registerLessonStudent } from '../services/lessonLearningService';
import { LoginCard, type Card } from './LessonAccountPanel';

const phaseLabel = { requested: '結果未確定', 'source-created': '学習ID確保済み', linked: '連携済み・アカウント発行待ち', completed: '登録完了', denied: '作成せず終了' };
export function LessonStudentRegistrationPanel({ childId, hasLink, onCompleted }: { childId: string; hasLink: boolean; onCompleted: () => void }) {
  const [config, setConfig] = useState<RegistrationConfig | null>(null);
  const [campus, setCampus] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{ id: string; campusId: string } | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const version = useRef(0), completed = useRef(false), finish = useRef(onCompleted);
  finish.current = onCompleted;
  const close = () => { setCard(null); if (completed.current) { completed.current = false; finish.current(); } };
  const refresh = async () => {
    const request = ++version.current;
    setBusy(true); setError(''); setConfig(null); setConfirmation(''); setAcknowledged(false);
    try {
      const result = await loadStudentRegistrationConfig(childId);
      if (request !== version.current) return;
      setConfig(result); setCampus(previous => result.campuses.some(row => row.id === previous) ? previous : result.campuses[0]?.id || '');
      setPending(previous => result.operations.some(row => row.id === previous?.id) ? null : previous);
    } catch (cause) { if (request === version.current) setError(cause instanceof Error ? cause.message : '登録設定を取得できません。'); }
    finally { if (request === version.current) setBusy(false); }
  };
  useEffect(() => {
    void refresh();
    const hidden = () => { if (document.visibilityState === 'hidden') { version.current++; setBusy(false); setConfirmation(''); setAcknowledged(false); close(); } };
    document.addEventListener('visibilitychange', hidden);
    return () => { version.current++; document.removeEventListener('visibilitychange', hidden); };
  }, []);
  useEffect(() => {
    if (!card) return;
    const timer = window.setTimeout(close, Math.max(0, Date.parse(card.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [card]);
  const run = async (operation: { id: string; campusId: string }) => {
    if (!config || busy || confirmation !== config.name || !acknowledged) return;
    const request = ++version.current;
    setBusy(true); setError(''); setPending(operation); setConfirmation(''); setAcknowledged(false);
    try {
      const result = await registerLessonStudent(childId, config, operation.id, operation.campusId);
      if (request !== version.current) return;
      if (!result.credentials.card || !result.credentials.expiresAt) throw Error('登録結果を確認してください。');
      completed.current = true;
      setCard({ ...result.credentials.card, passcode: result.credentials.passcode, expiresAt: result.credentials.expiresAt });
      // Keep the card mounted until the user closes it; refreshing the roster unmounts this panel.
      setConfig(previous => previous && ({ ...previous, allowNew: false }));
    } catch (cause) {
      if (request === version.current) {
        setError(cause instanceof Error ? cause.message : '登録結果が未確定です。同じ操作を再確認してください。');
        try {
          const latest = await loadStudentRegistrationConfig(childId);
          if (request === version.current) { setConfig(latest); if (latest.operations.some(row => row.id === operation.id)) setPending(null); }
        } catch { /* Keep the operation ID when the durable receipt cannot be read. */ }
      }
    } finally { if (request === version.current) setBusy(false); }
  };
  if (hasLink && config && config.operations.length === 0) return null;
  const confirmed = Boolean(config && !busy && confirmation === config.name && acknowledged);
  const unresolved = pending !== null || config?.operations.some(row => !['completed', 'denied'].includes(row.phase));
  return <section aria-label="未連携児童の新規登録" className="space-y-4 border-t border-slate-300 py-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="flex items-center gap-2 text-sm font-bold"><UserPlus className="h-4 w-4 text-teal-700" />学習アカウントの新規登録</h4><button type="button" disabled={busy || Boolean(card)} onClick={() => void refresh()} className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50"><RefreshCw className="h-4 w-4" />登録状況を更新</button></div>
    {error && <p role="alert" className="border-l-4 border-rose-500 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
    {config ? <>
      <dl className="grid gap-2 text-sm sm:grid-cols-[120px_minmax(0,1fr)]"><dt className="text-slate-600">名簿の氏名</dt><dd className="break-words font-bold">{config.name}</dd><dt className="text-slate-600">生年月日</dt><dd>{config.birthDate || '未登録'}</dd></dl>
      {!config.allowNew && !unresolved && <p role="status" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm">新規登録できません。生年月日の登録状態、過去の連携・登録履歴を確認してください。既存の学習IDがある場合は、そのIDを連携します。</p>}
      <label className="flex max-w-sm flex-col gap-1 text-sm font-bold">登録先校舎<select aria-label="新規登録先校舎" value={campus} disabled={busy || Boolean(unresolved) || !config.allowNew} onChange={event => setCampus(event.target.value)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3">{config.campuses.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label className="flex max-w-sm flex-col gap-1 text-sm font-bold">対象児童の氏名を入力<input aria-label="新規登録対象児童の氏名" value={confirmation} disabled={busy || Boolean(card)} onChange={event => setConfirmation(event.target.value)} autoComplete="off" className="min-h-10 rounded-lg border border-slate-300 px-3" /></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={acknowledged} disabled={busy || Boolean(card)} onChange={event => setAcknowledged(event.target.checked)} className="mt-1 h-4 w-4" />既存の学習アカウントがないこと、対象児童と共有先が正しいこと、学習情報の共有について説明・同意を確認しました</label>
      <button type="button" disabled={!confirmed || !config.allowNew || !campus || Boolean(unresolved) || Boolean(card)} onClick={() => void run({ id: crypto.randomUUID(), campusId: campus })} className="flex min-h-10 items-center gap-2 rounded-lg bg-teal-700 px-3 text-sm font-bold text-white disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}新規登録してカード表示</button>
      {config.operations.map(row => <div key={row.id} className="flex flex-wrap items-center gap-2 border-t border-slate-100 py-3 text-xs"><time>{new Date(row.at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</time><span>{phaseLabel[row.phase]}</span>{row.canResume && <button type="button" disabled={!confirmed || Boolean(card)} onClick={() => void run(row)} className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-300 px-2 disabled:opacity-50"><RefreshCw className="h-4 w-4" />同じ登録の結果を再確認</button>}</div>)}
    </> : busy && <p role="status" className="text-sm text-slate-600">登録設定を取得中...</p>}
    {pending && !config?.operations.some(row => row.id === pending.id) && !card && <button type="button" disabled={!confirmed} onClick={() => void run(pending)} className="flex min-h-10 items-center gap-2 rounded-lg border border-amber-600 px-3 text-sm disabled:opacity-50"><RefreshCw className="h-4 w-4" />未確定の同じ登録を再確認</button>}
    {card && <LoginCard card={card} name={config?.name || ''} close={close} />}
  </section>;
}
