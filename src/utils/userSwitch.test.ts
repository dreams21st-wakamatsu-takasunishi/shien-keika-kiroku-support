import {test} from 'node:test';
import assert from 'node:assert/strict';
import {switchUserSafely} from './userSwitch';
test('user switch waits for draft synchronization, local logout, reset, then fresh login',async()=>{
 const calls:string[]=[];
 await switchUserSafely({dirtyAreas:[],prepare:async()=>{calls.push('sync');return()=>{calls.push('release');};},signOut:async()=>{calls.push('logout');return {error:null};},reset:()=>{calls.push('reset');},reload:()=>{calls.push('reload');}});
 assert.deepEqual(calls,['sync','logout','reset','reload','release']);
});
test('unsaved settings stop switching before any save or logout',async()=>{
 const calls:string[]=[];
 await assert.rejects(()=>switchUserSafely({dirtyAreas:['活動・指導案','法定研修'],prepare:async()=>{calls.push('sync');return()=>{};},signOut:async()=>{calls.push('logout');return {error:null};},reset:()=>{calls.push('reset');},reload:()=>{calls.push('reload');}}),/先に保存/);
 assert.deepEqual(calls,[]);
});
test('failed or conflicting shared-draft save cannot end the current login',async()=>{
 const calls:string[]=[];
 await assert.rejects(()=>switchUserSafely({dirtyAreas:[],prepare:async()=>{throw Error('DRAFT_CONFLICT');},signOut:async()=>{calls.push('logout');return {error:null};},reset:()=>{calls.push('reset');},reload:()=>{calls.push('reload');}}),/DRAFT_CONFLICT/);
 assert.deepEqual(calls,[]);
});
test('logout failure restores the editor and never clears state or reloads',async()=>{
 const calls:string[]=[];
 await assert.rejects(()=>switchUserSafely({dirtyAreas:[],prepare:async()=>()=>{calls.push('release');},signOut:async()=>({error:Error('offline')}),reset:()=>{calls.push('reset');},reload:()=>{calls.push('reload');}}),/入力は残しています/);
 assert.deepEqual(calls,['release']);
});
test('unexpected logout rejection still releases the editor',async()=>{
 let released=false;
 await assert.rejects(()=>switchUserSafely({dirtyAreas:[],prepare:async()=>()=>{released=true;},signOut:async()=>{throw Error('network');},reset:()=>assert.fail(),reload:()=>assert.fail()}),/network/);assert.equal(released,true);
});
