import {useEffect,useRef,useState} from 'react';
import type {ChildProfile} from '../types';
import type {LessonLink} from '../learning/contracts';
import type {StudentAdminRow} from '../learning/studentAdmin';
import {loadLessonStudentAdmin,changeLessonStudentState} from '../services/lessonLearningService';
export function LessonStudentAdmin({childrenList,links,onChoose}:{childrenList:ChildProfile[];links:LessonLink[];onChoose:(id:string)=>void}){
 const [rows,setRows]=useState<StudentAdminRow[]>([]),[search,setSearch]=useState(''),[removed,setRemoved]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState<StudentAdminRow|null>(null),[name,setName]=useState('');
 const [notice,setNotice]=useState(''),[reload,setReload]=useState(0);
 const generation=useRef(0);
 const signature=JSON.stringify(links.map(l=>[l.id,l.revision]).sort());
 useEffect(()=>{
  const request=++generation.current;setBusy(true);setError('');setRows([]);setSelected(null);setName('');
  loadLessonStudentAdmin(links).then(data=>{if(request===generation.current)setRows(data);})
   .catch(()=>{if(request===generation.current)setError('管理情報を取得できませんでした。再取得してください。');})
   .finally(()=>{if(request===generation.current)setBusy(false);});
  return()=>{generation.current++;};
 },[signature,reload]);
 async function submit(){
  const child=childrenList.find(c=>c.id===selected?.childId),link=links.find(l=>l.id===selected?.linkId);
  if(!child||!link||name!==child.name||!selected||selected.revision===undefined||busy)return;
  const request=++generation.current;setBusy(true);setError('');
  try{
   const next=await changeLessonStudentState(link,selected.revision,selected.archived?'restore':'archive',child.name);
   if(request!==generation.current)return;
   setRows(previous=>previous.map(row=>row.childId===next.childId?next:row));setSelected(null);setName('');
   setNotice(next.archived?'ログインを停止し、削除済みに移動しました。学習履歴は残しています。':'児童の利用を再開しました。合言葉・学習履歴は変更していません。');
  }catch{if(request===generation.current)setError('操作結果を確認できませんでした。再取得して状態を確認してください。同じ児童を新規登録しないでください。');}
  finally{if(request===generation.current)setBusy(false);}
 }
 const filtered=childrenList.filter(c=>`${c.name} ${c.kana||''}`.includes(search.trim()))
  .filter(c=>Boolean(rows.find(r=>r.childId===c.id)?.archived)===removed);
 return <section aria-label="児童・ログイン管理の一覧" className="space-y-3 rounded-xl border border-slate-200 p-3">
  <div className="flex flex-wrap items-center gap-2"><h3 className="mr-auto font-bold">児童・ログイン管理</h3><button type="button" disabled={busy} onClick={()=>setReload(n=>n+1)} className="min-h-10 rounded-lg border px-3">一覧を再取得</button></div>
  <p className="text-xs text-slate-600">児童を選ぶと、登録・合言葉設定・確認へ進めます。削除はログイン停止であり、記録を消しません。校舎の選択は不要です。</p>
  <div className="flex flex-wrap gap-3"><label className="text-sm font-bold">児童を検索<input className="ml-2 min-h-10 max-w-full rounded-lg border px-2" value={search} onChange={e=>setSearch(e.target.value)}/></label>
   <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={removed} onChange={e=>{setRemoved(e.target.checked);setSelected(null);setName('');}}/>削除済みを表示</label></div>
  {busy&&<p role="status">確認中…</p>}
  {error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
  {notice&&<p role="status" className="rounded-lg bg-teal-50 p-3 text-sm text-teal-900">{notice}</p>}
  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{filtered.map(child=>{
   const link=links.find(l=>l.child_id===child.id),row=rows.find(r=>r.childId===child.id);
   return <article key={child.id} className="rounded-lg border border-slate-200 p-3">
    <h4 className="font-bold">{child.name}</h4><p className="mt-1 text-sm">児童番号：{row?.loginNumber||'—'} ／ {row?.archived?'削除済み':row?.unavailable?'設定要確認':link?'連携済み':'未登録'}</p>
    {row?.lastIssuedAt&&<p className="mt-1 text-xs text-slate-600">最終発行：{new Date(row.lastIssuedAt).toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'})}</p>}
    <div className="mt-2 flex flex-wrap gap-2">
     {!row?.archived&&<button type="button" disabled={busy} onClick={()=>onChoose(child.id)} className="min-h-10 rounded-lg border border-teal-500 px-3 text-sm font-bold text-teal-800">{link?'合言葉・ログインを管理':'Dレッスンに登録'}</button>}
     {row&&!row.unavailable&&<button type="button" disabled={busy} onClick={()=>{setSelected(row);setName('');setNotice('');}} className="min-h-10 rounded-lg border px-3 text-sm">{row.archived?'復元':'削除'}</button>}
    </div>
   </article>;
  })}</div>
  {!busy&&!error&&!filtered.length&&<p className="text-sm text-slate-600">該当する児童はいません。</p>}
  {selected&&<section aria-label="児童の削除・復元の確認" className="space-y-2 rounded-xl border-2 border-amber-400 bg-amber-50 p-3">
   <p className="font-bold">{childrenList.find(c=>c.id===selected.childId)?.name}：{selected.archived?'復元':'ログインを停止して削除済みに移動'}</p>
   <p className="text-sm">学習履歴・取り組み記録・合言葉・Dサポートの児童名簿は保持します。対象児童の氏名を入力してください。</p>
   <label className="grid gap-1 text-sm font-bold">確認する児童名<input autoComplete="off" value={name} disabled={busy} onChange={e=>setName(e.target.value)} className="min-h-10 w-full max-w-sm rounded-lg border bg-white px-2"/></label>
   <div className="flex gap-2"><button type="button" disabled={busy||name!==childrenList.find(c=>c.id===selected.childId)?.name} onClick={()=>void submit()} className="min-h-10 rounded-lg bg-slate-950 px-3 text-white disabled:opacity-40">{selected.archived?'復元する':'ログインを停止する'}</button>
    <button type="button" disabled={busy} onClick={()=>{setSelected(null);setName('');}} className="min-h-10 rounded-lg border px-3">キャンセル</button></div>
  </section>}
 </section>;
}
