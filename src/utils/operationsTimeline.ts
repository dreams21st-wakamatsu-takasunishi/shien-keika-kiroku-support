import type {AttendanceRecord, CalendarEvent, ChildProfile, DailyChildPlan, DailyTransportRequirement, TransportRun, Vehicle} from '../types';
import {getRegularDaysForDate, getWeekdayFromDate} from './weekdays';
import {getVehicleChildCapacity} from './vehicleCapacity';

export const DAY_START = 7 * 60;
export const DAY_END = 21 * 60;
export function dayMinute(value?: string): number | undefined {
  if(!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))return undefined;
  return Number(value.slice(0,2))*60+Number(value.slice(3));
}
export function dayRange(start?: string, end?: string) {
  const a=dayMinute(start),b=dayMinute(end);
  if(a===undefined||b===undefined||b<=a||b<=DAY_START||a>=DAY_END)return undefined;
  return {left:((Math.max(a,DAY_START)-DAY_START)/(DAY_END-DAY_START))*100,width:((Math.min(b,DAY_END)-Math.max(a,DAY_START))/(DAY_END-DAY_START))*100};
}
export function eventDayTimes(event:CalendarEvent,date:string) {
  if(event.date>date||(event.endDate||event.date)<date)return undefined;
  return {start:event.allDay||event.date<date?'07:00':event.startTime,end:event.allDay||(event.endDate||event.date)>date?'21:00':event.endTime};
}
export function isWorking(record?:AttendanceRecord) {
  return Boolean(record&&!['欠勤','有給','公休','特別休暇'].includes(record.status));
}
export function dayChildren(date:string,children:ChildProfile[],plans:DailyChildPlan[],requirements:DailyTransportRequirement[],runs:TransportRun[]) {
  return children.filter(child=>{
    if(child.careType==='保育所等訪問支援')return false;
    const plan=plans.find(p=>p.date===date&&p.childId===child.id);
    if(plan?.attendancePlan==='欠席')return false;
    return Boolean(plan || requirements.some(r=>r.date===date&&r.childId===child.id)
      ||runs.some(r=>r.date===date&&r.stops.some(s=>s.childId===child.id))
      ||(!child.serviceSuspended&&getRegularDaysForDate(child,date).includes(getWeekdayFromDate(date))));
  }).map(child=>{
    const plan=plans.find(p=>p.date===date&&p.childId===child.id);
    const requirement=requirements.find(r=>r.date===date&&r.childId===child.id);
    const pickup=runs.find(r=>r.date===date&&r.direction==='迎え'&&r.stops.some(s=>s.childId===child.id));
    const dropoff=runs.find(r=>r.date===date&&r.direction==='送り'&&r.stops.some(s=>s.childId===child.id));
    // A pickup stop is NOT a facility arrival. Use the run's return time, only
    // after calculation; otherwise retain the explicitly entered arrival.
    const pickupEnabled=requirement?.pickupEnabled!==false;
    const arrival=pickupEnabled&&pickup?.routeOptimizedAt?pickup.endTime:plan?.arrivalTime;
    const departure=requirement?.dropoffEnabled!==false&&dropoff?.routeOptimizedAt?dropoff.startTime:plan?.departureTime;
    const dismissal=plan?.schoolEndTime||(requirement?.pickupTimeMode==='fixed'?requirement.pickupTargetTime:undefined);
    const a=dayMinute(dismissal),b=dayMinute(arrival),c=dayMinute(departure);
    const timeOrderInvalid=(pickupEnabled&&a!==undefined&&b!==undefined&&a>b)||(b!==undefined&&c!==undefined&&b>c);
    return {child,arrival,departure,dismissal,pickup,dropoff,pickupEnabled,timeOrderInvalid,
      transportRange:pickupEnabled?dayRange(dismissal,arrival):undefined,range:dayRange(arrival,departure)};
  });
}
export interface OperationsWarning {key:string;runId:string;message:string;severity:'critical'|'warning';}
export function operationsWarnings(date:string,runs:TransportRun[],records:AttendanceRecord[],events:CalendarEvent[],vehicles:Vehicle[]):OperationsWarning[] {
  const warnings:OperationsWarning[]=[];
  const dayRuns=runs.filter(r=>r.date===date&&r.stops.length>0);
  const overlaps=(a?:string,b?:string,c?:string,d?:string)=>{
    const [x,y,z,w]=[a,b,c,d].map(dayMinute);
    return x!==undefined&&y!==undefined&&z!==undefined&&w!==undefined&&y>x&&w>z&&x<w&&z<y;
  };
  for(const run of dayRuns){
    const add=(key:string,message:string,severity:OperationsWarning['severity']='warning')=>warnings.push({key:`${run.id}:${key}`,runId:run.id,message:`${run.name}：${message}`,severity});
    const vehicle=vehicles.find(v=>v.id===run.vehicleId);
    if(vehicle&&run.stops.length>getVehicleChildCapacity(vehicle,run))add('capacity','児童の乗車枠を超えています','critical');
    if(!run.driverRecorderProfileId)add('driver','運転者が未設定です','critical');
    const ids=[...new Set([run.driverRecorderProfileId,...run.assistantRecorderProfileIds].filter(Boolean))] as string[];
    if(run.driverRecorderProfileId&&run.assistantRecorderProfileIds.includes(run.driverRecorderProfileId))add('duplicate','運転者と添乗員が同じ職員です','critical');
    for(const id of ids){
      const record=records.find(r=>r.date===date&&r.recorderProfileId===id);
      const start=dayMinute(run.startTime),end=dayMinute(run.endTime);
      const a=dayMinute(record?.scheduledStartTime),b=dayMinute(record?.scheduledEndTime);
      if(!isWorking(record)||a===undefined||b===undefined)add(`shift:${id}`,'担当職員の勤務予定が未登録、または休みです（確認用・配車は継続できます）');
      else if(start!==undefined&&end!==undefined&&(start<a||end>b))add(`outside:${id}`,'担当職員の勤務予定時間外を含みます');
      const busyEvent=events.find(e=>e.recorderProfileIds.includes(id)&&(()=>{const times=eventDayTimes(e,date);return times&&overlaps(run.startTime,run.endTime,times.start,times.end);})());
      if(busyEvent)add(`event:${id}`,'担当職員の業務予定・休みと重なっています');
    }
    const concurrent=dayRuns.filter(r=>r.id!==run.id&&overlaps(run.startTime,run.endTime,r.startTime,r.endTime));
    for(const other of concurrent){
      if(ids.some(id=>id===other.driverRecorderProfileId||other.assistantRecorderProfileIds.includes(id)))add(`staff-overlap:${other.id}`,`${other.name}と同じ時間帯に担当職員が重複しています`,'critical');
      if(run.vehicleId&&other.vehicleId===run.vehicleId)add(`vehicle-overlap:${other.id}`,`${other.name}と同じ時間帯に車両が重複しています`,'critical');
    }
  }
  return warnings.sort((a,b)=>Number(b.severity==='critical')-Number(a.severity==='critical'));
}
