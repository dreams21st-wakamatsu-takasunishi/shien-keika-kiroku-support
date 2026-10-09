import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpenCheck, Check, Link2, LoaderCircle, RefreshCw, Search, Unlink } from 'lucide-react';
import type { ChildProfile } from '../types';
import type { LessonHistory, LessonIdentity, LessonLink } from '../learning/contracts';
import { isStudentId } from '../learning/contracts';
import { disableLessonLink, inspectLessonStudent, linkLessonStudent, loadLessonHistory, loadLessonLinks } from '../services/lessonLearningService';
import { getLocalDateString } from '../utils/weekdays';
import {WordReviewInbox} from './WordReviewInbox';
import {LearningTaskManager} from './LearningTaskManager';
import { LessonProgressPanel } from './LessonProgressPanel';
import { LessonAccountPanel } from './LessonAccountPanel';
import { LessonCredentialPanel } from './LessonCredentialPanel';
import { LessonStudentRegistrationPanel } from './LessonStudentRegistrationPanel';

export function LessonLearningManager({ childrenList, remoteMode, scopeKey,reviewFocus=0 }: { childrenList: ChildProfile[]; remoteMode: boolean; scopeKey: string;reviewFocus?:number }) {
  const [tab, setTab] = useState<'history' | 'links'|'reviews'|'tasks'|'progress'>('history');
  useEffect(()=>{if(reviewFocus){setTab('reviews');setChildId('');}},[reviewFocus]);
  const [links, setLinks] = useState<LessonLink[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [canManageAccounts, setCanManageAccounts] = useState(false);
  const [canIssueAccounts, setCanIssueAccounts] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [childId, setChildId] = useState('');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState(getLocalDateString());
  const [studentId, setStudentId] = useState('');
  const [candidate, setCandidate] = useState<{ identity: LessonIdentity; fingerprint: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [history, setHistory] = useState<LessonHistory | null>(null);
  const [listBusy, setListBusy] = useState(false);
  const [operationBusy, setOperationBusy] = useState(false);
  const [listError, setListError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const requestVersion = useRef(0);
  const listVersion = useRef(0);
  const busy = listBusy || operationBusy;
  const selectedChild = childrenList.find(child => child.id === childId);
  const selectedLink = links.find(link => link.child_id === childId);

  const refresh = useCallback(async () => {
    const version = ++listVersion.current;
    setListBusy(remoteMode); setListError(''); setLoaded(false); setLinks([]); setCanManage(false); setCanManageAccounts(false); setCanIssueAccounts(false); setConfigured(false); setHistory(null); setCandidate(null); setConfirmed(false);
    if (!remoteMode) return;
    try {
      const result = await loadLessonLinks();
      if (version !== listVersion.current) return;
      setLinks(result.links); setCanManage(result.canManageLinks); setCanManageAccounts(result.canManageAccounts === true); setCanIssueAccounts(result.canIssueAccounts === true); setConfigured(result.configured); setLoaded(true);
    } catch (error) {
      if (version === listVersion.current) setListError(error instanceof Error ? error.message : '連携一覧を取得できませんでした。');
    } finally { if (version === listVersion.current) setListBusy(false); }
  }, [remoteMode, scopeKey]);
  useEffect(() => {
    requestVersion.current++; setHistory(null); setCandidate(null); setConfirmed(false); setStudentId(''); setMessage(''); setError(''); setOperationBusy(false);
  }, [childId, date]);
  useEffect(() => { setOperationBusy(false); setError(''); setMessage(''); void refresh(); return () => { listVersion.current++; requestVersion.current++; }; }, [refresh]);

  const run = async (operation: (version: number) => Promise<void>) => {
    const version = ++requestVersion.current;
    setOperationBusy(true); setError(''); setMessage('');
    try { await operation(version); } catch (error) { if (version === requestVersion.current) setError(error instanceof Error ? error.message : '処理を完了できませんでした。'); }
    finally { if (version === requestVersion.current) setOperationBusy(false); }
  };
  const readHistory = async (version: number) => {
    setHistory(null);
    const result = await loadLessonHistory(childId, date);
    if (version === requestVersion.current) setHistory(result);
  };
  const verify = async (version: number) => {
    setCandidate(null); setConfirmed(false);
    const result = await inspectLessonStudent(childId, studentId.trim());
    if (version === requestVersion.current) setCandidate(result);
  };
  const saveLink = async (version: number) => {
    if (!candidate || !confirmed) return;
    await linkLessonStudent(childId, candidate.identity.studentId, candidate.fingerprint);
    if (version !== requestVersion.current) return;
    setCandidate(null); setConfirmed(false); setStudentId('');
    await refresh(); if (version === requestVersion.current) setMessage('学習アカウントを連携しました。');
  };
  const disable = async (version: number) => {
    if (!selectedLink || !window.confirm(`${selectedChild?.name || '選択児童'}の学習連携を解除しますか？\n学習データ・ログイン・支援経過記録は削除されません。`)) return;
    await disableLessonLink(selectedLink);
    if (version !== requestVersion.current) return;
    await refresh(); if (version === requestVersion.current) setMessage('学習連携を解除しました。');
  };
  const filtered = childrenList.filter(child => `${child.name} ${child.kana || ''}`.normalize('NFKC').includes(search.normalize('NFKC').trim()));

  return <div className="mx-auto max-w-[1400px] space-y-4">
    <section className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
      <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950"><BookOpenCheck className="h-5 w-5 text-teal-700" />学習管理</h2>
      <button type="button" onClick={() => void refresh()} disabled={!remoteMode || busy} title="連携一覧を更新" className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />更新</button>
    </section>
    {!remoteMode && <p role="status" className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950">学習連携には職員ログインとクラウド接続が必要です。</p>}
    {remoteMode && loaded && !configured && <p role="status" className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950">学習連携のサーバー設定が未完了です。</p>}
    {error && <p role="alert" className="border-l-4 border-rose-500 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>}
    {listError && <p role="alert" className="border-l-4 border-rose-500 bg-rose-50 px-4 py-3 text-sm text-rose-900">{listError}</p>}
    {message && <p role="status" className="flex items-center gap-2 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><Check className="h-4 w-4" />{message}</p>}
    <div role="tablist" aria-label="学習管理の表示" className="flex flex-wrap gap-1 border-b border-slate-200">
      {([['history', '当日の取り組み'], ['progress', '児童別進捗'], ['tasks','課題の指定'], ['reviews','Word確認'], ['links', 'アカウント連携']] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`min-h-11 border-b-2 px-4 text-sm font-bold ${tab === value ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-600'}`}>{label}</button>)}
    </div>
    {tab === 'tasks' && <div className="flex flex-wrap items-end gap-3">
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-bold text-slate-700">対象児童
        <select aria-label="課題の対象児童" value={selectedChild ? childId : ''} disabled={operationBusy || !remoteMode} onChange={event => setChildId(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 sm:max-w-md">
          <option value="">児童を選択</option>
          {childrenList.map(child => <option key={child.id} value={child.id}>{child.name}{loaded ? links.some(link => link.child_id === child.id) ? '（連携済み）' : '（未連携）' : ''}</option>)}
        </select>
      </label>
      <p role="status" className="py-2 text-xs text-slate-600">{listBusy ? '連携情報を読み込み中...' : loaded ? `${childrenList.length}名・連携済み ${links.filter(link => childrenList.some(child => child.id === link.child_id)).length}名` : remoteMode ? '連携情報を取得できていません。' : 'クラウド未接続'}</p>
    </div>}
    <div className={`grid min-w-0 gap-5 ${tab === 'tasks' ? '' : 'lg:grid-cols-[280px_minmax(0,1fr)]'}`}>
      {tab !== 'tasks' && <aside className="min-w-0 border-b border-slate-200 pb-4 lg:border-b-0 lg:border-r lg:pr-5">
        <label className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><input aria-label="児童を検索" value={search} onChange={event => setSearch(event.target.value)} placeholder="児童名で検索" className="min-h-10 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm" /></label>
        <p className="my-3 text-xs text-slate-600">{filtered.length}名・連携済み {loaded ? links.filter(link => childrenList.some(child => child.id === link.child_id)).length : '—'}名</p>
        <div className="max-h-[50vh] overflow-y-auto lg:max-h-[65vh]">
          {tab==='reviews'&&<button type="button" disabled={busy} onClick={()=>setChildId('')} aria-pressed={!childId} className={`min-h-11 w-full border-b border-slate-100 px-3 text-left text-sm font-bold ${!childId?'bg-teal-50 text-teal-950':''}`}>すべての申請</button>}
          {filtered.map(child => <button key={child.id} type="button" disabled={busy} onClick={() => setChildId(child.id)} aria-pressed={childId === child.id} className={`flex min-h-14 w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left text-sm disabled:opacity-50 ${childId === child.id ? 'bg-teal-50 text-teal-950' : 'hover:bg-slate-50'}`}><span className="min-w-0 break-words font-bold">{child.name}</span><span className="shrink-0 text-xs text-slate-600">{loaded ? links.some(link => link.child_id === child.id) ? '連携済み' : '未連携' : '未確認'}</span></button>)}
          {filtered.length === 0 && <p className="py-6 text-center text-sm text-slate-600">該当する児童がいません。</p>}
        </div>
      </aside>}
      <section className="min-w-0 space-y-4" aria-label={tab === 'history' ? '当日の取り組み' : tab === 'progress' ? '児童別進捗' : tab === 'reviews' ? 'Word確認' : tab==='tasks'?'課題の指定':'アカウント連携'}>
        {tab==='reviews'?<WordReviewInbox childrenList={childrenList} childId={childId} remoteMode={remoteMode} scopeKey={scopeKey}/>:!selectedChild ? <p className="py-10 text-center text-sm text-slate-600">児童を選択してください。</p> : <>
          <div className="flex flex-wrap items-center gap-3"><h3 className="break-words text-base font-bold text-slate-950">{selectedChild.name}</h3>{selectedLink && <span className="text-xs text-slate-600">Dレッスン: {selectedLink.source_display_name}</span>}</div>
          {tab === 'progress' ? selectedLink && remoteMode && configured && loaded ? <div key={`${scopeKey}:${childId}:${selectedLink.id}:${selectedLink.revision}`}><LessonProgressPanel link={selectedLink} /></div> : <p role="status" className="py-6 text-sm text-slate-600">{!remoteMode ? '職員ログインとクラウド接続が必要です。' : listBusy ? '連携情報を読み込み中...' : !loaded ? '連携情報の取得に失敗しました。' : !configured ? '学習連携のサーバー設定が未完了です。' : 'この児童の学習アカウントは未連携です。'}</p> : tab==='tasks'?selectedLink&&configured&&loaded?<div key={`${scopeKey}:${childId}:${selectedLink.id}:${selectedLink.revision}`}><LearningTaskManager childId={childId} linkId={selectedLink.id} canManage={canManage} scopeKey={scopeKey}/></div>:<div className="space-y-3 py-6 text-sm text-slate-600">
            <p role="status">{!remoteMode ? '職員ログインとクラウド接続が必要です。' : listBusy ? '連携情報を読み込み中...' : !loaded ? '連携情報の取得に失敗しました。' : !configured ? '学習連携のサーバー設定が未完了です。' : 'この児童の学習アカウントは未連携です。'}</p>
            {remoteMode && !listBusy && !loaded && <button type="button" onClick={() => void refresh()} className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3"><RefreshCw className="h-4 w-4" />再取得</button>}
            {loaded && configured && !selectedLink && canManage && <button type="button" onClick={() => setTab('links')} className="flex min-h-10 items-center gap-2 rounded-lg border border-teal-600 px-3 text-teal-800"><Link2 className="h-4 w-4" />アカウント連携</button>}
          </div>:tab === 'history' ? <>
            <div className="flex flex-wrap items-end gap-3"><label className="flex flex-col gap-1 text-xs font-bold text-slate-700">実施日<input type="date" aria-label="実施日" value={date} disabled={busy} onChange={event => setDate(event.target.value)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" /></label><button type="button" disabled={busy || !selectedLink || !configured || !loaded || !date} onClick={() => void run(readHistory)} className="flex min-h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}実績を取得</button></div>
            {loaded && !selectedLink && <p className="py-4 text-sm text-slate-600">学習アカウントが未連携です。</p>}
            {history ? <>
              <p className="text-xs text-slate-600">取得日時: {new Date(history.fetchedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>
              <p role="status" className="border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-950">{history.historyNotice}</p>
              {history.events.length === 0 ? <p className="py-6 text-sm text-slate-600">この日付で取得できた履歴はありません。</p> : <div className="overflow-x-auto"><table className="w-full min-w-[560px] border-collapse text-left text-sm"><thead className="border-b border-slate-300 bg-slate-50"><tr><th className="p-3">時刻</th><th className="p-3">練習</th><th className="p-3">内容・結果</th></tr></thead><tbody>{history.events.map(event => <tr key={event.id} className="border-b border-slate-200"><td className="whitespace-nowrap p-3 align-top">{new Date(event.at).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })}</td><td className="p-3 align-top font-bold">{event.title}</td><td className="max-w-md break-words p-3 align-top"><p>{event.detail}</p><p className="mt-1 text-slate-600">{event.amount}</p></td></tr>)}</tbody></table></div>}
            </> : selectedLink && <p className="py-6 text-sm text-slate-600">実績は未取得です。</p>}
          </> : selectedLink ? <>
            <dl className="grid gap-2 border-y border-slate-200 py-4 text-sm sm:grid-cols-[120px_minmax(0,1fr)]"><dt className="text-slate-600">学習ID</dt><dd className="break-all font-mono">{selectedLink.source_student_id}</dd><dt className="text-slate-600">校舎ID</dt><dd className="break-all">{selectedLink.source_campus_id}</dd><dt className="text-slate-600">確認日時</dt><dd>{new Date(selectedLink.verified_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</dd></dl>
            {canManageAccounts && remoteMode && configured && loaded && <div key={`${scopeKey}:${childId}:${selectedLink.id}:${selectedLink.revision}`}><LessonAccountPanel link={selectedLink} name={selectedChild.name} /></div>}
            {canIssueAccounts && remoteMode && configured && loaded && <div key={`credential:${scopeKey}:${childId}:${selectedLink.id}:${selectedLink.revision}`}><LessonCredentialPanel link={selectedLink} name={selectedChild.name} /></div>}
            {canManage && <button type="button" disabled={busy} onClick={() => void run(disable)} className="flex min-h-10 items-center gap-2 rounded-lg border border-rose-300 px-3 text-sm text-rose-800 disabled:opacity-50"><Unlink className="h-4 w-4" />連携を解除</button>}
          </> : loaded && canManage ? <>
            <div className="flex flex-wrap items-end gap-3"><label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-bold text-slate-700">Dレッスンの学習ID<input value={studentId} disabled={busy} onChange={event => { setStudentId(event.target.value); setCandidate(null); setConfirmed(false); }} placeholder="student_..." className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm" /></label><button type="button" disabled={busy || !configured || !isStudentId(studentId.trim())} onClick={() => void run(verify)} className="flex min-h-10 items-center gap-2 rounded-lg border border-teal-600 px-4 text-sm font-bold text-teal-800 disabled:opacity-50"><Search className="h-4 w-4" />本人情報を確認</button></div>
            {candidate && <div className="space-y-4 border border-slate-300 bg-white p-4">
              <dl className="grid gap-2 text-sm sm:grid-cols-[140px_minmax(0,1fr)]"><dt className="text-slate-600">名簿の氏名</dt><dd className="break-words font-bold">{selectedChild.name}</dd><dt className="text-slate-600">名簿の生年月日</dt><dd>{selectedChild.birthDate || '未登録'}</dd><dt className="text-slate-600">学習の表示名</dt><dd className="break-words font-bold">{candidate.identity.displayName}</dd><dt className="text-slate-600">学習の生年月日</dt><dd>{candidate.identity.birthDate || '未登録'}</dd><dt className="text-slate-600">学習の校舎ID</dt><dd className="break-all">{candidate.identity.campusId}</dd></dl>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-teal-700" />同じ児童の学習アカウントであることを確認しました</label>
              <button type="button" disabled={!confirmed || busy} onClick={() => void run(saveLink)} className="flex min-h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-bold text-white disabled:opacity-50"><Link2 className="h-4 w-4" />連携を確定</button>
            </div>}
          </> : <p className="py-6 text-sm text-slate-600">{loaded ? '学習アカウントが未連携です。連携管理者に確認してください。' : '連携状態は未確認です。'}</p>}
          {tab === 'links' && remoteMode && configured && loaded && canManage && canIssueAccounts && <div key={`register:${scopeKey}:${childId}`}><LessonStudentRegistrationPanel childId={childId} hasLink={Boolean(selectedLink)} onCompleted={() => void refresh()} /></div>}
        </>}
      </section>
    </div>
  </div>;
}
