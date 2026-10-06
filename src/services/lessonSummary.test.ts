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

test('practice summary retains the task, outcome and metrics instead of only category totals',()=>{
 const frozen=structuredClone(examples),summary=summarizeLessonEvents(examples);
 assert.equal(summary,'文章入力練習：課題名未登録〔完了・0～34文字・7回／途中終了・0～17文字・3回〕／タイピング練習：課題名未登録〔完了・正確率96%・3回〕');
 assert.doesNotMatch(summary,/127文字|ミス|スコア|16:00|意欲|自力|姿勢/);
 assert.deepEqual(examples,frozen);
});
test('unknown results, missing amounts and partial zero counts are not inferred as completion',()=>{
 assert.equal(summarizeLessonEvents([event('text','練習','スコア 120 / ミス 0か所')]),'文章入力練習：課題名未登録〔完了状況未確認・文字数未確認〕');
 assert.equal(summarizeLessonEvents([event('text','未完了','120文字')]),'文章入力練習：課題名未登録〔完了状況未確認・120文字〕');
 assert.equal(summarizeLessonEvents([event('text','とちゅうでやめた','うった数 0文字')]),'文章入力練習：課題名未登録〔途中終了・0文字〕');
 assert.equal(summarizeLessonEvents([event('text','おわり','うった数 0文字')]),'文章入力練習：課題名未登録〔完了・0文字〕');
 assert.equal(summarizeLessonEvents([event('mouse','未クリア','120文字')]),'マウス練習：課題名未登録〔完了状況未確認〕');
 assert.equal(summarizeLessonEvents([event('keyboard','クリア','うった数 25回')]),'タイピング練習：課題名未登録〔完了・正確率未確認〕');
});
test('partial known character counts are labeled, scores are never counted as typed text',()=>{
 assert.equal(summarizeLessonEvents([event('text','おわり','うった数 １２文字'),event('text','おわり','スコア 90')]),'文章入力練習：課題名未登録〔完了・12文字（文字数未確認1回）・2回〕');
 assert.equal(summarizeLessonEvents([event('text','おわり','文字数 1,200文字 / スコア 100')]),'文章入力練習：課題名未登録〔完了・1200文字〕');
 assert.equal(summarizeLessonEvents([event('text','おわり','-5文字')]),'文章入力練習：課題名未登録〔完了・文字数未確認〕');
 assert.equal(summarizeLessonEvents([event('text','おわり','文字数 1,,200文字')]),'文章入力練習：課題名未登録〔完了・文字数未確認〕');
});
test('repeated tasks group by task and outcome without truncating different or long titles',()=>{
 const many=Array.from({length:50},()=>event('unknown','練習','スコア 1',`長い課題名${'x'.repeat(100)}`));
 assert.equal(summarizeLessonEvents(many),`その他の練習：長い課題名${'x'.repeat(100)}〔完了状況未確認・50回〕`);
 assert.equal(summarizeLessonEvents([]),'');
 assert.equal(summarizeLessonEvents([event('text','おわり','34文字','ぶんしょう ももたろう'),event('text','とちゅうでやめた','17文字','ぶんしょう ももたろう'),event('text','おわり','12文字','ぶんしょう はじめて')]),'文章入力練習：ももたろう〔完了・34文字／途中終了・17文字〕、はじめて〔完了・12文字〕');
});
test('typing topics keep accuracy per task and outcome, without fabricated means',()=>{
 const summary=summarizeLessonEvents([event('keyboard','クリア','せいかく 96%','キーボード なかゆび(うえ)'),event('keyboard','クリア','正確率 88%','キーボード くすりゆび(ホーム)'),event('keyboard','中断','正確率 ５０.５％','キーボード なかゆび(うえ)'),event('keyboard','クリア','ミス 0回 / スコア 100','キーボード は行(ブラインド)')]);
 assert.equal(summary,'タイピング練習：なかゆび(うえ)〔完了・正確率96%／途中終了・正確率50.5%〕、くすりゆび(ホーム)〔完了・正確率88%〕、は行(ブラインド)〔完了・正確率未確認〕');
 assert.match(summarizeLessonEvents([event('keyboard','クリア','正確率 101%','A'),event('keyboard','クリア','正確率 -5%','B')]),/A〔完了・正確率未確認〕、B〔完了・正確率未確認〕/);
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
 assert.match(summary,/完了・0～34文字・7回/);assert.match(summary,/職員が観察した姿勢/);assert.match(summary,/職員が記入した支援/);
 assert.doesNotMatch(summary,/実績：|スコア/);
});
