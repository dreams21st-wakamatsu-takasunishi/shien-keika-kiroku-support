import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseWordInbox} from '../learning/wordReviews';
import type {LessonLink} from '../learning/contracts';
const link={id:'link-a',child_id:'child-a',source_student_id:'student_a'} as LessonLink;
const row={id:'11111111-1111-4111-8111-111111111111',studentId:'student_a',childId:'child-a',linkId:'link-a',stageId:'w_b1_1',page:'3',fileType:'application/pdf',fileSize:30,status:'pending',revision:2,submittedAt:'2026-09-30T01:00:00Z',reviewedAt:null,reviewerName:null,reason:'',reward:0,artifactAvailable:true};
test('Word inbox is bound to a verified child, learning account and link',()=>{
  assert.equal(parseWordInbox({requests:[row]},[link]).length,1);
  for(const change of [{childId:'child-b'},{studentId:'student_b'},{linkId:'link-b'},{stageId:'bad'},{revision:0},{fileType:'text/html'},{page:'-1'}])assert.throws(()=>parseWordInbox({requests:[{...row,...change}]},[link]));
});
test('Word inbox rejects duplicate requests and omits private fields',()=>{
  assert.throws(()=>parseWordInbox({requests:[row,row]},[link]));
  const result=parseWordInbox({requests:[{...row,email:'private',file_path:'private'}]},[link])[0];assert.ok(!('email' in result)&&!('file_path' in result));
});
