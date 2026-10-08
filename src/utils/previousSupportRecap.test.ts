import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPreviousSupportRecaps,previousSupportDate,shortRecapLine,supportRecapLines} from './previousSupportRecap';
import type {SupportRecord} from '../types';

const record:SupportRecord={id:'fixture',templateId:'template-unified',templateName:'試験用',templateType:'平日',childId:'a',childName:'架空児童',date:'2026-10-02',attendance:'出席',expressions:['笑顔'],snack:'',recorderName:'架空職員',approvalStatus:'未確認',createdAt:'2026-10-02T00:00:00Z',updatedAt:'2026-10-02T00:00:00Z',sectionAnswers:{study:{sectionId:'study',sectionTitle:'学習',detailText:'声掛けを受けて取り組んだ。自力では完了していない。',answers:{module_study_attitude:{value:'声掛けあり',note:'開始時に不安を訴えた。'}}},__record_modules:{sectionId:'__record_modules',sectionTitle:'metadata',answers:{x:{value:'study'}}}}};
test('morning recap defaults to Friday on Monday and yesterday on other days',()=>{
 assert.equal(previousSupportDate('2026-10-05'),'2026-10-02');
 assert.equal(previousSupportDate('2026-10-08'),'2026-10-07');
 assert.equal(previousSupportDate('2026-10-04'),'2026-10-03');
 assert.equal(previousSupportDate('2026-01-01'),'2025-12-31');
 assert.throws(()=>previousSupportDate('invalid'));
});
test('recap is scoped to supplied roster and exact date, preserving multiple records and missing records',()=>{
 const records=[record,{...record,id:'second',createdAt:'2026-10-02T01:00:00Z'},{...record,id:'yesterday',date:'2026-10-01'},{...record,id:'other',childId:'outside'}];
 const before=structuredClone(records);
 const result=buildPreviousSupportRecaps([{id:'a',name:'架空A'},{id:'b',name:'架空B'}],records,'2026-10-02');
 assert.deepEqual(result[0].records.map(r=>r.id),['fixture','second']);
 assert.deepEqual(result[1].records,[]);assert.deepEqual(records,before);
});
test('recap uses explicit observations and does not invent mood from learning results or drop negation',()=>{
 const lines=supportRecapLines(record);
 assert.equal(lines[0],'学習の様子：声掛けを受けて取り組んだ。自力では完了していない。');
 assert.ok(lines.includes('宿題への取り組みの備考：開始時に不安を訴えた。'));
 assert.ok(lines.includes('宿題への取り組み：声掛けあり'));
 assert.ok(!lines.some(line=>line.includes('metadata')));
 const long='声掛けにより'+ 'ゆっくり'.repeat(70)+'取り組んだが完了していない。';
 assert.equal(shortRecapLine(long),long);
 assert.equal(shortRecapLine(`短い記録。${long}`),'短い記録。（続きは元の記録）');
});
test('free ABC, structured ABC and legacy summary remain readable',()=>{
 const section={sectionId:'special',sectionTitle:'特記',answers:{},abcAnalysis:{inputMode:'free' as const,freeText:'保護者から体調について共有があった。',antecedent:'',behavior:'',consequence:''}};
 assert.match(supportRecapLines({...record,sectionAnswers:{special:section}}).join(' '),/保護者から体調/);
 assert.match(supportRecapLines({...record,sectionAnswers:{special:{...section,abcAnalysis:{antecedent:'課題開始',behavior:'席を離れた',consequence:'休憩した'}}}}).join(' '),/前の状況：課題開始／行動：席を離れた／その後：休憩した/);
 assert.deepEqual(supportRecapLines({...record,expressions:[],attendance:'',sectionAnswers:{},synthesizedSummary:'保存済みのまとめ'}),['記録のまとめ：保存済みのまとめ']);
});
