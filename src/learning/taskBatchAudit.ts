import {credentialUuid as uuid} from './accountCredentials.ts';
import {parseTaskBatch,type TaskBatch,type BatchKind} from './taskBatches.ts';

export interface AuditCursor {createdAt:string;operationId:string}
export interface AuditFilters {kind:'all'|BatchKind;state:'all'|'pending'|'completed';actorId:string|null}
export interface AuditActor {id:string;name:string;active:boolean}
export interface AuditEntry extends AuditCursor {
 title:string;kind:BatchKind;parentId:string|null;actorId:string;actorName:string;actorActive:boolean;total:number;saved:number;
}
export interface AuditPage {organizationId:string;filters:AuditFilters;entries:AuditEntry[];actors:AuditActor[];nextCursor:AuditCursor|null}
export interface AuditDetail {organizationId:string;entry:AuditEntry;batch:TaskBatch}
export const initialAuditFilters:AuditFilters={kind:'all',state:'all',actorId:null};
const timestamp=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=max;
const invalid=()=>new Error('事業所の課題履歴を確認できません。再取得してください。');
export function parseAuditFilters(value:unknown):AuditFilters {
 const row=value as AuditFilters;
 if(!row||!['all','create','edit','stop'].includes(row.kind)||!['all','pending','completed'].includes(row.state)||row.actorId!==null&&!uuid(row.actorId))throw invalid();
 return {kind:row.kind,state:row.state,actorId:row.actorId};
}
export function parseAuditCursor(value:unknown):AuditCursor|null {
 if(value===null)return null;
 const row=value as AuditCursor;
 if(!row||!uuid(row.operationId)||!timestamp(row.createdAt))throw invalid();
 return {createdAt:row.createdAt,operationId:row.operationId};
}
function parseEntry(value:unknown):AuditEntry {
 const row=value as AuditEntry,cursor=parseAuditCursor(row);
 if(!cursor||!text(row.title,80)||!['create','edit','stop'].includes(row.kind)||!uuid(row.actorId)||!text(row.actorName,200)||typeof row.actorActive!=='boolean'
  ||!Number.isSafeInteger(row.total)||row.total<1||row.total>100||!Number.isSafeInteger(row.saved)||row.saved<0||row.saved>row.total
  ||(row.kind==='create'?row.parentId!==null:!uuid(row.parentId)||row.parentId===row.operationId))throw invalid();
 return {...cursor,title:row.title,kind:row.kind,parentId:row.parentId,actorId:row.actorId,actorName:row.actorName,actorActive:row.actorActive,total:row.total,saved:row.saved};
}
export function parseAuditPage(value:unknown,filters:AuditFilters,cursor:AuditCursor|null):AuditPage {
 const row=value as AuditPage&{schemaVersion:number};
 if(row?.schemaVersion!==1||!uuid(row.organizationId)||JSON.stringify(parseAuditFilters(row.filters))!==JSON.stringify(parseAuditFilters(filters))
  ||!Array.isArray(row.entries)||row.entries.length>20||!Array.isArray(row.actors)||row.actors.length>500)throw invalid();
 const seen=new Set<string>();
 const entries=row.entries.map(value=>{
  const entry=parseEntry(value);
  if(seen.has(entry.operationId)||entry.operationId===cursor?.operationId||filters.kind!=='all'&&entry.kind!==filters.kind
   ||filters.actorId!==null&&entry.actorId!==filters.actorId||filters.state==='pending'&&entry.saved===entry.total||filters.state==='completed'&&entry.saved!==entry.total)throw invalid();
  seen.add(entry.operationId);return entry;
 });
 const actors=row.actors.map(actor=>{
  if(!actor||!uuid(actor.id)||!text(actor.name,200)||typeof actor.active!=='boolean')throw invalid();
  return {id:actor.id,name:actor.name,active:actor.active};
 });
 if(new Set(actors.map(actor=>actor.id)).size!==actors.length)throw invalid();
 const nextCursor=parseAuditCursor(row.nextCursor),last=entries.at(-1);
 if(nextCursor&&(entries.length!==20||!last||nextCursor.operationId!==last.operationId||nextCursor.createdAt!==last.createdAt))throw invalid();
 return {organizationId:row.organizationId,filters:parseAuditFilters(row.filters),entries,actors,nextCursor};
}
export function parseAuditDetail(value:unknown,operationId:string,organizationId:string):AuditDetail {
 const row=value as AuditDetail&{schemaVersion:number};
 if(row?.schemaVersion!==1||row.organizationId!==organizationId||!uuid(organizationId))throw invalid();
 const entry=parseEntry(row.entry),batch=parseTaskBatch(row.batch,operationId);
 if(entry.operationId!==operationId||entry.title!==batch.template.title||entry.createdAt!==batch.createdAt||entry.kind!==(batch.kind||'create')
  ||entry.parentId!==(batch.parentId||null)||entry.total!==batch.items.length||entry.saved!==batch.items.filter(item=>item.status==='saved').length)throw invalid();
 return {organizationId,entry,batch};
}
