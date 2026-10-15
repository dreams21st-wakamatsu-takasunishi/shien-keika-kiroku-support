import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import {DiagnosticsPanel} from '../../src/components/DiagnosticsPanel';
import {LegalTrainingWorkspace} from '../../src/components/LegalTrainingWorkspace';
import {OrganizationServicesSettings} from '../../src/components/OrganizationServicesSettings';
import {LearningTaskManager} from '../../src/components/LearningTaskManager';
import {LessonAccountPanel} from '../../src/components/LessonAccountPanel';
import {LessonStudentRegistrationPanel} from '../../src/components/LessonStudentRegistrationPanel';
import {InputFieldAppearance} from '../../src/components/InputFieldAppearance';
import {installDiagnostics,setDiagnosticScreen,recordDiagnostic,diagnosticAction} from '../../src/services/diagnostics';
import type {TrainingData,TrainingRepository} from '../../src/training/model';
const mode=new URLSearchParams(location.search).get('screen')||'diagnostics';
const org='22222222-2222-4222-8222-222222222222',id='11111111-1111-4111-8111-111111111111';
const link:any={id,child_id:'manual-child',revision:1,source_project_ref:'abcdefghijklmnopqrst',source_table:'user_data',source_student_id:'student_manual',source_campus_id:'main',active:true};
const identity={sourceProjectRef:link.source_project_ref,dataTable:'user_data',studentId:link.source_student_id,campusId:'main',displayName:'サンプル児童A',birthDate:'2016-01-01'};
// All non-local requests return synthetic responses in memory. No live Auth or DB.
const localFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
 if(url.origin===location.origin)return localFetch(input,init);
 const body=JSON.parse(String(init?.body||'{}')),endpoint=url.pathname.split('/').at(-1);
 let value:unknown;
 if(endpoint==='organization_service_settings')value={service_types:['放課後等デイサービス','保育所等訪問支援'],revision:1};
 else if(endpoint==='lesson-learning'&&body.action==='tasks-list')value={schemaVersion:1,tasks:[],catalog:[{category:'keyboard',stageId:'4301',title:'あ〜さのことば'}],results:[]};
 else if(endpoint==='lesson-accounts'&&body.action==='audit')value={audits:[]};
 else if(endpoint==='lesson-accounts'&&body.action==='inspect')value={schemaVersion:1,childId:link.child_id,linkId:link.id,identity,account:{status:'ready',authCount:1,loginNumber:'19'},checkedAt:'2026-10-15T00:00:00Z',expiresAt:null,card:null};
 else if(endpoint==='lesson-student-registration'&&body.action==='configuration')value={sourceProject:link.source_project_ref,fingerprint:'a'.repeat(64),name:'サンプル児童A',birthDate:'2016-01-01',allowNew:true,campuses:[{id:'main',name:'サンプル校舎'}],operations:[]};
 else return new Response(JSON.stringify({message:'撮影用画面ではこの操作は実行しません。'}),{status:403,headers:{'Content-Type':'application/json'}});
 return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
};
installDiagnostics('guide-sample');setDiagnosticScreen('form');
if(mode==='diagnostics'){
 diagnosticAction('record.save.single');recordDiagnostic('record.save',Error('Failed to fetch'));
 diagnosticAction('connection.online');recordDiagnostic('record.save.same_content_confirmed',undefined,{kind:'recovery',code:'RECOVERY'});
}
const training:TrainingData={categories:[{id:'category',organizationId:org,title:'サンプル研修カテゴリ',active:true,revision:1,sortOrder:1}],videos:[{id:'video',organizationId:org,categoryId:'category',title:'サンプル研修動画',videoUrl:'https://example.invalid/training',materialUrl:'https://example.invalid/material',active:true,revision:1,sortOrder:1}],progress:[],settings:{confirmationFormUrl:'https://example.invalid/form',revision:1}};
const noop=async()=>{};
const repository:TrainingRepository={load:async()=>structuredClone(training),saveConfirmationForm:noop,addCategory:noop,addVideo:noop,updateCategory:noop,updateVideo:noop,archiveCategory:noop,archiveVideo:noop,reorderCategories:noop,reorderVideos:noop,setCompleted:async()=>({videoId:'video',userId:id,completedAt:null,revision:1})};
const titles:Record<string,string>={diagnostics:'エラー履歴の見方',training:'法定研修の設定',services:'事業所種別',task:'児童ごとの課題指定',account:'既存アカウントの確認',registration:'新規の学習登録'};
createRoot(document.getElementById('root')!).render(<><InputFieldAppearance/><main className="mx-auto max-w-5xl space-y-4 rounded-xl bg-white p-5 text-slate-950"><header className="rounded-xl bg-slate-900 p-4 text-white"><p className="text-xs text-teal-200">Dサポート / 架空データの操作画面例</p><h1 className="mt-1 text-xl font-bold">{titles[mode]}</h1></header>
 {mode==='diagnostics'&&<DiagnosticsPanel/>}
 {mode==='training'&&<LegalTrainingWorkspace user={{id,organizationId:org,displayName:'サンプル管理者',role:'admin'}} manage repository={repository}/>}
 {mode==='services'&&<OrganizationServicesSettings organizationId={org}/>}
 {mode==='task'&&<LearningTaskManager childId={link.child_id} linkId={link.id} canManage scopeKey="manual"/>}
 {mode==='account'&&<LessonAccountPanel link={link} name="サンプル児童A"/>}
 {mode==='registration'&&<LessonStudentRegistrationPanel childId={link.child_id} hasLink={false} onCompleted={()=>{}}/>}
 </main></>);
