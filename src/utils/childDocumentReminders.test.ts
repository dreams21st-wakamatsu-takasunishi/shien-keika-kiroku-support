import test from 'node:test';
import assert from 'node:assert/strict';
import type {ChildProfile} from '../types';
import {childDocumentReminders,documentFamilyReference,documentMissingFields} from './childDocumentReminders';
import {documentSlots,usagePlanRenewalCycleKey,type DocumentRegister,type ChildDocumentEntry} from './childDocuments';
const child:ChildProfile={id:'a',name:'架空児童A',birthDate:'2016-11-15',careType:'放課後等デイサービス'};
const entry=(patch:Partial<ChildDocumentEntry>={}):ChildDocumentEntry=>({id:'b',childId:'a',type:'benefit',cycleKey:'extra:one',documentDate:'2026-04-01',validUntil:'2026-11-30',confirmed:true,title:'',note:'',consentDate:'',guardianDeliveryDate:'',consultationDeliveryDate:'',operation:'record',replacesId:null,createdAt:'2026-04-01T00:00:00Z',createdByName:'架空職員',...patch});
const data=(entries:ChildDocumentEntry[]=[]):DocumentRegister=>({settings:[{childId:'a',revision:1,contractDate:'2026-04-15',monitoringMonths:[4,10],effectiveFrom:'2026-04-15',createdAt:'',createdByName:'架空職員'}],entries});
const reminders=(register=data(),date='2026-10-19')=>childDocumentReminders(child,[child],register,date);
const items=(rows:ReturnType<typeof reminders>)=>rows.flatMap(row=>row.items||[]);

test('missing/future contracts explain the missing setting without inventing dates',()=>{
 assert.match(reminders({settings:[],entries:[]})[0].detail,/不足項目：契約日/);
 const future=data();future.settings[0].contractDate='2027-04-15';assert.equal(reminders(future).length,1);assert.match(reminders(future)[0].title,/契約開始前/);
});
test('initial and first annual documents are merged once, with exact names and missing fields',()=>{
 const rows=reminders(),initial=rows.filter(r=>r.id==='documents:initial:2026-04-15');
 assert.equal(initial.length,1);assert.equal(initial[0].level,'overdue');
 const usage=items(rows).filter(i=>i.slotKey==='usage_plan|annual:2026-04-15');
 assert.equal(usage.length,1);assert.match(usage[0].label,/利用計画／初回/);assert.deepEqual(usage[0].missing,['作成日','実物の保管確認']);
 const ids=items(rows).map(i=>i.slotKey);assert.equal(new Set(ids).size,ids.length);
});
test('partially registered documents list only actual missing fields, including guardian dates',()=>{
 const final=entry({id:'p',type:'plan_final',cycleKey:'initial:2026-04-15',validUntil:'',consentDate:'2026-04-02',guardianDeliveryDate:''});
 const assessment=entry({id:'a',type:'assessment',cycleKey:'annual:2026-04-15',validUntil:'',confirmed:false});
 const rows=items(reminders(data([final,assessment])));
 assert.deepEqual(rows.find(i=>i.type==='plan_final'&&i.cycleKey===final.cycleKey)?.missing,['保護者交付日']);
 assert.deepEqual(rows.find(i=>i.type==='assessment')?.missing,['実物の保管確認']);
 assert.ok(!rows.some(i=>i.missing.some(field=>field.includes('相談支援'))));
});
test('benefit and usage renewals share one card and exact expiry boundaries',()=>{
 const store=data([entry({validUntil:'2026-12-31'})]);
 assert.ok(!reminders(store,'2026-11-29').some(r=>r.id==='documents:renewal:2026-12-31'));
 const renewal=reminders(store,'2026-11-30').filter(r=>r.id==='documents:renewal:2026-12-31');
 assert.equal(renewal.length,1);assert.deepEqual(renewal[0].types,['benefit','usage_plan']);
 assert.equal(reminders(store,'2026-12-31').find(r=>r.id===renewal[0].id)?.level,'soon');
 assert.equal(reminders(store,'2027-01-01').find(r=>r.id===renewal[0].id)?.level,'overdue');
 assert.ok(!reminders(store).some(r=>r.id==='birthday'));
});
test('new certificate does not erase pending plan; confirming that plan removes only its item',()=>{
 const old=entry(),next=entry({id:'next',cycleKey:'extra:next',documentDate:'2026-10-30',validUntil:'2027-11-30'});
 const plan=entry({id:'p',type:'usage_plan',cycleKey:usagePlanRenewalCycleKey(old.validUntil),documentDate:'2026-10-30',validUntil:'',confirmed:false});
 assert.deepEqual(items(reminders(data([old,next,plan]),'2026-10-30')).find(i=>i.cycleKey===plan.cycleKey)?.missing,['実物の保管確認']);
 assert.ok(!items(reminders(data([old,next,{...plan,confirmed:true}]),'2026-10-30')).some(i=>i.cycleKey===plan.cycleKey));
});
test('expiry field is merged into existing certificate issue instead of a separate duplicate alert',()=>{
 const rows=reminders(data([entry({cycleKey:'annual:2026-04-15',validUntil:'',confirmed:false})]));
 const benefit=items(rows).filter(i=>i.slotKey==='benefit|annual:2026-04-15');
 assert.equal(benefit.length,1);assert.deepEqual(benefit[0].missing,['実物の保管確認','受給者証の有効期限']);
});
test('six-month review reason joins pending documents and starts a month early without duplicating document issues',()=>{
 assert.ok(!reminders(data(),'2026-09-14').some(r=>r.detail.includes('6か月の確認目安')));
 const rows=reminders(data(),'2026-09-15');assert.ok(rows.some(r=>r.detail.includes('2026-10-15')));
 assert.ok(!rows.some(r=>r.id.startsWith('six-month:')&&r.types.includes('plan_final')));
 const recent=entry({id:'m',type:'monitoring',documentDate:'2026-10-01',validUntil:''});
 assert.ok(!reminders(data([recent])).some(r=>r.detail.includes('6か月の確認目安')));
 for(const invalid of [{...recent,confirmed:false},{...recent,documentDate:'2026-10-20'},{...recent,childId:'b'}])assert.ok(reminders(data([invalid])).some(r=>r.detail.includes('6か月の確認目安')));
 assert.ok(!childDocumentReminders({...child,careType:'保育所等訪問支援'},[child],data(),'2026-10-19').some(r=>r.detail.includes('6か月の確認目安')));
});
test('same-date standalone plan and monitoring reviews merge into one reminder',()=>{
 const store=data();store.settings[0].monitoringMonths=[];
 store.entries=documentSlots('a',store,'2026-04-15').map((slot,index)=>entry({id:'filled'+index,type:slot.type,cycleKey:slot.cycleKey,documentDate:'2026-04-15',validUntil:slot.type==='benefit'?'2027-04-30':'',consentDate:slot.type==='plan_final'?'2026-04-15':'',guardianDeliveryDate:slot.type==='plan_final'?'2026-04-15':''}));
 store.entries.push(entry({id:'m',type:'monitoring',validUntil:'',documentDate:'2026-04-15'}));
 const reviews=reminders(store,'2026-09-15').filter(r=>r.id.startsWith('six-month:'));
 assert.equal(reviews.length,1);assert.deepEqual(reviews[0].types,['monitoring','plan_final']);
});
test('all annual periods remain distinct while future preparation is not labeled missing',()=>{
 const store=data();store.settings[0].contractDate='2024-04-15';
 const rows=reminders(store);assert.equal(rows.filter(r=>r.id.startsWith('documents:annual:')).length,2);
 assert.ok(rows.filter(r=>r.items?.length).every(r=>r.basis==='事業所の管理目安'));
 assert.equal(reminders(data(),'2027-03-15').find(r=>r.id==='next-annual')?.date,'2027-04-15');
});
test('current monitoring period uses historical settings and next January preparation crosses year safely',()=>{
 const changed=data();changed.settings.push({...changed.settings[0],revision:2,monitoringMonths:[1],effectiveFrom:'2026-10-19'});
 assert.ok(reminders(changed).some(r=>r.id==='documents:plan:2026-10'));
 assert.equal(reminders(changed,'2026-12-20').find(r=>r.id==='next-monitoring')?.date,'2027-01-01');
});
test('birthday and sibling references are separate from missing documents and use explicit links only',()=>{
 const younger={...child,siblingIds:['older'],birthDate:'2016-04-10'},older={...child,id:'older',name:'架空B',birthDate:'2014-11-20',siblingIds:['a']};
 const family=documentFamilyReference(younger,[younger,older],'2026-10-19');assert.equal(family.eldest?.id,'older');
 const rows=childDocumentReminders(younger,[younger,older],data(),'2026-10-19');
 assert.ok(rows.find(r=>r.id==='siblings')?.reference);assert.match(rows.find(r=>r.id==='birthday')!.detail,/11月/);
 assert.equal(documentFamilyReference(child,[child,{...older,siblingIds:[],name:child.name}],'2026-10-19').siblingCount,0);
 for(const birthDate of ['', '2030-01-01','invalid'])assert.equal(documentFamilyReference(younger,[younger,{...older,birthDate}],'2026-10-19').eldest,undefined);
});
test('canceled and other-child entries cannot satisfy issues and calculations never mutate source data',()=>{
 const plan=entry({id:'p',type:'usage_plan',cycleKey:'annual:2026-04-15',validUntil:''});
 const store=data([plan,{...plan,id:'void',operation:'void',replacesId:'p'},{...plan,id:'foreign',childId:'b'}]),before=JSON.stringify(store);
 assert.ok(items(reminders(store)).some(i=>i.slotKey==='usage_plan|annual:2026-04-15'));
 assert.equal(JSON.stringify(store),before);
});
test('missing fields respect optional dates on contracts and named certificates',()=>{
 const slots=documentSlots('a',data(),'2026-04-15');
 assert.deepEqual(documentMissingFields(slots.find(s=>s.type==='contract')!),['実物の保管確認']);
});

test('many completion combinations never duplicate a document or missing field across colored alerts',()=>{
 for(let mask=0;mask<32;mask++){
  const store=data();store.entries=documentSlots('a',store,'2026-04-15').filter((_,i)=>(mask&(1<<(i%5)))!==0).map((slot,i)=>entry({id:'e'+i,type:slot.type,cycleKey:slot.cycleKey,documentDate:'2026-04-15',validUntil:slot.type==='benefit'?'2027-04-30':'',confirmed:i%2===0}));
  const all=items(reminders(store)),keys=all.map(row=>row.slotKey);
  assert.equal(keys.length,new Set(keys).size,'slot uniqueness for mask '+mask);
  for(const item of all)assert.equal(item.missing.length,new Set(item.missing).size);
 }
});
