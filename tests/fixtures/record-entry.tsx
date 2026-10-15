import React,{useCallback,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Header} from '../../src/components/Header';
import {RecordForm} from '../../src/components/RecordForm';
import {RecordEntryDialog} from '../../src/components/RecordEntryDialog';
import {DailyOperationsPanel} from '../../src/components/DailyOperationsPanel';
import {useRecordEntry} from '../../src/hooks/useRecordEntry';
import {localInputDrafts,mergeLocalInputDrafts,type RecordEntryLaunch,type RecordEntrySignal} from '../../src/utils/recordEntry';
import {getLocalDateString,getCurrentWeekday} from '../../src/utils/weekdays';
import {UNIFIED_TEMPLATE,UNIFIED_TEMPLATE_ID} from '../../src/data/unifiedTemplate';
import '../../src/index.css';
const date=getLocalDateString(),owner={userId:'fixture-user',recorderId:'fixture-staff'},prefix='support-record-draft-v2:local:fixture-user:';
const mode=new URLSearchParams(location.search).get('mode')||'single';
const children=['A','B','C'].map(id=>({id,name:'架空児童'+id,grade:'小学2年生',regularDays:['月','火','水','木','金','土','日'],transportProgram:'小学部',careType:'放課後等デイサービス'}));
const recorder={id:owner.recorderId,displayName:'架空職員',active:true};
const childDraft=(id:string)=>({recordId:'record-fixture-'+id,templateId:UNIFIED_TEMPLATE_ID,attendance:'出席',attendanceNote:id+'の入力済みメモ',expressions:[],expressionNote:'',snack:'',snackNote:'',sectionAnswers:{},recordModules:[],skippedQuestionIds:[]});
const seed=(id:string)=>({version:12,selectedTemplateId:UNIFIED_TEMPLATE_ID,selectedChildIds:[id],childTemplateIds:{[id]:UNIFIED_TEMPLATE_ID},childDrafts:{[id]:childDraft(id)},activeChildId:id,childStepIds:{[id]:'attendance'},date,recorderId:recorder.id,recorderName:recorder.displayName,currentStepIndex:2,updatedAt:new Date().toISOString()});
for(const key of Object.keys(localStorage))if(key.startsWith('support-record-draft-v2:local:'))localStorage.removeItem(key);
if(mode!=='empty')localStorage.setItem(prefix+'record-A',JSON.stringify(seed('A')));
if(mode==='split')localStorage.setItem(prefix+'record-B',JSON.stringify(seed('B')));
const model={opened:[] as RecordEntryLaunch[],failRead:false,delay:0,merges:0};Object.assign(window,{__recordEntry:model});
const noop=async()=>{};
function Fixture(){
 const [user,setUser]=useState(owner.userId),[screen,setScreen]=useState('home'),[key,setKey]=useState(''),[session,setSession]=useState(0),[signal,setSignal]=useState<RecordEntrySignal|null>(null),[,refresh]=useState(0);
 const changed=useCallback(()=>refresh(n=>n+1),[]);
 const drafts=localInputDrafts(localStorage,undefined,user);
 const entry=useRecordEntry({identity:{userId:user,recorderId:recorder.id},load:async()=>{if(model.delay)await new Promise(resolve=>setTimeout(resolve,model.delay));if(model.failRead)throw Error('確認用の通信エラー：新しい画面は作成していません。');return localInputDrafts(localStorage,undefined,user);},merge:async(rows,target)=>{mergeLocalInputDrafts(localStorage,undefined,{userId:user,recorderId:recorder.id},date,rows.map(row=>row.draftKey),target);model.merges++;},open:launch=>{model.opened.push(launch);if(key!==launch.draftKey||launch.reloaded)setSession(n=>n+1);setKey(launch.draftKey);setSignal({...launch,requestId:crypto.randomUUID()});setScreen('form');}});
 const newRecord=()=>{if(screen==='form')setSignal({requestId:crypto.randomUUID(),chooseChildren:true});else void entry.request({date});};
 return <><Header activeTab={screen==='form'?'form':'home'} setActiveTab={tab=>{if(tab==='form')newRecord();else setScreen('home');}} onNewRecord={newRecord} unapprovedCount={0} currentUser={{id:user,organizationId:'local',displayName:'架空職員',role:'staff'}} activeRecorder={recorder}/>
 <main className="mx-auto max-w-4xl space-y-3 p-3"><nav className="flex flex-wrap gap-2" aria-label="確認用の入口"><button type="button" className="rounded-lg border p-2" onClick={newRecord}>ホームの記録作成</button><button type="button" className="rounded-lg border p-2" onClick={()=>{setScreen('home');void entry.request({date,childId:'B'});}}>児童Bの記録を開始</button><button type="button" className="rounded-lg border p-2" onClick={()=>{setScreen('home');void entry.request({date,childId:'C'});}}>児童Cの記録を開始</button><button type="button" className="rounded-lg border p-2" onClick={()=>setScreen('status')}>記録状況を確認</button><button type="button" className="rounded-lg border p-2" onClick={()=>setUser('other-user')}>確認用のユーザー切替</button></nav>
 {entry.error&&!entry.dialog&&<p role="alert">{entry.error}</p>}
 {screen==='status'&&<DailyOperationsPanel childrenList={children as any} records={[]} drafts={drafts} dailyChildPlans={[]} dailyTransportRequirements={[]} currentUserId={user} currentRecorderId={recorder.id} targetDate={date} onTargetDateChange={()=>{}} onStartRecord={(id,date)=>void entry.request({date,childId:id})} onResumeDraft={key=>{setKey(key);setSignal(null);setScreen('form');setSession(n=>n+1);}} onViewDraft={()=>{}} onTakeOverDrafts={async()=>false} onDeleteDraft={noop} onOpenRecord={()=>{}} onManageOwnDrafts={date=>void entry.request({date,manage:true})}/>}
 {screen==='form'&&<RecordForm key={key+':'+session} draftKey={key} userId={user} userDisplayName="架空職員" templates={[UNIFIED_TEMPLATE]} childrenList={children as any} recorderProfiles={[recorder]} activeRecorder={recorder} entryRequest={signal} entryManagerOpen={Boolean(entry.dialog)||entry.busy} onManageOwnDrafts={date=>entry.request({date,manage:true})} readOnlyDrafts={drafts} lockedChildren={Object.fromEntries(drafts.filter(draft=>draft.draftKey!==key).flatMap(draft=>draft.selectedChildIds.map(id=>[date+':'+id,draft.recorderName||'職員'])))} onDraftChanged={changed} onSaveRecords={async records=>({status:'saved',records})}/>}
 <output data-testid="entry-state" className="block break-all text-xs" data-key={key} data-session={session}>{drafts.length}画面</output>
 {entry.dialog&&<RecordEntryDialog request={entry.dialog.request} drafts={entry.dialog.drafts} childrenList={children as any} busy={entry.busy} error={entry.error} onDateChange={date=>void entry.request({date,manage:true})} onChoose={key=>void entry.choose(key)} onMerge={(keys,target)=>void entry.merge(keys,target)} onClose={entry.close}/>}
 </main></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
