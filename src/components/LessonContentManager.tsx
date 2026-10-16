import React,{useEffect,useRef,useState} from 'react';
import {ArrowLeft,Copy,Eye,EyeOff,Gift,LoaderCircle,Pencil,Plus,RefreshCw,Save} from 'lucide-react';
import {loadCampusContent,loadContentCampuses,saveCampusContent} from '../services/lessonLearningService';
import {parseContentItem,type CampusContent,type ContentItem,type ContentKind,type CustomReward,type TextTask} from '../learning/managedContent';

const input='min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const button='inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-bold disabled:opacity-50';
const labels={textTasks:'文章課題',customThemes:'テーマ',customEffects:'演出'};
const itemName=(item:ContentItem)=>'title' in item?item.title:item.name;
function newItem(kind:ContentKind):ContentItem {
 const id=`${kind==='textTasks'?'tt':kind==='customThemes'?'ct':'ce'}_${crypto.randomUUID()}`;
 return kind==='textTasks'?{id,title:'',content:'',time:3,star:1,targetGroup:'',hidden:false}
  :kind==='customThemes'?{id,name:'',hidden:false,distribution:'gacha',bg:'#edf8f3',text:'#18392d',btnBg:'#087f72',btnText:'#ffffff'}
  :{id,name:'',hidden:false,distribution:'gacha',emojis:['⭐']};
}
function TextPreview({value}:{value:string}){
 return <div className="whitespace-pre-wrap break-words text-base leading-9">{value.split(/(\{[^{}|]+\|[^{}|]+\})/g).map((part,index)=>{
  const match=/^\{([^{}|]+)\|([^{}|]+)\}$/.exec(part);
  return match?<ruby key={index}>{match[1]}<rt className="text-xs">{match[2]}</rt></ruby>:part;
 })}</div>;
}
export function LessonContentManager({mode,scopeKey,onDirtyChange}:{key?:string;mode:'texts'|'rewards';scopeKey:string;onDirtyChange:(dirty:boolean)=>void}){
 const [configuration,setConfiguration]=useState<Awaited<ReturnType<typeof loadContentCampuses>>|null>(null);
 const [campus,setCampus]=useState(''),[snapshot,setSnapshot]=useState<CampusContent|null>(null);
 const [kind,setKind]=useState<ContentKind>(mode==='texts'?'textTasks':'customThemes');
 const [draft,setDraft]=useState<ContentItem|null>(null),[original,setOriginal]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const version=useRef(0),pending=useRef<{key:string;id:string}|null>(null);
 const dirty=Boolean(draft&&JSON.stringify(draft)!==original);
 useEffect(()=>{onDirtyChange(dirty);return()=>onDirtyChange(false);},[dirty,onDirtyChange]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 const leave=()=>!dirty||window.confirm('保存していない変更を破棄しますか？');
 const clearEditor=()=>{setDraft(null);setOriginal('');pending.current=null;};
 useEffect(()=>{
  const current=++version.current;setConfiguration(null);setCampus('');setSnapshot(null);clearEditor();setError('');setMessage('');setBusy(true);
  void loadContentCampuses().then(result=>{if(version.current===current){setConfiguration(result);setCampus(result.campuses[0]?.id||'');}})
   .catch(e=>{if(version.current===current)setError(e instanceof Error?e.message:'校舎を取得できませんでした。');}).finally(()=>{if(version.current===current)setBusy(false);});
  return()=>{version.current++;};
 },[scopeKey]);
 useEffect(()=>{setKind(mode==='texts'?'textTasks':'customThemes');clearEditor();},[mode]);
 const read=async()=>{
  if(!configuration||!campus)return;
  const current=++version.current;setSnapshot(null);clearEditor();setBusy(true);setError('');setMessage('');
  try{const result=await loadCampusContent(campus,configuration.organizationId);if(result.sourceProject!==configuration.sourceProject)throw Error('連携先が変更されました。');if(version.current===current)setSnapshot(result);}
  catch(e){if(version.current===current)setError(e instanceof Error?e.message:'取得できませんでした。');}
  finally{if(version.current===current)setBusy(false);}
 };
 useEffect(()=>{void read();return()=>{version.current++;};},[campus,configuration]);
 const edit=(item:ContentItem)=>{if(leave()){setDraft(structuredClone(item));setOriginal(JSON.stringify(item));setError('');setMessage('');pending.current=null;}};
 const patch=(update:Partial<TextTask>&Partial<CustomReward>)=>setDraft(value=>value?{...value,...update}:null);
 const save=async(item:ContentItem)=>{
  if(!snapshot)return;
  let normalized:ContentItem;
  try{normalized=parseContentItem(kind,kind==='customEffects'?{...item,emojis:(item as CustomReward).emojis?.map(value=>value.trim()).filter(Boolean)}:item);}catch(e){setError((e as Error).message);return;}
  const isNew=!snapshot.content[kind].some(value=>value.id===normalized.id);
  const presenting=kind!=='textTasks'&&isNew&&(normalized as CustomReward).distribution==='present'&&!normalized.hidden;
  const campusName=configuration?.campuses.find(row=>row.id===campus)?.name||campus;
  if(!window.confirm(`${campusName}の「${itemName(normalized)}」を保存しますか？${presenting?'\nこの校舎の連携済み児童へプレゼントします。':''}`))return;
  const key=JSON.stringify([snapshot.campusId,snapshot.revision,snapshot.fingerprint,kind,normalized]);
  if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};
  const current=++version.current;setBusy(true);setError('');setMessage('');
  try{
   const result=await saveCampusContent(snapshot,kind,normalized,pending.current.id);
   if(version.current!==current)return;
   setSnapshot(result.snapshot);clearEditor();setMessage(presenting?`保存しました。連携児童${result.giftedCount}名へプレゼントしました。`:'保存しました。');
  }catch(e){if(version.current===current)setError(e instanceof Error?e.message:'保存結果が未確定です。同じ内容で再確認してください。');}
  finally{if(version.current===current)setBusy(false);}
 };
 const rows=snapshot?.content[kind]||[];
 const textDraft=draft&&'title' in draft?draft:null,rewardDraft=draft&&'name' in draft?draft:null;
 const existing=Boolean(draft&&rows.some(item=>item.id===draft.id));
 return <section aria-label={mode==='texts'?'文章課題の作成':'ごほうびの作成'} className="min-w-0 space-y-4">
  <div className="flex flex-wrap items-end gap-3">
   <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-bold sm:max-w-sm">対象校舎<select aria-label="教材の対象校舎" className={input} value={campus} disabled={busy||!configuration} onChange={e=>{if(leave()){setCampus(e.target.value);setSnapshot(null);clearEditor();}}}>
    {!campus&&<option value="">校舎を選択</option>}{configuration?.campuses.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
   </select></label>
   <button type="button" className={button} disabled={busy||!campus} onClick={()=>{if(leave())void read();}}><RefreshCw className="h-4 w-4"/>再取得</button>
  </div>
  {busy&&<p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle className="h-4 w-4 animate-spin"/>処理中...</p>}
  {error&&<p role="alert" className="break-words border-l-4 border-rose-500 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
  {message&&<p role="status" className="bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
  {configuration&&!configuration.campuses.length&&<p role="status" className="py-6 text-sm text-slate-600">専用の連携許可がある校舎がありません。</p>}
  {snapshot&&<>
   {mode==='rewards'&&<div role="group" aria-label="ごほうびの種類" className="flex gap-1 border-b border-slate-200 pb-3">{(['customThemes','customEffects'] as const).map(value=><button type="button" key={value} aria-pressed={kind===value} disabled={busy} onClick={()=>{if(leave()){setKind(value);clearEditor();}}} className={`${button} ${kind===value?'border-teal-700 bg-teal-50 text-teal-900':''}`}>{labels[value]}</button>)}</div>}
   {!draft?<>
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-bold">{labels[kind]} <span className="text-sm font-normal text-slate-600">{rows.length}件</span></h3><button type="button" className={`${button} border-teal-700 bg-teal-700 text-white`} disabled={busy} onClick={()=>edit(newItem(kind))}><Plus className="h-4 w-4"/>{labels[kind]}を作成</button></div>
    <ul className="divide-y divide-slate-200 border-y border-slate-200">{rows.map(item=><li key={item.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-4">
     <div className="min-w-0 flex-1 basis-48"><p className="break-words font-bold">{itemName(item)}</p><p className="mt-1 break-words text-xs text-slate-600">{item.hidden?'非表示':'表示中'}{'title' in item?` ・ ${item.time}分 ・ 難度${item.star} ・ ${item.targetGroup||'全グループ'}`:` ・ ${item.distribution==='present'?'プレゼント':'ガチャ'}`}</p></div>
     <div className="flex shrink-0 gap-2"><button type="button" disabled={busy} className={button} aria-label={`編集：${itemName(item)}`} title="編集" onClick={()=>edit(item)}><Pencil className="h-4 w-4"/></button>
      <button type="button" disabled={busy} className={button} aria-label={`複製：${itemName(item)}`} title="複製" onClick={()=>edit({...item,id:newItem(kind).id,hidden:false,...('title' in item?{title:`${item.title}（コピー）`}:{name:`${item.name}（コピー）`})})}><Copy className="h-4 w-4"/></button>
      <button type="button" disabled={busy} className={button} aria-label={`${item.hidden?'表示':'非表示'}：${itemName(item)}`} title={item.hidden?'表示する':'非表示にする'} onClick={()=>void save({...item,hidden:!item.hidden})}>{item.hidden?<Eye className="h-4 w-4"/>:<EyeOff className="h-4 w-4"/>}</button></div>
    </li>)}</ul>{rows.length===0&&<p className="py-6 text-center text-sm text-slate-600">まだ作成されていません。</p>}
   </>:<form onSubmit={e=>{e.preventDefault();void save(draft);}} className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-bold">{labels[kind]}の{existing?'編集':'作成'}</h3><button type="button" disabled={busy} className={button} onClick={()=>{if(leave())clearEditor();}}><ArrowLeft className="h-4 w-4"/>一覧へ</button></div>
    <fieldset disabled={busy} className="grid min-w-0 gap-5 lg:grid-cols-2">
     <div className="min-w-0 space-y-4">
      <label className="block space-y-1 text-sm font-bold">{textDraft?'タイトル':'名前'}<input required maxLength={textDraft?160:80} className={input} value={itemName(draft)} onChange={e=>patch(textDraft?{title:e.target.value}:{name:e.target.value})}/></label>
      {textDraft?<>
       <div className="grid grid-cols-2 gap-3"><label className="block space-y-1 text-sm font-bold">制限時間（分）<input type="number" min={1} max={60} required className={input} value={textDraft.time} onChange={e=>patch({time:Number(e.target.value)})}/></label><label className="block space-y-1 text-sm font-bold">難度<select aria-label="難度" className={input} value={textDraft.star} onChange={e=>patch({star:Number(e.target.value)})}>{[1,2,3,4,5].map(n=><option value={n} key={n}>{n}</option>)}</select></label></div>
       <label className="block space-y-1 text-sm font-bold">対象学習グループ<input maxLength={80} className={input} value={textDraft.targetGroup} placeholder="全グループ" onChange={e=>patch({targetGroup:e.target.value})}/></label>
       <label className="block space-y-1 text-sm font-bold">お手本文章<textarea aria-label="お手本文章" required maxLength={20000} rows={10} className={input} value={textDraft.content} onChange={e=>patch({content:e.target.value})}/></label>
      </>:rewardDraft&&<>
       <label className="block space-y-1 text-sm font-bold">配布方法<select aria-label="配布方法" disabled={existing} className={input} value={rewardDraft.distribution} onChange={e=>patch({distribution:e.target.value as 'gacha'|'present',hidden:false})}><option value="gacha">ガチャに追加</option><option value="present">この校舎の連携児童へプレゼント</option></select></label>
       {kind==='customThemes'?<div className="grid grid-cols-2 gap-3">{([['bg','背景'],['text','文字'],['btnBg','ボタン背景'],['btnText','ボタン文字']] as const).map(([key,label])=><label key={key} className="flex items-center justify-between gap-3 text-sm font-bold">{label}<input aria-label={label} type="color" className="h-11 w-14 cursor-pointer rounded border border-slate-300" value={rewardDraft[key]} onChange={e=>patch({[key]:e.target.value})}/></label>)}</div>:<div className="grid grid-cols-3 gap-3">{[0,1,2].map(index=><label key={index} className="block space-y-1 text-sm font-bold">絵文字{index+1}<input aria-label={`絵文字${index+1}`} className={input} maxLength={32} required={index===0} value={rewardDraft.emojis?.[index]||''} onChange={e=>{const emojis=[...(rewardDraft.emojis||[])];emojis[index]=e.target.value;patch({emojis});}}/></label>)}</div>}
      </>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={Boolean(rewardDraft?.distribution==='present'&&!existing)} checked={!draft.hidden} onChange={e=>patch({hidden:!e.target.checked})} className="h-4 w-4 accent-teal-700"/>表示する</label>
     </div>
     <div className="min-w-0"><h4 className="mb-3 text-sm font-bold text-slate-700">プレビュー</h4>{textDraft?<div className="border-y border-slate-200 py-4"><h5 className="mb-4 break-words font-bold">{textDraft.title}</h5><TextPreview value={textDraft.content}/></div>:rewardDraft&&<div className="flex min-h-60 flex-col items-center justify-center gap-5 overflow-hidden border border-slate-200 p-5" style={kind==='customThemes'?{backgroundColor:rewardDraft.bg,color:rewardDraft.text}:{}}>
      {kind==='customEffects'&&<div className="flex min-h-20 max-w-full flex-wrap items-center justify-center gap-3 text-4xl">{rewardDraft.emojis?.map((emoji,i)=><span key={i} className="break-all">{emoji}</span>)}</div>}
      <p className="w-full break-words text-center text-lg font-bold">{rewardDraft.name||labels[kind]}</p>{kind==='customThemes'&&<span className="px-6 py-3 font-bold" style={{backgroundColor:rewardDraft.btnBg,color:rewardDraft.btnText}}>れんしゅう</span>}
     </div>}</div>
    </fieldset>
    <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4"><button type="submit" disabled={busy||!itemName(draft).trim()} className={`${button} border-teal-700 bg-teal-700 text-white`}>{busy?<LoaderCircle className="h-4 w-4 animate-spin"/>:rewardDraft?.distribution==='present'&&!existing?<Gift className="h-4 w-4"/>:<Save className="h-4 w-4"/>}保存</button>{dirty&&<span className="text-xs text-amber-800">未保存の変更あり</span>}</div>
   </form>}
  </>}
 </section>;
}
