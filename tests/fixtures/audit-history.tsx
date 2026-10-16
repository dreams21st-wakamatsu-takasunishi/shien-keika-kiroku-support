import React from 'react';
import {createRoot} from 'react-dom/client';
import {TeamManager} from '../../src/components/TeamManager';
import {DiagnosticsPanel} from '../../src/components/DiagnosticsPanel';
import {installDiagnostics,setDiagnosticScreen,clearDiagnostics} from '../../src/services/diagnostics';
import '../../src/index.css';
const org='22222222-2222-4222-8222-222222222222',id='11111111-1111-4111-8111-111111111111';
const model={auditRequests:0,requests:[] as {resource:string;org:string|null;order:string|null;select:string|null;method:string}[],mode:'error',delay:0};Object.assign(window,{__auditFixture:model});
clearDiagnostics();installDiagnostics('audit-fixture');setDiagnosticScreen('team');
window.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url),resource=url.pathname.split('/').at(-1)||'';
 model.requests.push({resource,org:url.searchParams.get('organization_id'),order:url.searchParams.get('order'),select:url.searchParams.get('select'),method:init?.method||'GET'});
 if(resource==='audit_logs'){
  model.auditRequests++;
  if(model.delay)await new Promise<void>((done,reject)=>{const timer=setTimeout(done,model.delay);init?.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));},{once:true});});
  if(model.mode==='error')return new Response(JSON.stringify({code:'57014',message:'canceling statement due to statement timeout'}),{status:500,headers:{'Content-Type':'application/json'}});
  return new Response(JSON.stringify([{id:30,actor_id:null,table_name:'synthetic_table',row_id:'synthetic-row',action:'UPDATE',occurred_at:'2026-10-16T04:24:37Z'}]),{headers:{'Content-Type':'application/json'}});
 }
 return new Response(JSON.stringify(resource==='organizations'?{code:'TEST'}:[]),{headers:{'Content-Type':'application/json'}});
};
createRoot(document.getElementById('root')!).render(<main className="app-background min-h-screen p-4"><h1 className="mb-3 text-sm font-bold">監査履歴・架空データによる検証</h1><TeamManager currentUser={{id,organizationId:org,role:'admin',displayName:'架空管理者'} as any}/><div className="mx-auto mt-6 max-w-[1600px]"><DiagnosticsPanel/></div></main>);
