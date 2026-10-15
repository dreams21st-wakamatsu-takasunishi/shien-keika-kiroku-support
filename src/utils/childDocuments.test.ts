import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addDocumentMonths,activeDocumentEntries,canManageChildDocuments,DOCUMENT_CATEGORIES,DOCUMENT_TYPES,groupDocumentSlots,documentSlots,documentWarnings,validDocumentDate,type DocumentRegister,type ChildDocumentSettings,type ChildDocumentEntry} from './childDocuments';
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
