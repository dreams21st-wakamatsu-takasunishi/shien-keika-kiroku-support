// Fictional records only. The real data-service builder is intercepted locally.
import React,{useCallback,useRef,useState} from 'react';import {createRoot} from 'react-dom/client';
import {RecordHistoryProvider} from '../../src/components/RecordHistory';import {RecordList} from '../../src/components/RecordList';
import {DailyOperationsPanel} from '../../src/components/DailyOperationsPanel';import {PreviousSupportRecap} from '../../src/components/PreviousSupportRecap';
import {createRecordChanges,initialRecordDate,mergeRecordPeriod,type RecordPeriod,type RecordPeriodResult} from '../../src/services/recordPeriods';import {loadWorkspaceData} from '../../src/services/dataService';import {mergeRecordRefresh} from '../../src/utils/recordRefresh';
import {getLocalDateString} from '../../src/utils/weekdays';import type {SupportRecord} from '../../src/types';import '../../src/index.css';
const orgA='11111111-1111-4111-8111-111111111111',orgB='22222222-2222-4222-8222-222222222222',today=getLocalDateString();
const row=(id:string,date:string,name='架空児童A',status='確認済み')=>({id,record_date:date,organization_id:orgA,child_id:id,child_name:name,version:3,deleted_at:null,approval_status:status,template_id:'original',template_name:'架空書式',template_type:'平日',attendance:'出席',expression:[],recorder_name:'架空職員',created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z',section_answers:{life:{sectionTitle:'生活',answers:{preparation:{value:'原文のまま',note:'保持する架空メモ'}}}},template_snapshot:{sections:[{id:'life',title:'旧版の架空の質問',fields:[]}]}});
const history=Array.from({length:1205},(_,i)=>row('history-'+String(1205-i).padStart(4,'0'),'2026-01-10'));
const all=[...history,row('february','2026-02-15'),row('eleven','2026-01-11'),row('concurrent-deleted','2026-01-14'),{...row('recap-record','2026-01-12'),child_id:'eleven'},row('pending','2020-01-01','架空の未確認児童','未確認'),row('today',today)];
const model={requests:[] as any[],rows:[] as SupportRecord[],initial:null as any,fail:'',delay:'',delayMs:0,cap:73,merges:0,scope:orgA,deleted:[] as string[]};
const nativeFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);if(url.origin===location.origin)return nativeFetch(input,init);
 const resource=url.pathname.split('/').at(-1)||'',filters=url.searchParams.getAll('record_date'),logic=url.searchParams.get('or')||'',org=url.searchParams.get('organization_id')?.replace('eq.','');
 model.requests.push({resource,org,filters,logic,ids:url.searchParams.get('id'),limit:url.searchParams.get('limit'),order:url.searchParams.get('order')});
 if(resource!=='support_records')return new Response(JSON.stringify(['organization_ai_settings','transport_route_settings'].includes(resource)?null:[]),{headers:{'Content-Type':'application/json'}});
 if(filters.includes('gte.'+model.fail))return new Response(JSON.stringify({code:'42501',message:'synthetic denied'}),{status:403,headers:{'Content-Type':'application/json'}});
 let rows=org===orgB?[{...row('org-b','2026-01-11','別事業所の架空児童B'),organization_id:orgB}]:all;
 const idFilter=url.searchParams.get('id'),ids=idFilter?.slice(4,-1).split(',').map(id=>id.replace(/^"|"$/g,''));
 rows=rows.filter(r=>(ids?ids.includes(r.id):!model.deleted.includes(r.id))&&filters.every(f=>f.startsWith('gte.')?r.record_date>=f.slice(4):r.record_date<=f.slice(4))).map(r=>model.deleted.includes(r.id)?{...r,deleted_at:'2026-10-26T00:00:00Z'}:r);
 const initial=logic.match(/record_date\.gte\.(\d{4}-\d{2}-\d{2})/)?.[1];if(initial)rows=rows.filter(r=>r.record_date>=initial||r.approval_status!=='確認済み');
 const date=logic.match(/record_date\.lt\.(\d{4}-\d{2}-\d{2})/)?.[1],id=logic.match(/id\.lt\.("(?:\\.|[^"])*")/)?.[1];if(date&&id){const cursor=JSON.parse(id);rows=rows.filter(r=>r.record_date<date||(r.record_date===date&&r.id<cursor));}
 const total=rows.length;rows=[...rows].sort((a,b)=>b.record_date.localeCompare(a.record_date)||b.id.localeCompare(a.id)).slice(0,Math.min(model.cap,Number(url.searchParams.get('limit')||200)));
 const body=JSON.stringify(rows);if(filters.includes('gte.'+model.delay)&&model.delayMs)await new Promise(resolve=>setTimeout(resolve,model.delayMs));
 return new Response(body,{headers:{'Content-Type':'application/json',...(ids?{'Content-Range':`0-${Math.max(0,rows.length-1)}/${total}`}:{})}});
};
const mapped=(r:ReturnType<typeof row>):SupportRecord=>({id:r.id,date:r.record_date,childId:r.child_id,childName:r.child_name,templateId:r.template_id,templateName:r.template_name,templateType:'平日',templateSectionsSnapshot:r.template_snapshot.sections,version:r.version,approvalStatus:r.approval_status as SupportRecord['approvalStatus'],attendance:'出席',expressions:[],snack:'',recorderName:r.recorder_name,createdAt:r.created_at,updatedAt:r.updated_at,sectionAnswers:r.section_answers});
const initial=all.filter(r=>r.record_date>=initialRecordDate(today)||r.approval_status!=='確認済み').map(mapped);
function Fixture(){
 const [records,setRecords]=useState(initial),[scope,setScope]=useState(orgA),[revision,setRevision]=useState(0),changes=useRef(createRecordChanges()),[view,setView]=useState('list'),[day,setDay]=useState('2026-01-11');model.rows=records;model.scope=scope;
 const loaded=useCallback((p:RecordPeriod,result:RecordPeriodResult,base:SupportRecord[])=>{model.merges++;setRecords(previous=>mergeRecordRefresh(mergeRecordPeriod(previous,result.records,p,base),result.refreshed,result.changedIds));},[]);
 Object.assign(window,{__recordHistory:model,__recordHistoryActions:{initial:async()=>{model.initial=await loadWorkspaceData(orgA);},view:(v:string)=>setView(v),date:(v:string)=>setDay(v),refresh:()=>setRevision(n=>n+1),scope:()=>{changes.current=createRecordChanges();setScope(orgB);setRecords([]);},remove:(id:string)=>{model.deleted.push(id);changes.current.add(id);setRecords(rows=>rows.filter(r=>r.id!==id));},edit:(id:string)=>setRecords(rows=>rows.map(r=>r.id===id?{...r,version:9,updatedAt:'2026-10-26T10:00:00Z'}:r))}});
 const children=[{id:'eleven',name:'架空児童A',regularDays:['月','火','水','木','金','土','日']}];
 return <React.StrictMode><RecordHistoryProvider organizationId={scope} scopeKey={scope} revision={revision} initialFrom={initialRecordDate(today)} records={records} onLoaded={loaded} changes={changes.current}><main className="min-h-screen bg-slate-50 p-4 text-slate-950"><p>全件架空データ・本番への通信と書き込みはありません。</p>
 {view==='list'&&<RecordList records={records} onSelectRecord={()=>{}} onEditRecord={()=>{}} onDuplicateRecord={()=>{}} onDeleteRecord={()=>{}} onNewRecord={()=>{}}/>}
 {view==='daily'&&<DailyOperationsPanel records={records} childrenList={children as any} drafts={[]} dailyChildPlans={[]} dailyTransportRequirements={[]} targetDate={day} onTargetDateChange={setDay} onStartRecord={()=>{}} onResumeDraft={()=>{}} onViewDraft={()=>{}} onTakeOverDrafts={async()=>true} onDeleteDraft={()=>{}} onOpenRecord={()=>{}}/>}
 {view==='recap'&&<PreviousSupportRecap records={records} childrenList={children as any} meetingDate={day}/>}
 </main></RecordHistoryProvider></React.StrictMode>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
