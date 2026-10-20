import React from 'react';
import { createRoot } from 'react-dom/client';
import { RecordForm } from '../../src/components/RecordForm';
import { UNIFIED_TEMPLATE } from '../../src/data/unifiedTemplate';
import { getLocalDateString } from '../../src/utils/weekdays';
import { getCurrentDraftCycleKey } from '../../src/utils/draftExpiry';
import '../../src/index.css';
const org='22222222-2222-4222-8222-222222222222',user='11111111-1111-4111-8111-111111111111',key='record-shared-sync-fixture';
const tag=new URLSearchParams(location.search).get('device')||'pc';
const storage=`support-record-draft-v2:${org}:${user}:${key}`;
const children=Array.from({length:6},(_,i)=>({id:`child-${i+1}`,name:`架空児童${i+1}`,grade:'小学3年生',regularDays:['月','火','水','木','金','土','日']}));
const model={confirm:false,confirmMessage:''};Object.assign(window,{__draftSyncFixture:model});
window.confirm=message=>{model.confirmMessage=message;return model.confirm;};
// Only the first tablet prepares a local six-child draft. PCs resume cloud data.
if(tag==='tablet'&&!localStorage.getItem(storage))localStorage.setItem(storage,JSON.stringify({version:12,draftCycleKey:getCurrentDraftCycleKey(),selectedTemplateId:UNIFIED_TEMPLATE.id,date:getLocalDateString(),selectedChildIds:children.map(c=>c.id),activeChildId:children[0].id,recorderId:'',recorderName:'架空A指導員',currentStepIndex:2,childStepIds:{},childTemplateIds:Object.fromEntries(children.map(c=>[c.id,UNIFIED_TEMPLATE.id])),childDrafts:Object.fromEntries(children.map(c=>[c.id,{recordId:`record-${c.id}`,templateId:UNIFIED_TEMPLATE.id,attendance:'出席',attendanceNote:'',expressions:[],expressionNote:'',snack:'',snackNote:'',recordModules:[],sectionAnswers:{},skippedQuestionIds:[]}]))}));
createRoot(document.getElementById('root')!).render(<React.StrictMode><main className="min-h-screen bg-slate-50 p-3 text-slate-950"><p className="mx-auto mb-3 max-w-4xl text-xs text-slate-500">{tag==='tablet'?'タブレット':'PC'}・同一架空アカウント／架空児童6名の同期試験。本番の記録は使用しません。</p><RecordForm organizationId={org} userId={user} userDisplayName="架空A指導員" draftKey={key} templates={[UNIFIED_TEMPLATE]} childrenList={children as any} recorderProfiles={[]} onSaveRecords={async()=>{throw Error('Fixture cannot save actual support records');}}/></main></React.StrictMode>);
