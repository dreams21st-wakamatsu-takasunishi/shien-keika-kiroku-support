import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyLessonActivities,MANUAL_LESSON_KEY,manualLessonIssues,readManualLessonExercises,summarizeManualLessonExercises,writeManualLessonExercises,type ManualLessonExercise} from '../learning/manualLessonPractice';
import {getIncompletePcActivities} from '../utils/recordIncompleteDetails';
import {formatPcActivities,importLessonEvents,readLessonEvidence,removeLessonEvidence} from '../learning/recordImport';
import type {LessonEvent,LessonHistory,LessonLink} from '../learning/contracts';

const row:ManualLessonExercise={id:'manual-1',category:'keyboard',title:'は行（ブラインド）',outcome:'completed',accuracy:'96',characters:''};
const details=writeManualLessonExercises({selections:['Dレッスン']},[row]);
const event:LessonEvent={id:'source-1',at:'2026-10-05T07:00:00Z',category:'keyboard',title:'キーボード は行(ブラインド)',detail:'クリア',amount:'せいかく 100%'};
const link:LessonLink={id:'link',organization_id:'org',child_id:'child',source_project_ref:'abcdefghijklmnopqrst',source_table:'user_data',source_student_id:'student_fixture',source_campus_id:'main',source_display_name:'架空児童',active:true,revision:1,verified_at:event.at};
const history:LessonHistory={schemaVersion:1,date:'2026-10-05',historyComplete:false,historyNotice:'履歴のみ',fetchedAt:event.at,identity:{sourceProjectRef:link.source_project_ref,dataTable:'user_data',studentId:link.source_student_id,campusId:'main',displayName:'架空児童',birthDate:''},events:[event]};
test('manual typing and text share fact formatting without impersonating automatic source evidence',()=>{
 const answer={value:'',note:'職員の観察',nestedDetails:writeManualLessonExercises(details,[row,{...row,id:'manual-2',category:'text',title:'ももたろう',outcome:'partial',characters:'17',accuracy:''}])};
 assert.equal(summarizeManualLessonExercises(answer.nestedDetails),'タイピング練習：は行（ブラインド）〔完了・正確率96%〕／文章入力練習：ももたろう〔途中終了・17文字〕');
 assert.match(formatPcActivities(answer.nestedDetails),/手入力：タイピング練習/);
 assert.deepEqual(readLessonEvidence(answer.nestedDetails),[]);
 const imported=importLessonEvents(answer,history,link,[event.id],{childId:'child',date:history.date,organizationId:'org',actorId:'staff',confirmedAt:event.at});
 assert.match(imported.value,/正確率100%.*手入力：.*正確率96%/);
 assert.equal(imported.note,answer.note);assert.equal(imported.nestedDetails?.[MANUAL_LESSON_KEY],answer.nestedDetails[MANUAL_LESSON_KEY]);
 assert.equal(readLessonEvidence(imported.nestedDetails).length,1);
 assert.match(removeLessonEvidence(imported).value,/手入力：/);
});
test('legacy generic selections are reversibly merged with imported categories while specific notes remain',()=>{
 const legacy={dLessonActivities:['タイピング練習','ブラインドタッチ練習','文章入力練習','Word練習','自由な取り組み']};
 assert.deepEqual(legacyLessonActivities(legacy,[event]),['文章入力練習','Word練習','自由な取り組み']);
 assert.deepEqual(legacyLessonActivities(legacy,[{...event,title:'キーボード 中指'}]),['ブラインドタッチ練習','文章入力練習','Word練習','自由な取り組み']);
 assert.deepEqual(legacyLessonActivities(legacy,[]),legacy.dLessonActivities);
});
test('missing manual task names and invalid measurements remain warnings even when automatic evidence exists',()=>{
 assert.deepEqual(getIncompletePcActivities(details),[]);
 assert.deepEqual(getIncompletePcActivities({selections:['Dレッスン']},true),[]);
 const invalid=writeManualLessonExercises(details,[{...row,title:'',accuracy:'101'}]);
 assert.deepEqual(manualLessonIssues(invalid),['手入力1の課題名','手入力1の正確率（0～100%）']);
 assert.equal(getIncompletePcActivities(invalid,true)[0].missing.length,2);
 assert.deepEqual(getIncompletePcActivities(writeManualLessonExercises(details,[])),[{selection:'Dレッスン',missing:['練習内容']}]);
 const text=writeManualLessonExercises(details,[{...row,category:'text',accuracy:'',characters:'-1'}]);
 assert.match(manualLessonIssues(text).join(''),/文字数/);
 assert.match(summarizeManualLessonExercises(text),/文字数未確認/);
 const zero=writeManualLessonExercises(details,[{...row,category:'text',characters:'0',accuracy:''}]);
 assert.match(summarizeManualLessonExercises(zero),/完了・0文字/);
});
test('manual formats are bounded and reject malformed, duplicate and unsupported rows',()=>{
 for(const raw of ['{',JSON.stringify({schemaVersion:2,exercises:[]}),JSON.stringify({schemaVersion:1,exercises:[row,row]}),JSON.stringify({schemaVersion:1,exercises:[{...row,category:'constructor'}]})])assert.throws(()=>readManualLessonExercises({[MANUAL_LESSON_KEY]:raw}));
 assert.throws(()=>writeManualLessonExercises({},Array.from({length:31},(_,i)=>({...row,id:String(i)}))));
 assert.deepEqual(getIncompletePcActivities({selections:['Dレッスン'],[MANUAL_LESSON_KEY]:'{'}),[{selection:'Dレッスン',missing:['手入力の形式']}]);
});
