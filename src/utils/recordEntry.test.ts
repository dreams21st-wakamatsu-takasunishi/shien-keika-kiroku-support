import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownInputDrafts,resolveRecordEntry,validateOwnDraftMerge,localInputDrafts,mergeLocalInputDrafts,assertDraftMergeSynced} from './recordEntry';
import type {RecordDraftSummary} from '../types';
const identity={userId:'user',recorderId:'staff'},date='2026-10-15';
const draft=(key:string,child:string,patch:Partial<RecordDraftSummary>={}):RecordDraftSummary=>({draftKey:key,userId:'user',recorderId:'staff',date,selectedChildIds:[child],selectedTemplateId:'template-unified',revision:1,currentStepIndex:4,updatedAt:'2026-10-15T01:00:00Z',...patch});
test('every new entry resumes the only same-user same-date input instead of splitting children',()=>{
 const existing=draft('record-a','a');for(const request of [{date},{date,childId:'b'},{date,childId:'a'}])assert.equal(resolveRecordEntry([existing],identity,request).kind,'resume');
 assert.equal(resolveRecordEntry([],identity,{date}).kind,'new');
 assert.equal(resolveRecordEntry([existing],identity,{date:'2026-10-16'}).kind,'new');
});
test('multiple groups require explicit choice; an already selected child returns to its own group',()=>{
 const rows=[draft('record-a','a'),draft('record-b','b')];assert.equal(resolveRecordEntry(rows,identity,{date}).kind,'choose');assert.equal(resolveRecordEntry(rows,identity,{date,childId:'c'}).kind,'choose');
 const result=resolveRecordEntry(rows,identity,{date,childId:'b'});assert.equal(result.kind,'resume');if(result.kind==='resume')assert.equal(result.draft.draftKey,'record-b');
 assert.equal(resolveRecordEntry(rows,identity,{date,manage:true}).kind,'choose');
});
test('ownership is based on IDs not display names; saved-record edits and corrections are excluded',()=>{
 const rows=[draft('record-a','a'),draft('record-b','b',{userId:'other'}),draft('record-c','c',{recorderId:'other'}),draft('record-edit-a','a'),draft('record-correction-a','a'),draft('record-d','d',{userId:undefined}),draft('record-e','e',{date:'2026-10-14'})];
 assert.deepEqual(ownInputDrafts(rows,identity,date).map(row=>row.draftKey),['record-a']);assert.deepEqual(ownInputDrafts(rows,{userId:'user'},date),[]);
});
test('merge rejects missing, repeated, foreign, different-date, different-format and overlapping drafts',()=>{
 const rows=[draft('record-a','a'),draft('record-b','b')],keys=rows.map(row=>row.draftKey);assert.equal(validateOwnDraftMerge(rows,identity,date,keys).length,2);
 for(const bad of [[],['record-a'],['record-a','record-a'],['record-a','record-missing']])assert.throws(()=>validateOwnDraftMerge(rows,identity,date,bad));
 for(const patch of [{userId:'other'},{date:'2026-10-14'},{recorderId:'other'},{selectedTemplateId:'other'},{selectedChildIds:['a']}, {draftKey:'record-edit-x'}])assert.throws(()=>validateOwnDraftMerge([rows[0],{...rows[1],...patch}],identity,date,keys));
});
class MemoryStorage implements Storage {data=new Map<string,string>();get length(){return this.data.size;}key(i:number){return [...this.data.keys()][i]??null;}getItem(k:string){return this.data.get(k)??null;}setItem(k:string,v:string){this.data.set(k,v);}removeItem(k:string){this.data.delete(k);}clear(){this.data.clear();}}
const prefix='support-record-draft-v2:local:user:';
const payload=(child:string)=>({version:12,date,recorderId:'staff',recorderName:'fixture',selectedTemplateId:'template-unified',selectedChildIds:[child],activeChildId:child,currentStepIndex:8,childDrafts:{[child]:{attendance:'出席',sectionAnswers:{special:{value:'入力済み '+child}}}},childTemplateIds:{[child]:'template-unified'},childStepIds:{[child]:'attendance'},updatedAt:'2026-10-15T01:00:00Z'});

test('production merge refuses unshared answers, absent shared drafts and stale revisions',()=>{
 const remote=payload('a');
 assert.doesNotThrow(()=>assertDraftMergeSynced({...remote,updatedAt:'later',currentStepIndex:3},remote,2,2));
 assert.doesNotThrow(()=>assertDraftMergeSynced(null,remote,2,2));
 const reordered={...remote,childDrafts:{a:{sectionAnswers:remote.childDrafts.a.sectionAnswers,attendance:'出席'}}};
 assert.doesNotThrow(()=>assertDraftMergeSynced(reordered,remote,2,2));
 for(const local of [{...remote,childDrafts:{a:{note:'未同期の内容'}}},{...remote,selectedChildIds:['a','b']},{...remote,childTemplateIds:{a:'different'}}])assert.throws(()=>assertDraftMergeSynced(local,remote,2,2),/共有保存前/);
 assert.throws(()=>assertDraftMergeSynced(remote,null,0,undefined),/端末内だけ/);
 assert.throws(()=>assertDraftMergeSynced(remote,remote,2,3),/更新されました/);
});
test('local summaries stay inside the exact organization and login storage scope',()=>{
 const storage=new MemoryStorage();storage.setItem(prefix+'record-a',JSON.stringify(payload('a')));storage.setItem('support-record-draft-v2:local:other:record-b',JSON.stringify(payload('b')));storage.setItem(prefix+'record-edit-x',JSON.stringify(payload('x')));storage.setItem(prefix+'record-broken','{');
 assert.deepEqual(localInputDrafts(storage,undefined,'user').map(row=>row.selectedChildIds),[['a']]);
});
test('explicit local merge retains every child answer, format, cursor and target order',()=>{
 const storage=new MemoryStorage();storage.setItem(prefix+'record-a',JSON.stringify(payload('a')));storage.setItem(prefix+'record-b',JSON.stringify(payload('b')));
 mergeLocalInputDrafts(storage,undefined,identity,date,['record-a','record-b'],'record-b');const result=JSON.parse(storage.getItem(prefix+'record-b')!);
 assert.deepEqual(result.selectedChildIds,['b','a']);assert.equal(result.activeChildId,'b');assert.equal(result.currentStepIndex,8);for(const id of ['a','b']){assert.deepEqual(result.childDrafts[id],payload(id).childDrafts[id]);assert.equal(result.childStepIds[id],'attendance');assert.equal(result.childTemplateIds[id],'template-unified');}assert.equal(storage.getItem(prefix+'record-a'),null);
});
test('failed validation or failed target write never removes any source input',()=>{
 const storage=new MemoryStorage(),a=payload('a'),b=payload('b');storage.setItem(prefix+'record-a',JSON.stringify(a));storage.setItem(prefix+'record-b',JSON.stringify({...b,childDrafts:{...b.childDrafts,a:{changed:true}}}));const before=[...storage.data];
 assert.throws(()=>mergeLocalInputDrafts(storage,undefined,identity,date,['record-a','record-b'],'record-a'));assert.deepEqual([...storage.data],before);
 storage.setItem(prefix+'record-b',JSON.stringify(b));storage.setItem=()=>{throw Error('quota');};assert.throws(()=>mergeLocalInputDrafts(storage,undefined,identity,date,['record-a','record-b'],'record-a'));assert.equal(storage.length,2);
});
