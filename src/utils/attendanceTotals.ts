import type {AttendanceRecord} from '../types';
export interface AttendanceTotal {state:'not_started'|'in_progress'|'unconfirmed'|'confirmed';reason:string;breakMinutes?:number;workingMinutes?:number}
/** Actuals only. Never turn a missing punch or a planned break into an actual. */
export function attendanceTotal(record:AttendanceRecord):AttendanceTotal {
 const pending=(reason:string):AttendanceTotal=>({state:'unconfirmed',reason});
 if(!record.clockInAt)return record.clockOutAt?pending('出勤打刻が未入力です'): {state:'not_started',reason:'出勤未打刻'};
 const start=Date.parse(record.clockInAt);
 if(!Number.isFinite(start))return pending('出勤時刻を確認してください');
 if(!record.clockOutAt)return pending('退勤未打刻のため未確定です');
 const end=Date.parse(record.clockOutAt),duration=end-start;
 if(!Number.isFinite(end)||duration<=0||duration>86400000)return pending('出退勤時刻の順序・長さを確認してください');
 let breakMs=0;
 if(record.confirmedBreakMinutes!==undefined&&record.breakConfirmedAt){
  if(!Number.isSafeInteger(record.confirmedBreakMinutes)||record.confirmedBreakMinutes<0||record.confirmedBreakMinutes*60000>duration)return pending('確認済み休憩時間を確認してください');
  breakMs=record.confirmedBreakMinutes*60000;
 }else{
  if(!record.breakPeriods?.length)return pending('休憩実績が未確認です（休憩なしの場合も確認が必要です）');
  const periods=record.breakPeriods.map(p=>({start:Date.parse(p.startedAt),end:p.endedAt?Date.parse(p.endedAt):NaN})).sort((a,b)=>a.start-b.start);
  for(let i=0;i<periods.length;i++){
   const p=periods[i];
   if(!Number.isFinite(p.start)||!Number.isFinite(p.end)||p.start<start||p.end>end||p.end<p.start||(i>0&&p.start<periods[i-1].end))return pending('休憩実績の終了・重複・時刻を確認してください');
   breakMs+=p.end-p.start;
  }
 }
 return {state:'confirmed',reason:'',breakMinutes:Math.round(breakMs/60000),workingMinutes:Math.round((duration-breakMs)/60000)};
}
export function summarizeAttendance(records:AttendanceRecord[]){
 const totals=records.map(attendanceTotal);
 return {workingMinutes:totals.reduce((sum,t)=>sum+(t.state==='confirmed'?t.workingMinutes!:0),0),unconfirmed:totals.filter(t=>t.state==='unconfirmed').length};
}
