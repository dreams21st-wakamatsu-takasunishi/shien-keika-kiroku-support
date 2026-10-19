import test from 'node:test';
import assert from 'node:assert/strict';
import type {ChildProfile} from '../types';
import {childDocumentReminders,documentFamilyReference} from './childDocumentReminders';
import {usagePlanRenewalCycleKey,type DocumentRegister,type ChildDocumentEntry} from './childDocuments';
const child:ChildProfile={id:'a',name:'架空児童A',birthDate:'2016-11-15',careType:'放課後等デイサービス'};
const entry=(patch:Partial<ChildDocumentEntry>={}):ChildDocumentEntry=>({id:'b',childId:'a',type:'benefit',cycleKey:'extra:one',documentDate:'2026-04-01',validUntil:'2026-11-30',confirmed:true,title:'',note:'',consentDate:'',guardianDeliveryDate:'',consultationDeliveryDate:'',operation:'record',replacesId:null,createdAt:'2026-04-01T00:00:00Z',createdByName:'架空職員',...patch});
const data=(entries:ChildDocumentEntry[]=[]):DocumentRegister=>({settings:[{childId:'a',revision:1,contractDate:'2026-04-15',monitoringMonths:[4,10],effectiveFrom:'2026-04-15',createdAt:'',createdByName:'架空職員'}],entries});
const reminders=(register=data(),date='2026-10-19')=>childDocumentReminders(child,[child],register,date);

test('missing/future contracts have explicit unknown states, without inventing dates',()=>{
 assert.equal(reminders({settings:[],entries:[]})[0].id,'contract');
 const future=data();future.settings[0].contractDate='2027-04-15';
 assert.equal(reminders(future).length,1);assert.match(reminders(future)[0].title,/契約開始前/);
});
test('actual expiry has priority over birthday; one-month notices and past-due severity use exact boundaries',()=>{
 const known=data([entry({validUntil:'2026-12-31'})]);
 assert.ok(!reminders(known,'2026-10-19').some(r=>r.id==='birthday'||r.id==='expiry'));
 assert.equal(reminders(known,'2026-11-30').find(r=>r.id==='expiry')?.level,'soon');
 assert.equal(reminders(known,'2026-12-31').find(r=>r.id==='expiry')?.level,'soon');
 assert.equal(reminders(known,'2027-01-01').find(r=>r.id==='expiry')?.level,'overdue');
});
test('usage-plan reminder remains after certificate renewal and clears only after storage confirmation of exact renewal',()=>{
 const old=entry(),next=entry({id:'next',cycleKey:'extra:next',documentDate:'2026-10-30',validUntil:'2027-11-30'});
 const plan=entry({id:'p',type:'usage_plan',cycleKey:usagePlanRenewalCycleKey(old.validUntil),documentDate:'2026-10-30',validUntil:'',confirmed:false});
 const pending=reminders(data([old,next,plan]),'2026-10-30');
 assert.ok(pending.some(r=>r.id.startsWith('usage:')));
 assert.ok(!reminders(data([old,next,{...plan,confirmed:true}]),'2026-10-30').some(r=>r.id.startsWith('usage:')));
});
test('annual confirmations are marked as local operating guidance, not statutory deadlines',()=>{
 const annual=reminders().find(r=>r.id==='annual')!;
 assert.equal(annual.basis,'事業所の管理目安');assert.match(annual.detail,/一律の法定有効期限ではありません/);
 assert.equal(reminders(data(),'2027-03-15').find(r=>r.id==='next-annual')?.date,'2027-04-15');
});
test('six-month notices start a month early and ignore unconfirmed, future, canceled, and other-child observations',()=>{
 assert.ok(!reminders(data(),'2026-09-14').some(r=>r.id.startsWith('six-month:')));
 assert.equal(reminders(data(),'2026-09-15').find(r=>r.id==='six-month:monitoring')?.date,'2026-10-15');
 const recent=entry({id:'m',type:'monitoring',documentDate:'2026-10-01',validUntil:''});
 assert.ok(!reminders(data([recent])).some(r=>r.id.startsWith('six-month:')));
 for(const invalid of [{...recent,confirmed:false},{...recent,documentDate:'2026-10-20'},{...recent,childId:'b'}])assert.ok(reminders(data([invalid])).some(r=>r.id==='six-month:monitoring'));
 assert.ok(reminders(data([recent,{...recent,id:'v',operation:'void',replacesId:'m'}])).some(r=>r.id==='six-month:monitoring'));
 assert.ok(!childDocumentReminders({...child,careType:'保育所等訪問支援'},[child],data(),'2026-10-19').some(r=>r.id.startsWith('six-month:')));
});
test('registered monitoring month is distinct from the six-month service review and announces next January in December',()=>{
 assert.ok(reminders().some(r=>r.id==='monitoring-month'));
 assert.ok(reminders().some(r=>r.id==='six-month:monitoring'));
 const changed=data();changed.settings.push({...changed.settings[0],revision:2,monitoringMonths:[1],effectiveFrom:'2026-10-19'});
 assert.ok(reminders(changed).some(r=>r.id==='monitoring-month'),'mid-month setting does not erase current month');
 assert.equal(reminders(changed,'2026-12-20').find(r=>r.id==='next-monitoring')?.date,'2027-01-01');
});
test('unknown monitoring months and expiry prompt confirmation, without claiming any document is missing by law',()=>{
 const unknown=data();unknown.settings[0].monitoringMonths=[];
 const rows=reminders(unknown);
 assert.ok(rows.some(r=>r.id==='monitoring-unknown'));
 assert.ok(rows.some(r=>r.id==='expiry-unknown'));
 const birth=rows.find(r=>r.id==='birthday')!;assert.equal(birth.basis,'地域の参考');assert.equal(birth.date,undefined);
});
test('sibling information uses explicit links, considers the eldest active candidate, and does not infer same-name families',()=>{
 const younger={...child,siblingIds:['older'],birthDate:'2016-04-10'},older={...child,id:'older',name:'架空児童B',birthDate:'2014-11-20',siblingIds:['a']};
 const reference=documentFamilyReference(younger,[younger,older],'2026-10-19');
 assert.equal(reference.siblingCount,1);assert.equal(reference.eldest?.id,'older');
 const rows=childDocumentReminders(younger,[younger,older],data(),'2026-10-19');
 assert.ok(rows.some(r=>r.id==='siblings'));assert.match(rows.find(r=>r.id==='birthday')!.detail,/11月/);
 assert.equal(documentFamilyReference(child,[child,{...older,name:child.name,siblingIds:[]}],'2026-10-19').siblingCount,0);
 assert.equal(documentFamilyReference(younger,[younger,{...older,serviceSuspended:true}],'2026-10-19').eldest?.id,'a');
});
test('unknown and future sibling birthdays never determine an eldest birthday; December references next January safely',()=>{
 const linked={...child,siblingIds:['other']};
 for(const birthDate of ['', '2030-01-01','not-a-date'])assert.equal(documentFamilyReference(linked,[linked,{id:'other',name:'架空B',birthDate}],'2026-10-19').eldest,undefined);
 const jan={...child,birthDate:'2016-01-20'};
 assert.ok(childDocumentReminders(jan,[jan],data(),'2026-12-01').some(r=>r.id==='birthday'));
});
test('only guardian consent and delivery prompt dates; removed consultation field is ignored and history retained',()=>{
 const final=entry({id:'p',type:'plan_final',cycleKey:'extra:plan',validUntil:'',consentDate:'2026-04-02',guardianDeliveryDate:'2026-04-02'});
 const store=data([final]),before=JSON.stringify(store);
 assert.ok(!reminders(store).some(r=>r.id==='delivery:p'));
 const missing=reminders(data([{...final,guardianDeliveryDate:''}])).find(r=>r.id==='delivery:p')!;
 assert.ok(missing);assert.ok(!missing.detail.includes('相談支援'));
 assert.ok(reminders(data([{...final,consentDate:''}])).some(r=>r.id==='delivery:p'));
 assert.ok(!reminders(data([{...final,consultationDeliveryDate:'2026-04-02'}])).some(r=>r.id==='delivery:p'));
 assert.equal(JSON.stringify(store),before);
 assert.ok(!reminders(data([{...final,childId:'b'}])).some(r=>r.id==='delivery:p'));
});
