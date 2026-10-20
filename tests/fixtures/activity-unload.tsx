import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ActivityPlanWorkspace } from '../../src/components/ActivityPlanWorkspace';
import { activityDraftStorageKey, hasPendingActivityDraft, installActivityDraftCloseWarning } from '../../src/utils/activityDraftWarning';
import { emptyActivity } from '../../src/utils/activityPlans';
import '../../src/index.css';
const org='22222222-2222-4222-8222-222222222222',user='11111111-1111-4111-8111-111111111111',key=activityDraftStorageKey(org,user);
const model={writes:0,failSave:false,delay:0,saved:null as any,requests:[] as string[]};
Object.assign(window,{__activityUnloadFixture:model});
const params=new URLSearchParams(location.search);
if(params.has('restored'))sessionStorage.setItem(key,JSON.stringify({...emptyActivity(),title:'架空の復元指導案'}));
if(params.has('foreign'))sessionStorage.setItem(activityDraftStorageKey(org,'another-staff'),JSON.stringify({...emptyActivity(),title:'他職員の架空下書き'}));
const nativeFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
  if(url.origin===location.origin)return nativeFetch(input,init);
  model.requests.push(url.pathname);
  if(!url.pathname.endsWith('/activity_plans'))throw Error('Fixture blocks unexpected operation');
  const method=init?.method||'GET';let status=200,value:unknown=[];
  if(method==='GET')value=model.saved?[model.saved]:[];
  else if(method==='POST'||method==='PATCH'){
    model.writes++;if(model.delay)await new Promise(r=>setTimeout(r,model.delay));
    if(model.failSave){status=503;value={message:'試験用：保存に失敗しました。入力は残っています。'};}
    else {model.saved={...JSON.parse(String(init?.body)),id:'fixture-saved-activity',revision:(model.saved?.revision||0)+1,updated_at:new Date().toISOString()};value=model.saved;}
  }else throw Error('Fixture never deletes activity plans');
  return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
};
function Fixture(){
  const [screen,setScreen]=useState('activity'),[dirty,setDirty]=useState(false);
  // Same scoped guard as App, kept mounted while the actual editor unmounts.
  useEffect(()=>installActivityDraftCloseWarning(window,()=>hasPendingActivityDraft(sessionStorage,key)),[]);
  return <main className="min-h-screen bg-slate-50 p-4 text-slate-950"><p>すべて架空データです。実際の指導案は使用しません。</p><p aria-label="試験：編集状態">{dirty?'未保存':'変更なし'}</p>{screen==='activity'?<ActivityPlanWorkspace organizationId={org} userId={user} onDirtyChange={setDirty} onOpenTrafficCost={()=>setScreen('traffic')} onOpenCalendar={()=>setScreen('calendar')}/>:<section><h1>{screen==='traffic'?'交通費計算への移動後':'業務カレンダーへの移動後'}</h1><button type="button" onClick={()=>setScreen('activity')}>指導案へ戻る</button></section>}</main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture/></React.StrictMode>);
