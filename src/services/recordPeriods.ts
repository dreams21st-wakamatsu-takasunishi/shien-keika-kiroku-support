import type {SupportRecord} from '../types';
export interface RecordPeriod {from?:string;to?:string}
export interface RecordPeriodResult {records:SupportRecord[];refreshed:SupportRecord[];changedIds:string[]}
export interface RecordCursor {date:string;id:string}
export interface RecordChanges {mark:()=>number;since:(marker:number)=>{marker:number;ids:string[]};add:(id?:string)=>void}
/** Session-memory IDs only. If bounded history is insufficient, fail closed
 * rather than claim that an old period is fully reconciled. */
export function createRecordChanges():RecordChanges{
 let sequence=0,droppedThrough=0;const events:{sequence:number;id?:string}[]=[];
 return {mark:()=>sequence,add:id=>{events.push({sequence:++sequence,id});if(events.length>4096)droppedThrough=events.shift()!.sequence;},since:marker=>{
  if(marker<droppedThrough)throw Error('記録の変更が多いため、もう一度読み込んでください。');
  const changed=events.filter(e=>e.sequence>marker);if(changed.some(e=>!e.id))throw Error('記録一覧の更新が必要です。もう一度読み込んでください。');
  return {marker:sequence,ids:[...new Set(changed.map(e=>e.id!))]};
 }};
}
export const RECORD_PAGE_SIZE=200;
export const INITIAL_RECORD_WINDOW_DAYS=30;
export function throwIfRecordReadAborted(signal?:AbortSignal){if(signal?.aborted)throw new DOMException('Cancelled record read','AbortError');}
export function validRecordDate(value:string){const d=new Date(value+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!value.startsWith('0000-')&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
export function validateRecordPeriod(period:RecordPeriod){
 if((period.from&&!validRecordDate(period.from))||(period.to&&!validRecordDate(period.to))||(period.from&&period.to&&period.from>period.to))throw Error('開始日・終了日を正しく指定してください。');
 return {from:period.from||undefined,to:period.to||undefined};
}
export function initialRecordDate(today:string,days=INITIAL_RECORD_WINDOW_DAYS){if(!validRecordDate(today)||!Number.isInteger(days)||days<1||days>366)throw Error('Invalid record date/window');const d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(days-1));return d.toISOString().slice(0,10);}
export function recordMonthPeriod(month:string):RecordPeriod{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month.startsWith('0000'))throw Error('Invalid record month');const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);return validateRecordPeriod({from:month+'-01',to:d.toISOString().slice(0,10)});}
export const inRecordPeriod=(row:Pick<SupportRecord,'date'>,period:RecordPeriod)=>(!period.from||row.date>=period.from)&&(!period.to||row.date<=period.to);
export const periodKey=(period:RecordPeriod)=>JSON.stringify([period.from||'',period.to||'']);
export function recordReadLogic(initialFrom:string|undefined,cursor?:RecordCursor){
 const initial=initialFrom?`record_date.gte.${initialFrom},approval_status.neq.確認済み`:'';
 const quotedId=cursor?'"'+cursor.id.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"':'';
 const next=cursor?`record_date.lt.${cursor.date},and(record_date.eq.${cursor.date},id.lt.${quotedId})`:'';
 return initial&&next?`and(or(${initial}),or(${next}))`:initial||next;
}
export async function collectRecordPages<T extends {id:string;record_date:string}>(read:(cursor?:RecordCursor)=>Promise<{data:T[]|null;error:unknown;status:number;count?:number|null}>,signal?:AbortSignal,finishAtCount=false){
 const rows:T[]=[],seen=new Set<string>();let cursor:RecordCursor|undefined;
 for(let page=0;page<5000;page++){
  throwIfRecordReadAborted(signal);const result=await read(cursor);throwIfRecordReadAborted(signal);
  if(result.error)return {...result,data:null};
  const data=result.data||[];
  for(const row of data){if(typeof row.id!=='string'||!row.id||!validRecordDate(row.record_date)||seen.has(row.id))throw Error('記録の読み込み中に一覧が変化しました。もう一度読み込んでください。');seen.add(row.id);rows.push(row);}
  // Even a short page can be the server's configured row cap. Stop only on
  // an empty cursor page; never infer that a short response is complete.
  if(!data.length||(finishAtCount&&typeof result.count==='number'&&Number.isFinite(result.count)&&result.count>=0&&data.length>=result.count))return {...result,data:rows};
  const last=data.at(-1)!;cursor={date:last.record_date,id:last.id};
 }
 throw Error('記録が多いため取得を停止しました。期間を短くして再度読み込んでください。');
}
/** Keep previously loaded older approved records; all outstanding records and
 * the current initial window are replaced by the authoritative new read. */
export function mergeInitialRecordWindow(previous:SupportRecord[],incoming:SupportRecord[],from:string){
 const oldById=new Map(previous.map(row=>[row.id,row]));
 const byId=new Map(previous.filter(r=>r.date<from&&r.approvalStatus==='確認済み').map(r=>[r.id,r]));
 for(const row of incoming){const old=oldById.get(row.id);byId.set(row.id,old&&(old.version||0)>(row.version||0)?old:row);}
 return [...byId.values()];
}
/** Never overwrite an edit acknowledged during this read, or resurrect a row
 * removed locally/through Realtime while the request was in flight. */
export function mergeRecordPeriod(previous:SupportRecord[],incoming:SupportRecord[],period:RecordPeriod,baseline:SupportRecord[]){
 const old=new Map(baseline.map(r=>[r.id,r])),current=new Map(previous.map(r=>[r.id,r]));
 const next=new Map(previous.filter(r=>!inRecordPeriod(r,period)).map(r=>[r.id,r]));
 for(const row of incoming){
  const now=current.get(row.id),base=old.get(row.id);
  if(base&&!now)continue;
  next.set(row.id,now&&(now.version||0)>(row.version||0)?now:row);
 }
 for(const row of previous){const base=old.get(row.id);if(inRecordPeriod(row,period)&&(!base||base.version!==row.version||base.updatedAt!==row.updatedAt)){const remote=next.get(row.id);if(!remote||(row.version||0)>=(remote.version||0))next.set(row.id,row);}}
 return [...next.values()];
}
