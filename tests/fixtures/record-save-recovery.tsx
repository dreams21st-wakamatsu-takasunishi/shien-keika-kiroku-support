import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import {RecordForm} from '../../src/components/RecordForm';
import {RecordOverwriteDialog} from '../../src/components/RecordOverwriteDialog';
import {DiagnosticsPanel} from '../../src/components/DiagnosticsPanel';
import {InputFieldAppearance} from '../../src/components/InputFieldAppearance';
import {runRecordSaveWorkflow,type RecordOverwritePair} from '../../src/services/recordSaveWorkflow';
import {installDiagnostics,setDiagnosticScreen,recordDiagnostic,diagnosticFetch} from '../../src/services/diagnostics';
import type {SupportRecord,Template} from '../../src/types';
installDiagnostics('test-save-recovery');setDiagnosticScreen('form');
const template:Template={id:'fixture-save-template',name:'保存確認',type:'カスタム',sections:[{id:'note',title:'観察',fields:[{id:'text',label:'観察内容',type:'text',defaultValue:''}]}]};
const child={id:'synthetic-save-child',name:'架空児童 保存確認'};
const initial:SupportRecord={id:'synthetic-deleted-id',childId:child.id,childName:child.name,date:'2026-10-09',templateId:template.id,templateName:template.name,templateType:'カスタム',attendance:'出席',expressions:['笑顔'],snack:'食べた',recorderName:'架空職員',sectionAnswers:{note:{sectionId:'note',sectionTitle:'観察',answers:{text:{value:'架空の入力内容。診断履歴には含めない。'}}}},approvalStatus:'未確認',createdAt:'2026-10-09T01:00:00Z',updatedAt:'2026-10-09T01:00:00Z'};
const mode=new URLSearchParams(location.search).get('mode')||'deleted';
const model={mode,reads:0,writes:[] as SupportRecord[][],active:[] as SupportRecord[],completed:false};
Object.assign(window,{__saveRecoveryFixture:model,__triggerDiagnosticHttp:()=>diagnosticFetch(`${location.origin}/rest/v1/rpc/save_support_records_guarded?private=never-stored`)});
function Fixture(){
  const [completion,setCompletion]=useState(false),[request,setRequest]=useState<{pairs:RecordOverwritePair[];resolve:(answer:boolean)=>void}|null>(null);
  return <main className="mx-auto max-w-5xl space-y-4 p-3">
    <p className="rounded-xl bg-amber-50 p-3 text-sm">架空データ専用・本番にはアクセスしません。再読み込みで確認用の保存先をリセットします。</p>
    {!completion?<RecordForm templates={[template]} childrenList={[child]} recorderProfiles={[]} initialRecord={initial} draftKey={`save-recovery-${mode}`} initialStepId="review" onSaveRecords={incoming=>runRecordSaveWorkflow(incoming,{
      load:async()=>{model.reads++;return{records:model.active,deletedIds:mode==='deleted'?[initial.id]:[]};},
      write:async records=>{model.writes.push(records);model.active=records.map(record=>({...record,version:1}));
        if(mode==='uncertain'&&model.writes.length===1)throw Error('Failed to fetch: synthetic response loss');
        if(mode==='different'&&model.writes.length===1){model.active=model.active.map(record=>({...record,sectionAnswers:{note:{sectionId:'note',sectionTitle:'観察',answers:{text:{value:'別の架空保存内容'}}}}}));return records.map(record=>({id:record.id,version:1,outcome:'already_saved' as const}));}
        return records.map(record=>({id:record.id,version:1,outcome:'inserted' as const}));},
      confirm:pairs=>new Promise(resolve=>setRequest({pairs,resolve})),newId:()=>`rec-${crypto.randomUUID()}`,
      recovery:kind=>recordDiagnostic(`record.save.${kind}`,undefined,{kind:'recovery',code:'RECOVERY'}),
    })} onSaveComplete={()=>{model.completed=true;setCompletion(true);}}/>
      :<p role="status" className="rounded-xl bg-emerald-50 p-4 font-bold">保存完了・入力中の児童は0名です。</p>}
    {request&&<RecordOverwriteDialog pairs={request.pairs} totalCount={1} onDecision={answer=>{request.resolve(answer);setRequest(null);}}/>}
    <DiagnosticsPanel/>
  </main>;
}
createRoot(document.getElementById('root')!).render(<><InputFieldAppearance/><Fixture/></>);
