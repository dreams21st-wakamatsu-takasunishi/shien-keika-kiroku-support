import test from 'node:test';
import assert from 'node:assert/strict';
import {canManageTraining,moveTrainingItem,moveTrainingItemTo,trainingResourceUrl,remainingTraining,trainingError,trainingOrderSnapshot,trainingTitle,trainingUrl,visibleTraining,type TrainingData} from '../training/model';
import {readFileSync} from 'node:fs';

test('only administrators and child development managers configure legal training',()=>{
 assert.equal(canManageTraining('admin'),true);assert.equal(canManageTraining('manager'),true);
 for(const role of ['staff','classroom_manager',undefined] as const)assert.equal(canManageTraining(role),false);
});
test('training metadata validates without fetching, including unsafe or credential-bearing URLs',()=>{
 assert.equal(trainingTitle(' 架空研修 '),'架空研修');assert.equal(trainingUrl('https://example.invalid/video'),'https://example.invalid/video');assert.equal(trainingUrl('',true),'');
 for(const value of ['','javascript:alert(1)','data:text/html,test','http://example.invalid','https://user:pass@example.invalid','https://example.invalid/ bad','https://example.invalid/\nvideo','https://'+ 'x'.repeat(2050)])assert.throws(()=>trainingUrl(value));
 for(const value of ['',' '.repeat(2),'x'.repeat(121),'a\u0000b'])assert.throws(()=>trainingTitle(value));
});
test('counts ignore other users and hidden categories/videos, and do not mark unregistered progress complete',()=>{
 const data:TrainingData={categories:[{id:'a',organizationId:'org',title:'架空カテゴリ',active:true,revision:1},{id:'b',organizationId:'org',title:'非表示',active:false,revision:1}],videos:['1','2','3'].map((id,index)=>({id,organizationId:'org',categoryId:index===2?'b':'a',title:id,videoUrl:'https://example.invalid',materialUrl:'',active:true,revision:1})),progress:[{videoId:'1',userId:'other',completedAt:'2026-10-06T00:00:00Z',revision:1},{videoId:'2',userId:'self',completedAt:null,revision:2}]};
 assert.equal(visibleTraining(data).videos.length,2);assert.equal(remainingTraining(visibleTraining(data).videos,data.progress,'self'),2);
 data.progress.push({videoId:'1',userId:'self',completedAt:'2026-10-06T00:00:00Z',revision:1});assert.equal(remainingTraining(visibleTraining(data).videos,data.progress,'self'),1);
});
test('resource selection always resolves exactly its own URL and never falls back to the other resource',()=>{
 const row={videoUrl:'https://example.invalid/video',materialUrl:'https://example.invalid/material'};
 assert.equal(trainingResourceUrl(row,'video'),row.videoUrl);assert.equal(trainingResourceUrl(row,'material'),row.materialUrl);
 assert.equal(trainingResourceUrl({...row,materialUrl:''},'material'),'');
 assert.equal(trainingResourceUrl({...row,materialUrl:''},'video'),row.videoUrl);
});
test('catalog uses the same stored order for learners and management without mutating data',()=>{
 const categories=[{id:'b',organizationId:'org',title:'二',active:true,revision:1,sortOrder:1},{id:'a',organizationId:'org',title:'一',active:true,revision:1,sortOrder:2}];
 const videos=['1','2','3'].map((id,index)=>({id,organizationId:'org',categoryId:'a',title:id,videoUrl:'https://example.invalid',materialUrl:'',active:true,revision:1,sortOrder:3-index}));
 const progress=[{videoId:'1',userId:'self',completedAt:'2026-10-06T00:00:00Z',revision:1}];
 const data={categories,videos,progress},before=structuredClone(data),visible=visibleTraining(data);
 assert.deepEqual(visible.categories.map(row=>row.id),['b','a']);assert.deepEqual(visible.videos.map(row=>row.id),['3','2','1']);assert.deepEqual(data,before);
});
test('drag and button reordering are immutable and safe at boundaries or missing targets',()=>{
 const rows=['a','b','c'].map(id=>({id}));
 assert.deepEqual(moveTrainingItem(rows,'b',-1).map(row=>row.id),['b','a','c']);
 assert.deepEqual(moveTrainingItem(rows,'c',1),rows);assert.deepEqual(moveTrainingItem(rows,'missing',-1),rows);
 assert.deepEqual(moveTrainingItemTo(rows,'a','c').map(row=>row.id),['b','c','a']);assert.deepEqual(moveTrainingItemTo(rows,'c','a').map(row=>row.id),['c','a','b']);
 assert.deepEqual(moveTrainingItemTo(rows,'a','missing'),rows);assert.deepEqual(rows.map(row=>row.id),['a','b','c']);
});
test('reorder payloads contain only unique opaque IDs and revisions, never titles or URLs',()=>{
 const row={id:'11111111-1111-4111-8111-111111111111',revision:2,title:'架空研修',videoUrl:'https://example.invalid/private'};
 assert.deepEqual(trainingOrderSnapshot([row]),[{id:row.id,revision:2}]);
 for(const rows of [[row,row],[{...row,id:'bad'}],[{...row,revision:0}],[{...row,revision:1.2}]])assert.throws(()=>trainingOrderSnapshot(rows));
 assert.match(trainingError(Error('TRAINING_ORDER_INVALID')),/再読込/);
});
test('unsafe resource URLs are rejected independently without opening a sibling tab',()=>{
 const row={videoUrl:'https://example.invalid/video',materialUrl:'javascript:alert(1)'};
 assert.equal(trainingResourceUrl(row,'video'),row.videoUrl);assert.throws(()=>trainingResourceUrl(row,'material'));
 assert.throws(()=>trainingResourceUrl({...row,videoUrl:'javascript:alert(1)'},'video'));
});
test('training errors never echo subscription URLs or titles, and service has no AI or localStorage processing',()=>{
 const secret='https://example.invalid/private?token=secret';assert.ok(!trainingError({code:'23514',message:secret}).includes(secret));assert.ok(!trainingError(Error(secret)).includes(secret));
 assert.match(trainingError({code:'PGRST202'}),/DB更新/);assert.match(trainingError({code:'40001'}),/再読込/);
 for(const path of ['src/services/legalTraining.ts','src/training/model.ts','src/components/LegalTrainingWorkspace.tsx']){
  const source=readFileSync(path,'utf8');assert.ok(!source.includes('localStorage'));assert.ok(!source.includes('functions.invoke'));assert.ok(!source.includes('fetch('));assert.ok(!source.includes('console.'));
 }
 assert.ok(!readFileSync('src/components/HomeScreen.tsx','utf8').includes('requestHomeAssistantProposal'));
});
