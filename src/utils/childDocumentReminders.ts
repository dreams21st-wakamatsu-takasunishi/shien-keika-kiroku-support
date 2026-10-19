import type {ChildProfile} from '../types';
import {buildSiblingGroupByChild} from './childSiblings';
import {
 activeDocumentEntries, addDocumentMonths, documentSlots, latestBenefitEntry,
 latestDocumentSettings, validDocumentDate,
 type DocumentRegister, type DocumentSlot, type DocumentType,
} from './childDocuments';

export const DOCUMENT_RULE_SOURCES = {
 guideline: {label:'放課後等デイサービスガイドライン（こども家庭庁）',url:'https://www.cfa.go.jp/assets/contents/node/basic_page/field_ref_resources/32675809-3f98-486b-9c03-efc695ede0bb/7d644e16/20240710_policies_shougaijishien_shisaku_11.pdf'},
 regional: {label:'受給者証の更新時期（北九州市・地域の参考）',url:'https://www.city.kitakyushu.lg.jp/files/001089726.pdf'},
 household: {label:'同一世帯の複数児童の上限額管理（厚生労働省）',url:'https://www.mhlw.go.jp/content/12200000/001472095.pdf'},
} as const;
export interface DocumentReminder {
 id:string;
 title:string;
 detail:string;
 date?:string;
 level:'overdue'|'soon'|'info';
 basis:'ガイドライン'|'登録情報'|'事業所の管理目安'|'地域の参考'|'条件の確認';
 types:DocumentType[];
 source?:keyof typeof DOCUMENT_RULE_SOURCES;
}

/** Only saved sibling links/groups are used; never infer family from a surname. */
export function documentFamilyReference(child:ChildProfile,children:ChildProfile[],today:string) {
 const groupMap=buildSiblingGroupByChild(children);
 const group=groupMap.get(child.id);
 const family=group?children.filter(row=>groupMap.get(row.id)===group):[child];
 const candidates=family.filter(row=>!row.serviceSuspended);
 const complete=candidates.length>0&&candidates.every(row=>validDocumentDate(row.birthDate||'')&&row.birthDate! <= today);
 const eldest=complete?[...candidates].sort((a,b)=>a.birthDate!.localeCompare(b.birthDate!)||a.id.localeCompare(b.id))[0]:undefined;
 return {siblingCount:family.length-1,eldest,complete,
   ownBirthMonth:validDocumentDate(child.birthDate||'')&&child.birthDate! <= today?Number(child.birthDate!.slice(5,7)):undefined};
}

export function childDocumentReminders(child:ChildProfile,children:ChildProfile[],register:DocumentRegister,today:string,slots:DocumentSlot[]=documentSlots(child.id,register,today)):DocumentReminder[] {
 if(!validDocumentDate(today))throw Error('確認日を確認してください。');
 const settings=latestDocumentSettings(register.settings,child.id);
 if(!settings)return [{id:'contract',title:'契約日を登録してください',detail:'契約日が未登録のため、契約時・年次の確認時期を計算できません。日付は推測せず登録してください。',level:'info',basis:'登録情報',types:[]}];
 if(settings.contractDate>today)return [{id:'contract',title:'契約開始前です',date:settings.contractDate,detail:'契約開始日に初回の書類枠を表示します。',level:'info',basis:'登録情報',types:[]}];
 const result:DocumentReminder[]=[];
 const active=activeDocumentEntries(register.entries.filter(row=>row.childId===child.id));
 const near=(date:string)=>addDocumentMonths(date,-1)<=today;
 const level=(date:string):DocumentReminder['level']=>date<today?'overdue':'soon';
 const add=(reminder:DocumentReminder)=>result.push(reminder);
 const initial=slots.filter(row=>row.required&&row.cycleKey.includes(settings.contractDate)&&row.status!=='complete');
 if(initial.length)add({id:'initial',title:'契約時の保管確認が残っています',detail:`初回の書類 ${initial.length}件が未入力・保管未確認です。契約書、同意書、初回計画等の実物を確認してください。`,date:settings.contractDate,level:'soon',basis:'登録情報',types:[...new Set(initial.map(row=>row.type))]});

 // Existing annual categories are local management conventions, not universal
 // statutory one-year expiry dates. The certificate expiry takes precedence.
 const annual=slots.filter(row=>row.cycleKey.startsWith('annual:'));
 const annualDate=annual.map(row=>row.dueDate).sort().at(-1);
 if(annualDate){
  const pending=annual.filter(row=>row.dueDate===annualDate&&row.status!=='complete');
  if(pending.length)add({id:'annual',title:'年次書類の確認目安です',detail:'契約日を基準にした事業所の管理目安です。アセスメント・別表等の内容を確認し、変更や指定権者の指示に応じて更新してください。一律の法定有効期限ではありません。',date:annualDate,level:level(annualDate),basis:'事業所の管理目安',types:pending.map(row=>row.type)});
 }
 let nextYear=Number(today.slice(0,4))-Number(settings.contractDate.slice(0,4));
 if(addDocumentMonths(settings.contractDate,nextYear*12)<=today)nextYear++;
 const nextAnnual=addDocumentMonths(settings.contractDate,nextYear*12);
 if(near(nextAnnual))add({id:'next-annual',title:'次の年次確認が近づいています',detail:'契約日の年次確認が1か月以内です。現状の聞き取りや書類更新の準備をしてください。年次枠は確認日に表示します。',date:nextAnnual,level:'soon',basis:'事業所の管理目安',types:['assessment','annex']});

 const certificate=latestBenefitEntry(child.id,register,today);
 if(!validDocumentDate(certificate?.validUntil||''))add({id:'expiry-unknown',title:'受給者証の有効期限を確認してください',detail:'有効期限が未登録のため、受給者証と利用計画の更新時期を確定できません。誕生月から期限を自動登録することはありません。',level:'info',basis:'登録情報',types:['benefit']});
 else if(near(certificate!.validUntil))add({id:'expiry',title:certificate!.validUntil<today?'受給者証の登録期限を過ぎています':'受給者証の更新時期です',detail:'記載された有効期限を基準に、1か月前から更新後の受給者証・利用計画の入力欄を表示します。自治体・相談支援へ手続きと交付状況を確認してください。',date:certificate!.validUntil,level:level(certificate!.validUntil),basis:'登録情報',types:['benefit','usage_plan']});
 const pendingUsage=slots.filter(row=>row.usagePlanRenewal&&row.status!=='complete');
 for(const slot of pendingUsage)add({id:'usage:'+slot.cycleKey,title:'更新後の利用計画を確認・登録してください',detail:'受給者証更新に伴う利用計画の保管確認が残っています。受給者証を先に登録してもこの確認は残ります。作成・交付時期は相談支援等へ確認し、既存分は上書きしません。',date:slot.dueDate,level:level(slot.dueDate),basis:'事業所の管理目安',types:['usage_plan']});

 const versions=register.settings.filter(row=>row.childId===child.id).sort((a,b)=>b.revision-a.revision);
 const current=versions.find(row=>row.effectiveFrom<=today);
 if(!current?.monitoringMonths.length)add({id:'monitoring-unknown',title:'受給者証のモニタリング月が未登録です',detail:'受給者証・相談支援から指定された月を確認してください。放デイ自身の6か月ごとの確認とは別に扱います。',level:'info',basis:'登録情報',types:[]});
 const period=today.slice(0,7),periodStart=period+'-01';
 // Match the same effective-date rule used for monthly slots.
 const monthly=versions.find(row=>row.effectiveFrom<=periodStart);
 if(period>settings.contractDate.slice(0,7)&&monthly?.monitoringMonths.includes(Number(period.slice(5)))){
  const pending=slots.filter(row=>row.cycleKey==='plan:'+period&&row.status!=='complete');
  if(pending.length)add({id:'monitoring-month',title:'今月は登録されたモニタリング更新月です',detail:'受給者証の指定月に基づく確認です。相談支援の実施日・計画の変更要否を確認し、対応した原案・会議・本案・モニタリングを登録してください。月末表示はアプリの確認目安です。',date:pending[0].dueDate,level:level(pending[0].dueDate),basis:'登録情報',types:pending.map(row=>row.type)});
 }
 // Notify a month early, including December -> January, without creating an
 // invented statutory deadline or replacing the current month's historical row.
 const nextStart=addDocumentMonths(periodStart,1),nextVersion=versions.find(row=>row.effectiveFrom<=nextStart);
 if(nextVersion?.monitoringMonths.includes(Number(nextStart.slice(5,7))))add({id:'next-monitoring',title:'翌月はモニタリング更新月です',detail:'日程・相談支援との連絡を確認してください。更新月の入力枠は月初に表示します。',date:nextStart,level:'soon',basis:'登録情報',types:['monitoring','plan_final']});

 if(child.careType!=='保育所等訪問支援'){
  for(const [type,title,detail] of [
   ['monitoring','放デイのモニタリング','支援の実施状況・目標達成度を確認し、結果をモニタリングとして登録してください。'],
   ['plan_final','放デイの個別支援計画の見直し','見直しの必要性を確認してください。変更する場合は原案・会議・同意／交付を含めた本案を追加登録してください。日付の登録だけで見直し完了とは判定しません。'],
  ] as const){
   const last=active.filter(row=>(row.type===type||(type==='plan_final'&&row.type==='monitoring'))&&row.confirmed&&row.documentDate<=today).map(row=>row.documentDate).sort().at(-1)||settings.contractDate;
   const due=addDocumentMonths(last,6);
   if(near(due))add({id:'six-month:'+type,title:title+'の確認時期です',detail:`保管確認済みの${type==='monitoring'?'モニタリング':'本案・モニタリング'}の最終作成日（未登録なら契約日）から6か月を目安に表示しています。${detail} 状態や家庭状況が変わった場合は6か月を待たず確認してください。`,date:due,level:level(due),basis:'ガイドライン',types:type==='monitoring'?['monitoring']:['plan_draft','plan_meeting','plan_final'],source:'guideline'});
  }
 }
 for(const plan of active.filter(row=>row.type==='plan_final'&&row.confirmed)){
  if(!plan.consentDate||!plan.guardianDeliveryDate)add({id:'delivery:'+plan.id,title:`個支本案 ${plan.documentDate}の同意・交付確認`,detail:'保護者の同意・保護者への交付について、未登録の確認日があります。実施状況を確認してください。',date:plan.documentDate,level:'soon',basis:'ガイドライン',types:['plan_final'],source:'guideline'});
 }
 const family=documentFamilyReference(child,children,today);
 if(family.siblingCount>0)add({id:'siblings',title:'きょうだい利用・世帯情報の確認',detail:'登録されたきょうだいのサービス利用状況、利用者負担上限額管理の該当有無・管理事業所を確認してください。きょうだいがいるだけで必要書類や期限は確定しません。事業所外の利用・卒業等も確認が必要です。',level:'info',basis:'条件の確認',types:['benefit'],source:'household'});
 if(!validDocumentDate(certificate?.validUntil||'')&&family.eldest){
  const month=Number(family.eldest.birthDate!.slice(5,7));
  const ownMonth=Number(today.slice(5,7)),nextMonth=ownMonth===12?1:ownMonth+1;
  if(month===ownMonth||month===nextMonth)add({id:'birthday',title:'誕生月を手掛かりに更新時期を確認',detail:`名簿上の${family.siblingCount?'利用停止を除く最年長のきょうだい':'本人'}の誕生月は${month}月です。北九州市の取扱いを参考表示していますが、自治体やサービス、きょうだいの利用状況により異なります。実際の受給者証を優先してください。期限や未提出は断定しません。`,level:'info',basis:'地域の参考',types:['benefit'],source:'regional'});
 }
 const rank={overdue:0,soon:1,info:2};
 return result.sort((a,b)=>rank[a.level]-rank[b.level]||(a.date||'9999').localeCompare(b.date||'9999')||a.id.localeCompare(b.id));
}
