import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {ArrowDown,ArrowUp,BookOpenCheck,ExternalLink,GripVertical,Pencil,Plus,RefreshCw} from 'lucide-react';
import {closestCenter,DndContext,KeyboardSensor,PointerSensor,useSensor,useSensors} from '@dnd-kit/core';
import {SortableContext,sortableKeyboardCoordinates,useSortable,verticalListSortingStrategy} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import type {UserProfile} from '../types';
import {createTrainingRepository} from '../services/legalTraining';
import {canManageTraining,moveTrainingItem,moveTrainingItemTo,openTrainingResources,remainingTraining,trainingError,visibleTraining,type TrainingCategory,type TrainingData,type TrainingProgress,type TrainingRepository,type TrainingVideo} from '../training/model';

const empty:TrainingData={categories:[],videos:[],progress:[]};
const inputClass='mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950';
const buttonClass='min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold disabled:opacity-40';

export function LegalTrainingWorkspace({user,manage=false,repository,onDirtyChange,onSignOut}:{key?:string;user:UserProfile;manage?:boolean;repository?:TrainingRepository;onDirtyChange?:(dirty:boolean)=>void;onSignOut?:()=>void}){
 const repo=useMemo(()=>repository||createTrainingRepository(user),[repository,user.id,user.organizationId,user.role]);
 const allowed=manage&&canManageTraining(user.role);
 const scope=`${user.organizationId}:${user.id}`;
 const [confirmedScope,setConfirmedScope]=useState('');
 const confirmed=confirmedScope===scope;
 const [data,setData]=useState<TrainingData>(empty),[selected,setSelected]=useState('');
 const [loading,setLoading]=useState(true),[ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[message,setMessage]=useState('');
 const [addingCategory,setAddingCategory]=useState(false),[categoryTitle,setCategoryTitle]=useState('');
 const [editingCategory,setEditingCategory]=useState<TrainingCategory|null>(null),[editingVideo,setEditingVideo]=useState<TrainingVideo|null>(null);
 const [video,setVideo]=useState({title:'',videoUrl:'',materialUrl:''});
 const dirty=allowed&&Boolean(categoryTitle.trim()||video.title.trim()||video.videoUrl.trim()||video.materialUrl.trim());
 const mounted=useRef(true),sequence=useRef(0);
 const reload=useCallback(async()=>{
  const request=++sequence.current;setLoading(true);setError('');
  try{const result=await repo.load();if(mounted.current&&sequence.current===request){setData(result);setReady(true);setSelected(previous=>result.categories.some(row=>row.id===previous&&row.active)?previous:result.categories.find(row=>row.active)?.id||'');}}
  catch(e){if(mounted.current&&sequence.current===request){setError(trainingError(e));setReady(false);}}
  finally{if(mounted.current&&sequence.current===request)setLoading(false);}
 },[repo]);
 useEffect(()=>{mounted.current=true;setData(empty);setSelected('');setReady(false);if(manage?allowed:confirmed)void reload();return()=>{mounted.current=false;sequence.current++;};},[reload,manage,allowed,confirmed]);
 useEffect(()=>{onDirtyChange?.(dirty);return()=>onDirtyChange?.(false);},[dirty,onDirtyChange]);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 // Read-only refresh on returning from the video tab. Never discard a manager's input.
 useEffect(()=>{const focus=()=>{if((manage?allowed:confirmed)&&!dirty&&!busy&&!loading)void reload();};window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[dirty,busy,loading,reload,manage,allowed,confirmed]);
 const mutate=async(action:()=>Promise<void>,success:string)=>{
  setBusy(true);setError('');setMessage('');
  try{await action();if(mounted.current){setMessage(success);await reload();}}
  catch(e){if(mounted.current)setError(trainingError(e));}
  finally{if(mounted.current)setBusy(false);}
 };
 const catalog=visibleTraining(data);
 const videos=catalog.videos.filter(row=>row.categoryId===selected);
 const progress=new Map<string,TrainingProgress>(data.progress.filter(row=>row.userId===user.id).map(row=>[row.videoId,row]));
 const blocked=loading||busy||!ready;
 const orderingBlocked=blocked||Boolean(editingCategory||editingVideo);
 const clearVideo=()=>{setVideo({title:'',videoUrl:'',materialUrl:''});setEditingVideo(null);};
 const startCategoryEdit=(row:TrainingCategory)=>{if(categoryTitle.trim()&&!window.confirm('現在の研修名の入力を破棄して編集しますか？'))return;setEditingCategory(row);setCategoryTitle(row.title);setAddingCategory(true);setMessage('');};
 const startVideoEdit=(row:TrainingVideo)=>{if((video.title||video.videoUrl||video.materialUrl)&&!window.confirm('現在の動画の入力を破棄して編集しますか？'))return;setEditingVideo(row);setVideo({title:row.title,videoUrl:row.videoUrl,materialUrl:row.materialUrl});setMessage('');};
 if(manage&&!allowed)return <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">研修の追加は管理者・児発管のみ行えます。</p>;
 if(!manage&&!confirmed)return <section aria-label="受講する職員の確認" className="mx-auto max-w-xl space-y-4 rounded-2xl border-2 border-teal-400 bg-white p-5 shadow-sm sm:p-7">
  <h2 className="text-xl font-black">受講する職員を確認してください</h2><p className="text-sm leading-relaxed text-slate-600">このアカウント本人の受講状況として「完了」が保存されます。表示されている職員で間違いありませんか？</p>
  <div className="rounded-xl bg-teal-50 p-4"><p className="text-xs font-bold text-teal-700">現在のログイン職員</p><p className="mt-1 break-words text-2xl font-black text-slate-950">{user.displayName}</p>{user.organizationName&&<p className="mt-1 text-xs text-slate-600">{user.organizationName}</p>}</div>
  <button type="button" className="min-h-12 w-full rounded-xl bg-teal-700 px-4 font-black text-white" onClick={()=>setConfirmedScope(scope)}>この職員で受講する</button>
  {onSignOut?<button type="button" className={`${buttonClass} w-full`} onClick={onSignOut}>別の職員で受講する（ログアウト）</button>:<p className="text-sm text-slate-600">違う職員の場合は、メニューからログアウトし、本人のアカウントでログインしてください。</p>}
 </section>;
 return <div className="space-y-4" aria-label={manage?'法定研修追加':'法定研修'}>
  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
   <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><BookOpenCheck className="h-7 w-7 text-teal-700"/><div><h2 className="text-xl font-black">{manage?'法定研修追加':'法定研修'}</h2><p className="mt-1 text-sm text-slate-600">{manage?'研修カテゴリに動画と資料のリンクを登録します。':`${user.displayName}さん本人の受講状況です。`}</p></div></div>
    <button type="button" className={buttonClass} disabled={busy||loading} onClick={()=>{if(!dirty||window.confirm('未保存の入力を残したまま、一覧を再読込しますか？'))void reload();}}><RefreshCw className="mr-1 inline h-4 w-4"/>再読込</button></div>
   <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">研修名・URLはDサポートのDBで共有し、AIには送信しません。動画・資料は外部サービスで開きます。外部サービスのログインは別途必要です。{user.organizationId==='local'?'試用データはメモリ内のみで、画面更新後は失われます。':''}</p>
   {!manage&&<p className="mt-3 text-xs text-slate-600">外部サービスの視聴済み表示とは連動しません。受講後に「完了」を押してください。これは自己申告の記録であり、視聴証明ではありません。</p>}
  </section>
  {loading&&<p role="status" className="text-sm text-slate-600">読み込み中…</p>}
  {error&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
  {message&&<p role="status" className="rounded-xl bg-teal-50 p-3 text-sm text-teal-900">{message}</p>}
  <div className="grid items-start gap-4 lg:grid-cols-[minmax(220px,320px)_minmax(0,1fr)]">
   <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4"><h3 className="font-black">研修カテゴリ</h3>
    {allowed&&<p className="mt-2 text-xs leading-relaxed text-slate-600">「並び替え」をドラッグ、または「上へ・下へ」でカテゴリと動画の表示順を変更できます。操作ごとに保存し、職員の受講画面にも反映します。</p>}
    {allowed&&<><button className={`${buttonClass} mt-3 w-full`} disabled={blocked} onClick={()=>{if(categoryTitle.trim()&&!window.confirm('入力中の研修名を破棄しますか？'))return;setEditingCategory(null);setCategoryTitle('');setAddingCategory(value=>editingCategory?true:!value);}}><Plus className="mr-1 inline h-4 w-4"/>研修カテゴリを追加</button>
     {addingCategory&&<form className="mt-3 space-y-2" onSubmit={e=>{e.preventDefault();void mutate(async()=>{if(editingCategory)await repo.updateCategory(editingCategory,categoryTitle);else await repo.addCategory(categoryTitle);if(mounted.current){setCategoryTitle('');setAddingCategory(false);setEditingCategory(null);}},editingCategory?'研修名を変更しました。':'研修カテゴリを追加しました。');}}><label className="block text-sm font-bold">研修名<input autoComplete="off" required maxLength={120} className={inputClass} value={categoryTitle} disabled={blocked} onChange={e=>setCategoryTitle(e.target.value)}/></label><button className={`${buttonClass} w-full`} disabled={blocked||!categoryTitle.trim()}>{editingCategory?'研修名の変更を保存':'カテゴリを保存'}</button><button type="button" className={`${buttonClass} w-full`} disabled={busy} onClick={()=>{if(!categoryTitle.trim()||window.confirm('研修名の入力を破棄しますか？')){setCategoryTitle('');setEditingCategory(null);setAddingCategory(false);}}}>入力をやめる</button></form>}
    </>}
    <TrainingSortableList items={catalog.categories} disabled={!allowed||orderingBlocked} onMove={(id,target)=>void mutate(()=>repo.reorderCategories(moveTrainingItemTo(catalog.categories,id,target)),'カテゴリの表示順を保存しました。')}><div className="mt-3 space-y-2">{catalog.categories.map((row,index)=>{
     const count=remainingTraining(catalog.videos.filter(video=>video.categoryId===row.id),data.progress,user.id);
     return <TrainingSortableItem key={row.id} id={row.id} title={row.title} disabled={!allowed||orderingBlocked}>{handle=><div role="group" aria-label={`カテゴリ ${row.title}`}><button type="button" aria-pressed={selected===row.id} disabled={busy} className={`flex min-h-14 w-full items-center justify-between gap-2 rounded-xl border p-3 text-left ${selected===row.id?'border-teal-500 bg-teal-50':'border-slate-200'}`} onClick={()=>{if(video.title||video.videoUrl||video.materialUrl){if(!window.confirm('動画の未保存の入力を破棄して別のカテゴリを開きますか？'))return;clearVideo();}setSelected(row.id);setMessage('');}}><span className="min-w-0 break-words font-bold">{row.title}</span>{!manage&&<span className={`shrink-0 rounded-full px-2 py-1 text-xs font-black ${count?'bg-amber-100 text-amber-950':'bg-emerald-100 text-emerald-800'}`}>未受講 {count}</span>}</button>
      {allowed&&<><button type="button" aria-label={`${row.title}の研修名を編集`} className="mt-1 min-h-10 text-xs font-bold text-teal-800" disabled={blocked} onClick={()=>startCategoryEdit(row)}><Pencil className="mr-1 inline h-3 w-3"/>研修名を編集</button><TrainingOrderControls handle={handle} title={row.title} index={index} count={catalog.categories.length} disabled={orderingBlocked} onMove={direction=>void mutate(()=>repo.reorderCategories(moveTrainingItem(catalog.categories,row.id,direction)),'カテゴリの表示順を保存しました。')}/></>}</div>}</TrainingSortableItem>;
    })}</div></TrainingSortableList>
    {ready&&!catalog.categories.length&&<p className="mt-3 text-sm text-slate-600">研修カテゴリがありません。管理者・児発管が設定の「法定研修追加」で登録してください。</p>}
   </section>
   <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-black">{catalog.categories.find(row=>row.id===selected)?.title||'研修名を選択してください'}</h3>
    {allowed&&selected&&<button type="button" className="min-h-10 text-xs font-bold text-rose-700" disabled={blocked||dirty} onClick={()=>{const row=catalog.categories.find(row=>row.id===selected);if(row&&window.confirm('カテゴリとカテゴリ内の動画を一覧から削除します。過去の受講履歴は保持されます。削除しますか？'))void mutate(()=>repo.archiveCategory(row),'カテゴリを削除しました。');}}>カテゴリを削除</button>}</div>
    {allowed&&selected&&<form className="mt-4 space-y-3 rounded-xl border border-teal-200 bg-teal-50 p-3" onSubmit={e=>{e.preventDefault();void mutate(async()=>{if(editingVideo)await repo.updateVideo(editingVideo,video);else await repo.addVideo(selected,video);if(mounted.current)clearVideo();},editingVideo?'動画の変更を保存しました。':'動画を追加しました。');}}>
     <h4 className="font-black">{editingVideo?'登録済み動画を編集':'動画を追加'}</h4>
     <label className="block text-sm font-bold">動画タイトル<input autoComplete="off" required maxLength={180} className={inputClass} value={video.title} disabled={blocked} onChange={e=>setVideo(row=>({...row,title:e.target.value}))}/></label>
     <label className="block text-sm font-bold">動画URL<input autoComplete="off" required type="url" inputMode="url" maxLength={2048} className={inputClass} value={video.videoUrl} disabled={blocked} onChange={e=>setVideo(row=>({...row,videoUrl:e.target.value}))}/></label>
     <label className="block text-sm font-bold">資料URL（任意）<input autoComplete="off" type="url" inputMode="url" maxLength={2048} className={inputClass} value={video.materialUrl} disabled={blocked} onChange={e=>setVideo(row=>({...row,materialUrl:e.target.value}))}/></label>
     <div className="flex flex-wrap gap-2"><button className="min-h-11 rounded-xl bg-teal-700 px-4 text-sm font-bold text-white disabled:opacity-40" disabled={blocked||!video.title.trim()||!video.videoUrl.trim()}>{editingVideo?'動画の変更を保存':'動画を追加'}</button>{(editingVideo||video.title||video.videoUrl||video.materialUrl)&&<button type="button" className={buttonClass} disabled={busy} onClick={()=>{if(window.confirm('動画の入力を破棄しますか？'))clearVideo();}}>{editingVideo?'編集をやめる':'入力をクリア'}</button>}</div>
     {(editingCategory||editingVideo)&&<p className="text-xs font-bold text-teal-800">編集中は並び替え・削除を停止しています。編集を保存するか、入力を取り消してから操作してください。</p>}
     <p className="text-xs text-slate-600">編集しても受講済み状態は変わりません。内容の異なる動画は新規登録してください。削除は一覧から取り除き、過去の受講履歴を保持します。</p>
    </form>}
    <TrainingSortableList items={videos} disabled={!allowed||orderingBlocked} onMove={(id,target)=>void mutate(()=>repo.reorderVideos(selected,moveTrainingItemTo(videos,id,target)),'動画の表示順を保存しました。')}><div className="mt-4 space-y-3">{videos.map((row,index)=>{
     const status=progress.get(row.id),completed=Boolean(status?.completedAt);
     return <TrainingSortableItem key={row.id} id={row.id} title={row.title} disabled={!allowed||orderingBlocked}>{handle=><article aria-label={row.title} className={`rounded-xl border p-3 ${completed&&!manage?'border-emerald-200 bg-emerald-50/50':'border-slate-200'}`}>
      <div className="flex flex-wrap items-center gap-2"><button type="button" className="min-h-11 min-w-0 flex-1 break-words text-left text-base font-bold text-teal-800 underline decoration-teal-300 underline-offset-4" onClick={()=>{try{openTrainingResources(row,(url,target,features)=>window.open(url,target,features));setMessage('外部タブを開きました。動画・資料が開かない場合は、個別のリンクを押してください。');}catch(e){setError(trainingError(e));}}}>{row.title}<ExternalLink className="ml-1 inline h-4 w-4"/></button>
       {!manage&&<span className={`rounded-full px-3 py-1 text-xs font-black ${completed?'bg-emerald-100 text-emerald-900':'bg-amber-100 text-amber-900'}`}>{completed?'受講済み':'未受講'}</span>}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2"><a className={buttonClass+' inline-flex items-center'} href={row.videoUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">動画を開く</a>{row.materialUrl&&<a className={buttonClass+' inline-flex items-center'} href={row.materialUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">資料を開く</a>}
       {manage?<><button type="button" className={`${buttonClass} text-teal-800`} disabled={blocked} onClick={()=>startVideoEdit(row)}>編集</button><button type="button" className={`${buttonClass} text-rose-700`} disabled={blocked||dirty} onClick={()=>{if(window.confirm('この動画を一覧から削除します。過去の受講履歴は保持されます。削除しますか？'))void mutate(()=>repo.archiveVideo(row),'動画を削除しました。');}}>削除</button></>:<button type="button" className={completed?`${buttonClass} text-slate-700`:'min-h-11 rounded-xl border border-teal-700 bg-teal-700 px-4 text-sm font-bold text-white disabled:opacity-40'} disabled={blocked} onClick={()=>void mutate(async()=>{await repo.setCompleted(row.id,!completed,status?.revision||0);},completed?'完了を取り消しました。':'本人の受講完了を保存しました。')}>{completed?'取り消し':'完了'}</button>}</div>
      {!manage&&status?.completedAt&&<p className="mt-2 text-xs text-emerald-800">受講完了：{new Date(status.completedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</p>}
      {allowed&&<TrainingOrderControls handle={handle} title={row.title} index={index} count={videos.length} disabled={orderingBlocked} onMove={direction=>void mutate(()=>repo.reorderVideos(selected,moveTrainingItem(videos,row.id,direction)),'動画の表示順を保存しました。')}/>}
     </article>}</TrainingSortableItem>;
    })}</div></TrainingSortableList>
    {ready&&selected&&!videos.length&&<p className="mt-4 text-sm text-slate-600">このカテゴリには動画がありません。</p>}
   </section>
  </div>
 </div>;
}
function TrainingOrderControls({handle,title,index,count,disabled,onMove}:{handle:ReactNode;title:string;index:number;count:number;disabled:boolean;onMove:(direction:-1|1)=>void}){
 return <div className="mt-2 flex flex-wrap items-center gap-2">{handle}<span className="mr-auto text-xs text-slate-500">{index+1} / {count}</span>
  <button type="button" aria-label={`${title}を上へ`} disabled={disabled||index===0} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 disabled:opacity-40" onClick={()=>onMove(-1)}><ArrowUp className="mr-1 inline h-3 w-3"/>上へ</button>
  <button type="button" aria-label={`${title}を下へ`} disabled={disabled||index===count-1} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 disabled:opacity-40" onClick={()=>onMove(1)}><ArrowDown className="mr-1 inline h-3 w-3"/>下へ</button>
 </div>;
}
function TrainingSortableList({items,disabled,onMove,children}:{items:{id:string}[];disabled:boolean;onMove:(id:string,target:string)=>void;children?:ReactNode}){
 const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:6}}),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}));
 return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({active,over})=>{if(!disabled&&over&&active.id!==over.id)onMove(String(active.id),String(over.id));}}><SortableContext items={items.map(row=>row.id)} strategy={verticalListSortingStrategy}>{children}</SortableContext></DndContext>;
}
function TrainingSortableItem({id,title,disabled,children}:{key?:string;id:string;title:string;disabled:boolean;children?:(handle:ReactNode)=>ReactNode}){
 const {attributes,listeners,setNodeRef,setActivatorNodeRef,transform,transition,isDragging}=useSortable({id,disabled});
 const handle=<button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`${title}をドラッグして並び替え`} disabled={disabled} className="min-h-11 touch-none rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700 disabled:opacity-40" style={{cursor:disabled?'default':isDragging?'grabbing':'grab'}}><GripVertical className="mr-1 inline h-4 w-4"/>並び替え</button>;
 return <div ref={setNodeRef} style={{transform:CSS.Transform.toString(transform),transition}} className={isDragging?'relative z-20 rounded-xl bg-white shadow-xl ring-2 ring-teal-400':''}>{children?.(handle)}</div>;
}
