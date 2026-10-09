import React, { useEffect, useRef, useState } from 'react';
import { LoaderCircle, RefreshCw, UserPlus, UserRoundCheck } from 'lucide-react';
import type { HandoffReason, RegistrationConfig, RegistrationOperation } from '../learning/studentRegistration';
import { loadStudentRegistrationConfig, registerLessonStudent, takeOverLessonRegistration } from '../services/lessonLearningService';
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
  const [reason, setReason] = useState<HandoffReason>('staff-unavailable');
  const [handoff, setHandoff] = useState<{ operation: RegistrationOperation; requestId: string; reason: HandoffReason } | null>(null);
  const [notice, setNotice] = useState('');
  const [card, setCard] = useState<Card | null>(null);
  const version = useRef(0), completed = useRef(false), finish = useRef(onCompleted);
  finish.current = onCompleted;
  const close = () => { setCard(null); if (completed.current) { completed.current = false; finish.current(); } };
  const refresh = async () => {
    const request = ++version.current;
    setBusy(true); setError(''); setNotice(''); setConfig(null); setConfirmation(''); setAcknowledged(false);
    try {
      const result = await loadStudentRegistrationConfig(childId);
      if (request !== version.current) return;
      setConfig(result); setCampus(previous => result.campuses.some(row => row.id === previous) ? previous : result.campuses[0]?.id || '');
      setPending(previous => result.operations.some(row => row.id === previous?.id) ? null : previous);
      setHandoff(previous => previous && result.operations.some(row => row.id === previous.operation.id && row.canTakeOver && row.handoffRevision === previous.operation.handoffRevision) ? previous : null);
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
  const takeOver = async (operation: RegistrationOperation) => {
    if (!config || busy || confirmation !== config.name || !acknowledged || !operation.canTakeOver) return;
    const request = ++version.current;
    const intent = handoff?.operation.id === operation.id && handoff.operation.handoffRevision === operation.handoffRevision
      ? handoff : { operation, requestId: crypto.randomUUID(), reason };
    setHandoff(intent); setBusy(true); setError(''); setNotice(''); setConfirmation(''); setAcknowledged(false);
    try {
      await takeOverLessonRegistration(childId, config, intent.operation, intent.requestId, intent.reason);
      const latest = await loadStudentRegistrationConfig(childId);
      if (request !== version.current) return;
      setConfig(latest); setHandoff(null); setNotice('引き継ぎを記録しました。氏名・確認欄を再確認して、同じ登録の結果を再確認してください。');
    } catch (cause) {
      if (request === version.current) {
        setError(cause instanceof Error ? cause.message : '引き継ぎ結果を確認できません。登録状況を再取得してください。');
        try {
          const latest = await loadStudentRegistrationConfig(childId);
          if (request === version.current) { setConfig(latest); if (!latest.operations.some(row => row.id === operation.id && row.canTakeOver && row.handoffRevision === operation.handoffRevision)) setHandoff(null); }
        } catch { /* Retry the same handoff request when its receipt cannot be read. */ }
      }
    } finally { if (request === version.current) setBusy(false); }
  };
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
    {notice && <p role="status" className="border-l-4 border-teal-600 bg-teal-50 p-3 text-sm">{notice}</p>}
    {config ? <>
      <dl className="grid gap-2 text-sm sm:grid-cols-[120px_minmax(0,1fr)]"><dt className="text-slate-600">名簿の氏名</dt><dd className="break-words font-bold">{config.name}</dd><dt className="text-slate-600">生年月日</dt><dd>{config.birthDate || '未登録'}</dd></dl>
      {!config.allowNew && !unresolved && <p role="status" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm">新規登録できません。生年月日の登録状態、過去の連携・登録履歴を確認してください。既存の学習IDがある場合は、そのIDを連携します。</p>}
      <label className="flex max-w-sm flex-col gap-1 text-sm font-bold">登録先校舎<select aria-label="新規登録先校舎" value={campus} disabled={busy || Boolean(unresolved) || !config.allowNew} onChange={event => setCampus(event.target.value)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3">{config.campuses.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label className="flex max-w-sm flex-col gap-1 text-sm font-bold">対象児童の氏名を入力<input aria-label="新規登録対象児童の氏名" value={confirmation} disabled={busy || Boolean(card)} onChange={event => setConfirmation(event.target.value)} autoComplete="off" className="min-h-10 rounded-lg border border-slate-300 px-3" /></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={acknowledged} disabled={busy || Boolean(card)} onChange={event => setAcknowledged(event.target.checked)} className="mt-1 h-4 w-4" />{config.allowNew ? '既存の学習アカウントがないこと、対象児童と共有先が正しいこと、学習情報の共有について説明・同意を確認しました' : '対象児童・共有先・説明同意と登録履歴を確認し、同じ学習IDの登録を再開することを確認しました'}</label>
      <button type="button" disabled={!confirmed || !config.allowNew || !campus || Boolean(unresolved) || Boolean(card)} onClick={() => void run({ id: crypto.randomUUID(), campusId: campus })} className="flex min-h-10 items-center gap-2 rounded-lg bg-teal-700 px-3 text-sm font-bold text-white disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}新規登録してカード表示</button>
      {config.operations.some(row => row.canTakeOver) && <label className="flex max-w-sm flex-col gap-1 text-sm font-bold">引き継ぎ理由<select aria-label="登録の引き継ぎ理由" value={reason} disabled={busy || Boolean(handoff)} onChange={event => setReason(event.target.value as HandoffReason)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3"><option value="staff-unavailable">担当者不在・退職</option><option value="permission-change">担当者の権限変更</option><option value="connection-failure">通信・端末障害</option><option value="other-confirmed">その他（確認済み）</option></select></label>}
      {config.operations.map(row => <div key={row.id} className="flex flex-wrap items-center gap-2 border-t border-slate-100 py-3 text-xs"><time>{new Date(row.at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</time><span>{phaseLabel[row.phase]}{row.handoffRevision > 0 ? ` / 引き継ぎ${row.handoffRevision}回` : ''}</span>{row.canResume && <button type="button" disabled={!confirmed || Boolean(card)} onClick={() => void run(row)} className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-300 px-2 disabled:opacity-50"><RefreshCw className="h-4 w-4" />同じ登録の結果を再確認</button>}{row.canTakeOver && <button type="button" disabled={!confirmed || Boolean(card)} onClick={() => void takeOver(row)} className="flex min-h-9 items-center gap-2 rounded-lg border border-amber-600 px-2 text-amber-950 disabled:opacity-50"><UserRoundCheck className="h-4 w-4" />{handoff?.operation.id === row.id ? '同じ引き継ぎを再確認' : 'この登録を引き継ぐ'}</button>}{!row.canResume && !row.canTakeOver && !['completed', 'denied'].includes(row.phase) && <span className="text-amber-900">担当者・処理中の状態・名簿・校舎・連携を確認してください</span>}</div>)}
    </> : busy && <p role="status" className="text-sm text-slate-600">登録設定を取得中...</p>}
    {pending && !config?.operations.some(row => row.id === pending.id) && !card && <button type="button" disabled={!confirmed} onClick={() => void run(pending)} className="flex min-h-10 items-center gap-2 rounded-lg border border-amber-600 px-3 text-sm disabled:opacity-50"><RefreshCw className="h-4 w-4" />未確定の同じ登録を再確認</button>}
    {card && <LoginCard card={card} name={config?.name || ''} close={close} />}
  </section>;
}
