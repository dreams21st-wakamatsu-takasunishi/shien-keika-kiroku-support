import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSingleFlight} from './singleFlight';

test('coalesces only overlapping reads for the exact same scope, child, date and link revision', async () => {
  const read=createSingleFlight();
  let calls=0;
  const fetch=async()=>++calls;
  const key='organization:actor:child:date:link:1';
  const first=read(key,fetch);
  assert.equal(first,read(key,fetch));
  assert.equal(await first,1);
  assert.equal(await read(key,fetch),2);
  assert.deepEqual(await Promise.all([read(key,fetch),read(key+'2',fetch)]),[3,4]);
  await assert.rejects(read(key,async()=>{throw Error('offline');}),/offline/);
  assert.equal(await read(key,fetch),5);
});
