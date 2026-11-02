import React,{useMemo,useState} from 'react';import {createRoot} from 'react-dom/client';import type {SupabaseClient} from '@supabase/supabase-js';
import '../../src/index.css';import {MorningMeetingPanel} from '../../src/components/MorningMeetingPanel';import {ParentShareDialog} from '../../src/components/ParentShareDialog';import type {MorningMeetingRecord,SupportRecord} from '../../src/types';

// In-process/local BroadcastChannel adapter. Never opens Supabase WebSockets.
class FakeChannel{
 state='joining';closed=false;callback?:(status:string)=>void;entries:{type:string;event:string;fn:(data:any)=>void}[]=[];presence=new Map<string,any>();own:any;bus:BroadcastChannel;
 socket={isConnected:()=>!(window as any).__morningOffline};
 constructor(readonly topic:string){this.bus=new BroadcastChannel(topic);this.bus.onmessage=event=>{const message=event.data;if(message.kind==='broadcast')this.entries.filter(e=>e.type==='broadcast'&&e.event===message.event).forEach(e=>e.fn({payload:message.payload}));if(message.kind==='presence'){this.presence.set(message.data.sessionId,message.data);this.sync();}if(message.kind==='request'&&this.own)this.bus.postMessage({kind:'presence',data:this.own});if(message.kind==='leave'){this.presence.delete(message.id);this.sync();}};}
 on(type:string,filter:any,fn:(data:any)=>void){this.entries.push({type,event:filter.event,fn});return this;}
 subscribe(fn:(status:string)=>void){this.callback=fn;queueMicrotask(()=>{if(!this.closed){this.state='joined';fn('SUBSCRIBED');this.bus.postMessage({kind:'request'});}});return this;}
 sync(){this.entries.filter(e=>e.type==='presence').forEach(e=>e.fn({}));}
 presenceState(){return Object.fromEntries([...this.presence].map(([id,value])=>[id,[value]]));}
 async send(message:any){if(!this.socket.isConnected())return 'error';this.bus.postMessage({kind:'broadcast',event:message.event,payload:message.payload});return 'ok';}
 async track(activity:any){this.own=activity;this.presence.set(activity.sessionId,activity);this.bus.postMessage({kind:'presence',data:activity});this.sync();return 'ok';}
 teardown(){if(this.closed)return;this.closed=true;if(this.own)this.bus.postMessage({kind:'leave',id:this.own.sessionId});this.bus.close();this.state='closed';}
}
class FakeClient{
 channels:FakeChannel[]=[];realtime={setAuth:async()=>{}};getChannels(){return this.channels;}
 channel(topic:string){const c=new FakeChannel('realtime:'+topic);this.channels.push(c);return c;}
 async removeChannel(c:FakeChannel){this.channels=this.channels.filter(x=>x!==c);c.teardown();c.callback?.('CLOSED');return 'ok';}
}
const org='11111111-1111-4111-8111-111111111111';
const base:SupportRecord={id:'share-fixture',childId:'share-child',childName:'架空児童 あおい',date:'2026-11-02',templateId:'template-unified',templateName:'統合記録',templateType:'平日',attendance:'出席',expressions:['5：笑顔が見られ、明るい表情だった'],snack:'食べた',recorderName:'架空職員A',approvalStatus:'未確認',version:1,createdAt:'2026-11-02T00:00:00Z',updatedAt:'2026-11-02T01:00:00Z',sectionAnswers:{life:{sectionId:'life',sectionTitle:'来所時',answers:{preparation:{value:'5：必要な準備に気づき、自分で行えた'},fatigue:{value:'3：中程度'}}},study:{sectionId:'study',sectionTitle:'学習',answers:{module_study_homework:{value:'算数（プリント）',homeworkDetails:{subjects:['算数'],materials:{算数:['プリント']},notes:{}}},module_study_attitude:{value:'5：自力で宿題を済ませられた'}}},special:{sectionId:'special',sectionTitle:'特記',answers:{},detailText:'宿題は空欄が残った。別児童 ひなたさんの家庭事情は共有しない。'}}};
function Fixture(){
 const user=new URLSearchParams(location.search).get('user')||'A',part=new URLSearchParams(location.search).get('part');
 const [record,setRecord]=useState(base),[open,setOpen]=useState(false),[meetings,setMeetings]=useState<MorningMeetingRecord[]>([]),[dirty,setDirty]=useState(false);
 const client=useMemo(()=>new FakeClient(),[]);
 (window as any).__parentShare={changeSource:()=>setRecord({...record,version:(record.version||1)+1,updatedAt:'2026-11-02T02:00:00Z'})};
 (window as any).__morningClient=client;
 if(part==='parent')return <main className="p-4"><button type="button" onClick={()=>setOpen(true)} className="min-h-12 rounded-xl bg-teal-700 px-4 font-bold text-white">保護者への共有文を開く</button>{open&&<ParentShareDialog record={record} remote onClose={()=>setOpen(false)}/>}</main>;
 return <main className="mx-auto max-w-[1800px] bg-slate-50 p-3"><p className="mb-2 text-xs">架空試験・職員{user} ／ {dirty?'未保存':'保存済み'}</p><MorningMeetingPanel organizationId={org} currentUser={{id:user,organizationId:org,displayName:'架空職員'+user,role:'staff'}} activeRecorder={{id:user,displayName:'架空職員'+user,active:true}} realtimeClient={client as unknown as SupabaseClient} records={meetings} templates={[]} confirmations={[]} recorderProfiles={[]} canManageTemplates={false} dailySummary={['利用予定 8名','送迎 迎え3便・送り3便']} onSave={async r=>r} onSynced={r=>setMeetings(old=>old.find(x=>x.date===r.date)?.revision===r.revision?old:[r,...old.filter(x=>x.date!==r.date)])} onDirtyChange={setDirty} onSaveTemplate={()=>{}} onArchiveTemplate={()=>{}} onSetConfirmation={()=>{}}/></main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture/></React.StrictMode>);
