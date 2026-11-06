import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMockExamProblem, parseMockExamCatalog } from '../learning/mockExamProblems';
const org='11111111-1111-4111-8111-111111111111';
const item={id:'round-78',round:78,title:'第78回過去問題',reference:'　架空本文。\n　次の段落。',permissionConfirmed:true,hidden:false};
const snapshot=()=>({schemaVersion:1,dataTable:'user_data',organizationId:org,sourceProject:'a'.repeat(20),campusId:'main',revision:1,fingerprint:'a'.repeat(32),catalog:[item]});
test('mock exam contract preserves paragraphs and supports an authoritative empty catalog',()=>{
  assert.deepEqual(parseMockExamProblem(item),item);
  assert.equal(parseMockExamProblem({...item,reference:'　本文。\r\n次。'}).reference,'　本文。\n次。');
  assert.deepEqual(parseMockExamCatalog({...snapshot(),catalog:[]},'main',org).catalog,[]);
  assert.equal(parseMockExamCatalog(snapshot(),'main',org).catalog[0].round,78);
});
test('mock exam contract rejects wrong identity, permission, content and duplicate rounds',()=>{
  for(const patch of [{id:'round-79'},{round:0},{round:1000},{round:'78'},{title:'別問題'},{reference:'　\n '},{reference:'あ'.repeat(6001)},{permissionConfirmed:false},{hidden:'false'}]) assert.throws(()=>parseMockExamProblem({...item,...patch}));
  for(const patch of [{campusId:'other'},{organizationId:'22222222-2222-4222-8222-222222222222'},{sourceProject:'bad'},{dataTable:'test_user_data'},{revision:-1},{fingerprint:'bad'},{catalog:[item,item]}]) assert.throws(()=>parseMockExamCatalog({...snapshot(),...patch},'main',org));
  assert.throws(()=>parseMockExamCatalog({...snapshot(),campusId:'public'},'public',org));
});
