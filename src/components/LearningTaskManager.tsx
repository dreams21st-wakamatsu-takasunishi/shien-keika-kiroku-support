import {useCallback,useEffect,useRef,useState} from 'react';
import {LockKeyhole,Plus,RefreshCw,Save,SquarePen,SquareX} from 'lucide-react';
import {type LearningTask,type TaskCategory,taskCategories,validTaskDates} from '../learning/tasks';
import {loadLearningTasks,saveLearningTask} from '../services/lessonLearningService';
import {getLocalDateString} from '../utils/weekdays';
type Draft=Omit<LearningTask,'updatedAt'>;
const newDraft=():Draft=>({id:crypto.randomUUID(),revision:0,category:'mouse',title:'',instructions:'',startsOn:getLocalDateString(),endsOn:getLocalDateString(),active:true});
export function LearningTaskManager({childId,linkId,canManage,scopeKey}:{childId:string;linkId:string;canManage:boolean;scopeKey:string}){
 const [tasks,setTasks]=useState<LearningTask[]>([]),[draft,setDraft]=useState<Draft|null>(null),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const version=useRef(0);
 const refresh=useCallback(async()=>{
  const v=++version.current;setBusy(true);setError('');setTasks([]);setLoaded(false);setDraft(null);setMessage('');
  try{const rows=await loadLearningTasks(childId);if(v===version.current){setTasks(rows);setLoaded(true);if(canManage&&rows.length===0)setDraft(newDraft());}}
  catch(e){if(v===version.current)setError(e instanceof Error?e.message:'課題を取得できませんでした。');}
  finally{if(v===version.current)setBusy(false);}
 },[childId,linkId,scopeKey,canManage]);
 useEffect(()=>{void refresh();return()=>{version.current++;};},[refresh]);
 const save=async(value:Draft)=>{
  const v=++version.current;setBusy(true);setError('');setMessage('');
  try{const saved=await saveLearningTask(childId,value);if(v===version.current){setTasks(rows=>[saved,...rows.filter(r=>r.id!==saved.id)]);setDraft(null);setMessage(saved.active?'課題を保存しました。':'課題を停止しました。');}}
  catch(e){if(v===version.current)setError(e instanceof Error?e.message:'保存結果を確認してください。再取得すると現在の状態を確認できます。');}
  finally{if(v===version.current)setBusy(false);}
 };
 const valid=draft&&draft.title.trim().length>0&&draft.title.length<=80&&draft.instructions.length<=500&&validTaskDates(draft.startsOn,draft.endsOn);
 return <div className="space-y-4">
  <div className="flex flex-wrap justify-between gap-2"><h4 className="text-sm font-bold">課題の指定</h4><div className="flex gap-2"><button type="button" title="課題を再取得" disabled={busy} onClick={()=>void refresh()} className="flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm disabled:opacity-50"><RefreshCw className="h-4 w-4"/>更新</button>{canManage&&<button type="button" disabled={busy||!loaded} onClick={()=>{setDraft(newDraft());setMessage('');}} className="flex min-h-10 items-center gap-2 rounded-lg bg-teal-700 px-3 text-sm text-white disabled:opacity-50"><Plus className="h-4 w-4"/>課題を追加</button>}</div></div>
  {error&&<p role="alert" className="border-l-4 border-rose-500 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
  {message&&<p role="status" className="bg-emerald-50 p-3 text-sm text-emerald-950">{message}</p>}
  {!canManage&&<p role="status" className="flex items-start gap-2 border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0"/>閲覧のみ：課題の追加・編集・停止には管理者、または「学習連携・課題管理」権限が必要です。</p>}
  {busy&&<p role="status" className="text-sm text-slate-600">処理中...</p>}
  {draft&&canManage&&<form aria-label={draft.revision===0?'新しい課題':'課題の編集'} onSubmit={e=>{e.preventDefault();if(valid&&!busy)void save(draft);}} className="space-y-3 border-y border-slate-200 py-4">
   <h5 className="text-sm font-bold">{draft.revision===0?'新しい課題':'課題の編集'}</h5>
   <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">分野<select aria-label="課題の分野" value={draft.category} disabled={busy} onChange={e=>setDraft({...draft,category:e.target.value as TaskCategory})} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2">{Object.entries(taskCategories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label className="text-sm">課題名<input aria-label="課題名" required maxLength={80} value={draft.title} disabled={busy} onChange={e=>setDraft({...draft,title:e.target.value})} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3"/></label></div>
   <label className="block text-sm">取り組む内容<textarea aria-label="取り組む内容" maxLength={500} rows={3} value={draft.instructions} disabled={busy} onChange={e=>setDraft({...draft,instructions:e.target.value})} className="mt-1 w-full rounded-lg border border-slate-300 p-3"/></label>
   <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">開始日<input aria-label="課題の開始日" type="date" required value={draft.startsOn} disabled={busy} onChange={e=>setDraft({...draft,startsOn:e.target.value})} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3"/></label><label className="text-sm">終了日<input aria-label="課題の終了日" type="date" required value={draft.endsOn} disabled={busy} onChange={e=>setDraft({...draft,endsOn:e.target.value})} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3"/></label></div>
   {!validTaskDates(draft.startsOn,draft.endsOn)&&<p role="alert" className="text-sm text-rose-800">開始日から終了日まで90日以内の期間を指定してください。</p>}
   <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy||!valid} className="flex min-h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4"/>保存</button><button type="button" disabled={busy} onClick={()=>setDraft(null)} className="min-h-10 rounded-lg border px-4 text-sm">キャンセル</button></div>
  </form>}
  {loaded&&tasks.length===0&&!draft&&<p className="py-4 text-sm text-slate-600">指定された課題はありません。</p>}
  <ul className="divide-y divide-slate-200">{tasks.map(task=><li key={task.id} className="space-y-2 py-4"><div className="flex flex-wrap items-center justify-between gap-2"><h5 className="min-w-0 break-words text-sm font-bold">{task.title}</h5><span className="text-xs text-slate-600">{!task.active?'停止中':task.endsOn<getLocalDateString()?'期間終了':task.startsOn>getLocalDateString()?'開始前':'有効'}</span></div><p className="text-xs text-slate-600">{taskCategories[task.category]} / {task.startsOn} 〜 {task.endsOn}</p><p className="whitespace-pre-wrap break-words text-sm">{task.instructions}</p>{canManage&&<div className="flex gap-2"><button type="button" disabled={busy} onClick={()=>setDraft({...task})} className="flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm disabled:opacity-50"><SquarePen className="h-4 w-4"/>編集</button>{task.active&&<button type="button" disabled={busy} onClick={()=>{if(window.confirm('この課題を停止しますか？ 学習記録は削除されません。'))void save({...task,active:false});}} className="flex min-h-10 items-center gap-2 rounded-lg border border-rose-300 px-3 text-sm text-rose-800 disabled:opacity-50"><SquareX className="h-4 w-4"/>停止</button>}</div>}</li>)}</ul>
 </div>;
}
