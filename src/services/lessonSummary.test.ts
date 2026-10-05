import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeLessonEvents} from '../learning/lessonSummary';
import {formatPcActivities,IMPORT_KEY,importLessonEvents,readLessonEvidence} from '../learning/recordImport';
import type {LessonEvent,LessonHistory,LessonLink} from '../learning/contracts';
import {generateUnifiedRecordSummary} from '../utils/unifiedRecordSummary';

const event=(category:string,detail:string,amount:string,title=''):LessonEvent=>({id:'fixture',at:'2026-10-05T07:00:00Z',category,title,detail,amount});
const examples:LessonEvent[]=[
 event('text','おわり','うった数 24文字 / ミス 0か所 / スコア 24'),
 event('text','おわり','うった数 0文字 / ミス 0か所 / スコア 0'),
 ...[25,15,40].map(count=>event('keyboard','クリア',`うった数 ${count}回 / ミス 1回 / せいかく 96%`)),
 ...[9,34,12,19,12].map(count=>event('text','おわり / しんきろく',`うった数 ${count}文字 / ミス 1か所 / スコア ${count-1}`)),
 ...[17,0,0].map(count=>event('text','とちゅうでやめた',`うった数 ${count}文字 / 0分44秒`)),
].map((row,index)=>({...row,id:`event-${index}`}));

test('many practice logs become concise facts, with partial and finished counts separated',()=>{
 const frozen=structuredClone(examples),summary=summarizeLessonEvents(examples);
 assert.equal(summary,'文章入力練習10回（終了7回、途中終了3回、終了分110文字）、キーボード練習3回（クリア3回）');
 assert.doesNotMatch(summary,/127文字|ミス|スコア|96%|16:00|意欲|自力|姿勢/);
 assert.deepEqual(examples,frozen);
});
test('unknown results, missing amounts and partial zero counts are not inferred as completion',()=>{
 assert.equal(summarizeLessonEvents([event('text','練習','スコア 120 / ミス 0か所')]),'文章入力練習1回');
 assert.equal(summarizeLessonEvents([event('text','未完了','120文字')]),'文章入力練習1回（入力120文字（文字数確認分））');
 assert.equal(summarizeLessonEvents([event('text','とちゅうでやめた','うった数 0文字')]),'文章入力練習1回（途中終了1回）');
 assert.equal(summarizeLessonEvents([event('text','おわり','うった数 0文字')]),'文章入力練習1回（終了1回、終了分0文字）');
 assert.equal(summarizeLessonEvents([event('mouse','未クリア','120文字')]),'マウス練習1回');
 assert.equal(summarizeLessonEvents([event('keyboard','クリア','うった数 25回')]),'キーボード練習1回（クリア1回）');
});
test('partial known character counts are labeled, scores are never counted as typed text',()=>{
 assert.equal(summarizeLessonEvents([event('text','おわり','うった数 １２文字'),event('text','おわり','スコア 90')]),'文章入力練習2回（終了2回、終了分12文字（文字数確認分））');
 assert.equal(summarizeLessonEvents([event('text','おわり','文字数 1,200文字 / スコア 100')]),'文章入力練習1回（終了1回、終了分1200文字）');
 assert.equal(summarizeLessonEvents([event('text','おわり','-5文字')]),'文章入力練習1回（終了1回）');
});
test('many titles, unknown categories and unsupported metrics cannot grow the summary like raw logs',()=>{
 const many=Array.from({length:50},(_,i)=>event('unknown-'+i,'練習','スコア 1',`長い課題名${'x'.repeat(100)}`));
 assert.equal(summarizeLessonEvents(many),'その他の練習50回');
 assert.equal(summarizeLessonEvents([]),'');
});

const link:LessonLink={id:'fixture-link',organization_id:'fixture-org',child_id:'fixture-child',source_project_ref:'abcdefghijklmnopqrst',source_table:'user_data',source_student_id:'student_fixture',source_campus_id:'main',source_display_name:'架空児童',active:true,revision:1,verified_at:'2026-10-05T07:00:00Z'};
const history:LessonHistory={schemaVersion:1,date:'2026-10-05',historyComplete:false,historyNotice:'保存分のみ',fetchedAt:'2026-10-05T08:00:00Z',events:examples,identity:{sourceProjectRef:link.source_project_ref,dataTable:'user_data',studentId:link.source_student_id,campusId:'main',displayName:'架空児童',birthDate:''}};

test('summary/detail switches preserve raw evidence, staff notes, other activities and export text',()=>{
 const imported=importLessonEvents({value:'',note:'職員が記入した支援',nestedDetails:{selections:['Dレッスン','その他'],dLessonActivities:['タイピング練習'],otherNote:'職員の手入力'}},history,link,examples.map(e=>e.id),{childId:link.child_id,date:history.date,organizationId:link.organization_id,actorId:'fixture-staff',confirmedAt:history.fetchedAt,importMode:'automatic'});
 assert.doesNotMatch(imported.value,/実績：|スコア|16:00/);
 const concise=imported.value,raw=imported.nestedDetails![IMPORT_KEY];
 const detailed={...imported.nestedDetails,dLessonSummaryMode:'detailed'};
 assert.match(formatPcActivities(detailed),/実績：16:00.*スコア/);
 assert.equal(formatPcActivities({...detailed,dLessonSummaryMode:'concise'}),concise);
 assert.equal(detailed[IMPORT_KEY],raw);
 assert.equal(readLessonEvidence(detailed).length,13);
 assert.equal(imported.note,'職員が記入した支援');
 assert.match(concise,/タイピング練習/);assert.match(concise,/その他（職員の手入力）/);
 const summary=generateUnifiedRecordSummary({recorderName:'架空職員',attendance:'出席',expressions:[],snack:'',sectionAnswers:{__record_modules:{sectionId:'__record_modules',sectionTitle:'項目',answers:{pc:{value:'pc'}}},'record-module-pc':{sectionId:'record-module-pc',sectionTitle:'パソコン',answers:{module_pc_content:imported,module_pc_posture:{value:'職員が観察した姿勢'}}}}});
 assert.match(summary,/終了分110文字/);assert.match(summary,/職員が観察した姿勢/);assert.match(summary,/職員が記入した支援/);
 assert.doesNotMatch(summary,/実績：|スコア/);
});
