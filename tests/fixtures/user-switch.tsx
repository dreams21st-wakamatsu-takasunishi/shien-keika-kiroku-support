import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Header} from '../../src/components/Header';
import {RecordForm} from '../../src/components/RecordForm';
import {AuthScreen} from '../../src/components/AuthScreen';
import {switchUserSafely,type PrepareUserSwitch} from '../../src/utils/userSwitch';
import {UNIFIED_TEMPLATE,UNIFIED_TEMPLATE_ID} from '../../src/data/unifiedTemplate';
import {getLocalDateString} from '../../src/utils/weekdays';
import '../../src/index.css';
const mode=new URLSearchParams(location.search).get('mode')||'normal',date=getLocalDateString();
const model={signOut:0,reset:0,reload:0,failLogout:false,delay:0,dirty:false};Object.assign(window,{__userSwitch:model});
const child={id:'fixture-child',name:'架空児童A',regularDays:['月','火','水','木','金','土','日'],grade:'小学2年生'};
const staff={id:'fixture-staff',displayName:'架空職員A',active:true};
const prefix='support-record-draft-v2:local:fixture-user:',key=prefix+'record-switch-test';
for(const k of Object.keys(localStorage))if(k.startsWith(prefix))localStorage.removeItem(k);
localStorage.setItem(key,JSON.stringify({version:12,selectedTemplateId:UNIFIED_TEMPLATE_ID,selectedChildIds:[child.id],activeChildId:child.id,childTemplateIds:{[child.id]:UNIFIED_TEMPLATE_ID},childStepIds:{[child.id]:'attendance'},childDrafts:{[child.id]:{attendance:'出席',attendanceNote:'元の入力済み内容',expressions:[],expressionNote:'',snack:'',snackNote:'',sectionAnswers:{},recordModules:[],skippedQuestionIds:[]}},date,recorderId:staff.id,recorderName:staff.displayName,currentStepIndex:2,updatedAt:new Date().toISOString()}));
function Fixture(){
 const guard=useRef<PrepareUserSwitch|null>(null),[loggedIn,setLoggedIn]=useState(true),[user,setUser]=useState('架空職員A');
 const userId=user==='架空職員A'?'fixture-user':'fixture-user-b';
 if(!loggedIn)return <AuthScreen onSignIn={async()=>{setUser('架空職員B');setLoggedIn(true);return {error:null};}} onStaffIdSignIn={async()=>{setUser('架空職員B');setLoggedIn(true);return {error:null};}} onQrSignIn={async()=>({error:null})}/>;
 return <><Header activeTab="form" setActiveTab={()=>{}} unapprovedCount={0} onNewRecord={()=>{}} currentUser={mode==='local'?null:{id:userId,organizationId:'local',displayName:user,role:mode==='admin'?'admin':'staff'}} activeRecorder={{...staff,displayName:user}} onSwitchUser={mode==='local'?undefined:()=>switchUserSafely({dirtyAreas:model.dirty?['活動・指導案']:[],prepare:mode==='prepare-error'?async()=>{throw Error('共有保存に失敗しました。ユーザーは切り替えていません。');}:guard.current,signOut:async()=>{model.signOut++;if(model.delay)await new Promise(resolve=>setTimeout(resolve,model.delay));return {error:model.failLogout?Error('offline'):null};},reset:()=>{model.reset++;},reload:()=>{model.reload++;setLoggedIn(false);}})}/>
 <main className="mx-auto max-w-4xl p-3"><p className="mb-3 rounded-xl bg-sky-50 p-3 text-sm">架空データのユーザー切り替え確認画面</p><RecordForm key={user} prepareUserSwitchRef={guard} userId={userId} userDisplayName={user} activeRecorder={{...staff,displayName:user}} draftKey="record-switch-test" templates={[UNIFIED_TEMPLATE]} childrenList={[child]} recorderProfiles={[staff]} onSaveRecords={async records=>({status:'saved',records})}/></main></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
