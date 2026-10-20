import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RecordForm } from '../../src/components/RecordForm';
import { UNIFIED_TEMPLATE } from '../../src/data/unifiedTemplate';
import { getLocalDateString } from '../../src/utils/weekdays';
import { getCurrentDraftCycleKey } from '../../src/utils/draftExpiry';
import '../../src/index.css';
const org='22222222-2222-4222-8222-222222222222',user='11111111-1111-4111-8111-111111111111',key='record-add-target',date=getLocalDateString();
const children=['A','B','C','D','E','F'].map(id=>({id,name:`架空児童${id}`,grade:'小学3年生',regularDays:id==='D'?[]:['月','火','水','木','金','土','日']}));
const draft=(ids:string[],recorderName:string)=>({version:12,draftCycleKey:getCurrentDraftCycleKey(),selectedTemplateId:UNIFIED_TEMPLATE.id,date,selectedChildIds:ids,activeChildId:ids[0],currentStepIndex:2,childStepIds:{},recorderId:'',recorderName,childTemplateIds:Object.fromEntries(ids.map(id=>[id,UNIFIED_TEMPLATE.id])),childDrafts:Object.fromEntries(ids.map(id=>[id,{recordId:`kept-record-${id}`,templateId:UNIFIED_TEMPLATE.id,attendance:'出席',attendanceNote:`${id}の入力済み内容`,expressions:[],expressionNote:'',snack:'',snackNote:'',recordModules:[],sectionAnswers:{},skippedQuestionIds:[]}]))});
const row=(payload:any)=>({payload,revision:1,updated_at:new Date().toISOString(),device_id:'fixture-device',recorder_profile_id:null});
const rows:Record<string,any>={ [key]:row(draft(['A'],'架空職員あおい')),'record-add-source':row(draft(['B','C','D','E'],'架空職員みどり')),'record-wrong-format':row({...draft(['F'],'別形式の架空職員'),selectedTemplateId:'template-legacy'}) };
const model={rows,transfers:[] as any[],saves:[] as any[],requests:[] as string[],failNext:false,loseResponse:false,delay:0,refreshes:0};
Object.assign(window,{__childTakeoverFixture:model});
localStorage.setItem(`support-record-draft-v2:${org}:${user}:${key}`,JSON.stringify({...rows[key].payload,__cloudSync:{revision:1,payload:rows[key].payload}}));
const nativeFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
  if(url.origin===location.origin)return nativeFetch(input,init);
  const operation=url.pathname.split('/').at(-1)!;model.requests.push(operation);
  const body=init?.body?JSON.parse(String(init.body)):{};
  const respond=(value:unknown,status=200)=>new Response(status===204?null:JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  if(operation==='record_drafts'){
    const selected=url.searchParams.get('draft_key')?.replace(/^eq\./,'');
    if(init?.method==='DELETE'&&selected==='quick-memo-account')return respond(null,204);
    if(!init?.method||init.method==='GET')return respond(rows[selected!]||null);
  }
  if(operation==='save_record_draft_guarded'){
    model.saves.push(body);
    const previous=rows[body.p_draft_key];
    if(previous&&previous.revision!==body.p_expected_revision)return respond({code:'P0001',message:'DRAFT_CONFLICT: newer target input'},409);
    rows[body.p_draft_key]={...row(body.p_payload),revision:(previous?.revision||0)+1};
    return respond([{new_revision:rows[body.p_draft_key].revision,saved_at:rows[body.p_draft_key].updated_at}]);
  }
  if(operation==='take_over_record_draft_children_into_existing'){
    model.transfers.push(body);if(model.delay)await new Promise(r=>setTimeout(r,model.delay));
    if(model.failNext){model.failNext=false;return respond({code:'42501',message:'試験用：この端末では引き継げません。入力内容は保持しています。'},403);}
    const selected=body.p_items[0],source=rows[selected.sourceDraftKey],target=rows[body.p_target_draft_key];
    if(!source?.payload.selectedChildIds.includes(selected.childId)||!target)return respond({message:'Source or target unavailable'},400);
    const id=selected.childId;
    target.payload={...target.payload,selectedChildIds:[...target.payload.selectedChildIds,id],childDrafts:{...target.payload.childDrafts,[id]:source.payload.childDrafts[id]},childTemplateIds:{...target.payload.childTemplateIds,[id]:source.payload.childTemplateIds[id]},takenOverFromDraftKeys:[selected.sourceDraftKey]};
    target.revision++;target.updated_at=new Date().toISOString();
    source.payload.selectedChildIds=source.payload.selectedChildIds.filter((candidate:string)=>candidate!==id);delete source.payload.childDrafts[id];source.revision++;
    if(model.loseResponse){model.loseResponse=false;return respond({message:'Synthetic lost response'},502);}
    return respond([{new_revision:target.revision,saved_at:target.updated_at,draft_payload:target.payload}]);
  }
  throw Error('Fixture blocks unexpected external operation: '+operation);
};
const summaries=()=>Object.entries(rows).map(([draftKey,value])=>({draftKey,revision:value.revision,userId:draftKey===key?user:'33333333-3333-4333-8333-333333333333',recorderName:value.payload.recorderName,selectedChildIds:value.payload.selectedChildIds,selectedTemplateId:value.payload.selectedTemplateId,date,updatedAt:value.updated_at,currentStepIndex:2}));
function Fixture(){
  const [allDrafts,setAllDrafts]=useState(summaries);
  return <main className="min-h-screen bg-slate-50 p-3 text-slate-950"><p className="mb-3 text-xs">児童追加・他職員からの引き継ぎ（すべて架空データ／外部への送信なし）</p><RecordForm organizationId={org} userId={user} userDisplayName="架空職員あおい" draftKey={key} templates={[UNIFIED_TEMPLATE]} childrenList={children as any} recorderProfiles={[]} readOnlyDrafts={allDrafts} lockedChildren={Object.fromEntries(allDrafts.filter(d=>d.draftKey!==key).flatMap(d=>d.selectedChildIds.map(id=>[`${date}:${id}`,d.recorderName])))} onDraftChanged={()=>{model.refreshes++;setAllDrafts(summaries());}} onSaveRecords={async()=>{throw Error('Fixture cannot save actual records');}}/></main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture/></React.StrictMode>);
