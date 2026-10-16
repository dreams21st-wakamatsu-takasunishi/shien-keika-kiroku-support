import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {loadWorkspaceData,loadWorkspacePatch,loadRecordSaveSnapshot,listRecordDrafts} from '../../src/services/dataService';
import {DiagnosticsPanel} from '../../src/components/DiagnosticsPanel';
import {createWorkspaceRefreshQueue} from '../../src/services/workspaceRefreshQueue';
import {clearPerformanceTimings} from '../../src/services/performanceMetrics';
import {RecordList} from '../../src/components/DeferredAppScreens';
import type {SupportRecord} from '../../src/types';
import '../../src/index.css';
const org='22222222-2222-4222-8222-222222222222';
const model={requests:[] as {resource:string;select:string|null;org:string|null;filter:string|null;ids:string|null;method:string}[],fail:'',delay:0,result:null as any};
const record={id:'fixture-record',child_id:'fixture-child',record_date:'2026-10-16',child_name:'架空児童',version:3,deleted_at:null,section_answers:{},template_snapshot:{sections:[]}};
window.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url),resource=url.pathname.split('/').at(-1)||'';
  model.requests.push({resource,select:url.searchParams.get('select'),org:url.searchParams.get('organization_id'),filter:url.searchParams.get('or'),ids:url.searchParams.get('id'),method:init?.method||'GET'});
  if(model.delay)await new Promise(resolve=>setTimeout(resolve,model.delay));
  if(resource===model.fail)return new Response(JSON.stringify({code:'42501',message:'synthetic denied'}),{status:403,headers:{'Content-Type':'application/json'}});
  let rows:any=[];
  if(resource==='organization_ai_settings'||resource==='transport_route_settings')rows=null;
  if(resource==='support_records')rows=model.requests.at(-1)?.filter?[record,{...record,id:'deleted-record',deleted_at:'2026-10-16T00:00:00Z'}]:[record];
  if(resource==='record_drafts')rows=[{user_id:'fixture-user',draft_key:'record-fixture',revision:4,device_id:'fixture-device',recorder_profile_id:'fixture-recorder',selectedChildIds:['fixture-child'],recorderName:'架空職員',date:'2026-10-16',currentStepIndex:2,takenOverFromDraftKey:'record-old'}];
  return new Response(JSON.stringify(rows),{headers:{'Content-Type':'application/json'}});
};
clearPerformanceTimings();
const queue=createWorkspaceRefreshQueue();queue.reset('test-account');
Object.assign(window,{__workspacePerformance:model,__workspaceActions:{
  full:async()=>model.result=await loadWorkspaceData(org),
  patch:async(tables:string[])=>model.result=await loadWorkspacePatch(org,tables),
  recordPatch:async()=>model.result=await loadWorkspacePatch(org,['support_records'],['fixture-record']),
  drafts:async()=>model.result=await listRecordDrafts(org),
  snapshot:async()=>model.result=await loadRecordSaveSnapshot(org,[{id:'fixture-record',childId:'fixture-child',date:'2026-10-16'}] as SupportRecord[]),
  burst:async()=>{const work=async(tables:string[]|undefined)=>{model.result=tables?await loadWorkspacePatch(org,tables):await loadWorkspaceData(org);};const first=queue.request(undefined,work);queue.request(['morning_meeting_records'],work);queue.request(['morning_meeting_records'],work);await first;},
}});
function Fixture(){const [open,setOpen]=useState(false);return <main className="app-background mx-auto min-h-screen max-w-5xl space-y-4 p-4 text-slate-900"><h1>処理時間・読み込みの確認（架空データ）</h1><p>本番の記録やアカウントには接続しません。</p><button className="min-h-11 rounded-lg border px-4" onClick={()=>setOpen(true)}>遅延読み込みの記録一覧を開く</button>{open&&<RecordList records={[]} onSelectRecord={()=>{}} onEditRecord={()=>{}} onDeleteRecord={()=>{}} onDuplicateRecord={()=>{}} onNewRecord={()=>{}}/>}<DiagnosticsPanel/></main>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
