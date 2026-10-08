import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import {MorningMeetingPanel} from '../../src/components/MorningMeetingPanel';
import type {MorningMeetingRecord,SupportRecord} from '../../src/types';
import {previousSupportDate} from '../../src/utils/previousSupportRecap';
import {getLocalDateString} from '../../src/utils/weekdays';

const children=[{id:'recap-a',name:'架空児童 あおい'},{id:'recap-b',name:'架空児童 ひなた'},{id:'recap-c',name:'架空児童 そら'}];
const date=previousSupportDate(getLocalDateString());
const base:SupportRecord={id:'recap-record-a',templateId:'fixture',templateName:'試験用支援記録',templateType:'平日',childId:children[0].id,childName:children[0].name,date,attendance:'出席',expressions:['笑顔'],snack:'',recorderName:'架空職員',approvalStatus:'未確認',createdAt:`${date}T00:00:00Z`,updatedAt:`${date}T00:00:00Z`,sectionAnswers:{pc:{sectionId:'pc',sectionTitle:'パソコン学習',detailText:'切り替え時に不安を訴えた。声掛けのあと休憩した。自力で課題を完了していない。',answers:{module_pc_content:{value:'Dレッスン（マウス練習）'}}}}};
function Fixture(){
 const [records,setRecords]=useState<MorningMeetingRecord[]>([]);
 return <main className="mx-auto max-w-6xl bg-slate-50 p-3 sm:p-6">
  <MorningMeetingPanel records={records} templates={[]} confirmations={[]} recorderProfiles={[]} canManageTemplates={false} supportRecords={[base,{...base,id:'recap-record-b',childId:children[1].id,childName:children[1].name,approvalStatus:'確認済み',sectionAnswers:{activity:{sectionId:'activity',sectionTitle:'活動',detailText:'友だちと順番を確認しながらゲームに参加した。',answers:{}}}}]} childrenList={children} onSave={async record=>{const saved={...record,revision:(record.revision||0)+1};setRecords(previous=>[...previous.filter(r=>r.date!==record.date),saved]);return saved;}} onSaveTemplate={()=>{}} onArchiveTemplate={()=>{}} onSetConfirmation={()=>{}}/>
 </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture/></React.StrictMode>);
