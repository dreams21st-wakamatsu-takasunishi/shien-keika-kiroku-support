import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceScopeIssue,formatPcActivities,IMPORT_KEY,importLessonEvents,MAX_IMPORTED_EVENTS,readLessonEvidence,removeLessonEvidence} from '../learning/recordImport';
import type {LessonHistory,LessonLink} from '../learning/contracts';
import type {SectionFieldAnswer} from '../types';

const link:LessonLink={id:'link-fixture',organization_id:'org-fixture',child_id:'child-fixture',source_project_ref:'abcdefghijklmnopqrst',source_table:'user_data',source_student_id:'student_fixture',source_campus_id:'main',source_display_name:'架空児童',active:true,revision:1,verified_at:'2026-10-01T00:00:00Z'};
const history:LessonHistory={schemaVersion:1,identity:{sourceProjectRef:link.source_project_ref,dataTable:'user_data',studentId:link.source_student_id,campusId:'main',displayName:'架空児童',birthDate:'2018-01-01'},date:'2026-10-01',historyComplete:false,historyNotice:'保存された履歴のみ',fetchedAt:'2026-10-01T01:00:00Z',events:[
 {id:'mouse-1',at:'2026-10-01T00:00:00Z',category:'mouse',title:'M-1',detail:'クリア',amount:'ステージをクリア'},
 {id:'text-1',at:'2026-10-01T00:10:00Z',category:'text',title:'文章入力',detail:'練習',amount:'120文字'},
]};
const context={childId:link.child_id,date:history.date,organizationId:link.organization_id,actorId:'staff-fixture',confirmedAt:'2026-10-01T01:01:00Z'};
const empty:SectionFieldAnswer={value:'',note:''};
test('confirmed lesson import keeps only selected facts and bounded source metadata',()=>{
 const result=importLessonEvents(empty,history,link,['mouse-1'],context);
 assert.match(result.value,/マウス練習1回.*M-1.*クリア1回/);assert.doesNotMatch(result.value,/09:00|120文字|自力|姿勢|支援/);
 const evidence=readLessonEvidence(result.nestedDetails);assert.equal(evidence.length,1);assert.equal(evidence[0].confirmedBy,context.actorId);
 assert.equal(evidence[0].linkRevision,1);assert.equal(evidence[0].studentId,link.source_student_id);
 assert.ok(!result.nestedDetails?.[IMPORT_KEY].includes('2018-01-01'));assert.ok(!result.nestedDetails?.[IMPORT_KEY].includes('displayName'));
});
test('import merges manual PC selections and notes without changing other exam content',()=>{
 const answer:SectionFieldAnswer={value:'文章入力模擬試験（1回目：60文字・第2回過去問）',note:'声かけは職員が記入',nestedDetails:{selections:['文章入力模擬試験','その他'],mockCharacterCounts:['60'],mockPastRounds:['2'],otherNote:'手動の活動'}};
 const frozen=structuredClone(answer),result=importLessonEvents(answer,history,link,['mouse-1'],context);
 assert.deepEqual(answer,frozen);assert.equal(result.note,answer.note);assert.deepEqual(result.nestedDetails?.mockCharacterCounts,['60']);
 assert.match(result.value,/60文字・第2回過去問/);assert.match(result.value,/その他（手動の活動）/);
 assert.deepEqual(result.nestedDetails?.selections,['文章入力模擬試験','その他','Dレッスン']);
 assert.equal(result.nestedDetails?.dLessonActivities,undefined);
});
test('legacy free text remains editable and survives removal of imported evidence',()=>{
 const answer={value:'先生が入力した元の内容',note:'元の備考'};
 const imported=importLessonEvents(answer,history,link,['mouse-1'],context);
 assert.equal(imported.nestedDetails?.pcManualValue,answer.value);assert.match(imported.value,/先生が入力した元の内容/);
 const removed=removeLessonEvidence(imported);assert.deepEqual(readLessonEvidence(removed.nestedDetails),[]);
 assert.match(removed.value,/先生が入力した元の内容/);assert.equal(removed.note,answer.note);assert.doesNotMatch(removed.value,/M-1/);
});
test('same source event cannot duplicate while an additional selected event appends',()=>{
 const first=importLessonEvents(empty,history,link,['mouse-1'],context);
 assert.equal(importLessonEvents(first,history,link,['mouse-1'],context),first);
 const second=importLessonEvents(first,history,link,['mouse-1','text-1'],context);
 assert.equal(readLessonEvidence(second.nestedDetails).length,2);assert.equal((second.value.match(/M-1/g)||[]).length,1);
});
test('wrong child date organization source account and revoked link are rejected',()=>{
 for(const changed of [{childId:'other'},{date:'2026-09-30'},{organizationId:'other'},{actorId:''},{confirmedAt:'invalid'}])assert.throws(()=>importLessonEvents(empty,history,link,['mouse-1'],{...context,...changed}));
 for(const changed of [{source_student_id:'student_other'},{source_campus_id:'other'},{active:false},{revision:0}])assert.throws(()=>importLessonEvents(empty,history,{...link,...changed},['mouse-1'],context));
 assert.throws(()=>importLessonEvents(empty,history,link,[],context));assert.throws(()=>importLessonEvents(empty,history,link,['missing'],context));
 assert.throws(()=>importLessonEvents(empty,history,link,['mouse-1','mouse-1'],context));
});
test('stored evidence prevents saving after child date or organization changes',()=>{
 const imported=importLessonEvents(empty,history,link,['mouse-1'],context);
 assert.equal(evidenceScopeIssue(imported.nestedDetails,context.childId,context.date,context.organizationId),'');
 assert.match(evidenceScopeIssue(imported.nestedDetails,'other',context.date,context.organizationId),/一致していません/);
 assert.match(evidenceScopeIssue(imported.nestedDetails,context.childId,'2026-09-30',context.organizationId),/一致していません/);
 assert.match(evidenceScopeIssue(imported.nestedDetails,context.childId,context.date,'other'),/一致していません/);
});
test('corrupt evidence is not silently discarded but can be explicitly removed',()=>{
 for(const value of ['{',JSON.stringify({schemaVersion:2,events:[]}),JSON.stringify({schemaVersion:1,events:[{}]})]){
  const answer={...empty,nestedDetails:{[IMPORT_KEY]:value}};
  assert.throws(()=>readLessonEvidence(answer.nestedDetails));assert.throws(()=>importLessonEvents(answer,history,link,['mouse-1'],context));
  assert.deepEqual(readLessonEvidence(removeLessonEvidence(answer).nestedDetails),[]);
 }
});
test('event count and payload limits prevent unbounded record growth',()=>{
 const rows=Array.from({length:MAX_IMPORTED_EVENTS+1},(_,i)=>({...history.events[0],id:`event-${i}`}));
 assert.throws(()=>importLessonEvents(empty,{...history,events:rows},link,rows.map(e=>e.id),context),/50件/);
 assert.throws(()=>readLessonEvidence({[IMPORT_KEY]:'x'.repeat(100001)}));
});
test('existing PC formatter retains legacy and repeated mock exam semantics',()=>{
 assert.equal(formatPcActivities({selections:['Dレッスン','文章入力模擬試験','その他'],dLessonActivities:['マウス練習'],mockCharacterCounts:['10','20'],mockPastRounds:['1','2'],otherNote:'補足'}),'Dレッスン（マウス練習）、文章入力模擬試験（1回目：10文字・第1回過去問／2回目：20文字・第2回過去問）、その他（補足）');
 assert.equal(formatPcActivities({selections:['文章入力模擬試験'],mockCharacterCount:'50',mockPastRound:'3'}),'文章入力模擬試験（1回目：50文字・第3回過去問）');
});
