import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, LoaderCircle, Pencil, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { loadContentCampuses, loadMockExamProblems, changeMockExamProblem } from '../services/lessonLearningService';
import { parseMockExamProblem, type MockExamCatalog, type MockExamProblem, type MockExamAction } from '../learning/mockExamProblems';
import { LessonRequestError } from '../learning/reviewNotice';

const input = 'min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-50';
type ProblemDraft = Omit<MockExamProblem,'permissionConfirmed'> & {permissionConfirmed:boolean};

export function LessonMockExamManager({scopeKey,onDirtyChange}:{key?:string;scopeKey:string;onDirtyChange:(dirty:boolean)=>void}) {
  const [configuration,setConfiguration] = useState<Awaited<ReturnType<typeof loadContentCampuses>> | null>(null);
  const [campus,setCampus] = useState(''), [snapshot,setSnapshot] = useState<MockExamCatalog | null>(null);
  const [draft,setDraft] = useState<ProblemDraft | null>(null), [original,setOriginal] = useState('');
  const [editing,setEditing] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState(''), [message,setMessage] = useState('');
  const version = useRef(0), locked = useRef(false), pending = useRef<{key:string;id:string} | null>(null);
  const dirty = Boolean(draft && JSON.stringify(draft) !== original);
  const clear = () => {setDraft(null);setOriginal('');pending.current=null;};
  const leave = () => !dirty || window.confirm('保存していない問題文の変更を破棄しますか？');
  useEffect(() => {onDirtyChange(dirty);return () => onDirtyChange(false);},[dirty,onDirtyChange]);
  useEffect(() => {
    const warn = (event:BeforeUnloadEvent) => {if (dirty) {event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',warn);return () => window.removeEventListener('beforeunload',warn);
  },[dirty]);
  useEffect(() => {
    const current = ++version.current;setConfiguration(null);setCampus('');setSnapshot(null);clear();setError('');setMessage('');setBusy(true);
    void loadContentCampuses().then(result => {if (version.current===current) {setConfiguration(result);setCampus(result.campuses[0]?.id || '');}})
      .catch(e => {if (version.current===current) setError(e instanceof Error?e.message:'校舎を取得できませんでした。');})
      .finally(() => {if (version.current===current) setBusy(false);});
    return () => {version.current++;};
  },[scopeKey]);
  async function read() {
    if (!configuration || !campus || locked.current) return;
    const current = ++version.current;setBusy(true);setSnapshot(null);clear();setError('');setMessage('');
    try {
      const result = await loadMockExamProblems(campus,configuration.organizationId);
      if (result.sourceProject!==configuration.sourceProject) throw Error('連携先が変更されました。');
      if (version.current===current) setSnapshot(result);
    } catch (e) {if (version.current===current) setError(e instanceof Error?e.message:'問題を取得できませんでした。');}
    finally {if (version.current===current) setBusy(false);}
  }
  useEffect(() => {void read();return () => {version.current++;};},[campus,configuration]);
  function edit(item?:MockExamProblem) {
    if (!leave()) return;
    const next = item?{...item,permissionConfirmed:false}:{id:'round-1',round:1,title:'第1回過去問題',reference:'',permissionConfirmed:false,hidden:false};
    setDraft(next);setOriginal(JSON.stringify(next));setEditing(Boolean(item));setError('');setMessage('');pending.current=null;
  }
  async function publish(action:MockExamAction,item:ProblemDraft) {
    if (!snapshot || locked.current) return;
    let normalized:MockExamProblem;
    try {normalized=parseMockExamProblem(item);} catch (e) {setError((e as Error).message);return;}
    const campusName = configuration?.campuses.find(row => row.id===campus)?.name || campus;
    if (!window.confirm(action==='delete'
      ? `${campusName}の「${item.title}」を全端末の問題一覧から削除しますか？\n過去の成績記録と実施中の試験は残ります。`
      : `${campusName}の「${item.title}」を保存して全端末へ配信しますか？\n次の問題一覧取得から反映されます。実施中の試験は変更しません。`)) return;
    const key = JSON.stringify([snapshot.campusId,snapshot.revision,snapshot.fingerprint,action,normalized]);
    if (pending.current?.key!==key) pending.current={key,id:crypto.randomUUID()};
    const current = ++version.current;locked.current=true;setBusy(true);setError('');setMessage('');
    try {
      const result = await changeMockExamProblem(snapshot,action,normalized,pending.current.id);
      if (version.current!==current) return;
      setSnapshot(result);clear();setMessage(action==='delete'?'削除を配信しました。過去の成績は保持されています。':'保存して配信しました。');
    } catch (e) {
      if (version.current!==current) return;
      if (e instanceof LessonRequestError && [401,403].includes(e.httpStatus || 0)) {setSnapshot(null);clear();}
      setError(e instanceof Error?e.message:'配信結果が未確定です。同じ内容で再確認してください。');
    } finally {locked.current=false;if (version.current===current) setBusy(false);}
  }
  const rows = [...(snapshot?.catalog || [])].sort((a,b) => a.round-b.round);
  return <section aria-label="模擬試験の問題管理" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-bold sm:max-w-sm">対象校舎
        <select className={input} aria-label="模擬試験の対象校舎" value={campus} disabled={busy || !configuration} onChange={event => {if (leave()) {setCampus(event.target.value);setSnapshot(null);clear();}}}>
          {!campus&&<option value="">校舎を選択</option>}{configuration?.campuses.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
      </label>
      <button type="button" className={button} disabled={busy || !campus} onClick={() => {if (leave()) void read();}}><RefreshCw className="h-4 w-4"/>再取得</button>
      {snapshot&&<span className="py-2 text-xs text-slate-600">配信版 {snapshot.revision}</span>}
    </div>
    {busy&&<p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle className="h-4 w-4 animate-spin"/>処理中...</p>}
    {error&&<p role="alert" className="break-words border-l-4 border-rose-500 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
    {message&&<p role="status" className="bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
    {configuration&&!configuration.campuses.length&&<p className="py-6 text-sm text-slate-600">専用の連携許可がある校舎がありません。</p>}
    {snapshot&&(!draft?<>
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">登録問題 <span className="text-sm font-normal">{rows.length}件</span></h3>
        <button type="button" className={`${button} border-teal-700 bg-teal-700 text-white`} disabled={busy || rows.length>=100} onClick={() => edit()}><Plus className="h-4 w-4"/>問題を追加</button>
      </div>
      <ul className="divide-y divide-slate-200 border-y border-slate-200">{rows.map(item => <li key={item.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-4">
        <div className="min-w-0 flex-1"><h4 className="break-words font-bold">{item.title}</h4><p className="mt-1 text-sm text-slate-600">{item.reference.length.toLocaleString()}文字 ・ {item.hidden?'非表示':'配信中'}</p></div>
        <div className="flex gap-2">
          <button type="button" className={button} disabled={busy} title="本文を確認・編集" aria-label={`本文を確認・編集：${item.title}`} onClick={() => edit(item)}><Pencil className="h-4 w-4"/></button>
          <button type="button" className={`${button} text-rose-700`} disabled={busy} title="削除" aria-label={`削除：${item.title}`} onClick={() => void publish('delete',item)}><Trash2 className="h-4 w-4"/></button>
        </div>
      </li>)}</ul>
      {!rows.length&&<p className="py-6 text-sm text-slate-600">登録された問題はありません。</p>}
    </>:<form onSubmit={event => {event.preventDefault();void publish(editing?'update':'create',draft);}} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">問題の{editing?'確認・編集':'追加'}</h3><button type="button" className={button} disabled={busy} onClick={() => {if (leave()) clear();}}><ArrowLeft className="h-4 w-4"/>一覧へ</button></div>
      <fieldset disabled={busy} className="grid min-w-0 gap-5 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <label className="block space-y-1 text-sm font-bold">受検回<input aria-label="受検回" type="number" min={1} max={999} required disabled={editing} className={input} value={draft.round || ''} onChange={event => {const round=Number(event.target.value);setDraft({...draft,round,id:`round-${round}`,title:`第${round}回過去問題`});}}/></label>
          <label className="block space-y-1 text-sm font-bold">採点用の正解本文<textarea aria-label="採点用の正解本文" rows={14} required maxLength={6000} spellCheck={false} className={`${input} whitespace-pre-wrap leading-7`} value={draft.reference} onChange={event => setDraft({...draft,reference:event.target.value})}/></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-teal-700" checked={!draft.hidden} onChange={event => setDraft({...draft,hidden:!event.target.checked})}/>問題一覧に表示する</label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" required className="mt-1 h-4 w-4 shrink-0 accent-teal-700" checked={draft.permissionConfirmed} onChange={event => setDraft({...draft,permissionConfirmed:event.target.checked})}/>本文のデータ化・児童への配信の利用許諾を確認済み</label>
        </div>
        <div className="min-w-0"><h4 className="mb-3 text-sm font-bold">本文プレビュー ・ {draft.reference.length.toLocaleString()}文字</h4><div className="max-h-[38rem] overflow-y-auto whitespace-pre-wrap break-words border-y border-slate-200 py-4 text-base leading-8">{draft.reference || '（本文未入力）'}</div></div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4"><button type="submit" className={`${button} border-teal-700 bg-teal-700 text-white`} disabled={busy || !draft.permissionConfirmed || !draft.reference.trim()}><Save className="h-4 w-4"/>保存して全端末へ配信</button>{dirty&&<span className="text-xs text-amber-800">未保存の変更あり</span>}</div>
    </form>)}
  </section>;
}
