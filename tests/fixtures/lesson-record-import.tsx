import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import {RecordForm} from '../../src/components/RecordForm';
import {LessonHistoryImport} from '../../src/components/LessonHistoryImport';
import type {SectionFieldAnswer,SupportRecord,Template} from '../../src/types';
import {importLessonEvents} from '../../src/learning/recordImport';
import {getCurrentDraftCycleKey} from '../../src/utils/draftExpiry';
import {UNIFIED_TEMPLATE} from '../../src/data/unifiedTemplate';
import {writeManualLessonExercises} from '../../src/learning/manualLessonPractice';

const organizationId='22222222-2222-4222-8222-222222222222',actorId='33333333-3333-4333-8333-333333333333';
const children=[{id:'child-import-a',name:'架空児童 あおい'},{id:'child-import-b',name:'架空児童 ひなた'}];
const template:Template={id:'template-import-fixture',name:'試験用パソコン記録',type:'カスタム',description:'',sections:[{id:'pc',title:'パソコン学習',fields:[
 {id:'pc_content',label:'パソコン取り組み内容',type:'pc_activities',defaultValue:''},
 {id:'pc_posture',label:'姿勢の手入力',type:'text',defaultValue:''},
]}]};
const record:SupportRecord={id:'record-import-fixture',templateId:template.id,templateName:template.name,templateType:'カスタム',childId:children[0].id,childName:children[0].name,date:'2026-10-01',attendance:'出席',expressions:[],snack:'',recorderName:'架空職員',approvalStatus:'未確認',createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z',sectionAnswers:{pc:{sectionId:'pc',sectionTitle:'パソコン学習',answers:{pc_content:{value:'元の入力',note:'職員の手入力備考'},pc_posture:{value:'職員が観察した内容'}}}}};
if(new URLSearchParams(location.search).get('new')==='true'){
 const storageKey=`support-record-draft-v2:${organizationId}:${actorId}:record-import-new-fixture`;
 if(!localStorage.getItem(storageKey))localStorage.setItem(storageKey,JSON.stringify({
  version:12,draftCycleKey:getCurrentDraftCycleKey(),selectedTemplateId:UNIFIED_TEMPLATE.id,
  childTemplateIds:Object.fromEntries(children.map(child=>[child.id,UNIFIED_TEMPLATE.id])),
  selectedChildIds:children.map(child=>child.id),activeChildId:children[0].id,date:record.date,
  recorderId:'',recorderName:'架空職員',currentStepIndex:3,childStepIds:{},
  childDrafts:Object.fromEntries(children.map((child,index)=>[child.id,{
   recordId:`fixture-new-${index}`,templateId:UNIFIED_TEMPLATE.id,attendance:'出席',attendanceNote:'',expressions:[],expressionNote:'',snack:'',snackNote:'',skippedQuestionIds:[],
   recordModules:index===0?[{id:'pc-existing',type:'pc'}]:[],
   sectionAnswers:index===0?{'record-module-pc-existing':{sectionId:'record-module-pc-existing',sectionTitle:'パソコン',answers:{module_pc_content:{value:'元の入力',note:'職員の手入力備考'},module_pc_posture:{value:'職員が観察した内容',note:''}}}}:{},
  }])),
 }));
}
function Fixture(){
 const [childId,setChildId]=useState(children[0].id),[date,setDate]=useState(record.date),[answer,setAnswer]=useState<SectionFieldAnswer>({value:'元の入力',note:'職員の備考'});
 const params=new URLSearchParams(location.search);
 if(params.get('component')==='true')return <main className="mx-auto max-w-3xl bg-white p-4 text-slate-950">
  <button type="button" onClick={()=>setChildId(children[1].id)}>試験用：児童切替</button>
  <button type="button" onClick={()=>setDate('2026-10-02')}>試験用：日付切替</button>
  <button type="button" onClick={()=>setDate('')}>試験用：日付を空にする</button>
  <LessonHistoryImport childId={childId} childName={children.find(c=>c.id===childId)!.name} date={date} organizationId={organizationId} actorId={actorId} answer={answer} disabled={params.get('readonly')==='true'} onChange={setAnswer}/>
  <output aria-label="試験用の記録内容">{answer.value}</output>
 </main>;
 if(params.get('new')==='true')return <main className="min-h-screen bg-slate-50 p-3"><RecordForm templates={[UNIFIED_TEMPLATE]} childrenList={children} recorderProfiles={[]} organizationId={organizationId} userId={actorId} userDisplayName="架空職員" draftKey="record-import-new-fixture" lessonImportEnabled={true} readOnly={params.get('readonly')==='true'} onSaveRecords={async()=>{throw Error('Fixture must never save a real record');}}/></main>;
 const initialRecord=params.get('invalid')==='true'?{...record,date:'2026-10-02',sectionAnswers:{...record.sectionAnswers,pc:{...record.sectionAnswers.pc,answers:{...record.sectionAnswers.pc.answers,pc_content:importLessonEvents(record.sectionAnswers.pc.answers.pc_content,{schemaVersion:1,date:record.date,historyComplete:false,historyNotice:'架空履歴',fetchedAt:'2026-10-01T01:00:00Z',identity:{sourceProjectRef:'abcdefghijklmnopqrst',dataTable:'user_data',studentId:'student_ui_a',campusId:'main',displayName:'架空児童',birthDate:''},events:[{id:'mouse-ui',at:'2026-10-01T00:00:00Z',category:'mouse',title:'M-1',detail:'クリア',amount:'ステージをクリア'}]},{id:'fixture-link',organization_id:organizationId,child_id:record.childId,source_project_ref:'abcdefghijklmnopqrst',source_table:'user_data',source_student_id:'student_ui_a',source_campus_id:'main',source_display_name:'架空児童',active:true,revision:1,verified_at:'2026-10-01T00:00:00Z'},['mouse-ui'],{childId:record.childId,date:record.date,organizationId,actorId,confirmedAt:'2026-10-01T01:00:00Z'})}}}}:record;
 const compatibleRecord=params.get('manual-details')==='true'?{...record,id:'record-manual-fixture',sectionAnswers:{pc:{...record.sectionAnswers.pc,answers:{...record.sectionAnswers.pc.answers,pc_content:{value:'Dレッスン',nestedDetails:writeManualLessonExercises({selections:['Dレッスン']},[{id:'old-manual',category:'keyboard',title:'保存済み課題',outcome:'partial',accuracy:'88',characters:''}])}}}}}:initialRecord;
 return <main className="min-h-screen bg-slate-50 p-3"><RecordForm templates={[template]} childrenList={children} recorderProfiles={[]} initialRecord={compatibleRecord} organizationId={organizationId} userId={actorId} userDisplayName="架空職員" draftKey={params.get('manual-details')==='true'?'record-manual-fixture':params.get('invalid')==='true'?'record-import-invalid-fixture':'record-import-fixture'} lessonImportEnabled={true} initialStepId="field-pc-pc_content" onSaveRecords={async()=>{throw Error('Fixture must never save a real record');}}/></main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture/></React.StrictMode>);
