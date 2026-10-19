// Synthetic metadata only; service calls are replaced, no production connection.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ChildDocumentWorkspace} from '../../src/components/ChildDocumentWorkspace';
import {ChildrenManager} from '../../src/components/ChildrenManager';
import type {DocumentRegister} from '../../src/utils/childDocuments';
import {documentSlots} from '../../src/utils/childDocuments';
import type {ChildDocumentApi} from '../../src/services/childDocumentService';
import '../../src/index.css';
const mode=new URLSearchParams(location.search).get('mode')||'normal',role=new URLSearchParams(location.search).get('role')||'admin';
const children=[{id:'a',name:'架空児童A',careType:'放課後等デイサービス',regularDays:['月','金'],grade:'小学2年生'},{id:'b',name:'架空児童B',careType:'保育所等訪問支援',regularDays:[],grade:'小学1年生'}] as any;
const user={id:'synthetic-manager',organizationId:'synthetic-org',displayName:'架空管理者',role} as any;
const store='fixture-child-documents-v1';
let records:DocumentRegister={settings:mode==='empty'?[]:[{childId:'a',revision:1,contractDate:'2024-04-15',monitoringMonths:[4,10],effectiveFrom:'2024-04-15',createdAt:'2024-04-15T00:00:00Z',createdByName:'架空管理者'}],entries:[]};
if(mode==='benefit-expiry'||mode==='usage-renewal')records.entries.push({id:'fictional-benefit',childId:'a',type:'benefit',cycleKey:'annual:2026-04-15',documentDate:'2026-04-01',validUntil:'2026-11-30',confirmed:true,title:'',note:'既存の保管場所',consentDate:'',guardianDeliveryDate:'',consultationDeliveryDate:'',operation:'record',replacesId:null,createdAt:'2026-04-01T00:00:00Z',createdByName:'架空管理者'});
if(mode==='usage-renewal')records.entries.push({...records.entries[0],id:'fictional-plan',type:'usage_plan',cycleKey:'annual:2026-04-15',validUntil:''});
if(mode==='family-reminders'){
 children[0].birthDate='2016-04-15';children[0].siblingIds=['b'];
 children[1].birthDate='2014-11-20';children[1].siblingIds=['a'];
}
if(mode==='document-deletion'){
 const base={childId:'a',type:'certificate' as const,cycleKey:'extra:mistake',documentDate:'',validUntil:'',confirmed:true,title:'誤追加の証明書',note:'',consentDate:'',guardianDeliveryDate:'',consultationDeliveryDate:'',operation:'record' as const,replacesId:null,createdAt:'2026-10-01T00:00:00Z',createdByName:'架空管理者'};
 records.entries.push({...base,id:'mistake'},{...base,id:'keep',cycleKey:'extra:keep',title:'残す証明書'},
  {...base,id:'other-child',childId:'b',cycleKey:'extra:other',title:'別児童の証明書'},
  {...base,id:'annual',type:'assessment',cycleKey:'annual:2026-04-15',documentDate:'2026-04-15',title:''},
  {...base,id:'extra-plan',type:'plan_final',cycleKey:'extra:mistaken-plan',documentDate:'2026-10-01',title:''});
}
if(mode==='legacy-consultation')records.entries.push({id:'legacy-plan',childId:'a',type:'plan_final',cycleKey:'extra:legacy-plan',documentDate:'2026-10-01',validUntil:'',confirmed:true,title:'',note:'既存の記載',consentDate:'2026-10-01',guardianDeliveryDate:'2026-10-01',consultationDeliveryDate:'2026-10-02',operation:'record',replacesId:null,createdAt:'2026-10-02T00:00:00Z',createdByName:'架空管理者'});
if(mode==='alert-details'){
 records.settings[0].contractDate='2026-10-01';records.settings[0].effectiveFrom='2026-10-01';
 records.entries=documentSlots('a',records,'2026-10-01').filter(slot=>slot.type!=='usage_plan').map((slot,index)=>({id:'filled-'+index,childId:'a',type:slot.type,cycleKey:slot.cycleKey,documentDate:'2026-10-01',validUntil:slot.type==='benefit'?'2027-11-30':'',confirmed:slot.type!=='assessment',title:'',note:'',consentDate:slot.type==='plan_final'?'2026-10-01':'',guardianDeliveryDate:'',consultationDeliveryDate:'',operation:'record',replacesId:null,createdAt:'2026-10-01T00:00:00Z',createdByName:'架空管理者'}));
}
const model={loads:0,writes:0,settingsWrites:0,failLoad:mode==='load-error',failSave:false,delay:0};
const persist=()=>localStorage.setItem(store,JSON.stringify(records));persist();Object.assign(window,{__documentFixture:model});
const wait=async()=>{if(model.delay)await new Promise(resolve=>setTimeout(resolve,model.delay));};
const api:ChildDocumentApi={load:async()=>{model.loads++;await wait();if(model.failLoad)throw Error('確認用の通信エラー：保管状況を取得できません。');return structuredClone(records);},
 settings:async(childId,revision,contractDate,monitoringMonths,effectiveFrom)=>{await wait();if(model.failSave)throw Error('設定を共有保存できませんでした。');const next={childId,revision:revision+1,contractDate,monitoringMonths,effectiveFrom,createdAt:new Date().toISOString(),createdByName:user.displayName};records.settings.push(next);model.settingsWrites++;persist();return structuredClone(next);},
 entry:async(childId,entry)=>{await wait();if(model.failSave)throw Error('共有保存できませんでした。入力は残しています。');const next={...entry,childId,createdAt:new Date().toISOString(),createdByName:user.displayName};records.entries=records.entries.filter(row=>row.id!==entry.id);records.entries.push(next);model.writes++;persist();return structuredClone(next);},
};
function Fixture(){const [dirty,setDirty]=useState(false);return <main className="app-background min-h-screen mx-auto max-w-[1500px] p-3"><p className="mb-3 rounded-xl bg-slate-950 p-3 text-xs font-bold text-white">Dサポート 保管書類／架空データの検証画面</p>{mode==='roster'?<ChildrenManager currentUser={user} childrenList={children} canEdit onAddChild={()=>{}} onUpdateChild={()=>{}} onDeleteChild={()=>{}}/>:<ChildDocumentWorkspace user={user} childrenList={children} api={api} onDirtyChange={setDirty}/>}<output data-testid="dirty" className="block text-xs">{dirty?'未保存の入力あり':'未保存の入力なし'}</output></main>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
