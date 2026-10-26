import test from 'node:test';import assert from 'node:assert/strict';
import {openTrainingConfirmationForm} from '../src/training/model.ts';
test('completion form uses the exact HTTPS URL and no identity or video parameters',()=>{
 const calls=[];assert.equal(openTrainingConfirmationForm('https://example.invalid/form',( ...args)=>calls.push(args)),'https://example.invalid/form');
 assert.deepEqual(calls,[['https://example.invalid/form','_blank','noopener,noreferrer']]);
});
test('absent or unsafe URLs do not open; popup failure still permits a direct fallback',()=>{
 const calls=[];assert.equal(openTrainingConfirmationForm('',(...args)=>calls.push(args)),'');
 assert.throws(()=>openTrainingConfirmationForm('javascript:alert(1)',(...args)=>calls.push(args)));assert.deepEqual(calls,[]);
 assert.equal(openTrainingConfirmationForm('https://example.invalid/form',()=>{throw Error('blocked');}),'https://example.invalid/form');
});
