import {useEffect,useMemo,useRef,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {Copy,FilePlus2,RefreshCw,Save,Trash2,Users} from 'lucide-react';
import type {ChildProfile,SupportRecord,MorningMeetingRecord,MorningMeetingTemplate,MorningMeetingConfirmation,RecorderProfile,UserProfile,MorningSectionKey} from '../types';
import {getLocalDateString} from '../utils/weekdays';
import {isServiceDate} from '../learning/contracts';
import {MORNING_SECTIONS,formatMorningDocument,morningDocument,morningRevisions} from '../utils/morningSections';
import {acknowledgeMorningSave,createMorningState,editMorningField,receiveMorningSnapshot,resolveMorningField,visibleMorningDocument,type MorningSectionState} from '../utils/morningSectionSync';
import {loadMorningSections,saveMorningSection} from '../services/morningSections';
import {createMorningMeetingRealtime} from '../services/morningMeetingRealtime';
import {supabase} from '../lib/supabase';
import {PreviousSupportRecap} from './PreviousSupportRecap';
import {DeleteWorkspaceItem} from './WorkspaceLifecycle';

export interface MorningMeetingPanelProps {
 supportRecords?:SupportRecord[];childrenList?:ChildProfile[];records:MorningMeetingRecord[];
 templates:MorningMeetingTemplate[];confirmations:MorningMeetingConfirmation[];recorderProfiles:RecorderProfile[];
 organizationId?:string;activeRecorder?:RecorderProfile;currentUser?:UserProfile|null;canManageTemplates:boolean;dailySummary?:string[];
 onSave:(record:MorningMeetingRecord)=>Promise<MorningMeetingRecord|void>|MorningMeetingRecord|void;
 onSynced?:(record:MorningMeetingRecord)=>void;onDirtyChange?:(dirty:boolean)=>void;
 realtimeClient?:SupabaseClient;
 onSaveTemplate:(template:MorningMeetingTemplate)=>Promise<void>|void;onArchiveTemplate:(id:string)=>Promise<void>|void;
 onSetConfirmation:(confirmation:MorningMeetingConfirmation,confirmed:boolean)=>Promise<void>|void;
}
interface LiveField {sender:string;name:string;fieldKey:MorningSectionKey;text:string;revision:number;version:number;at:number}
interface Viewer {sessionId:string;name:string;fieldKey?:MorningSectionKey}
const validKey=(key:unknown):key is MorningSectionKey=>MORNING_SECTIONS.some(s=>s.key===key);
const button='min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 disabled:opacity-40';

export function MorningMeetingPanel(props:MorningMeetingPanelProps){
 const [date,setDate]=useState(getLocalDateString());
 // A keyed editor prevents late requests from a previous date/account entering a new editor.
 const scope=`${props.organizationId||'local'}:${props.currentUser?.id||props.activeRecorder?.id||'local'}:${date}`;
 const pending=useRef(false),[dirty,setDirty]=useState(false);
 const dirtyChange=(value:boolean)=>{pending.current=value;setDirty(value);props.onDirtyChange?.(value);};
 const dateChange=(value:string)=>{if(!isServiceDate(value)||value===date)return;if(pending.current){window.alert('未保存の入力・同時更新の確認があります。保存してから朝礼日を変更してください。');return;}setDate(value);};
 return <section className="morning-workspace" aria-label="朝礼記録">
  <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 p-4"><div><h3 className="text-lg font-black text-slate-950">朝礼記録</h3><p className="mt-1 text-xs text-slate-500">左で仕上がりを確認し、右の項目を入力します。別項目は同時編集できます。</p></div><label className="text-xs font-bold text-slate-600">朝礼日<input aria-label="朝礼日" type="date" value={date} disabled={dirty} onChange={e=>dateChange(e.target.value)} className="ml-2 min-h-11 rounded-xl border bg-white px-3 text-sm"/></label></div>
  <div key={scope}><MorningSectionEditor {...props} date={date} onDirty={dirtyChange}/></div>
 </section>;
}

function MorningSectionEditor(props:MorningMeetingPanelProps&{date:string;onDirty:(dirty:boolean)=>void}){
 const initial=props.records.find(r=>r.date===props.date);
 const [state,setState]=useState(()=>createMorningState(initial)),stateRef=useRef(state);
 const [active,setActive]=useState<MorningSectionKey>(initial?.content&&!initial.sectionDocument?'legacy':'plan'),[mode,setMode]=useState<'input'|'preview'>('input');
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[connection,setConnection]=useState(props.organizationId?'connecting':'local'),[viewers,setViewers]=useState<Viewer[]>([]),[live,setLive]=useState<Partial<Record<MorningSectionKey,LiveField>>>({}),[clock,setClock]=useState(Date.now());
 const [blocked,setBlocked]=useState(false),[templateId,setTemplateId]=useState(''),[templateName,setTemplateName]=useState(''),[templateBody,setTemplateBody]=useState(''),[editingTemplateId,setEditingTemplateId]=useState(''),[otherBusy,setOtherBusy]=useState(false);
 const mounted=useRef(true),saving=useRef(false),saveTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),reloadTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),draftTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const blockedRef=useRef(false),deletionEpoch=useRef(0);
 const connectionRef=useRef<ReturnType<typeof createMorningMeetingRealtime>|null>(null),reloadRef=useRef<()=>Promise<void>>(async()=>{}),saveRef=useRef<()=>Promise<void>>(async()=>{});
 const callbacks=useRef(props);callbacks.current=props;
 const session=useRef(crypto.randomUUID()).current,focused=useRef<MorningSectionKey|undefined>(undefined),preview=useRef<HTMLDivElement>(null);
 const pendingBroadcasts=useRef(new Map<MorningSectionKey,LiveField>()),seen=useRef(new Map<string,number>());
 const actor=props.activeRecorder?.displayName||props.currentUser?.displayName||'職員';
 const pending=Object.keys(state.edits).length>0||Object.keys(state.conflicts).length>0;
 const doc=visibleMorningDocument(state),canonical=morningDocument(state.record),revisions=morningRevisions(state.record);
 const commit=(next:MorningSectionState)=>{stateRef.current=next;setState(next);};
 useEffect(()=>{callbacks.current.onDirty(pending);},[pending]);
 useEffect(()=>{
  mounted.current=true;const warning=(event:BeforeUnloadEvent)=>{if(Object.keys(stateRef.current.edits).length||Object.keys(stateRef.current.conflicts).length){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',warning);
  return()=>{mounted.current=false;clearTimeout(saveTimer.current);clearTimeout(reloadTimer.current);clearTimeout(draftTimer.current);window.removeEventListener('beforeunload',warning);callbacks.current.onDirty(false);};
 },[]);
 useEffect(()=>{const incoming=props.records.find(r=>r.date===props.date);if(incoming)commit(receiveMorningSnapshot(stateRef.current,incoming));},[props.records]);
 const accept=(record:MorningMeetingRecord)=>{
  if(!mounted.current||record.date!==props.date)return;
  if(!stateRef.current.record&&!focused.current&&!Object.keys(stateRef.current.edits).length&&record.content&&!record.sectionDocument)setActive('legacy');
  commit(receiveMorningSnapshot(stateRef.current,record));callbacks.current.onSynced?.(stateRef.current.record!);blockedRef.current=false;setBlocked(false);
 };
 const loading=useRef<Promise<void>|null>(null);
 reloadRef.current=async()=>{
  if(!props.organizationId||!mounted.current)return;
  if(loading.current)return loading.current;
  const epoch=deletionEpoch.current;
  loading.current=(async()=>{try{const record=await loadMorningSections(props.date);if(!mounted.current||epoch!==deletionEpoch.current)return;if(record)accept(record);else if(stateRef.current.record){blockedRef.current=true;setBlocked(true);setError('この朝礼記録を取得できません。削除・復元状態を確認してください。入力は保持しています。');}}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'朝礼記録を取得できません。');}finally{loading.current=null;}})();
  return loading.current;
 };
 const scheduleReload=()=>{clearTimeout(reloadTimer.current);reloadTimer.current=setTimeout(()=>void reloadRef.current(),250);};
 const presence=(key?:MorningSectionKey)=>{
  focused.current=key;connectionRef.current?.track({sessionId:session,name:actor,fieldKey:key||'',lastActiveAt:new Date().toISOString()});
 };
 const publish=(key:MorningSectionKey)=>{
  const edit=stateRef.current.edits[key];if(!edit)return;
  pendingBroadcasts.current.set(key,{sender:session,name:actor,fieldKey:key,text:edit.text,revision:edit.expected,version:edit.version,at:Date.now()});
  if(draftTimer.current)return;
  draftTimer.current=setTimeout(()=>{draftTimer.current=undefined;for(const item of pendingBroadcasts.current.values())connectionRef.current?.send('section_draft',{...item,date:props.date});pendingBroadcasts.current.clear();},250);
 };
 useEffect(()=>{
  const realtimeClient=props.realtimeClient||supabase;
  if(!props.organizationId||!realtimeClient)return;
  const manager=createMorningMeetingRealtime(realtimeClient,{
   topic:`organization:${props.organizationId}:morning-meeting:${props.date}`,sessionId:session,
   onStatus:status=>{if(mounted.current)setConnection(status);},
   onConnected:()=>{presence(focused.current);void reloadRef.current().then(()=>{if(mounted.current)void saveRef.current();});connectionRef.current?.send('section_request',{date:props.date,sender:session});for(const {key} of MORNING_SECTIONS)publish(key);},
   bindChannel:(channel,isCurrent)=>{
    channel.on('presence',{event:'sync'},()=>{
     if(!isCurrent()||!mounted.current)return;
     const rows=Object.values(channel.presenceState()).flat() as any[];
     setViewers(rows.filter(r=>r.sessionId!==session&&typeof r.sessionId==='string'&&typeof r.name==='string').map(r=>({sessionId:r.sessionId,name:r.name.slice(0,100),fieldKey:validKey(r.fieldKey)?r.fieldKey:undefined})));
    });
    channel.on('broadcast',{event:'section_draft'},({payload:p}:any)=>{
     if(!isCurrent()||!mounted.current||p?.date!==props.date||p.sender===session||typeof p.sender!=='string'||typeof p.name!=='string'||!validKey(p.fieldKey)||typeof p.text!=='string'||p.text.length>20000||!Number.isSafeInteger(p.version)||!Number.isSafeInteger(p.revision))return;
     if(p.revision!==morningRevisions(stateRef.current.record)[p.fieldKey])return;
     const key=JSON.stringify([p.sender,p.fieldKey]);if((seen.current.get(key)??-1)>=p.version)return;seen.current.set(key,p.version);
     setLive(old=>({...old,[p.fieldKey]:{...p,name:p.name.slice(0,100),at:Date.now()}}));
    });
    channel.on('broadcast',{event:'section_request'},({payload:p}:any)=>{if(isCurrent()&&p?.date===props.date){presence(focused.current);for(const {key} of MORNING_SECTIONS)publish(key);}});
    channel.on('broadcast',{event:'section_saved'},({payload:p}:any)=>{if(isCurrent()&&p?.date===props.date)scheduleReload();});
    channel.on('postgres_changes',{event:'*',schema:'public',table:'morning_meeting_records',filter:`organization_id=eq.${props.organizationId}`},(payload:any)=>{if(isCurrent()&&(payload.new?.meeting_date||payload.old?.meeting_date)===props.date)scheduleReload();});
   },
  });
  connectionRef.current=manager;manager.start();void reloadRef.current();
  const refresh=()=>{if(document.visibilityState==='visible')void reloadRef.current().then(()=>{if(mounted.current)void saveRef.current();});};
  window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);
  const timer=setInterval(()=>{setClock(Date.now());if(document.visibilityState==='visible'){void reloadRef.current();presence(focused.current);}},15000);
  const lifecycle=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.resource==='morning_meeting_records'&&detail.id===props.date){if(!detail.restore){blockedRef.current=true;deletionEpoch.current++;clearTimeout(saveTimer.current);setBlocked(true);setError('この日の朝礼記録は削除されました。入力は保持しています。');}else void reloadRef.current();}};
  window.addEventListener('d-support:workspace-item-deleted',lifecycle);
  return()=>{clearInterval(timer);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('d-support:workspace-item-deleted',lifecycle);manager.stop();connectionRef.current=null;};
 },[props.organizationId,props.date,session,actor,props.realtimeClient]);
 const scheduleSave=()=>{clearTimeout(saveTimer.current);saveTimer.current=setTimeout(()=>void saveRef.current(),1800);};
 const change=(key:MorningSectionKey,text:string)=>{
  if(blockedRef.current)return;
  commit(editMorningField(stateRef.current,key,text));callbacks.current.onDirty(true);setMessage('');publish(key);scheduleSave();
 };
 saveRef.current=async()=>{
  if(saving.current||blockedRef.current||!mounted.current)return;
  const entry=(Object.entries(stateRef.current.edits) as [MorningSectionKey,NonNullable<MorningSectionState['edits'][MorningSectionKey]>][]).find(([key])=>!stateRef.current.conflicts[key]);
  if(!entry)return;
  if(props.organizationId&&!navigator.onLine){setError('オフラインです。入力を保持しています。接続復旧後に「保存・再試行」を押してください。');return;}
  const [key,edit]=entry;saving.current=true;setError('');let completed=false;const epoch=deletionEpoch.current;
  try{
   let result;
   if(props.organizationId)result=await saveMorningSection(props.date,key,edit.text,edit.expected);
   else{
    const base=stateRef.current.record,document=morningDocument(base),rev=morningRevisions(base);document[key]=edit.text;rev[key]++;
    const stamp=new Date().toISOString(),local:MorningMeetingRecord={date:props.date,content:formatMorningDocument(document),sectionDocument:document,sectionRevisions:rev,revision:(base?.revision||0)+1,createdAt:base?.createdAt||stamp,updatedAt:stamp,updatedByName:actor,updatedByRecorderId:props.activeRecorder?.id};
    if(local.content.length>20000)throw Error('朝礼全体は20,000文字までです。');
    const saved=await callbacks.current.onSave(local);result={record:saved||local,conflict:false};
   }
   if(!mounted.current||epoch!==deletionEpoch.current)return;
   commit(acknowledgeMorningSave(stateRef.current,key,edit.version,result.record,result.conflict));
   callbacks.current.onSynced?.(stateRef.current.record!);completed=true;
   if(result.conflict)setMessage('同じ項目が更新されています。入力を残したまま比較してください。');
   else{setMessage('保存済み');connectionRef.current?.send('section_saved',{date:props.date,sender:session,fieldKey:key});}
  }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'保存できませんでした。入力は保持しています。');}
  finally{saving.current=false;if(mounted.current&&completed){const still=Object.keys(stateRef.current.edits).some(k=>!stateRef.current.conflicts[k as MorningSectionKey]);if(still)saveTimer.current=setTimeout(()=>void saveRef.current(),500);}}
 };
 // Save failures wait for explicit retry; do not spin an offline/conflicting request loop.
 const retry=()=>{setError('');void saveRef.current();};
 useEffect(()=>{const node=preview.current?.querySelector<HTMLElement>(`[data-morning-preview="${active}"]`);if(node&&preview.current){const a=node.getBoundingClientRect(),b=preview.current.getBoundingClientRect();if(a.top<b.top||a.bottom>b.bottom)preview.current.scrollTo({top:preview.current.scrollTop+a.top-b.top-12,behavior:'smooth'});}},[active]);
 const resolve=(key:MorningSectionKey,keep:boolean)=>{commit(resolveMorningField(stateRef.current,key,keep));if(keep)scheduleSave();};
 const confirmed=props.confirmations.filter(c=>c.date===props.date&&state.record&&Date.parse(c.confirmedAt)>=Date.parse(state.record.updatedAt));
 const confirmationActor=props.activeRecorder?{confirmerKey:`recorder:${props.activeRecorder.id}`,recorderProfileId:props.activeRecorder.id,confirmerName:actor}:props.currentUser?{confirmerKey:`user:${props.currentUser.id}`,userId:props.currentUser.id,confirmerName:actor}:null;
 const isConfirmed=Boolean(confirmationActor&&confirmed.some(c=>c.confirmerKey===confirmationActor.confirmerKey));
 const confirm=async()=>{if(!confirmationActor||pending||!state.record)return;setOtherBusy(true);try{await props.onSetConfirmation({date:props.date,...confirmationActor,confirmedAt:new Date().toISOString()},!isConfirmed);}catch{setError('確認状況を保存できませんでした。');}finally{setOtherBusy(false);}};
 const copy=async()=>{try{await navigator.clipboard.writeText(formatMorningDocument(doc));setMessage('朝礼の文章をコピーしました。');}catch{setError('コピーできませんでした。ブラウザーの権限を確認してください。');}};
 const templateApply=()=>{const template=props.templates.find(t=>t.id===templateId);if(!template)return;if(doc.legacy&&!window.confirm('自由記入・既存本文の欄をテンプレートで置き換えます。他の項目は変更しません。続けますか？'))return;change('legacy',template.content);setActive('legacy');};
 const templateEdit=()=>{const t=props.templates.find(t=>t.id===templateId);if(t){setEditingTemplateId(t.id);setTemplateName(t.name);setTemplateBody(t.content);}};
 const templateSave=async()=>{if(!templateName.trim()||!templateBody.trim()||templateBody.length>20000)return;setOtherBusy(true);try{const now=new Date().toISOString(),old=props.templates.find(t=>t.id===editingTemplateId);await props.onSaveTemplate({id:old?.id||crypto.randomUUID(),name:templateName.trim(),content:templateBody,createdAt:old?.createdAt||now,updatedAt:now});setEditingTemplateId('');setTemplateName('');setTemplateBody('');setMessage('テンプレートを保存しました。');}catch{setError('テンプレートを保存できませんでした。');}finally{setOtherBusy(false);}};
 return <div className="p-3 sm:p-4">
  <div id="morning-collaboration-status" aria-label="共同編集と保存状態" className="morning-fixed-status">
   <span className="shrink-0 text-xs font-bold text-teal-900">{connection==='local'?'ローカル試用':connection==='connected'?`共同編集・${viewers.length+1}人`:'接続を確認中'}</span>
   <span role="status" className="shrink-0 text-xs font-bold">{blocked?'削除・利用状態の確認が必要':error?'保存・通信の確認が必要':pending?'入力を保持・保存待ち':state.record?'保存済み':'未作成'}</span>
   <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto text-xs"><span className="shrink-0">自分：{actor}</span>{viewers.map(v=><span key={v.sessionId} className="shrink-0 rounded-full bg-indigo-50 px-2 py-1 text-indigo-900">{v.name}{v.fieldKey?`：${MORNING_SECTIONS.find(s=>s.key===v.fieldKey)?.label}を編集中`:'：閲覧中'}</span>)}</div>
  </div>
  <div className="mt-3 flex flex-wrap items-center gap-2">
   <div className="morning-mobile-tabs" role="tablist" aria-label="朝礼の表示切り替え"><button type="button" role="tab" aria-selected={mode==='input'} onClick={()=>setMode('input')} className={button}>入力</button><button type="button" role="tab" aria-selected={mode==='preview'} onClick={()=>setMode('preview')} className={button}>プレビュー</button></div>
   <button type="button" onClick={retry} disabled={blocked} className={button}><Save className="mr-1 inline h-4 w-4"/>保存・再試行</button>
   <button type="button" onClick={()=>void reloadRef.current()} className={button}><RefreshCw className="mr-1 inline h-4 w-4"/>最新を確認</button>
   <button type="button" onClick={()=>void copy()} className={button}><Copy className="mr-1 inline h-4 w-4"/>文章コピー</button>
   {state.record&&<DeleteWorkspaceItem resource="morning_meeting_records" id={props.date} revision={state.record.revision} disabled={pending||saving.current} onDeleted={()=>{blockedRef.current=true;deletionEpoch.current++;clearTimeout(saveTimer.current);setBlocked(true);}}/>}
  </div>
  {error&&<p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
  <p className="mt-2 min-h-5 text-xs text-teal-800">{message||'\u00a0'}</p>
  <div className="morning-edit-layout mt-3" data-mode={mode}>
   <aside className="morning-preview-pane" aria-label="朝礼の仕上がりプレビュー"><h4 className="mb-2 text-sm font-black">仕上がりプレビュー ／ {props.date}</h4><div ref={preview} className="morning-preview-scroll">
    {MORNING_SECTIONS.map(s=>{const remote=live[s.key],showLive=remote&&clock-remote.at<45000&&remote.revision===revisions[s.key]&&!state.edits[s.key]&&remote.text!==canonical[s.key];const value=showLive?remote.text:doc[s.key];return <section key={s.key} data-morning-preview={s.key} className={`mb-3 rounded-xl border p-3 ${active===s.key?'border-teal-500 bg-teal-50 ring-2 ring-teal-100':'border-slate-200 bg-white'}`}><h5 className="text-sm font-bold">{s.label}</h5>{showLive&&<p className="mt-1 text-xs font-bold text-indigo-700">{remote.name}さんの入力共有（保存待ち）</p>}<p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7">{value||'（未記入）'}</p></section>;})}
   </div></aside>
   <div className="morning-input-pane" aria-label="朝礼の項目入力">
    <nav className="mb-3 flex flex-wrap gap-2" aria-label="朝礼の入力項目">{MORNING_SECTIONS.map(s=><button key={s.key} type="button" aria-pressed={active===s.key} onClick={()=>{setActive(s.key);document.getElementById('morning-field-'+s.key)?.focus({preventScroll:true});}} className={`min-h-10 rounded-xl border px-3 text-xs font-bold ${active===s.key?'border-teal-700 bg-teal-700 text-white':'border-slate-200 bg-white'}`}>{s.label}{state.edits[s.key]?' ・未保存':''}</button>)}</nav>
    {MORNING_SECTIONS.map(s=><section key={s.key} hidden={active!==s.key}>
     <label className="block text-sm font-black text-slate-900">{s.label}<textarea id={'morning-field-'+s.key} aria-label={s.key==='legacy'?'朝礼記録の入力':s.label+'の入力'} aria-describedby="morning-collaboration-status" value={doc[s.key]} maxLength={20000} disabled={blocked} onChange={e=>change(s.key,e.target.value)} onFocus={()=>{setActive(s.key);presence(s.key);}} onBlur={()=>presence(undefined)} rows={9} className="mt-2 min-h-64 max-h-[65dvh] w-full resize-y rounded-xl border-2 border-teal-200 bg-teal-50/30 p-4 text-base leading-8 focus:border-teal-600 focus:bg-white"/></label>
     <p className="mt-1 text-xs text-slate-500">この項目 {doc[s.key].length}文字 ／ 朝礼全体は20,000文字まで</p>
     {viewers.filter(v=>v.fieldKey===s.key).map(v=><p key={v.sessionId} className="mt-2 rounded-lg bg-indigo-50 p-2 text-xs text-indigo-900">{v.name}さんもこの項目を編集中です。同じ項目の更新は保存時に確認します。</p>)}
     {state.conflicts[s.key]&&<section role="alert" className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3"><h5 className="font-black text-amber-950">同じ項目が更新されました</h5><p className="mt-1 text-xs">入力は保持しています。自分の入力と保存済みの最新内容を比較してください。</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><div><strong className="text-xs">自分の入力</strong><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words text-sm">{doc[s.key]}</pre></div><div><strong className="text-xs">保存済みの最新内容</strong><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words text-sm">{canonical[s.key]||'（空欄）'}</pre></div></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={()=>resolve(s.key,true)} className={button}>確認して自分の内容を保存</button><button type="button" onClick={()=>resolve(s.key,false)} className={button}>最新内容を使用</button></div><p className="mt-2 text-xs">必要な部分は比較しながら上の入力欄へ手動で統合してください。他の項目は上書きしません。</p></section>}
    </section>)}
    {state.record&&!state.record.sectionDocument&&state.record.content&&<p className="mt-3 rounded-lg bg-sky-50 p-3 text-xs text-sky-900">既存の本文は「自由記入・既存の本文」にそのまま残しています。勝手に分解・書き換えは行いません。</p>}
   </div>
  </div>
  <details className="mt-4 rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer py-2 text-sm font-bold">参照：本日の業務・前回の支援内容</summary><div className="mt-3 space-y-4"><div className="grid gap-2 sm:grid-cols-2">{props.dailySummary?.map(line=><p key={line} className="rounded-lg bg-teal-50 p-3 text-sm">{line}</p>)}</div><PreviousSupportRecap meetingDate={props.date} childrenList={props.childrenList||[]} records={props.supportRecords||[]}/></div></details>
  <details className="mt-3 rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer py-2 text-sm font-bold">入力準備・テンプレート</summary>
   <div className="mt-3 flex flex-wrap gap-2"><select aria-label="朝礼テンプレート" value={templateId} onChange={e=>setTemplateId(e.target.value)} className="min-h-11 max-w-full rounded-xl border px-3"><option value="">テンプレートを選択</option>{props.templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><button type="button" disabled={!templateId||blocked} onClick={templateApply} className={button}>自由記入欄へ適用</button>
   {props.canManageTemplates&&<><button type="button" disabled={otherBusy||!templateId} onClick={templateEdit} className={button}>選択したテンプレートを編集</button><button type="button" disabled={otherBusy||!templateId} onClick={()=>{if(window.confirm('この朝礼テンプレートを削除しますか？'))void Promise.resolve(props.onArchiveTemplate(templateId)).catch(()=>setError('テンプレートを削除できませんでした。'));}} className={button}><Trash2 className="mr-1 inline h-4 w-4"/>テンプレート削除</button></>}</div>
   {props.canManageTemplates&&<div className="mt-4 space-y-3 rounded-xl bg-sky-50 p-3"><h5 className="text-sm font-bold">{editingTemplateId?'テンプレートを編集':'新しいテンプレート'}</h5><div className="flex flex-wrap gap-2"><button type="button" disabled={otherBusy} onClick={()=>{setEditingTemplateId('');setTemplateName('');setTemplateBody('');}} className={button}>新規・編集を取り消す</button><button type="button" disabled={otherBusy} onClick={()=>{if(templateBody&&!window.confirm('テンプレート編集中の本文を、現在の朝礼の内容で置き換えますか？'))return;setTemplateBody(formatMorningDocument(doc));}} className={button}>現在の朝礼を読み込む</button></div>
    <label className="block text-sm font-bold">テンプレート名<input aria-label="朝礼テンプレート名" value={templateName} maxLength={100} onChange={e=>setTemplateName(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border px-3"/></label>
    <label className="block text-sm font-bold">テンプレート本文<textarea aria-label="朝礼テンプレート本文" value={templateBody} maxLength={20000} onChange={e=>setTemplateBody(e.target.value)} rows={5} className="mt-1 min-h-32 w-full resize-y rounded-xl border p-3 font-normal"/></label>
    <button type="button" disabled={otherBusy||!templateName.trim()||!templateBody.trim()} onClick={()=>void templateSave()} className={button}><FilePlus2 className="mr-1 inline h-4 w-4"/>{editingTemplateId?'テンプレートの変更を保存':'テンプレートを作成'}</button>
   </div>}
  </details>
  <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3"><Users className="h-5 w-5 text-teal-700"/><p className="text-sm">最新内容の確認済み {confirmed.length}人</p><button type="button" disabled={pending||blocked||otherBusy||!state.record||!confirmationActor||!state.record.content.trim()} onClick={()=>void confirm()} className={button}>{isConfirmed?'確認済みを取り消す':'最新内容を確認しました'}</button><details className="w-full"><summary className="cursor-pointer text-xs text-slate-600">確認した職員</summary><div className="mt-2 flex flex-wrap gap-2">{props.recorderProfiles.filter(r=>r.active).map(r=>{const current=confirmed.find(c=>c.recorderProfileId===r.id),past=props.confirmations.find(c=>c.date===props.date&&c.recorderProfileId===r.id);return <span key={r.id} className={`rounded-lg border px-3 py-2 text-xs ${current?'border-teal-200 bg-teal-50 text-teal-900':past?'border-amber-200 bg-amber-50 text-amber-950':'border-slate-200 bg-white text-slate-600'}`}>{r.displayName}：{current?'確認済み':past?'再確認が必要':'未確認'}</span>;})}{confirmed.filter(c=>!props.recorderProfiles.some(r=>r.id===c.recorderProfileId)).map(c=><span key={c.confirmerKey} className="rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-900">{c.confirmerName}：確認済み</span>)}{!props.recorderProfiles.length&&!confirmed.length&&<p className="text-sm">まだ確認されていません。</p>}</div></details></div>
 </div>;
}
