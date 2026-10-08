import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceScopeIssue,formatPcActivities,IMPORT_KEY,importLessonEvents,MAX_IMPORTED_EVENTS,readLessonEvidence,removeLessonEvidence} from '../learning/recordImport';
import type {LessonHistory,LessonLink} from '../learning/contracts';
import type {SectionFieldAnswer} from '../types';
import {isLessonSourceDate,shiftServiceDate} from '../learning/lessonHistoryDates';
import {applyAutomaticLessonHistory} from '../learning/automaticRecordImport';

const link:LessonLink={id:'link-fixture',organization_id:'org-fixture',child_id:'child-fixture',source_project_ref:'abcdefghijklmnopqrst',source_table:'user_data',source_student_id:'student_fixture',source_campus_id:'main',source_display_name:'架空児童',active:true,revision:1,verified_at:'2026-10-01T00:00:00Z'};
const history:LessonHistory={schemaVersion:1,identity:{sourceProjectRef:link.source_project_ref,dataTable:'user_data',studentId:link.source_student_id,campusId:'main',displayName:'架空児童',birthDate:'2018-01-01'},date:'2026-10-01',historyComplete:false,historyNotice:'保存された履歴のみ',fetchedAt:'2026-10-01T01:00:00Z',events:[
 {id:'mouse-1',at:'2026-10-01T00:00:00Z',category:'mouse',title:'M-1',detail:'クリア',amount:'ステージをクリア'},
 {id:'text-1',at:'2026-10-01T00:10:00Z',category:'text',title:'文章入力',detail:'練習',amount:'120文字'},
]};
const context={childId:link.child_id,date:history.date,organizationId:link.organization_id,actorId:'staff-fixture',confirmedAt:'2026-10-01T01:01:00Z'};
const empty:SectionFieldAnswer={value:'',note:''};
test('confirmed lesson import keeps only selected facts and bounded source metadata',()=>{
 const result=importLessonEvents(empty,history,link,['mouse-1'],context);
 assert.match(result.value,/マウス練習：M-1〔完了〕/);assert.doesNotMatch(result.value,/09:00|120文字|自力|姿勢|支援/);
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
test('history window is record-relative across month year and leap day boundaries',()=>{
 assert.equal(shiftServiceDate('2026-10-01',-3),'2026-09-28');
 assert.equal(shiftServiceDate('2026-01-01',-3),'2025-12-29');
 assert.equal(shiftServiceDate('2024-03-01',-1),'2024-02-29');
 for(const date of ['2026-09-28','2026-09-29','2026-09-30','2026-10-01'])assert.ok(isLessonSourceDate(date,'2026-10-01'));
 for(const date of ['2026-09-27','2026-10-02','2026-02-30',''])assert.equal(isLessonSourceDate(date,'2026-10-01'),false);
});
test('past import retains source date and pins evidence to the destination record date',()=>{
 const pastContext={...context,date:'2026-10-04',sourceDate:history.date,importMode:'manual' as const};
 const imported=importLessonEvents(empty,history,link,['mouse-1'],pastContext);
 const event=readLessonEvidence(imported.nestedDetails)[0];
 assert.equal(event.date,'2026-10-01');assert.equal(event.recordDate,'2026-10-04');
 assert.equal(evidenceScopeIssue(imported.nestedDetails,context.childId,'2026-10-04',context.organizationId),'');
 assert.match(evidenceScopeIssue(imported.nestedDetails,context.childId,'2026-10-03',context.organizationId),/一致していません/);
 assert.match(imported.value,/2026-10-01実施の実績：/);
 assert.match(formatPcActivities({...imported.nestedDetails,dLessonSummaryMode:'detailed'}),/2026-10-01実施の実績：09:00/);
 assert.equal(importLessonEvents(imported,history,link,['mouse-1'],pastContext),imported);
 for(const changed of [{date:'2026-10-05'},{date:'2026-09-30'},{importMode:'automatic' as const}])assert.throws(()=>importLessonEvents(empty,history,link,['mouse-1'],{...pastContext,...changed}));
 const corrupt=JSON.parse(String(imported.nestedDetails?.[IMPORT_KEY]));corrupt.events[0].recordDate='2026-10-05';
 assert.throws(()=>readLessonEvidence({[IMPORT_KEY]:JSON.stringify(corrupt)}));
});
test('same-day auto import coexists with anchored historical evidence and keeps manual selections',()=>{
 const imported=importLessonEvents({value:'Dレッスン',nestedDetails:{selections:['Dレッスン'],dLessonActivities:['Word練習']}},history,link,['mouse-1'],{...context,date:'2026-10-02',sourceDate:history.date});
 const section={sectionId:'pc',sectionTitle:'PC',answers:{content:imported}};
 const currentHistory={...history,date:'2026-10-02',events:[{...history.events[1],id:'today',at:'2026-10-02T00:00:00Z'}]};
 const result=applyAutomaticLessonHistory({pc:section},{section,fieldId:'content'},currentHistory,link,{...context,date:'2026-10-02'});
 assert.equal(result.issue,'');assert.equal(result.added,1);
 assert.equal(readLessonEvidence(result.sections.pc.answers.content.nestedDetails).length,2);
 assert.match(result.sections.pc.answers.content.value,/2026-10-01実施の実績：.*M-1/);
 assert.match(result.sections.pc.answers.content.value,/文章入力練習：文章入力/);
 assert.deepEqual(result.sections.pc.answers.content.nestedDetails?.dLessonActivities,['Word練習']);
});
