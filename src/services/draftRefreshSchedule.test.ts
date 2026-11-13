import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDraftRefreshSchedule} from './draftRefreshSchedule';
test('local and Realtime draft signals coalesce; scope changes can cancel pending signals',()=>{
 let callback:(()=>void)|undefined,runs=0;
 const schedule=createDraftRefreshSchedule((job,ms)=>{assert.equal(ms,350);callback=job;return 1 as never;},()=>{callback=undefined;});
 schedule.request(()=>runs++);schedule.request(()=>runs+=10);
 assert.equal(runs,0);callback?.();assert.equal(runs,1);
 schedule.request(()=>runs++);schedule.cancel();assert.equal(callback,undefined);
 schedule.request(()=>runs++);callback?.();assert.equal(runs,2);
});
