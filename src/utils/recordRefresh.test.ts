import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeRecordRefresh} from './recordRefresh';
import type {SupportRecord} from '../types';
const row=(id:string,version=1)=>({id,version} as SupportRecord);
test('record refresh preserves unrelated identities, adds new rows and removes deleted or hidden rows',()=>{
  const previous=[row('unchanged'),row('updated'),row('deleted')],incoming=[row('updated',2),row('new')];
  const result=mergeRecordRefresh(previous,incoming,['updated','deleted','new']);
  assert.deepEqual(result,[previous[0],incoming[0],incoming[1]]);assert.equal(result[0],previous[0]);
  assert.equal(previous.length,3);assert.equal(incoming.length,2);
});
test('an older response cannot regress an acknowledged saved or reviewed version',()=>{
  const current=row('saved',4),old=row('saved',3);
  assert.equal(mergeRecordRefresh([current],[old],['saved'])[0],current);
  assert.deepEqual(mergeRecordRefresh([current],[],['saved']),[]);
});
