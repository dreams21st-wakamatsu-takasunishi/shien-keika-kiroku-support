import test from 'node:test';import assert from 'node:assert/strict';
import type {SupportRecord} from '../types';
import {IMPORT_KEY} from '../learning/recordImport';
import {buildParentShareProposal,composeParentShare,parentShareSourceKey} from './parentShare';
const base:SupportRecord={id:'fixture',childId:'child',childName:'架空児童',date:'2026-11-02',templateId:'template-unified',templateName:'試験用',templateType:'平日',attendance:'出席',expressions:['5：笑顔が見られ、明るい表情だった'],snack:'食べた',recorderName:'架空職員',sectionAnswers:{life:{sectionId:'life',sectionTitle:'生活',answers:{preparation:{value:'5：必要な準備に気づき、自分で行えた'},fatigue:{value:'3：中程度'}}},study:{sectionId:'study',sectionTitle:'学習',answers:{module_study_homework:{value:'算数（プリント）',homeworkDetails:{subjects:['算数'],materials:{算数:['プリント']},notes:{}}},module_study_attitude:{value:'5：自力で宿題を済ませられた'}}}},approvalStatus:'未確認',version:1,createdAt:'2026-11-02T00:00:00Z',updatedAt:'2026-11-02T00:00:00Z'};
const text=(record:SupportRecord)=>{const p=buildParentShareProposal(record);return composeParentShare(p.candidates,new Set(p.candidates.filter(c=>c.selected).map(c=>c.id)));};
test('local factual draft uses known structured values, not scores, author, child name or fabricated support',()=>{const result=text(base);assert(result.includes('算数の課題に取り組みました'));assert(result.includes('自分で行えました'));assert(result.includes('疲れた様子'));for(const bad of ['5：','3：','架空職員','架空児童','休憩を挟','成長','安心して'])assert(!result.includes(bad),bad);});
test('absence and unknown attendance never manufacture an activity or cheerful greeting',()=>{for(const attendance of ['欠席','']){const p=buildParentShareProposal({...base,attendance});assert.equal(p.candidates.length,0);assert(p.warnings.length);assert.equal(text({...base,attendance}),'');}});
test('free notes, other-child names, family facts and medication are not automatically copied',()=>{const r=structuredClone(base);r.sectionAnswers.life.answers.medication={value:'服薬あり',note:'別児童の名前と家庭の事情'};r.sectionAnswers.special={sectionId:'special',sectionTitle:'特記',answers:{},abcAnalysis:{inputMode:'free',freeText:'別児童の名前と家庭の事情',behavior:'',consequence:'',antecedent:''}};const p=buildParentShareProposal(r);assert(!text(r).includes('別児童'));assert(!text(r).includes('服薬あり'));assert(p.candidates.filter(c=>c.manual).every(c=>!c.selected));assert(p.warnings.some(w=>w.includes('服薬')));});
test('completion conflicts and safety issues demand review without dropping negative descriptions',()=>{const r=structuredClone(base);r.sectionAnswers.special={sectionId:'special',sectionTitle:'特記',answers:{},detailText:'宿題は未記入の空欄が残った。転倒でケガをした。'};const p=buildParentShareProposal(r);assert(p.warnings.some(w=>w.includes('食い違い')));assert(p.warnings.some(w=>w.includes('体調・安全')));const note=p.candidates.find(c=>c.manual)!;assert(note.text.includes('空欄'));assert(note.text.includes('ケガ'));});
test('arbitrary custom selections are not converted to asserted facts',()=>{const r=structuredClone(base);r.expressions=['楽しく幸せに過ごした'];r.sectionAnswers={custom:{sectionId:'custom',sectionTitle:'家族',answers:{free:{value:'家庭の機微情報'}}}};assert.equal(text(r),'');});
test('unfinished homework never generates a contradictory attempted-study sentence from subjects alone',()=>{const r=structuredClone(base);r.sectionAnswers.study.answers.module_study_attitude={value:'1：宿題に取り組むことができなかった'};assert(!text(r).includes('算数の課題に取り組みました'));assert(text(r).includes('取り組むことができませんでした'));});
test('compose includes only chosen whole candidates and never truncates a trailing negation',()=>{const content='とても長い文章'.repeat(70)+'完了していない。';assert.equal(composeParentShare([{id:'a',label:'要確認',text:content,selected:false,manual:true}],new Set(['a'])),'本日のご様子です。\n'+content);});
test('record content changes invalidate the source identity without editing input',()=>{assert.notEqual(parentShareSourceKey(base),parentShareSourceKey({...base,updatedAt:'2026-11-02T01:00:00Z'}));const copy=structuredClone(base);copy.sectionAnswers.life.answers.preparation.value='別の内容';assert.notEqual(parentShareSourceKey(base),parentShareSourceKey(copy));});


test('lesson details remain opt-in and preserve partial outcomes, accuracy and typed characters',()=>{
 const r=structuredClone(base);
 const evidence=(id:string,category:string,title:string,detail:string,amount:string)=>({id,category,title,detail,amount,at:'2026-11-02T07:00:00Z',date:r.date,childId:r.childId,organizationId:'fixture-org',sourceProjectRef:'abcdefghijklmnopqrst',sourceTable:'user_data',studentId:'student_fixture',campusId:'main',linkId:'fixture-link',linkRevision:1,confirmedBy:'fixture-staff',confirmedAt:'2026-11-02T08:00:00Z'});
 r.sectionAnswers.pc={sectionId:'pc',sectionTitle:'パソコン',answers:{module_pc_content:{value:'Dレッスン',nestedDetails:{[IMPORT_KEY]:JSON.stringify({schemaVersion:1,events:[evidence('k','keyboard','ホームポジション','クリア','せいかく 96%'),evidence('t','text','文章の練習','とちゅうでやめた','うった数 17文字')]})}}}};
 const p=buildParentShareProposal(r),detail=p.candidates.filter(c=>c.manual);
 assert(detail.some(c=>c.text.includes('ホームポジション')&&c.text.includes('96％')));
 assert(detail.some(c=>c.text.includes('文章の練習')&&c.text.includes('途中で終了')&&c.text.includes('17文字')));
 assert(detail.every(c=>!c.selected));assert(!text(r).includes('96％'));assert(!text(r).includes('17文字'));
 const events=JSON.parse(r.sectionAnswers.pc.answers.module_pc_content.nestedDetails![IMPORT_KEY] as string);
 events.events[0].childId='other-child';events.events[1].date='2026-11-01';events.events[1].at='2026-11-01T07:00:00Z';
 r.sectionAnswers.pc.answers.module_pc_content.nestedDetails![IMPORT_KEY]=JSON.stringify(events);
 const mismatched=buildParentShareProposal(r);assert(mismatched.warnings.some(w=>w.includes('一致しない')));assert(!mismatched.candidates.some(c=>c.label==='Dレッスンの取り組み'));
});
test('polite option formatting preserves negative observations',()=>{
 const r=structuredClone(base);r.expressions=['3：普段通りで、大きな変化は見られなかった'];
 assert(text(r).includes('大きな変化は見られませんでした。'));assert(!text(r).includes('変化が見られました'));
});
