import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MANUAL_TITLES,TROUBLE_TITLES,getManualContext,homeManualContext,attendanceManualContext,manualHref,troubleHref,type ManualScreen} from './manualLinks';

const source=(file:string)=>JSON.parse(readFileSync(new URL('../../docs/manuals/'+file,import.meta.url),'utf8')) as {id:string;title:string}[];
test('contextual help titles and fixed anchors match both published guide sources',()=>{
 for(const [file,titles,htmlFile] of [['sections.json',MANUAL_TITLES,'index.html'],['troubleshooting.json',TROUBLE_TITLES,'troubleshooting.html']] as const){
  assert.deepEqual(Object.entries(titles),source(file).map(row=>[row.id,row.title]));
  const html=readFileSync(new URL('../../public/manuals/d-support/'+htmlFile,import.meta.url),'utf8');
  for(const id of Object.keys(titles))assert(html.includes('id="'+id+'"'),id);
 }
});
test('every screen has a valid operation and troubleshooting destination',()=>{
 const screens:ManualScreen[]=['home','dailyChanges','todayWork','calendar','monthlySchedule','dispatch','operations','communication','assistant','meeting','records','children','record','activity','traffic','facility','learning','training','settings','team','auth','personal','qr','diagnostics'];
 for(const screen of screens){const help=getManualContext(screen);assert(help.topics.length&&help.troubles.length);for(const id of help.topics)assert(id in MANUAL_TITLES);for(const id of help.troubles)assert(id in TROUBLE_TITLES);assert.deepEqual(getManualContext(screen,'unknown-section'),help);}
});
test('active nested tabs use their actual guide instead of the parent menu',()=>{
 for(const [screen,section,topic] of [['record','review','record-save'],['record','children','record-select'],['communication','morning','morning'],['communication','handover','handover'],['facility','supplies','supplies'],['facility','newsletter','newsletter'],['learning','progress','lesson-progress'],['learning','individual','lesson-task'],['learning','batch','lesson-batch'],['learning','reviews','lesson-word'],['learning','links','lesson-account'],['settings','schools','schools'],['settings','vehicles','vehicles'],['settings','shiftTemplates','shift-template'],['settings','legalTraining','training-settings'],['settings','diagnostics','diagnostics'],['settings','serviceTypes','service-types'],['team','devices','devices'],['team','invite','invitation-audit'],['personal','qr','qr-punch']] as const){assert.equal(getManualContext(screen,section).topics[0],topic);}
 assert.equal(attendanceManualContext('overview').topics[0],'attendance');assert.equal(attendanceManualContext('request').topics[0],'shift-request');assert.equal(attendanceManualContext('planning').topics[0],'shift-create');assert.equal(attendanceManualContext('attendance').topics[0],'attendance-correct');
 assert.equal(homeManualContext('menu').topics[0],'home');assert.equal(homeManualContext('communication','morning').topics[0],'morning');assert.equal(homeManualContext('dispatch').topics[0],'dispatch');
});
test('help URLs contain only fixed local paths and chapters, including Pages subpath',()=>{
 for(const base of ['./','/','/shien-keika-kiroku-support/']){
  for(const id of Object.keys(MANUAL_TITLES) as (keyof typeof MANUAL_TITLES)[]){assert.equal(manualHref(id,base),base+'manuals/d-support/index.html#'+id);assert(!manualHref(id,base).includes('?'));}
  for(const id of Object.keys(TROUBLE_TITLES) as (keyof typeof TROUBLE_TITLES)[])assert.equal(troubleHref(id,base),base+'manuals/d-support/troubleshooting.html#'+id);
 }
});
