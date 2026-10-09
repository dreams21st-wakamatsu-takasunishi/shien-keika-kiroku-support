import {useEffect,useRef,useState} from 'react';
import {Check,ClipboardCheck,RefreshCw,SquarePen,SquareX} from 'lucide-react';
import type {ChildProfile} from '../types';
import {changeReasons,parseTaskTemplate,type TaskBatch,type TaskTemplate} from '../learning/taskBatches';
import {taskCategories,type TaskCategory} from '../learning/tasks';
import {loadTaskBatchChangeTargets,prepareTaskBatchChange} from '../services/lessonLearningService';
const inputClass='mt-1 min-h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3';
const buttonClass='flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50';
export function LearningTaskBatchChangePanel({base,childrenList,disabled,onPrepared}:{base:TaskBatch;childrenList:ChildProfile[];disabled:boolean;onPrepared:(batch:TaskBatch)=>void}){
 const [kind,setKind]=useState<'edit'|'stop'|null>(null),[draft,setDraft]=useState<TaskTemplate>(base.template),[details,setDetails]=useState<Awaited<ReturnType<typeof loadTaskBatchChangeTargets>>|null>(null);
 const [selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const version=useRef(0),operation=useRef('');
 useEffect(()=>()=>{version.current++;},[]);
 const open=async(next:'edit'|'stop')=>{
  if(disabled||busy)return;const v=++version.current;setBusy(true);setKind(next);setError('');setDetails(null);setSelected([]);operation.current='';setDraft(base.template);
  try{const result=await loadTaskBatchChangeTargets(base);if(v===version.current){setDetails(result);const current=result.candidates.find(row=>row.reason==='ready')?.task;if(current)setDraft(parseTaskTemplate(current));}}
  catch(e){if(v===version.current)setError(e instanceof Error?e.message:'現在の課題を取得できません。');}
  finally{if(v===version.current)setBusy(false);}
 };
 const available=details?.candidates.filter(row=>row.reason==='ready'&&childrenList.some(child=>child.id===row.childId))||[];
 const targets=available.filter(row=>selected.includes(row.childId));
 let valid=!!kind&&targets.length>0;try{const value=parseTaskTemplate(draft);if(kind==='edit'&&value.stageId&&!details?.catalog.some(stage=>stage.category===value.category&&stage.stageId===value.stageId))valid=false;}catch{valid=false;}
 const changeDraft=(value:TaskTemplate)=>{operation.current='';setDraft(value);};
 const changeSelection=(value:string[])=>{operation.current='';setSelected(value);};
 const prepare=async()=>{
  if(!kind||!valid||busy||disabled)return;const v=++version.current;setBusy(true);setError('');operation.current||=crypto.randomUUID();
  try{const result=await prepareTaskBatchChange(operation.current,base,kind,draft,targets);if(v===version.current)onPrepared(result);}
  catch(e){if(v===version.current)setError(e instanceof Error?e.message:'変更内容を確認できません。');}
  finally{if(v===version.current)setBusy(false);}
 };
 return <section aria-label="一括課題の変更・停止" className="space-y-3 border-t border-slate-200 pt-4">
  <div className="flex flex-wrap gap-2"><button type="button" disabled={busy||disabled} onClick={()=>void open('edit')} className={buttonClass}><SquarePen className="h-4 w-4"/>一括編集</button><button type="button" disabled={busy||disabled} onClick={()=>void open('stop')} className={`${buttonClass} border-rose-300 text-rose-800`}><SquareX className="h-4 w-4"/>一括停止</button></div>
  {error&&<p role="alert" className="border-l-4 border-rose-500 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
  {busy&&<p role="status" className="text-sm text-slate-600">現在の課題を確認中...</p>}
  {kind&&details&&<form aria-label={kind==='stop'?'一括停止の対象選択':'一括編集の対象と内容'} onSubmit={e=>{e.preventDefault();void prepare();}} className="space-y-3">
   <div className="flex flex-wrap items-center gap-2 text-sm"><h5 className="font-bold">{kind==='stop'?'停止する児童':'変更する児童'}：{targets.length}名</h5><button type="button" disabled={busy||disabled} onClick={()=>changeSelection(available.map(row=>row.childId))} className={buttonClass}><Check className="h-4 w-4"/>変更可能な児童を選択</button><button type="button" disabled={busy||disabled} onClick={()=>void open(kind)} className={buttonClass}><RefreshCw className="h-4 w-4"/>現在の課題を再取得</button></div>
   <ul className="divide-y divide-slate-200 border-y border-slate-200">{details.candidates.map(row=><li key={row.childId} className="space-y-1 py-3 text-sm"><label className="flex items-start gap-2"><input type="checkbox" aria-label={`変更対象：${childrenList.find(child=>child.id===row.childId)?.name||'名簿から除外された児童'}`} disabled={busy||disabled||row.reason!=='ready'||!childrenList.some(child=>child.id===row.childId)} checked={selected.includes(row.childId)} onChange={e=>changeSelection(e.target.checked?[...selected,row.childId]:selected.filter(id=>id!==row.childId))} className="mt-1 h-4 w-4 shrink-0 accent-teal-700"/><span className="min-w-0 break-words"><strong>{childrenList.find(child=>child.id===row.childId)?.name||'名簿から除外された児童'}</strong><span className="ml-2 text-xs text-slate-600">{changeReasons[row.reason]}</span></span></label>{row.task&&<div className="space-y-1 pl-6 text-xs text-slate-600"><p className="break-words">現在：{row.task.title} / {taskCategories[row.task.category]} {row.task.stageId&&`[${row.task.stageId}]`} / {row.task.startsOn} 〜 {row.task.endsOn} / 版 {row.task.revision}</p><p className="whitespace-pre-wrap break-words">{row.task.instructions}</p></div>}<p className="break-words pl-6 text-xs text-slate-600">{row.campusId} / {row.group||'グループ未設定'}</p></li>)}</ul>
   {kind==='edit'&&<>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">変更後の分野<select aria-label="変更後の分野" value={draft.category} disabled={busy||disabled} onChange={e=>changeDraft({...draft,category:e.target.value as TaskCategory,stageId:undefined})} className={inputClass}>{Object.entries(taskCategories).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label className="text-sm">変更後の課題名<input aria-label="変更後の課題名" required maxLength={80} value={draft.title} disabled={busy||disabled} onChange={e=>changeDraft({...draft,title:e.target.value})} className={inputClass}/></label></div>
    <label className="block text-sm">変更後のステージ<select aria-label="変更後のステージ" value={draft.stageId||''} disabled={busy||disabled||!details.catalog.some(stage=>stage.category===draft.category)} onChange={e=>changeDraft({...draft,stageId:e.target.value||undefined})} className={inputClass}><option value="">分野全体（ステージ指定なし）</option>{details.catalog.filter(stage=>stage.category===draft.category).map(stage=><option key={stage.stageId} value={stage.stageId}>{stage.title} [{stage.stageId}]</option>)}</select></label>
    <label className="block text-sm">変更後の内容<textarea aria-label="変更後の内容" rows={3} maxLength={500} value={draft.instructions} disabled={busy||disabled} onChange={e=>changeDraft({...draft,instructions:e.target.value})} className={`${inputClass} py-2`}/></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">変更後の開始日<input aria-label="変更後の開始日" type="date" required value={draft.startsOn} disabled={busy||disabled} onChange={e=>changeDraft({...draft,startsOn:e.target.value})} className={inputClass}/></label><label className="text-sm">変更後の終了日<input aria-label="変更後の終了日" type="date" required value={draft.endsOn} disabled={busy||disabled} onChange={e=>changeDraft({...draft,endsOn:e.target.value})} className={inputClass}/></label></div>
   </>}
   <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy||disabled||!valid} className={`${buttonClass} border-teal-700 bg-teal-700 font-bold text-white`}><ClipboardCheck className="h-4 w-4"/>{kind==='stop'?'停止内容を確認':'変更内容を確認'}</button><button type="button" disabled={busy||disabled} onClick={()=>{setKind(null);setDetails(null);setError('');}} className={buttonClass}>キャンセル</button></div>
  </form>}
 </section>;
}
