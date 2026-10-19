import type {ChildProfile} from '../types';
import {buildSiblingGroupByChild} from './childSiblings';
import {activeDocumentEntries,addDocumentMonths,documentSlots,latestBenefitEntry,latestDocumentSettings,validDocumentDate,DOCUMENT_TYPES,type DocumentRegister,type DocumentSlot,type DocumentType} from './childDocuments';

export const DOCUMENT_RULE_SOURCES = {
 guideline:{label:'放課後等デイサービスガイドライン（こども家庭庁）',url:'https://www.cfa.go.jp/assets/contents/node/basic_page/field_ref_resources/32675809-3f98-486b-9c03-efc695ede0bb/7d644e16/20240710_policies_shougaijishien_shisaku_11.pdf'},
 regional:{label:'受給者証の更新時期（北九州市・地域の参考）',url:'https://www.city.kitakyushu.lg.jp/files/001089726.pdf'},
 household:{label:'同一世帯の複数児童の上限額管理（厚生労働省）',url:'https://www.mhlw.go.jp/content/12200000/001472095.pdf'},
} as const;
export interface DocumentReminderItem {slotKey:string;type:DocumentType;cycleKey:string;label:string;missing:string[];}
export interface DocumentReminder {
 id:string;title:string;detail:string;date?:string;
 level:'overdue'|'soon'|'info';
 basis:'ガイドライン'|'登録情報'|'事業所の管理目安'|'地域の参考'|'条件の確認';
 types:DocumentType[];source?:keyof typeof DOCUMENT_RULE_SOURCES;
 items?:DocumentReminderItem[];reference?:boolean;reviewNotes?:string[];
}
/** Use explicit sibling links, never names/addresses, to form reference groups. */
export function documentFamilyReference(child:ChildProfile,children:ChildProfile[],today:string){
 const groups=buildSiblingGroupByChild(children),group=groups.get(child.id);
 const family=group?children.filter(row=>groups.get(row.id)===group):[child];
 const candidates=family.filter(row=>!row.serviceSuspended);
 const complete=candidates.length>0&&candidates.every(row=>validDocumentDate(row.birthDate||'')&&row.birthDate!<=today);
 const eldest=complete?[...candidates].sort((a,b)=>a.birthDate!.localeCompare(b.birthDate!)||a.id.localeCompare(b.id))[0]:undefined;
 return {siblingCount:family.length-1,eldest,complete,ownBirthMonth:validDocumentDate(child.birthDate||'')&&child.birthDate!<=today?Number(child.birthDate!.slice(5,7)):undefined};
}
/** One source of truth for actual missing fields, rather than a generic count. */
export function documentMissingFields(slot:DocumentSlot):string[]{
 const fields:string[]=[],entry=slot.entry;
 const named=['certificate','additional'].includes(slot.type);
 const dated=!['certificate','additional','contract','important','portrait','privacy'].includes(slot.type);
 if(named&&!entry?.title.trim())fields.push('書類名');
 if(dated&&!entry?.documentDate)fields.push('作成日');
 if(!entry?.confirmed)fields.push('実物の保管確認');
 if(slot.type==='plan_final'&&entry){
  if(!entry.consentDate)fields.push('保護者同意日');
  if(!entry.guardianDeliveryDate)fields.push('保護者交付日');
 }
 return fields;
}
const rank={overdue:0,soon:1,info:2};
export function childDocumentReminders(child:ChildProfile,children:ChildProfile[],register:DocumentRegister,today:string,slots:DocumentSlot[]=documentSlots(child.id,register,today)):DocumentReminder[]{
 if(!validDocumentDate(today))throw Error('確認日を確認してください。');
 const settings=latestDocumentSettings(register.settings,child.id);
 if(!settings)return [{id:'contract',title:'契約日が未登録です',detail:'不足項目：契約日。上の「契約日」を入力して保存してください。未登録のため初回・年次の必要枠は計算できません。',level:'info',basis:'登録情報',types:[]}];
 if(settings.contractDate>today)return [{id:'contract',title:'契約開始前です',date:settings.contractDate,detail:'契約開始日に初回の入力欄を表示します。',level:'info',basis:'登録情報',types:[]}];
 const result:DocumentReminder[]=[],groups=new Map<string,DocumentReminder>();
 const active=activeDocumentEntries(register.entries.filter(row=>row.childId===child.id));
 const near=(date:string)=>addDocumentMonths(date,-1)<=today;
 const level=(date:string):DocumentReminder['level']=>date<today?'overdue':'soon';
 const groupKey=(slot:DocumentSlot)=>{
  if(slot.cycleKey==='initial:'+settings.contractDate||slot.cycleKey==='annual:'+settings.contractDate)return 'initial:'+settings.contractDate;
  if(slot.benefitRenewal||slot.usagePlanRenewal)return 'renewal:'+(slot.benefitRenewal||slot.usagePlanRenewal)!.previousValidUntil;
  return slot.cycleKey;
 };
 const addIssue=(slot:DocumentSlot,fields:string[],reason?:string)=>{
  if(!fields.length)return;
  const key=groupKey(slot);let group=groups.get(key);
  if(!group){
   const title=key.startsWith('initial:')?'初回書類':key.startsWith('annual:')?slot.dueDate+' 年次書類':key.startsWith('plan:')?key.slice(5)+' 更新月の書類':key.startsWith('renewal:')?'受給者証更新分（前回期限 '+slot.dueDate+'）':'追加・個別登録の書類';
   group={id:'documents:'+key,title:title+'：未登録・確認不足',detail:'下記の不足項目を入力し、実物の保管を確認して保存してください。年次・月末の日付は事業所の管理目安であり、一律の法定有効期限ではありません。',date:slot.dueDate,level:level(slot.dueDate),basis:'事業所の管理目安',types:[],items:[]};
   groups.set(key,group);result.push(group);
  }
  let item=group.items!.find(item=>item.slotKey===slot.key);
  if(!item){item={slotKey:slot.key,type:slot.type,cycleKey:slot.cycleKey,label:DOCUMENT_TYPES[slot.type]+'／'+slot.label,missing:[]};group.items!.push(item);}
  item.missing=Array.from(new Set([...item.missing,...fields]));
  group.types=Array.from(new Set([...group.types,slot.type]));
  if(reason&&!group.detail.includes(reason))group.detail+=' '+reason;
 };
 for(const slot of slots)addIssue(slot,documentMissingFields(slot));
 const certificate=latestBenefitEntry(child.id,register,today);
 if(!validDocumentDate(certificate?.validUntil||'')){
  const benefitSlot=certificate?slots.find(slot=>slot.entry?.id===certificate.id):slots.filter(slot=>slot.type==='benefit').at(-1);
  if(benefitSlot)addIssue(benefitSlot,['受給者証の有効期限'],'受給者証の期限が未登録のため、更新時期は確定できません。誕生月からは推測しません。');
 }
 // Fold reviews into pending document periods; otherwise group reviews by due date.
 if(child.careType!=='保育所等訪問支援')for(const type of ['monitoring','plan_final'] as const){
  const last=active.filter(row=>(row.type===type||(type==='plan_final'&&row.type==='monitoring'))&&row.confirmed&&row.documentDate<=today).map(row=>row.documentDate).sort().at(-1)||settings.contractDate;
  const due=addDocumentMonths(last,6);if(!near(due))continue;
  const action=type==='monitoring'?'モニタリングの実施・作成日の確認':'個支本案の見直し要否の確認';
  const reason=`${action}：最終登録日 ${last}（未登録なら契約日）から6か月の確認目安は ${due} です。`;
  const pending=slots.filter(slot=>slot.type===type&&documentMissingFields(slot).length).sort((a,b)=>b.dueDate.localeCompare(a.dueDate))[0];
  if(pending){
   const group=groups.get(groupKey(pending))!;if(!group.detail.includes(reason))group.detail+=' '+reason;
   group.reviewNotes=[...(group.reviewNotes||[]),reason];
   if(rank[level(due)]<rank[group.level])group.level=level(due);group.source='guideline';
  }else{
   let reminder=result.find(row=>row.id==='six-month:'+due);
   if(!reminder){reminder={id:'six-month:'+due,title:'計画見直し・モニタリングの実施確認',date:due,level:level(due),basis:'ガイドライン',types:[],detail:'書類不足の断定ではなく、登録済みの作成日を手掛かりに実施状況の確認を促しています。状態・家庭状況の変化がある場合は6か月を待たず確認してください。',source:'guideline'};result.push(reminder);}
   reminder.detail+=' '+reason;reminder.types.push(type);
  }
 }
 const versions=register.settings.filter(row=>row.childId===child.id).sort((a,b)=>b.revision-a.revision);
 if(!versions.find(row=>row.effectiveFrom<=today)?.monitoringMonths.length)result.push({id:'monitoring-unknown',title:'受給者証のモニタリング月が未登録です',detail:'不足項目：モニタリング更新月。上の契約・更新月設定で、受給者証等に記載された月を選択して保存してください。',level:'info',basis:'登録情報',types:[]});
 let nextYear=Number(today.slice(0,4))-Number(settings.contractDate.slice(0,4));if(addDocumentMonths(settings.contractDate,nextYear*12)<=today)nextYear++;
 const nextAnnual=addDocumentMonths(settings.contractDate,nextYear*12);
 if(near(nextAnnual))result.push({id:'next-annual',title:'次回の年次確認の準備',detail:'対象：アセスメントシート・別表。契約日の年次確認が1か月以内です。内容確認の準備をしてください。未登録の不足アラートではありません。',date:nextAnnual,level:'soon',basis:'事業所の管理目安',types:['assessment','annex']});
 const nextStart=addDocumentMonths(today.slice(0,7)+'-01',1);
 if(versions.find(row=>row.effectiveFrom<=nextStart)?.monitoringMonths.includes(Number(nextStart.slice(5,7))))result.push({id:'next-monitoring',title:'翌月のモニタリング更新の準備',detail:'対象：原案・会議・本案・モニタリング。実施日と計画の変更要否を確認してください。翌月の枠は月初に表示します。',date:nextStart,level:'soon',basis:'登録情報',types:['monitoring','plan_final']});
 const family=documentFamilyReference(child,children,today);
 if(family.siblingCount>0)result.push({id:'siblings',title:'きょうだい利用・世帯情報の確認',detail:'登録きょうだいのサービス利用状況と、利用者負担上限額管理の該当有無・管理事業所を確認する参考情報です。書類不足や提出義務を自動判定したものではありません。',level:'info',basis:'条件の確認',types:['benefit'],source:'household',reference:true});
 if(!validDocumentDate(certificate?.validUntil||'')&&family.eldest){
  const month=Number(family.eldest.birthDate!.slice(5,7)),ownMonth=Number(today.slice(5,7)),nextMonth=ownMonth===12?1:ownMonth+1;
  if(month===ownMonth||month===nextMonth)result.push({id:'birthday',title:'誕生月を手掛かりに更新時期を確認',detail:`名簿上の${family.siblingCount?'利用停止を除く最年長のきょうだい':'本人'}の誕生月は${month}月です。北九州市の地域の参考です。自治体やサービス、きょうだいの利用状況で異なるため実際の受給者証を優先し、期限は自動登録しません。`,level:'info',basis:'地域の参考',types:['benefit'],source:'regional',reference:true});
 }
 return result.sort((a,b)=>rank[a.level]-rank[b.level]||(a.date||'9999').localeCompare(b.date||'9999')||a.id.localeCompare(b.id));
}
