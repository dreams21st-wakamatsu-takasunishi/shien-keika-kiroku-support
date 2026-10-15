import type {RecordDraftSummary} from '../types';

export interface RecordEntryIdentity {userId?:string;recorderId?:string}
export interface RecordEntryRequest {date:string;childId?:string;manage?:boolean}
export interface RecordEntryLaunch {draftKey:string;date:string;childId?:string;chooseChildren:boolean;reloaded?:boolean}
export interface RecordEntrySignal {requestId:string;date?:string;childId?:string;chooseChildren:boolean}
export function isInputDraftKey(key:string){return key.startsWith('record-')&&!/^record-(edit|correction)-/.test(key);}
export function ownInputDrafts(drafts:RecordDraftSummary[],identity:RecordEntryIdentity,date:string){
 return drafts.filter(draft=>isInputDraftKey(draft.draftKey)&&draft.date===date&&draft.selectedChildIds.length>0
  &&(identity.userId?draft.userId===identity.userId:!draft.userId)
  &&(draft.recorderId||'')===(identity.recorderId||''))
  .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.draftKey.localeCompare(b.draftKey));
}
export function resolveRecordEntry(drafts:RecordDraftSummary[],identity:RecordEntryIdentity,request:RecordEntryRequest){
 const candidates=ownInputDrafts(drafts,identity,request.date);
 const containing=request.childId?candidates.filter(draft=>draft.selectedChildIds.includes(request.childId!)):[];
 if(request.manage||containing.length>1)return {kind:'choose' as const,candidates};
 const target=containing[0]||(candidates.length===1?candidates[0]:undefined);
 if(target)return {kind:'resume' as const,draft:target};
 return candidates.length?{kind:'choose' as const,candidates}:{kind:'new' as const};
}
export function validateOwnDraftMerge(drafts:RecordDraftSummary[],identity:RecordEntryIdentity,date:string,keys:string[]){
 if(keys.length<2||keys.length>100||new Set(keys).size!==keys.length)throw Error('まとめる入力中記録を2件以上選択してください。');
 const own=ownInputDrafts(drafts,identity,date),selected=keys.map(key=>own.find(draft=>draft.draftKey===key));
 if(selected.some(draft=>!draft))throw Error('記録の担当者・日付・状態が変わっています。一覧を確認し直してください。');
 const checked=selected as RecordDraftSummary[],format=checked[0].selectedTemplateId;
 if(!format||checked.some(draft=>draft.selectedTemplateId!==format))throw Error('異なる記録形式はまとめられません。入力内容はそれぞれに残しています。');
 const children=checked.flatMap(draft=>draft.selectedChildIds);
 if(new Set(children).size!==children.length)throw Error('同じ児童を含む記録があります。上書きを防ぐため、まとめる処理を停止しました。');
 return checked;
}
export function localInputDrafts(storage:Pick<Storage,'length'|'key'|'getItem'>,organizationId?:string,userId?:string):RecordDraftSummary[]{
 const prefix=`support-record-draft-v2:${organizationId||'local'}:${userId||'local'}:`,result:RecordDraftSummary[]=[];
 for(let i=0;i<storage.length;i++){
  const key=storage.key(i);if(!key?.startsWith(prefix))continue;
  try{const payload=JSON.parse(storage.getItem(key)||'null'),draftKey=key.slice(prefix.length);
   if(!payload||!isInputDraftKey(draftKey)||!Array.isArray(payload.selectedChildIds)||!payload.selectedChildIds.every((id:unknown)=>typeof id==='string'&&id.length>0)||typeof payload.date!=='string'
    ||(payload.recorderId!=null&&typeof payload.recorderId!=='string')||(payload.updatedAt!=null&&typeof payload.updatedAt!=='string')||(payload.selectedTemplateId!=null&&typeof payload.selectedTemplateId!=='string'))continue;
   result.push({draftKey,userId,revision:0,selectedChildIds:payload.selectedChildIds,date:payload.date,recorderId:payload.recorderId||undefined,recorderName:payload.recorderName,selectedTemplateId:payload.selectedTemplateId,currentStepIndex:payload.currentStepIndex||0,updatedAt:payload.updatedAt||''});
  }catch{/* Invalid local data cannot create or redirect an entry. */}
 }
 return result;
}

/** Ignore navigation/timestamps, but never discard answers waiting in this browser. */
export function assertDraftMergeSynced(local:unknown,remote:unknown,expectedRevision:number|undefined,actualRevision:number|undefined){
 if(!expectedRevision||!actualRevision||!remote)throw Error('端末内だけに残っている記録があります。各入力画面を開いて共有保存を完了してから、もう一度まとめてください。入力内容は残しています。');
 if(expectedRevision!==actualRevision)throw Error('入力内容が更新されました。一覧を開き直してください。入力内容は残しています。');
 if(!local)return;
 const canonical=(value:unknown):string=>{
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>JSON.stringify(key)+':'+canonical(item)).join(',')+'}';
  return JSON.stringify(value)??'null';
 };
 const fields=['date','recorderId','recorderName','selectedTemplateId','selectedChildIds','childDrafts','childTemplateIds'];
 const a=local as Record<string,unknown>,b=remote as Record<string,unknown>;
 if(fields.some(field=>canonical(a[field])!==canonical(b[field])))throw Error('この端末に共有保存前の入力があります。対象の入力画面を開き、共有保存が完了してからまとめてください。入力内容は残しています。');
}

/** Demo-only merge: validate everything before the first write; never overwrite a child. */
export function mergeLocalInputDrafts(storage:Storage,organizationId:string|undefined,identity:RecordEntryIdentity,date:string,keys:string[],targetKey:string){
 validateOwnDraftMerge(localInputDrafts(storage,organizationId,identity.userId),identity,date,keys);
 if(!keys.includes(targetKey))throw Error('まとめ先の記録が選択されていません。');
 const prefix=`support-record-draft-v2:${organizationId||'local'}:${identity.userId||'local'}:`,snapshots=keys.map(key=>storage.getItem(prefix+key)),payloads=snapshots.map(value=>JSON.parse(value||'null'));
 const target=structuredClone(payloads[keys.indexOf(targetKey)]),ids=new Set(target.selectedChildIds);
 for(let i=0;i<keys.length;i++){
  if(keys[i]===targetKey)continue;
  const incoming=payloads[i];
  for(const field of ['childDrafts','childTemplateIds','childStepIds']){
   target[field]||={};
   for(const [id,value] of Object.entries(incoming[field]||{})){
    if(id in target[field]&&JSON.stringify(target[field][id])!==JSON.stringify(value))throw Error('重なる児童の入力内容があります。上書きせず処理を停止しました。');
    target[field][id]=value;
   }
  }
  for(const id of incoming.selectedChildIds){if(ids.has(id))throw Error('児童が重複しています。');ids.add(id);target.selectedChildIds.push(id);}
 }
 if(keys.some((key,i)=>storage.getItem(prefix+key)!==snapshots[i]))throw Error('入力内容が更新されました。一覧を確認し直してください。');
 target.updatedAt=new Date().toISOString();target.takenOverFromDraftKeys=[...new Set([...(target.takenOverFromDraftKeys||[]),...keys.filter(key=>key!==targetKey)])];target.takenOverAt=target.updatedAt;
 storage.setItem(prefix+targetKey,JSON.stringify(target));
 for(const key of keys)if(key!==targetKey)storage.removeItem(prefix+key);
}
