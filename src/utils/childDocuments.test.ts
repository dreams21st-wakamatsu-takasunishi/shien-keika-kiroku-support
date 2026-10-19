import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addDocumentMonths,activeDocumentEntries,benefitRenewalCycleKey,usagePlanRenewalCycleKey,latestBenefitEntry,canManageChildDocuments,DOCUMENT_CATEGORIES,DOCUMENT_TYPES,groupDocumentSlots,documentSlots,documentWarnings,validDocumentDate,type DocumentRegister,type ChildDocumentSettings,type ChildDocumentEntry} from './childDocuments';
const settings=(patch:Partial<ChildDocumentSettings>={}):ChildDocumentSettings=>({childId:'a',revision:1,contractDate:'2024-04-15',monitoringMonths:[4,10],effectiveFrom:'2024-04-15',createdAt:'2024-04-15T00:00:00Z',createdByName:'架空職員',...patch});
const entry=(type:ChildDocumentEntry['type'],cycleKey:string,id='one',patch:Partial<ChildDocumentEntry>={}):ChildDocumentEntry=>({id,childId:'a',type,cycleKey,documentDate:'2026-04-01',title:'',confirmed:true,note:'',validUntil:'',consentDate:'',guardianDeliveryDate:'',consultationDeliveryDate:'',operation:'record',replacesId:null,createdAt:'2026-04-01T00:00:00Z',createdByName:'架空職員',...patch});
const register=(entries:ChildDocumentEntry[]=[],versions=[settings()]):DocumentRegister=>({settings:versions,entries});
test('only admin and manager can read or operate document tracking; delegated classroom/staff roles cannot',()=>{
 for(const role of ['admin','manager'] as const){assert.equal(canManageChildDocuments({role}),true);assert.equal(canManageChildDocuments({role,fieldModeOnly:true}),false);}
 for(const role of ['classroom_manager','staff'] as const)assert.equal(canManageChildDocuments({role}),false);assert.equal(canManageChildDocuments(null),false);
});
test('anniversary dates clamp leap days and month ends without overflow',()=>{
 assert.equal(addDocumentMonths('2024-02-29',12),'2025-02-28');assert.equal(addDocumentMonths('2024-08-31',6),'2025-02-28');assert.equal(validDocumentDate('2026-02-30'),false);assert.equal(validDocumentDate('2026-1-01'),false);
});
test('unknown or future contract dates never imply documents are complete',()=>{
 assert.deepEqual(documentSlots('a',register([],[]),'2026-10-15'),[]);assert.match(documentWarnings('a',register([],[]),'2026-10-15')[0],/未完了/);
 assert.deepEqual(documentSlots('a',register([],[settings({contractDate:'2027-01-01',effectiveFrom:'2027-01-01'})]),'2026-10-15'),[]);
});
test('contract creates all initial forms and exactly four separate contract parts',()=>{
 const slots=documentSlots('a',register(),'2024-04-15');assert.equal(slots.length,12);
 assert.deepEqual(slots.filter(s=>['contract','important','portrait','privacy'].includes(s.type)).map(s=>s.type),['contract','important','portrait','privacy']);
 assert.equal(slots.filter(s=>s.type==='monitoring').length,0);assert.ok(slots.every(s=>s.status==='missing'));
});
test('annual records remain separate for every elapsed contract anniversary',()=>{
 const data=register([entry('assessment','annual:2026-04-15')]),slots=documentSlots('a',data,'2026-10-15').filter(s=>s.type==='assessment');
 assert.deepEqual(slots.map(s=>s.dueDate),['2024-04-15','2025-04-15','2026-04-15']);assert.deepEqual(slots.map(s=>s.status),['missing','missing','complete']);
});
test('monitoring months recur through the present month but cannot create future or duplicate initial-month cycles',()=>{
 const slots=documentSlots('a',register(),'2026-10-15').filter(s=>s.type==='monitoring');assert.deepEqual(slots.map(s=>s.cycleKey),['plan:2024-10','plan:2025-04','plan:2025-10','plan:2026-04','plan:2026-10']);assert.equal(slots.at(-1)?.status,'upcoming');assert.equal(slots.at(-1)?.dueDate,'2026-10-31');
});
test('monitoring month changes preserve past periods and only apply on/after their effective date',()=>{
 const slots=documentSlots('a',register([],[settings(),settings({revision:2,monitoringMonths:[3,9],effectiveFrom:'2026-06-01'})]),'2026-10-15').filter(s=>s.type==='monitoring');
 assert.deepEqual(slots.map(s=>s.cycleKey),['plan:2024-10','plan:2025-04','plan:2025-10','plan:2026-04','plan:2026-09']);
});
test('mid-month changes cannot erase the checklist already due in the current month',()=>{
 const slots=documentSlots('a',register([],[settings(),settings({revision:2,monitoringMonths:[3,9],effectiveFrom:'2026-10-15'})]),'2026-10-15');
 assert.ok(slots.some(s=>s.type==='monitoring'&&s.cycleKey==='plan:2026-10'));
});
test('every additional final plan requires its own draft and meeting; an unrelated meeting cannot satisfy it',()=>{
 const slots=documentSlots('a',register([entry('plan_final','extra:one'),entry('plan_final','extra:two','two'),entry('plan_meeting','extra:one','meeting')]),'2026-10-15');
 assert.equal(slots.find(s=>s.type==='plan_meeting'&&s.cycleKey==='extra:one')?.status,'complete');assert.equal(slots.find(s=>s.type==='plan_meeting'&&s.cycleKey==='extra:two')?.status,'missing');assert.equal(slots.filter(s=>s.type==='plan_draft'&&s.cycleKey.startsWith('extra')).length,2);
});
test('corrections and cancellations keep the full source history and only affect their exact slot',()=>{
 const old=entry('assessment','annual:2024-04-15'),correction=entry('assessment','annual:2024-04-15','two',{replacesId:'one',documentDate:'2024-04-16'}),cancel=entry('assessment','annual:2024-04-15','three',{replacesId:'two',operation:'void'});
 assert.deepEqual(activeDocumentEntries([old,correction]).map(s=>s.id),['two']);assert.deepEqual(activeDocumentEntries([old,correction,cancel]),[]);assert.equal([old,correction,cancel].length,3);
 assert.equal(documentSlots('a',register([old,correction,cancel]),'2026-10-15').find(s=>s.type==='assessment'&&s.cycleKey==='annual:2024-04-15')?.status,'missing');
});
test('date-only entries without actual storage confirmation remain unconfirmed',()=>{
 const slots=documentSlots('a',register([entry('assessment','annual:2026-04-15','one',{confirmed:false})]),'2026-10-15');assert.equal(slots.find(s=>s.type==='assessment'&&s.cycleKey==='annual:2026-04-15')?.status,'unconfirmed');
});
test('named certificates support multiple independent records without creation dates',()=>{
 const slots=documentSlots('a',register([entry('certificate','extra:a','one',{title:'診断書',documentDate:''}),entry('certificate','extra:b','two',{title:'手帳コピー',documentDate:''})]),'2026-10-15').filter(s=>s.type==='certificate');assert.equal(slots.length,2);assert.ok(slots.every(s=>s.status==='complete'&&!s.required));
});
test('six-month monitoring, unknown month, expiration and consent alerts stay distinct from annual operating slots',()=>{
 let warnings=documentWarnings('a',register(), '2026-10-15');assert.ok(warnings.some(s=>s.includes('6か月')));
 warnings=documentWarnings('a',register([entry('monitoring','extra:recent','m',{documentDate:'2026-09-01'})]),'2026-10-15');assert.ok(!warnings.some(s=>s.includes('6か月')));
 assert.ok(!documentWarnings('a',register(),'2026-10-15',false).some(s=>s.includes('6か月')));
 warnings=documentWarnings('a',register([entry('benefit','annual:2026-04-15','b',{validUntil:'2026-09-30'}),entry('plan_final','extra:p','p')],[settings({monitoringMonths:[]})]),'2026-10-15');for(const marker of ['更新月が未登録','有効期限','保護者の同意'])assert.ok(warnings.some(s=>s.includes(marker)),marker);
});

test('document categories cover every form exactly once, including optional named documents',()=>{
 const types=DOCUMENT_CATEGORIES.flatMap(category=>[...category.types]);
 assert.equal(new Set(types).size,types.length);
 assert.deepEqual([...types].sort(),Object.keys(DOCUMENT_TYPES).sort());
 assert.equal(groupDocumentSlots([]).length,5);
});

test('category summaries count current registrations separately from storage confirmations and keep all years',()=>{
 const data=register([entry('assessment','annual:2024-04-15','old',{documentDate:'2024-04-16'}),entry('assessment','annual:2026-04-15','recent',{documentDate:'2026-04-18',confirmed:false})]);
 const slots=documentSlots('a',data,'2026-10-15'),before=JSON.stringify(slots),groups=groupDocumentSlots(slots);
 const assessment=groups.find(category=>category.id==='assessment')!.groups.find(group=>group.type==='assessment')!;
 assert.equal(assessment.required,3);assert.equal(assessment.registered,2);assert.equal(assessment.confirmed,1);assert.equal(assessment.pending,2);assert.equal(assessment.latestDate,'2026-04-18');
 assert.equal(assessment.slots.length,3);assert.equal(JSON.stringify(slots),before);
});

test('category summaries do not count canceled history or treat undated certificates as missing',()=>{
 const original=entry('certificate','extra:one','cert',{documentDate:'',title:'診断書'}),cancel={...original,id:'void',operation:'void' as const,replacesId:'cert'},other=entry('certificate','extra:two','other',{documentDate:'',title:'手帳コピー'});
 const certificate=groupDocumentSlots(documentSlots('a',register([original,cancel,other]),'2026-10-15')).find(category=>category.id==='other')!.groups.find(group=>group.type==='certificate')!;
 assert.equal(certificate.registered,1);assert.equal(certificate.confirmed,1);assert.equal(certificate.required,0);assert.equal(certificate.pending,0);assert.equal(certificate.latestDate,'');assert.equal(certificate.slots[0].entry?.title,'手帳コピー');
});

test('benefit renewal appears exactly one calendar month before expiry without changing stored history',()=>{
 const data=register([entry('benefit','annual:2026-04-15','b',{validUntil:'2026-11-30'})]),before=JSON.stringify(data);
 assert.equal(documentSlots('a',data,'2026-10-29').filter(s=>s.benefitRenewal).length,0);
 const rows=documentSlots('a',data,'2026-10-30').filter(s=>s.benefitRenewal);
 assert.equal(rows.length,1);assert.equal(rows[0].cycleKey,benefitRenewalCycleKey('2026-11-30'));
 assert.equal(rows[0].entry,undefined);assert.equal(rows[0].dueDate,'2026-11-30');assert.equal(rows[0].status,'upcoming');
 assert.equal(rows[0].benefitRenewal?.availableFrom,'2026-10-30');assert.equal(JSON.stringify(data),before);
 assert.ok(documentWarnings('a',data,'2026-10-30').some(w=>w.includes('1か月以内')));
 assert.ok(!documentWarnings('a',data,'2026-10-29').some(w=>w.includes('1か月以内')));
});
test('benefit renewal month-end thresholds clamp leap days and cross the year correctly',()=>{
 for(const [expiry,dayBefore,first] of [['2026-03-31','2026-02-27','2026-02-28'],['2028-03-31','2028-02-28','2028-02-29'],['2027-01-31','2026-12-30','2026-12-31']]){
  const data=register([entry('benefit','extra:old','b',{documentDate:'2024-05-01',validUntil:expiry,confirmed:false})]);
  assert.ok(!documentSlots('a',data,dayBefore).some(s=>s.benefitRenewal));
  assert.equal(documentSlots('a',data,first).find(s=>s.benefitRenewal)?.benefitRenewal?.availableFrom,first);
 }
});
test('duplicate copies with the same expiry produce one renewal and no other child is used',()=>{
 const old=entry('benefit','extra:a','a',{validUntil:'2026-11-30'}),other=entry('benefit','extra:b','b',{validUntil:'2026-11-30'}),foreign={...old,id:'foreign',childId:'b',validUntil:'2026-10-31'};
 const rows=documentSlots('a',register([old,other,foreign]),'2026-10-30').filter(s=>s.benefitRenewal);
 assert.equal(rows.length,1);assert.equal(rows[0].dueDate,'2026-11-30');
});
test('missing or voided expiry does not manufacture dates or renewal documents',()=>{
 const old=entry('benefit','extra:old','b',{validUntil:'2026-11-30'}),voided={...old,id:'void',operation:'void' as const,replacesId:'b'};
 for(const entries of [[{...old,validUntil:''}],[old,voided]])assert.ok(!documentSlots('a',register(entries),'2026-12-01').some(s=>s.benefitRenewal));
 assert.equal(latestBenefitEntry('a',register([old,voided]),'2026-12-01'),undefined);
});
test('a saved renewed certificate remains independent and only the next expiry opens a new slot',()=>{
 const old=entry('benefit','annual:2026-04-15','old',{validUntil:'2026-11-30'});
 const renewed=entry('benefit',benefitRenewalCycleKey(old.validUntil),'new',{documentDate:'2026-10-30',validUntil:'2027-11-30',createdAt:'2026-10-30T00:00:00Z'});
 const data=register([old,renewed]),rows=documentSlots('a',data,'2026-10-30').filter(s=>s.benefitRenewal);
 assert.equal(rows.length,1);assert.equal(rows[0].entry?.id,'new');assert.equal(rows[0].status,'complete');
 assert.equal(latestBenefitEntry('a',data,'2026-10-30')?.validUntil,'2027-11-30');
 assert.equal(documentSlots('a',data,'2027-10-30').filter(s=>s.benefitRenewal).length,2);
 assert.equal(old.validUntil,'2026-11-30');assert.equal(old.documentDate,'2026-04-01');
});
test('an already registered successor avoids historical missing renewal rows but preserves saved renewals after source cancellation',()=>{
 const old=entry('benefit','extra:old','old',{validUntil:'2026-11-30'}),next=entry('benefit','extra:new','new',{documentDate:'2026-10-30',validUntil:'2027-11-30'});
 assert.ok(!documentSlots('a',register([old,next]),'2026-12-01').some(s=>s.benefitRenewal));
 const saved={...next,cycleKey:benefitRenewalCycleKey(old.validUntil)},voided={...old,id:'void',operation:'void' as const,replacesId:'old'};
 assert.equal(documentSlots('a',register([old,saved,voided]),'2026-12-01').find(s=>s.cycleKey===saved.cycleKey)?.label,'更新分（前回期限 2026-11-30）');
});
test('expiry day stays valid, the following day is expired, and corrections use the corrected expiry only',()=>{
 const old=entry('benefit','extra:old','old',{validUntil:'2026-11-30'});
 assert.ok(!documentWarnings('a',register([old]),'2026-11-30').some(w=>w.includes('過ぎています')));
 assert.ok(documentWarnings('a',register([old]),'2026-12-01').some(w=>w.includes('過ぎています')));
 const correction={...old,id:'corrected',replacesId:'old',validUntil:'2026-12-31'};
 assert.ok(!documentSlots('a',register([old,correction]),'2026-10-30').some(s=>s.benefitRenewal));
 assert.equal(documentSlots('a',register([old,correction]),'2026-11-30').filter(s=>s.benefitRenewal).length,1);
});
test('current certificate is chosen by issue history, not by the longest expiry or storage confirmation',()=>{
 const old=entry('benefit','extra:old','old',{validUntil:'2027-12-31'}),current=entry('benefit','extra:current','current',{documentDate:'2026-09-01',validUntil:'2026-11-30',confirmed:false});
 assert.equal(documentSlots('a',register([old,current]),'2026-10-30').find(s=>s.benefitRenewal)?.dueDate,'2026-11-30');
 assert.ok(documentWarnings('a',register([old,current]),'2026-10-30').some(w=>w.includes('1か月以内')));
 assert.ok(!documentSlots('a',register([old,{...current,validUntil:''}]),'2027-12-31').some(s=>s.benefitRenewal));
});

test('usage-plan renewal opens one calendar month before the registered expiry and never copies dates',()=>{
 const data=register([entry('benefit','annual:2026-04-15','b',{validUntil:'2026-11-30'})]);
 assert.ok(!documentSlots('a',data,'2026-10-29').some(s=>s.usagePlanRenewal));
 const renewal=documentSlots('a',data,'2026-10-30').find(s=>s.usagePlanRenewal)!;
 assert.equal(renewal.cycleKey,usagePlanRenewalCycleKey('2026-11-30'));
 assert.equal(renewal.entry,undefined);assert.equal(renewal.status,'upcoming');
 assert.equal(renewal.usagePlanRenewal?.availableFrom,'2026-10-30');
 assert.equal(renewal.dueDate,'2026-11-30');
});
test('registering a new certificate does not erase its pending usage-plan renewal',()=>{
 const old=entry('benefit','extra:old','old',{validUntil:'2026-11-30'}),next=entry('benefit',benefitRenewalCycleKey(old.validUntil),'next',{documentDate:'2026-10-30',validUntil:'2027-11-30'});
 const data=register([old,next]),before=JSON.stringify(data);
 assert.equal(documentSlots('a',data,'2026-10-30').find(s=>s.usagePlanRenewal)?.status,'upcoming');
 assert.equal(documentSlots('a',data,'2026-12-01').find(s=>s.usagePlanRenewal)?.status,'missing');
 assert.equal(JSON.stringify(data),before);
});
test('saved usage-plan renewals stay separate from originals and survive certificate cancellation',()=>{
 const benefit=entry('benefit','extra:old','b',{validUntil:'2026-11-30'}),oldPlan=entry('usage_plan','annual:2026-04-15','oldPlan');
 const renewal=entry('usage_plan',usagePlanRenewalCycleKey(benefit.validUntil),'renewal',{documentDate:'2026-10-30',confirmed:false});
 const data=register([benefit,oldPlan,renewal,{...benefit,id:'void',operation:'void',replacesId:'b'}]);
 const slot=documentSlots('a',data,'2026-12-01').find(s=>s.usagePlanRenewal)!;
 assert.equal(slot.entry?.id,'renewal');assert.equal(slot.status,'unconfirmed');
 assert.equal(slot.usagePlanRenewal?.previousValidUntil,'2026-11-30');
 assert.equal(documentSlots('a',data,'2026-12-01').find(s=>s.entry?.id==='oldPlan')?.status,'complete');
});
test('explicit expiry suppresses only unsaved anniversary placeholders; saved annual history is retained',()=>{
 const benefit=entry('benefit','annual:2026-04-15','b',{validUntil:'2026-11-30'});
 const plan=entry('usage_plan','annual:2025-04-15','p',{documentDate:'2025-04-15'});
 const slots=documentSlots('a',register([benefit,plan]),'2026-10-30');
 assert.ok(!slots.some(s=>s.type==='usage_plan'&&s.cycleKey==='annual:2026-04-15'));
 assert.equal(slots.find(s=>s.cycleKey==='annual:2025-04-15'&&s.type==='usage_plan')?.entry?.id,'p');
 assert.ok(slots.some(s=>s.type==='usage_plan'&&s.cycleKey==='annual:2024-04-15'));
 assert.equal(slots.filter(s=>s.usagePlanRenewal).length,1);
});
test('usage-plan renewals deduplicate same expiry copies and ignore unknown, voided and other-child sources',()=>{
 const benefit=entry('benefit','extra:one','b',{validUntil:'2026-11-30'});
 assert.equal(documentSlots('a',register([benefit,{...benefit,id:'copy',cycleKey:'extra:two'}]),'2026-10-30').filter(s=>s.usagePlanRenewal).length,1);
 for(const rows of [[{...benefit,validUntil:''}],[{...benefit,childId:'b'}],[benefit,{...benefit,id:'void',operation:'void' as const,replacesId:'b'}]])assert.ok(!documentSlots('a',register(rows),'2026-12-01').some(s=>s.usagePlanRenewal));
});
