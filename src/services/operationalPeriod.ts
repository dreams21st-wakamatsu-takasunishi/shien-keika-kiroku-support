import {validRecordDate} from './recordPeriods';
export type OperationalPeriod = {from:string;to:string};
export type OperationalSlice = 'attendance'|'transport'|'both';

export function dayPeriod(date:string):OperationalPeriod|null {
  return validRecordDate(date)?{from:date,to:date}:null;
}
export function monthPeriod(month:string):OperationalPeriod|null {
  if(!/^\d{4}-\d{2}$/.test(month)||!validRecordDate(month+'-01'))return null;
  const [year,number]=month.split('-').map(Number);
  const date=new Date(month+'-01T12:00:00Z');
  date.setUTCFullYear(year,number,0);
  return {from:month+'-01',to:date.toISOString().slice(0,10)};
}
export const inOperationalPeriod=(date:string,p:OperationalPeriod)=>date>=p.from&&date<=p.to;
export function operationDateAffected(dates:Set<string>|null|undefined,period:OperationalPeriod){
  return !dates||[...dates].some(date=>inOperationalPeriod(date,period));
}

export function mergeOperationalPeriod<T extends {id:string;date:string}>(previous:T[],incoming:T[],period:OperationalPeriod,baseline:T[]){
  const original=new Map(baseline.map(row=>[row.id,row]));
  const latest=new Map(previous.map(row=>[row.id,row]));
  const result=new Map(previous.filter(row=>!inOperationalPeriod(row.date,period)||original.get(row.id)!==row).map(row=>[row.id,row]));
  for(const row of incoming){
    if(!inOperationalPeriod(row.date,period)||latest.get(row.id)!==original.get(row.id))continue;
    result.set(row.id,row);
  }
  return [...result.values()];
}
