import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStudentAdmin} from '../learning/studentAdmin';
const links=[{id:'link-fixture',child_id:'child-fixture'}];
const row={linkId:links[0].id,childId:links[0].child_id,revision:0,archived:false,loginNumber:'19',lastIssuedAt:null};
test('student lifecycle receipts strip secrets and preserve lifecycle state',()=>{
 assert.deepEqual(parseStudentAdmin({items:[{...row,passcode:'SECRET',accesses:['SECRET']}]},links),[row]);
 assert.equal(parseStudentAdmin({items:[{...row,revision:1,archived:true}]},links)[0].archived,true);
 assert.deepEqual(parseStudentAdmin({items:[{...row,unavailable:true}]},links),[{linkId:row.linkId,childId:row.childId,unavailable:true}]);
});
test('student lifecycle rejects wrong child, duplicates, malformed revision and timestamps',()=>{
 for(const patch of [{childId:'other'},{linkId:'other'},{revision:-1},{revision:0.5},{archived:'true'},{loginNumber:'SECRET'},{lastIssuedAt:'invalid'}])
  assert.throws(()=>parseStudentAdmin({items:[{...row,...patch}]},links));
 assert.throws(()=>parseStudentAdmin({items:[]},links));
 assert.throws(()=>parseStudentAdmin({items:[row,row]},[...links,...links]));
 assert.deepEqual(parseStudentAdmin({items:[]},[]),[]);
});
