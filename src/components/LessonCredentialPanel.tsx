import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, LoaderCircle, RefreshCw } from 'lucide-react';
import type { LessonLink } from '../learning/contracts';
import { validCredentialPasscode, type CredentialAction, type CredentialOperation } from '../learning/accountCredentials';
import { issueLessonCredentials, loadCredentialOperations } from '../services/lessonLearningService';
import { LoginCard, type Card } from './LessonAccountPanel';

const actionLabel = (action: CredentialAction) => action === 'issue' ? '教室アカウント発行' : '合言葉再発行';
const statusLabel = { requested: '結果未確定・再確認が必要', completed: '発行済み', denied: '変更せず終了' };

export function LessonCredentialPanel({ link, name }: { link: LessonLink; name: string }) {
  const [action, setAction] = useState<CredentialAction>('issue');
  const [confirmation, setConfirmation] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [repeatPasscode, setRepeatPasscode] = useState('');
  const [operations, setOperations] = useState<CredentialOperation[]>([]);
  const [pending, setPending] = useState<{ id: string; action: CredentialAction } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [card, setCard] = useState<Card | null>(null);
  const version = useRef(0);
  const clearPasscode = () => { setPasscode(''); setRepeatPasscode(''); };
  const passcodeReady = passcode === repeatPasscode && (passcode === '' || validCredentialPasscode(passcode));
  const refresh = async () => {
    const request = ++version.current;
    setBusy(true); setLoaded(false); setCard(null); setConfirmation(''); setAcknowledged(false); clearPasscode(); setError('');
    try { const result = await loadCredentialOperations(link); if (request === version.current) { setOperations(result); setLoaded(true); setPending(previous => result.some(item => item.id === previous?.id && item.status !== 'requested') ? null : previous); } }
    catch (cause) { if (request === version.current) setError(cause instanceof Error ? cause.message : '発行履歴を取得できません。'); }
    finally { if (request === version.current) setBusy(false); }
  };
  useEffect(() => {
    void refresh();
    const hidden = () => { if (document.visibilityState === 'hidden') { version.current++; setBusy(false); setCard(null); setConfirmation(''); setAcknowledged(false); clearPasscode(); } };
    document.addEventListener('visibilitychange', hidden);
    return () => { version.current++; document.removeEventListener('visibilitychange', hidden); };
  }, []);
  useEffect(() => {
    if (!card) return;
    const timer = window.setTimeout(() => setCard(null), Math.max(0, Date.parse(card.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [card]);
  const run = async (operation: { id: string; action: CredentialAction }) => {
    if (busy || confirmation !== name || !acknowledged || !passcodeReady) return;
    const request = ++version.current;
    setBusy(true); setCard(null); setError(''); setPending(operation); setConfirmation(''); setAcknowledged(false);
    clearPasscode();
    try {
      const result = await issueLessonCredentials(link, operation.id, operation.action, passcode || undefined);
      if (request !== version.current) return;
      if (!result.card || !result.expiresAt || Date.parse(result.expiresAt) <= Date.now()) throw Error('カードの有効期限を確認してください。同じ操作を再確認してください。');
      const history = await loadCredentialOperations(link);
      if (request !== version.current) return;
      setOperations(history); setLoaded(true); setPending(null);
      setCard({ ...result.card, passcode: result.passcode, expiresAt: result.expiresAt });
    } catch (cause) {
      if (request === version.current) {
        setError(cause instanceof Error ? cause.message : '発行結果が未確定です。同じ操作を再確認してください。');
        try { const history = await loadCredentialOperations(link); if (request === version.current) { setOperations(history); setLoaded(true); if (history.some(item => item.id === operation.id && item.status !== 'requested')) setPending(null); } } catch { /* Preserve the operation ID when the receipt is unavailable. */ }
      }
    } finally { if (request === version.current) setBusy(false); }
  };
  const unresolved = operations.some(operation => operation.status === 'requested') || pending !== null;
  const confirmed = loaded && !busy && confirmation === name && acknowledged && passcodeReady;
  return <section aria-label="学習アカウント発行・再発行" className="space-y-4 border-b border-slate-200 py-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="flex items-center gap-2 text-sm font-bold"><KeyRound className="h-4 w-4 text-teal-700" />アカウント発行・合言葉再発行</h4><button type="button" disabled={busy} onClick={() => void refresh()} className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50"><RefreshCw className="h-4 w-4" />発行履歴を更新</button></div>
    {error && <p role="alert" className="border-l-4 border-rose-500 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
    <fieldset disabled={busy || unresolved} className="flex flex-wrap gap-4"><legend className="mb-2 text-sm font-bold">操作</legend>{(['issue', 'reset'] as const).map(value => <label key={value} className="flex items-center gap-2 text-sm"><input type="radio" name={`credential-${link.id}`} checked={action === value} onChange={() => { setAction(value); setAcknowledged(false); }} />{actionLabel(value)}</label>)}</fieldset>
    <p className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950">再発行すると以前の合言葉は使えなくなります。学習ID・取り組み記録は引き継ぎます。同じ本人の旧ログインも同じ合言葉に更新します。番号重複・本人情報や所有関係の矛盾がある場合は変更を止めます。</p>
    <fieldset disabled={busy} className="space-y-2 rounded-xl border border-slate-200 px-3 pb-3">
      <legend className="px-1 text-sm font-bold">合言葉の設定</legend>
      <p className="text-xs text-slate-600">空欄なら数字6桁を自動発行。指定する場合は数字6桁を2回入力してください。手動設定した操作を再確認するときは、最初と同じ合言葉を入力します。</p>
      <div className="grid max-w-xl gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-bold">設定する合言葉（任意）<input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={passcode} onChange={event => { setPasscode(event.target.value); setAcknowledged(false); }} className="min-h-10 w-full rounded-lg border border-slate-300 px-3" /></label>
        <label className="flex flex-col gap-1 text-xs font-bold">設定する合言葉（確認）<input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={repeatPasscode} onChange={event => { setRepeatPasscode(event.target.value); setAcknowledged(false); }} className="min-h-10 w-full rounded-lg border border-slate-300 px-3" /></label>
      </div>
      {!passcodeReady && <p className="text-xs font-bold text-rose-800">数字6桁で、2つの入力を一致させてください。</p>}
    </fieldset>
    <label className="flex max-w-sm flex-col gap-1 text-sm font-bold">対象児童の氏名を入力<input aria-label="発行対象児童の氏名" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} autoComplete="off" className="min-h-10 rounded-lg border border-slate-300 px-3" /></label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} disabled={busy} className="mt-1 h-4 w-4" />{name}さんの操作であり、再発行時は古い合言葉が使えなくなることを確認しました</label>
    <button type="button" disabled={!confirmed || unresolved} onClick={() => void run({ id: crypto.randomUUID(), action })} className="flex min-h-10 items-center gap-2 rounded-lg bg-teal-700 px-3 text-sm font-bold text-white disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}{actionLabel(action)}してカード表示</button>
    {pending && !operations.some(item => item.id === pending.id) && <button type="button" disabled={!confirmed} onClick={() => void run(pending)} className="flex min-h-10 items-center gap-2 rounded-lg border border-amber-600 px-3 text-sm"><RefreshCw className="h-4 w-4" />未確定の同じ操作を再確認</button>}
    <ul className="divide-y divide-slate-100 text-xs">{operations.map(operation => <li key={operation.id} className="flex flex-wrap items-center gap-2 py-3"><time dateTime={operation.at}>{new Date(operation.at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</time><span>{actionLabel(operation.action)} / {statusLabel[operation.status]}</span>{operation.canResume && <button type="button" disabled={!confirmed} onClick={() => void run(operation)} className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-300 px-2 disabled:opacity-50"><RefreshCw className="h-4 w-4" />同じ操作の結果を再確認</button>}</li>)}</ul>
    {card && <LoginCard card={card} name={name} close={() => setCard(null)} />}
  </section>;
}
