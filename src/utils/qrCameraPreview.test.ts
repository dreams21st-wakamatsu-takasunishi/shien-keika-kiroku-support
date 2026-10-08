import {test} from 'node:test';
import assert from 'node:assert/strict';
import {QR_PREVIEW_MIRROR_KEY,qrPreviewMirrored,readQrPreviewMirrorPreference,saveQrPreviewMirrorPreference} from './qrCameraPreview';

test('front preview defaults to mirror; rear and unknown cameras stay normal',()=>{
  assert.equal(qrPreviewMirrored('user'),true);
  for(const mode of ['environment','left','right',undefined,''])assert.equal(qrPreviewMirrored(mode),false);
});

test('an explicit user choice overrides facing mode without reversing QR input',()=>{
  assert.equal(qrPreviewMirrored('user',false),false);
  assert.equal(qrPreviewMirrored('environment',true),true);
  assert.equal(qrPreviewMirrored(undefined,true),true);
});

test('only boolean display preferences are restored and saved',()=>{
  for(const [value,expected] of [['true',true],['false',false],[null,undefined],['yes',undefined],['{"token":"private"}',undefined]] as const){
    assert.equal(readQrPreviewMirrorPreference({getItem:key=>{assert.equal(key,QR_PREVIEW_MIRROR_KEY);return value;}}),expected);
  }
  const writes:string[]=[];
  saveQrPreviewMirrorPreference(true,{setItem:(key,value)=>writes.push(key+'='+value)});
  saveQrPreviewMirrorPreference(false,{setItem:(key,value)=>writes.push(key+'='+value)});
  assert.deepEqual(writes,[QR_PREVIEW_MIRROR_KEY+'=true',QR_PREVIEW_MIRROR_KEY+'=false']);
});

test('unavailable or blocked preference storage never prevents camera preview use',()=>{
  assert.equal(readQrPreviewMirrorPreference({getItem:()=>{throw Error('blocked');}}),undefined);
  assert.doesNotThrow(()=>saveQrPreviewMirrorPreference(true,{setItem:()=>{throw Error('blocked');}}));
  assert.equal(readQrPreviewMirrorPreference(),undefined);
});
