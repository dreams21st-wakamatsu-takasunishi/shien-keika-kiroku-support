import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildChildDocumentCsv} from './childDocumentCsv';
import {additionalDocumentCycleKey, newDocumentEntry, type ChildDocumentEntry} from './childDocuments';

const make=(type:ChildDocumentEntry['type'],key:string,fields:Partial<ChildDocumentEntry>={}) => ({
 ...newDocumentEntry(type,key),childId:'a',createdAt:'2026-05-01T00:00:00Z',createdByName:'出力しない職員名',...fields,
});
const a={id:'a',name:'架空児童A',careType:'放課後等デイサービス' as const,visitingSupportEnabled:true};
const b={id:'b',name:'架空児童B',careType:'保育所等訪問支援' as const};
const asOf='2026-11-23';

test('export includes only the effective registered rows for each chosen child; no old, cancelled, or unlisted data',()=>{
 const certificate=make('certificate',additionalDocumentCycleKey('extra:fixture','certificate','day'),{title:'訂正前の名前'});
 const current={...certificate,id:'latest',title:'登録, "証明書"\n続き',confirmed:true,note:'出力しない内部メモ',replacesId:certificate.id};
 const cancelled=make('additional','extra:cancelled',{title:'取り消された追加書類'});
 const plan=make('plan_final','extra:visit-sample',{documentDate:'2026-11-01',planStartDate:'2026-11-03',consentDate:'2026-11-03',guardianDeliveryDate:'2026-11-03'});
 const other=make('benefit','extra:benefit',{childId:'b',validUntil:'2027-04-01',confirmed:true});
 const excluded=make('certificate','extra:excluded',{childId:'other',title:'一覧対象外'});
 const data={settings:[],entries:[certificate,current,cancelled,{...cancelled,id:'void',operation:'void' as const,replacesId:cancelled.id},plan,other,excluded]};
 const scoped=buildChildDocumentCsv([a],data,asOf);
 const all=buildChildDocumentCsv([a,b],data,asOf);
 assert.equal(scoped.count,2);
 assert.equal(all.count,3);
 assert.ok(all.csv.startsWith('\uFEFF"児童名","カテゴリ"'));
 assert.match(all.csv,/"登録, ""証明書""\n続き"/);
 for(const marker of ['放課後等デイサービス（放デイ）','保育所等訪問支援','保管確認済み','交付・同意済み','2027-04-01','2026-11-03'])assert.ok(all.csv.includes(marker),marker);
 assert.doesNotMatch(scoped.csv,/架空児童B|2027-04-01/);
 assert.doesNotMatch(all.csv,/訂正前の名前|取り消された追加書類|一覧対象外|出力しない|個支原案|個支会議/);
});

test('user-provided spreadsheet formula triggers are escaped and empty registers only produce a header',()=>{
 const entries=['=1+2','   ＠SUM(1)','+1','-1','\tdata'].map((title,index)=>make('certificate','extra:fixture-'+index,{title}));
 const {csv,count}=buildChildDocumentCsv([a],{entries,settings:[]},asOf);
 assert.equal(count,5);
 for(const row of entries)assert.ok(csv.includes('"\''+row.title+'"'),row.title);
 const empty=buildChildDocumentCsv([a],{entries:[],settings:[]},asOf);
 assert.equal(empty.count,0);
 assert.equal(empty.csv.trim().split('\r\n').length,1);
});
