import type {MorningMeetingRecord,MorningSectionKey,MorningSectionDocument} from '../types';
export const MORNING_SECTIONS: {key:MorningSectionKey;label:string}[]=[
 {key:'plan',label:'本日の予定'},{key:'attendance',label:'欠席・追加利用'},{key:'transport',label:'送迎確認'},
 {key:'children',label:'児童対応'},{key:'staff',label:'職員連絡'},{key:'safety',label:'安全確認'},
 {key:'legacy',label:'自由記入・既存の本文'},
];
export const emptyMorningDocument=():MorningSectionDocument=>({legacy:'',plan:'',attendance:'',transport:'',children:'',staff:'',safety:''});
export function morningDocument(record?:MorningMeetingRecord):MorningSectionDocument{
 return record?.sectionDocument?{...record.sectionDocument}:{...emptyMorningDocument(),legacy:record?.content||''};
}
export function morningRevisions(record?:MorningMeetingRecord):Record<MorningSectionKey,number>{
 return Object.fromEntries(MORNING_SECTIONS.map(s=>[s.key,record?.sectionRevisions?.[s.key]??(s.key==='legacy'?record?.revision||0:0)])) as Record<MorningSectionKey,number>;
}
export function formatMorningDocument(doc:MorningSectionDocument){
 return [doc.legacy,...MORNING_SECTIONS.filter(s=>s.key!=='legacy'&&doc[s.key].trim()).map(s=>`【${s.label}】\n${doc[s.key]}`)].filter(Boolean).join('\n\n');
}
export function parseMorningRecord(value:unknown):MorningMeetingRecord{
 const row=value as any;
 if(!row||typeof row.meeting_date!=='string'||typeof row.content!=='string'||!Number.isSafeInteger(Number(row.revision))||Number(row.revision)<1)throw Error('朝礼記録の応答を確認できません。');
 let sectionDocument:MorningSectionDocument|undefined,sectionRevisions:Record<MorningSectionKey,number>|undefined;
 if(row.section_document!==null&&row.section_document!==undefined){
  sectionDocument=emptyMorningDocument();sectionRevisions=morningRevisions();
  for(const {key} of MORNING_SECTIONS){
   if(typeof row.section_document[key]!=='string'||row.section_document[key].length>20000||!Number.isSafeInteger(Number(row.section_revisions?.[key]))||Number(row.section_revisions[key])<0)throw Error('朝礼の項目情報を確認できません。');
   sectionDocument[key]=row.section_document[key];sectionRevisions[key]=Number(row.section_revisions[key]);
  }
 }
 return {date:row.meeting_date,content:row.content,revision:Number(row.revision),createdAt:row.created_at,updatedAt:row.updated_at,
  updatedByName:row.updated_by_name||undefined,updatedByRecorderId:row.updated_by_recorder_profile_id||undefined,sectionDocument,sectionRevisions};
}
