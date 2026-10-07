import {test} from 'node:test';
import assert from 'node:assert/strict';
import {markerPopoverPosition} from './markerPopover';
test('marker child picker stays attached below the clicked marker',()=>{
  const p=markerPopoverPosition({left:600,right:620,top:220,bottom:244},{width:1366,height:768},160);
  assert.equal(p.top,252);assert.equal(p.left+p.arrowLeft,610);assert.equal(p.maxHeight,160);
});
test('marker picker opens above near bottom and fits mobile viewport edges',()=>{
  const p=markerPopoverPosition({left:355,right:380,top:720,bottom:744},{width:390,height:768});
  assert.equal(p.side,'above');assert.equal(p.bottom,56);assert.ok(p.left+p.width<=378);assert.ok(p.left>=12);
  const narrow=markerPopoverPosition({left:10,right:30,top:220,bottom:244},{width:280,height:768});
  assert.equal(narrow.width,256);assert.equal(narrow.left,12);
});
