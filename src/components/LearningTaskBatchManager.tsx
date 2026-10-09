import {useEffect,useRef,useState} from 'react';
import {Check,ClipboardCheck,LoaderCircle,Plus,RefreshCw,Search,SquareX,Users} from 'lucide-react';
import type {ChildProfile} from '../types';
import {assertSameTaskBatch,batchErrors,filterTaskTargets,parseTaskTemplate,type TaskBatch,type TaskTemplate} from '../learning/taskBatches';
import {taskCategories,type TaskCategory} from '../learning/tasks';
import {applyTaskBatch,loadTaskBatch,loadTaskBatchConfiguration,prepareTaskBatch} from '../services/lessonLearningService';
import {getLocalDateString} from '../utils/weekdays';
const initialDraft=():TaskTemplate=>({category:'mouse',title:'',instructions:'',startsOn:getLocalDateString(),endsOn:getLocalDateString()});
const inputClass='mt-1 min-h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3';
const buttonClass='flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50';
export function LearningTaskBatchManager({childrenList}:{childrenList:ChildProfile[]}){
 const [config,setConfig]=useState<Awaited<ReturnType<typeof loadTaskBatchConfiguration>>|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[running,setRunning]=useState(false);
 const [campus,setCampus]=useState(''),[group,setGroup]=useState<string|null>(null),[search,setSearch]=useState(''),[selected,setSelected]=useState<string[]>([]);
 const [draft,setDraft]=useState(initialDraft),[batch,setBatch]=useState<TaskBatch|null>(null),[confirmed,setConfirmed]=useState(false),[historyId,setHistoryId]=useState('');
 const generation=useRef(0),stop=useRef(false),operationId=useRef<string>('');
 const refresh=async()=>{
  const v=++generation.current;setBusy(true);setError('');setConfig(null);setSelected([]);operationId.current='';
  try{const result=await loadTaskBatchConfiguration();if(v===generation.current)setConfig(result);}
  catch(e){if(v===generation.current)setError(e instanceof Error?e.message:'対象児童を取得できません。');}
  finally{if(v===generation.current)setBusy(false);}
 };
 useEffect(()=>{void refresh();return()=>{stop.current=true;generation.current++;};},[]);
 const targets=config?.targets.filter(row=>childrenList.some(child=>child.id===row.childId))||[];
 const visible=filterTaskTargets(targets,campus,group).filter(row=>{const child=childrenList.find(child=>child.id===row.childId)!;return `${child.name} ${child.kana||''}`.normalize('NFKC').includes(search.normalize('NFKC').trim());});
 const selection=targets.filter(row=>selected.includes(row.childId));
 const changeDraft=(next:TaskTemplate)=>{setDraft(next);operationId.current='';};
 const changeSelection=(next:string[])=>{setSelected(next);operationId.current='';};
 let valid=false;try{const value=parseTaskTemplate(draft);valid=Boolean(selection.length&&selection.length<=100&&selection.every(row=>row.available)&&(!value.stageId||config?.catalog.some(stage=>stage.category===value.category&&stage.stageId===value.stageId)));}catch{/* Incomplete drafts are not submitted. */}
 const preview=async()=>{
  if(!valid||busy)return;
  const v=++generation.current;setBusy(true);setError('');operationId.current||=crypto.randomUUID();
  try{const result=await prepareTaskBatch(operationId.current,draft,selection);if(v===generation.current){setBatch(result);setConfirmed(false);}}
  catch(e){if(v===generation.current)setError(e instanceof Error?e.message:'指定内容を確認できません。');}
  finally{if(v===generation.current)setBusy(false);}
 };
 const openHistory=async()=>{
  if(!historyId)return;const v=++generation.current;setBusy(true);setError('');setBatch(null);setConfirmed(false);
  try{const result=await loadTaskBatch(historyId);if(v===generation.current)setBatch(result);}
  catch(e){if(v===generation.current)setError(e instanceof Error?e.message:'履歴を取得できません。');}
  finally{if(v===generation.current)setBusy(false);}
 };
 const execute=async()=>{
  if(!batch||!confirmed||busy)return;const v=++generation.current;stop.current=false;setBusy(true);setRunning(true);setError('');
  let current=batch;
  try{
   for(const item of batch.items){
    if(stop.current||v!==generation.current)break;
    if(item.status==='saved')continue;
    const next=assertSameTaskBatch(current,await applyTaskBatch(batch.operationId,item.childId));
    if(v!==generation.current)break;current=next;setBatch(next);
   }
  }catch(e){if(v===generation.current)setError(e instanceof Error?e.message:'処理を中断しました。履歴から再確認してください。');}
  finally{if(v===generation.current){setBusy(false);setRunning(false);setConfirmed(false);}}
 };
 const name=(id:string)=>childrenList.find(child=>child.id===id)?.name||'名簿から除外された児童';
 return <div className="min-w-0 space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-base font-bold"><Users className="h-5 w-5 text-teal-700"/>まとめて指定</h3><button type="button" disabled={busy||!!batch} onClick={()=>void refresh()} className={buttonClass}><RefreshCw className="h-4 w-4"/>対象・履歴を更新</button></div>
  {error&&<p role="alert" className="border-l-4 border-rose-500 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
  {busy&&<p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle className="h-4 w-4 animate-spin"/>{running?'児童ごとの結果を保存中...':'確認中...'}</p>}
  {!batch&&config&&<>
   <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 pb-4"><label className="min-w-0 flex-1 text-sm">過去の一括指定<select aria-label="過去の一括指定" value={historyId} disabled={busy} onChange={e=>setHistoryId(e.target.value)} className={inputClass}><option value="">自分の指定履歴（直近20件）</option>{config.history.map(row=><option key={row.operationId} value={row.operationId}>{row.title} / 作成済み {row.saved}/{row.total}名</option>)}</select></label><button type="button" disabled={busy||!historyId} onClick={()=>void openHistory()} className={buttonClass}><RefreshCw className="h-4 w-4"/>履歴を開く</button></div>
   <fieldset disabled={busy} className="space-y-3"><legend className="mb-2 text-sm font-bold">対象児童</legend>
    <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">校舎<select aria-label="一括指定の校舎" value={campus} onChange={e=>{setCampus(e.target.value);setGroup(null);}} className={inputClass}><option value="">すべての校舎</option>{[...new Set(targets.map(row=>row.campusId))].sort().map(id=><option key={id} value={id}>{id}</option>)}</select></label><label className="text-sm">学習グループ<select aria-label="一括指定のグループ" value={group===null?'*':`g:${group}`} onChange={e=>setGroup(e.target.value==='*'?null:e.target.value.slice(2))} className={inputClass}><option value="*">すべてのグループ</option>{[...new Set(targets.filter(row=>!campus||row.campusId===campus).map(row=>row.group))].sort().map(id=><option key={id} value={`g:${id}`}>{id||'未設定'}</option>)}</select></label><label className="text-sm">児童名<div className="relative"><Search className="absolute left-3 top-4 h-4 w-4 text-slate-500"/><input aria-label="一括指定の児童検索" value={search} onChange={e=>setSearch(e.target.value)} className={`${inputClass} pl-9`}/></div></label></div>
    <div className="flex flex-wrap items-center gap-2 text-sm"><strong>選択 {selection.length}名 / 表示 {visible.length}名</strong><button type="button" onClick={()=>changeSelection([...new Set([...selected,...visible.filter(row=>row.available).map(row=>row.childId)])])} className={buttonClass}><Check className="h-4 w-4"/>表示中を選択</button><button type="button" onClick={()=>changeSelection([])} className={buttonClass}><SquareX className="h-4 w-4"/>選択を解除</button></div>
    {selection.length>100&&<p role="alert" className="text-sm text-rose-800">一度に指定できるのは100名までです。</p>}
    <ul className="max-h-72 divide-y divide-slate-200 overflow-auto border-y border-slate-200">{visible.map(row=><li key={row.childId}><label className="flex min-h-12 items-start gap-3 px-2 py-3 text-sm"><input type="checkbox" aria-label={`対象：${name(row.childId)}`} checked={selected.includes(row.childId)} disabled={!row.available} onChange={e=>changeSelection(e.target.checked?[...selected,row.childId]:selected.filter(id=>id!==row.childId))} className="mt-1 h-4 w-4 shrink-0 accent-teal-700"/><span className="min-w-0 break-words"><strong>{name(row.childId)}</strong><span className="ml-2 text-xs text-slate-600">{row.campusId} / {row.group||'グループ未設定'}</span>{!row.available&&<span className="block text-xs text-amber-900">連携許可・所属の確認が必要</span>}</span></label></li>)}</ul>
    {!visible.length&&<p className="text-sm text-slate-600">対象の連携児童がいません。</p>}
   </fieldset>
   <form aria-label="一括指定の課題" onSubmit={e=>{e.preventDefault();void preview();}} className="space-y-3 border-y border-slate-200 py-4">
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">分野<select aria-label="一括課題の分野" value={draft.category} disabled={busy} onChange={e=>changeDraft({...draft,category:e.target.value as TaskCategory,stageId:undefined})} className={inputClass}>{Object.entries(taskCategories).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label className="text-sm">課題名<input aria-label="一括課題名" required maxLength={80} value={draft.title} disabled={busy} onChange={e=>changeDraft({...draft,title:e.target.value})} className={inputClass}/></label></div>
    <label className="block text-sm">ステージ<select aria-label="一括課題のステージ" value={draft.stageId||''} disabled={busy||!config.catalog.some(stage=>stage.category===draft.category)} onChange={e=>{const stage=config.catalog.find(stage=>stage.category===draft.category&&stage.stageId===e.target.value);changeDraft({...draft,stageId:stage?.stageId,title:draft.title||stage?.title||''});}} className={inputClass}><option value="">分野全体（ステージ指定なし）</option>{config.catalog.filter(stage=>stage.category===draft.category).map(stage=><option key={stage.stageId} value={stage.stageId}>{stage.title} [{stage.stageId}]</option>)}</select></label>
    <label className="block text-sm">取り組む内容<textarea aria-label="一括課題の内容" rows={3} maxLength={500} value={draft.instructions} disabled={busy} onChange={e=>changeDraft({...draft,instructions:e.target.value})} className={`${inputClass} py-2`}/></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">開始日<input aria-label="一括課題の開始日" type="date" required value={draft.startsOn} disabled={busy} onChange={e=>changeDraft({...draft,startsOn:e.target.value})} className={inputClass}/></label><label className="text-sm">終了日<input aria-label="一括課題の終了日" type="date" required value={draft.endsOn} disabled={busy} onChange={e=>changeDraft({...draft,endsOn:e.target.value})} className={inputClass}/></label></div>
    <button type="submit" disabled={busy||!valid} className={`${buttonClass} border-teal-700 bg-teal-700 font-bold text-white`}><ClipboardCheck className="h-4 w-4"/>指定内容を確認</button>
   </form>
  </>}
  {batch&&<section aria-label="一括指定の確認と結果" className="space-y-4 border-y border-slate-200 py-4">
   <h4 className="break-words text-base font-bold">{batch.template.title}</h4><p className="break-words text-sm">{taskCategories[batch.template.category]} / {config?.catalog.find(stage=>stage.category===batch.template.category&&stage.stageId===batch.template.stageId)?.title||batch.template.stageId||'分野全体'} / {batch.template.startsOn} 〜 {batch.template.endsOn}</p><p className="whitespace-pre-wrap break-words text-sm">{batch.template.instructions}</p>
   <p role="status" className="text-sm font-bold">作成済み {batch.items.filter(row=>row.status==='saved').length}/{batch.items.length}名</p>
   <ul className="divide-y divide-slate-200">{batch.items.map(item=><li key={item.childId} className="space-y-1 py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong className="break-words">{name(item.childId)}</strong><span className={item.status==='saved'?'text-emerald-800':'text-amber-900'}>{item.status==='saved'?'作成済み':'未完了'}</span></div><p className="break-words text-xs text-slate-600">{item.campusId} / {item.group||'グループ未設定'}</p>{item.errorCode&&<p className="text-amber-900">{batchErrors[item.errorCode]}</p>}</li>)}</ul>
   {batch.items.some(row=>row.status==='pending')&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" aria-label="一括指定の内容確認" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-teal-700"/>対象児童と課題内容を確認しました</label>}
   <div className="flex flex-wrap gap-2">{batch.items.some(row=>row.status==='pending')&&<button type="button" disabled={busy||!confirmed} onClick={()=>void execute()} className={`${buttonClass} border-teal-700 bg-teal-700 font-bold text-white`}><Users className="h-4 w-4"/>{batch.items.some(row=>row.status==='saved'||row.errorCode)?'未完了の児童を再確認':'まとめて指定'}</button>}{running?<button type="button" onClick={()=>{stop.current=true;setError('現在の児童の処理後に停止します。未完了の結果は履歴から再確認できます。');}} className={buttonClass}><SquareX className="h-4 w-4"/>処理を止める</button>:<button type="button" disabled={busy} onClick={()=>{setBatch(null);setConfirmed(false);setDraft(initialDraft());setSelected([]);operationId.current='';void refresh();}} className={buttonClass}><Plus className="h-4 w-4"/>別の課題を指定</button>}</div>
  </section>}
 </div>;
}
