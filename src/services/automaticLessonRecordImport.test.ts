import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAutomaticLessonHistory} from '../learning/automaticRecordImport';
import {importLessonEvents,readLessonEvidence} from '../learning/recordImport';
import type {LessonHistory,LessonLink} from '../learning/contracts';
import type {SectionAnswer} from '../types';
import {generateUnifiedRecordSummary} from '../utils/unifiedRecordSummary';

const link:LessonLink={id:'link-auto',organization_id:'org-auto',child_id:'child-auto',source_project_ref:'abcdefghijklmnopqrst',source_table:'user_data',source_student_id:'student_auto',source_campus_id:'main',source_display_name:'架空児童',active:true,revision:1,verified_at:'2026-10-05T00:00:00Z'};
const history:LessonHistory={schemaVersion:1,date:'2026-10-05',historyComplete:false,historyNotice:'部分履歴',fetchedAt:'2026-10-05T01:00:00Z',identity:{sourceProjectRef:link.source_project_ref,dataTable:'user_data',studentId:link.source_student_id,campusId:'main',displayName:'架空児童',birthDate:''},events:[
 {id:'mouse-1',at:'2026-10-05T00:00:00Z',category:'mouse',title:'マウス練習 M-1',detail:'クリア',amount:'1ステージ'},
 {id:'text-1',at:'2026-10-05T00:30:00Z',category:'text',title:'文章入力',detail:'第2回',amount:'120文字'},
]};
const context={childId:link.child_id,date:history.date,organizationId:link.organization_id,actorId:'staff-auto',confirmedAt:history.fetchedAt};
const section:SectionAnswer={sectionId:'record-module-pc-1',sectionTitle:'パソコン',answers:{module_pc_content:{value:'職員の元の入力',note:'支援の備考'},module_pc_posture:{value:'姿勢は職員が観察した内容'}}};
const target={section,fieldId:'module_pc_content'};
const sections={[section.sectionId]:section};

test('automatic import includes all fetched exercises and preserves hand-entered content and observation',()=>{
 const frozen=structuredClone(sections),result=applyAutomaticLessonHistory(sections,target,history,link,context);
 assert.equal(result.issue,'');assert.equal(result.added,2);assert.deepEqual(sections,frozen);
 const answer=result.sections[section.sectionId].answers.module_pc_content;
 assert.match(answer.value,/職員の元の入力.*マウス練習 M-1.*文章入力.*120文字/);
 assert.equal(answer.note,'支援の備考');assert.equal(result.sections[section.sectionId].answers.module_pc_posture.value,'姿勢は職員が観察した内容');
 assert.ok(readLessonEvidence(answer.nestedDetails).every(event=>event.importMode==='automatic'));
});
test('re-fetch and another PC module cannot duplicate any existing source event',()=>{
 const first=applyAutomaticLessonHistory(sections,target,history,link,context);
 const second=applyAutomaticLessonHistory(first.sections,target,history,link,context);
 assert.equal(second.sections,first.sections);assert.equal(second.added,0);
 const other={section:{...section,sectionId:'record-module-pc-2'},fieldId:'module_pc_content'};
 const third=applyAutomaticLessonHistory(first.sections,other,{...history,events:[...history.events,{...history.events[0],id:'mouse-2'}]},link,context);
 assert.equal(third.added,1);assert.equal(readLessonEvidence(third.sections[other.section.sectionId].answers.module_pc_content.nestedDetails).length,1);
 assert.equal(readLessonEvidence(third.sections[section.sectionId].answers.module_pc_content.nestedDetails).length,2);
});
test('changed imported facts are flagged without overwriting staff or earlier evidence',()=>{
 const first=applyAutomaticLessonHistory(sections,target,history,link,context);
 const result=applyAutomaticLessonHistory(first.sections,target,{...history,events:[{...history.events[0],amount:'250文字'}]},link,context);
 assert.match(result.issue,/変更されています/);assert.equal(result.sections,first.sections);assert.equal(result.added,0);
});
test('empty history does not create a PC section or infer non-participation',()=>{
 const result=applyAutomaticLessonHistory({},target,{...history,events:[]},link,context);
 assert.deepEqual(result.sections,{});assert.equal(result.added,0);assert.equal(result.issue,'');
});
test('wrong date, child, organization, source identity or revoked link cannot write',()=>{
 for(const changed of [{date:'2026-10-04'},{childId:'other'},{organizationId:'other'},{actorId:''}]){
  const result=applyAutomaticLessonHistory(sections,target,history,link,{...context,...changed});assert.ok(result.issue);assert.equal(result.sections,sections);
 }
 for(const changed of [{active:false},{source_student_id:'student_other'},{source_campus_id:'other'},{source_table:'test_user_data'},{revision:0}]){
  const result=applyAutomaticLessonHistory(sections,target,history,{...link,...changed},context);assert.ok(result.issue);assert.equal(result.sections,sections);
 }
});
test('out-of-scope or corrupt evidence in any other field blocks automatic additions',()=>{
 const imported=importLessonEvents({value:'',note:''},history,link,['mouse-1'],context);
 const corrupt={...sections,other:{sectionId:'other',sectionTitle:'別項目',answers:{exercise:{...imported,nestedDetails:{...imported.nestedDetails,dLessonHistoryEvidence:'{'}}}}};
 const corruptResult=applyAutomaticLessonHistory(corrupt,target,history,link,context);
 assert.ok(corruptResult.issue);assert.equal(corruptResult.added,0);assert.equal(corruptResult.sections,corrupt);
 const otherChild=importLessonEvents({value:'',note:''},history,{...link,child_id:'other'},['mouse-1'],{...context,childId:'other'});
 const data={...sections,other:{sectionId:'other',sectionTitle:'別項目',answers:{exercise:otherChild}}};
 const result=applyAutomaticLessonHistory(data,target,history,link,context);assert.match(result.issue,/一致/);assert.equal(result.sections,data);
});
test('too many events are flagged instead of truncated or silently lost',()=>{
 const events=Array.from({length:51},(_,index)=>({...history.events[0],id:`event-${index}`}));
 const result=applyAutomaticLessonHistory(sections,target,{...history,events},link,context);
 assert.match(result.issue,/50件/);assert.equal(result.sections,sections);assert.equal(result.added,0);
});
test('automatic facts appear in the regular record summary, not just the import panel',()=>{
 const result=applyAutomaticLessonHistory(sections,target,history,link,context);
 const summary=generateUnifiedRecordSummary({recorderName:'架空職員',attendance:'出席',expressions:[],snack:'',sectionAnswers:{...result.sections,__record_modules:{sectionId:'__record_modules',sectionTitle:'記録項目',answers:{'pc-1':{value:'pc',note:'0'}}}}});
 assert.match(summary,/【パソコン】/);assert.match(summary,/マウス練習 M-1/);assert.match(summary,/120文字/);assert.match(summary,/姿勢は職員が観察した内容/);
});
