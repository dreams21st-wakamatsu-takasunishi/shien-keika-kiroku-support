import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dayMinute,dayRange,dayChildren,eventDayTimes,operationsWarnings} from './operationsTimeline';
import {constrainPanel} from './editorPanelGeometry';
import type {AttendanceRecord,CalendarEvent,ChildProfile,DailyChildPlan,DailyTransportRequirement,TransportRun,Vehicle} from '../types';
const date='2026-10-07';
test('timeline uses one 7–21 scale and clips ranges without accepting invalid or overnight times',()=>{
  assert.deepEqual(dayRange('07:00','21:00'),{left:0,width:100});
  assert.deepEqual(dayRange('06:00','22:00'),{left:0,width:100});
  assert.equal(dayRange('18:00','10:00'),undefined);assert.equal(dayRange('bad','12:00'),undefined);
  assert.equal(dayMinute('24:00'),undefined);assert.equal(dayRange('10:00','10:00'),undefined);
});
test('multi-day events are clipped to the selected date instead of repeating first-day times',()=>{
  const event={date,endDate:'2026-10-09',startTime:'16:00',endTime:'10:00',allDay:false} as CalendarEvent;
  assert.deepEqual(eventDayTimes(event,date),{start:'16:00',end:'21:00'});
  assert.deepEqual(eventDayTimes(event,'2026-10-08'),{start:'07:00',end:'21:00'});
  assert.deepEqual(eventDayTimes(event,'2026-10-09'),{start:'07:00',end:'10:00'});
  assert.equal(eventDayTimes(event,'2026-10-10'),undefined);
});
test('a pickup time is not counted as facility arrival and absences/visiting-only children are excluded',()=>{
  const children=[{id:'a',regularDays:['水']},{id:'b',regularDays:['水']},{id:'v',careType:'保育所等訪問支援',regularDays:['水']}] as ChildProfile[];
  const plans=[{date,childId:'a',attendancePlan:'利用予定',arrivalTime:'16:00',departureTime:'18:00'},{date,childId:'b',attendancePlan:'欠席'}] as DailyChildPlan[];
  const run={id:'r',date,direction:'迎え',startTime:'14:00',endTime:'15:00',stops:[{childId:'a',plannedTime:'14:30'}]} as TransportRun;
  const rows=dayChildren(date,children,plans,[],[run]);assert.equal(rows.length,1);assert.equal(rows[0].arrival,'16:00');
  assert.equal(dayChildren(date,children,plans,[],[{...run,routeOptimizedAt:'confirmed'}])[0].arrival,'15:00');
});
test('child transport ends at facility arrival and presence ends at dropoff departure, not child stop time',()=>{
  const children=[{id:'a'}] as ChildProfile[];
  const plans=[{date,childId:'a',schoolEndTime:'14:00',arrivalTime:'16:00',departureTime:'18:00'}] as DailyChildPlan[];
  const pickup={date,direction:'迎え',startTime:'13:30',endTime:'15:10',routeOptimizedAt:'confirmed',stops:[{childId:'a',plannedTime:'14:20'}]} as TransportRun;
  const dropoff={date,direction:'送り',startTime:'17:20',endTime:'18:30',routeOptimizedAt:'confirmed',stops:[{childId:'a',plannedTime:'17:50'}]} as TransportRun;
  const row=dayChildren(date,children,plans,[],[pickup,dropoff])[0];
  assert.equal(row.arrival,'15:10');assert.equal(row.departure,'17:20');
  assert.deepEqual(row.transportRange,dayRange('14:00','15:10'));assert.deepEqual(row.range,dayRange('15:10','17:20'));
  assert.ok(Math.abs(row.transportRange!.left+row.transportRange!.width-row.range!.left)<1e-9);
  const pending=dayChildren(date,children,plans,[],[{...pickup,routeOptimizedAt:undefined},{...dropoff,routeOptimizedAt:undefined}])[0];
  assert.equal(pending.arrival,'16:00');assert.equal(pending.departure,'18:00');
});

test('unknown child times are not guessed and reversed/zero-length intervals are not drawn',()=>{
  const children=[{id:'a'}] as ChildProfile[];
  const row=(schoolEndTime?:string,arrivalTime?:string,departureTime?:string)=>dayChildren(date,children,[{date,childId:'a',schoolEndTime,arrivalTime,departureTime}] as DailyChildPlan[],[],[])[0];
  assert.equal(row('14:00',undefined,'17:00').transportRange,undefined);assert.equal(row('14:00',undefined,'17:00').range,undefined);
  assert.equal(row(undefined,'15:00','17:00').transportRange,undefined);assert.ok(row(undefined,'15:00','17:00').range);
  assert.equal(row('16:00','15:00','17:00').transportRange,undefined);assert.equal(row('16:00','15:00','17:00').timeOrderInvalid,true);
  assert.equal(row('14:00','17:00','16:00').range,undefined);assert.equal(row('14:00','17:00','16:00').timeOrderInvalid,true);
  assert.equal(row('14:00','14:00','14:00').transportRange,undefined);assert.equal(row('14:00','14:00','14:00').timeOrderInvalid,false);
  assert.deepEqual(row('06:00','08:00','22:00').transportRange,dayRange('07:00','08:00'));
});

test('parent transport does not create a facility transport interval or use stale assigned runs',()=>{
  const children=[{id:'a'}] as ChildProfile[];
  const plans=[{date,childId:'a',schoolEndTime:'14:00',arrivalTime:'15:00',departureTime:'17:00'}] as DailyChildPlan[];
  const requirements=[{date,childId:'a',pickupEnabled:false,dropoffEnabled:false}] as DailyTransportRequirement[];
  const runs=[{date,direction:'迎え',endTime:'16:00',routeOptimizedAt:'confirmed',stops:[{childId:'a'}]},{date,direction:'送り',startTime:'18:00',routeOptimizedAt:'confirmed',stops:[{childId:'a'}]}] as TransportRun[];
  const row=dayChildren(date,children,plans,requirements,runs)[0];
  assert.equal(row.pickupEnabled,false);assert.equal(row.transportRange,undefined);assert.equal(row.arrival,'15:00');assert.equal(row.departure,'17:00');assert.ok(row.range);
});

test('warnings cover driver/assistant clashes, shifts, events and vehicles without modifying inputs',()=>{
  const first={id:'r1',date,name:'便1',startTime:'14:00',endTime:'15:00',driverRecorderProfileId:'staff',assistantRecorderProfileIds:['assistant'],vehicleId:'v',stops:[{childId:'a'}]} as TransportRun;
  const second={...first,id:'r2',name:'便2',startTime:'14:30',endTime:'16:00',driverRecorderProfileId:'other',assistantRecorderProfileIds:['assistant']};
  const record={date,recorderProfileId:'staff',status:'勤務予定',scheduledStartTime:'09:00',scheduledEndTime:'18:00'} as AttendanceRecord;
  const event={id:'event',date,recorderProfileIds:['staff'],allDay:false,startTime:'14:00',endTime:'14:30'} as CalendarEvent;
  const before=JSON.stringify([first,second]);const warnings=operationsWarnings(date,[first,second],[record],[event],[]);
  assert.ok(warnings.some(w=>w.key==='r1:staff-overlap:r2'));assert.ok(warnings.some(w=>w.key==='r1:event:staff'));
  assert.ok(warnings.some(w=>w.key==='r1:shift:assistant'));assert.equal(JSON.stringify([first,second]),before);
  assert.ok(!operationsWarnings(date,[first,{...second,startTime:'15:00',endTime:'16:00'}],[record],[],[]).some(w=>w.key.includes('-overlap:')));
});
test('editor position and size remain within small or resized viewports',()=>{
  assert.deepEqual(constrainPanel({x:900,y:800,width:600,height:500},{width:390,height:300}),{x:0,y:0,width:390,height:300});
  const resized=constrainPanel({x:-30,y:-40,width:100,height:100},{width:1366,height:700});
  assert.deepEqual(resized,{x:0,y:0,width:320,height:280});
});

test('transport staff and vehicle overlaps are red; meeting and shift checks are yellow, ordered after red',()=>{
  const first={id:'first',date,name:'迎え1便',startTime:'14:00',endTime:'15:00',driverRecorderProfileId:'driver',assistantRecorderProfileIds:['assistant'],vehicleId:'v',stops:[{childId:'a'}]} as TransportRun;
  const second={...first,id:'second',name:'迎え2便',driverRecorderProfileId:'assistant',assistantRecorderProfileIds:[],startTime:'14:30',endTime:'15:30'};
  const event={id:'meeting',date,title:'会議',recorderProfileIds:['driver'],allDay:false,startTime:'14:15',endTime:'14:45'} as CalendarEvent;
  const warnings=operationsWarnings(date,[first,second],[],[event],[]);
  assert.equal(warnings.find(w=>w.key==='first:staff-overlap:second')?.severity,'critical');
  assert.equal(warnings.find(w=>w.key==='first:vehicle-overlap:second')?.severity,'critical');
  assert.equal(warnings.find(w=>w.key==='first:event:driver')?.severity,'warning');
  assert.equal(warnings.find(w=>w.key==='first:shift:driver')?.severity,'warning');
  const yellow=warnings.findIndex(w=>w.severity==='warning');
  assert.ok(yellow>0);assert.ok(warnings.slice(yellow).every(w=>w.severity==='warning'));
  const adjacent={...second,startTime:'15:00',endTime:'15:30'};
  assert.ok(!operationsWarnings(date,[first,adjacent],[],[],[]).some(w=>w.key.includes('-overlap:')));
});

test('missing driver, duplicate crew and child-capacity overflow are red without inventing an overlap',()=>{
  const vehicle={id:'v',capacity:2} as Vehicle;
  const run={id:'r',date,name:'便',startTime:'14:00',endTime:'15:00',vehicleId:'v',driverRecorderProfileId:'staff',assistantRecorderProfileIds:['staff'],stops:[{childId:'a'},{childId:'b'}]} as TransportRun;
  const warnings=operationsWarnings(date,[run],[],[],[vehicle]);
  assert.equal(warnings.find(w=>w.key==='r:capacity')?.severity,'critical');
  assert.equal(warnings.find(w=>w.key==='r:duplicate')?.severity,'critical');
  assert.equal(operationsWarnings(date,[{...run,driverRecorderProfileId:undefined}],[],[],[vehicle]).find(w=>w.key==='r:driver')?.severity,'critical');
  assert.ok(!warnings.some(w=>w.key.includes('-overlap:')));
  assert.equal(operationsWarnings(date,[{...run,stops:[]},{...run,date:'2026-10-08'}],[],[],[vehicle]).length,0);
});
