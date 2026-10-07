import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DailyTransportPlanner} from '../../src/components/DailyTransportPlanner';
import {StaffShiftManager} from '../../src/components/StaffShiftManager';
import {DEFAULT_TRANSPORT_ROUTE_SETTINGS,type AttendanceRecord,type CalendarEvent,type ChildProfile,type DailyChildPlan,type DailyTransportRequirement,type RecorderProfile,type StaffShiftRequest,type TransportRun,type Vehicle} from '../../src/types';
import '../../src/index.css';

const date='2026-10-07',now='2026-10-07T00:00:00Z';
const profiles=['日直職員A','運転職員B','運転職員C','支援職員D','パート職員E','パート職員F'].map((name,i)=>({id:`demo-staff-${i}`,displayName:name,active:true,employmentType:i<4?'full_time':'part_time'})) as RecorderProfile[];
const vehicles=['車両A','車両B','車両C'].map((name,i)=>({id:`demo-vehicle-${i}`,name,capacity:7,available:true,wheelchairAccessible:false,createdAt:now,updatedAt:now})) as Vehicle[];
const children=Array.from({length:12},(_,i)=>({id:`demo-child-${i}`,name:`確認児童${String.fromCharCode(65+i)}`,kana:`かくにん${i}`,grade:i<8?'小学3年':'高校1年',transportProgram:i<8?'小学部':'キャリアズ',careType:'放課後等デイサービス',schoolName:i<8?'確認小学校':'確認高等学校',address:'確認用住所',regularDays:['水'],defaultDepartureTime:i<8?'17:00':'19:00',transportPermanentNote:i===0?'チャイルドシートを忘れずに持参':''})) as unknown as ChildProfile[];
const plans=children.map((child,i)=>({id:`demo-plan-${i}`,childId:child.id,date,attendancePlan:'利用予定',serviceCategory:'放課後等デイサービス',recordFormat:'小学部',dayPattern:'平日',schoolEndTime:i<8?`${14+Math.floor(i/4)}:${i%2?'30':'00'}`:'17:00',arrivalTime:i<8?'15:30':'17:30',departureTime:i<8?'17:00':'19:00',createdAt:now,updatedAt:now})) as unknown as DailyChildPlan[];
const requirements=children.map((child,i)=>({id:`demo-requirement-${i}`,date,childId:child.id,pickupEnabled:true,dropoffEnabled:true,pickupTimeMode:'fixed',pickupTargetTime:plans[i].schoolEndTime,pickupLocationType:'学校',pickupLocationName:child.schoolName,pickupAddress:'確認用住所',dropoffTimeMode:'departure_forward',dropoffTargetTime:plans[i].departureTime,dropoffLocationType:'自宅',dropoffLocationName:'自宅',dropoffAddress:'確認用住所',revision:0,createdAt:now,updatedAt:now})) as unknown as DailyTransportRequirement[];
// Opt-in edge cases for the local-only assignment checks.
if(new URLSearchParams(location.search).get('assignment')==='edges'){
  plans[9].schoolEndTime=undefined;requirements[9].pickupTimeMode='departure_forward';requirements[9].pickupTargetTime='18:00';
  plans[10].attendancePlan='欠席';requirements[11].pickupEnabled=false;
}
const startingRecords=profiles.map((p,i)=>({id:`demo-attendance-${i}`,recorderProfileId:p.id,recorderName:p.displayName,date,scheduledStartTime:i>=4?'13:00':'10:00',scheduledEndTime:i>=4?'18:00':'20:00',status:'勤務予定',breakPeriods:[],createdAt:now,updatedAt:now})) as AttendanceRecord[];
const events=[{id:'demo-meeting',title:'支援会議（確認用）',eventType:'会議',date,allDay:false,startTime:'14:00',endTime:'14:30',recorderProfileIds:[profiles[1].id],childIds:[],notificationEnabled:false,visibility:'全体',color:'#f59e0b',recurrence:'なし',createdAt:now,updatedAt:now}] as unknown as CalendarEvent[];
const startingRuns=vehicles.flatMap((vehicle,i)=>(['迎え','送り'] as const).map(direction=>({id:`demo-run-${direction}-${i}`,date,name:`${direction}1便・${vehicle.name}`,direction,vehicleId:vehicle.id,vehicleName:vehicle.name,driverRecorderProfileId:profiles[i+1].id,driverName:profiles[i+1].displayName,assistantRecorderProfileIds:[],startTime:direction==='迎え'?'13:30':'17:00',endTime:direction==='迎え'?'15:30':'18:00',status:'未出発',createdAt:now,updatedAt:now,stops:children.slice(i*3,i*3+3).map((child,j)=>({id:`demo-stop-${direction}-${i}-${j}`,childId:child.id,childName:child.name,locationType:direction==='迎え'?'学校':'自宅',locationName:direction==='迎え'?child.schoolName:'自宅',location:'確認用住所',timeMode:'fixed',timeAnchorTime:direction==='迎え'?plans[i*3+j].schoolEndTime:'17:30',plannedTime:direction==='迎え'?plans[i*3+j].schoolEndTime:'17:30',order:j+1}))}))) as TransportRun[];
if(new URLSearchParams(location.search).get('warnings')==='severity'){
  const other=startingRuns.find(run=>run.direction==='迎え'&&run.vehicleId===vehicles[1].id)!;
  other.driverRecorderProfileId=profiles[1].id;other.driverName=profiles[1].displayName;
}
const requests=[{id:'demo-request',recorderProfileId:profiles[4].id,recorderName:profiles[4].displayName,requestedDate:date,requestedStartTime:'13:00',requestedEndTime:'18:00',status:'申請中',createdAt:now,updatedAt:now}] as StaffShiftRequest[];

function Preview(){
  const [page,setPage]=useState<'transport'|'shift'|'closed'>('transport');
  const [runs,setRuns]=useState(startingRuns),[records,setRecords]=useState(startingRecords);
  const [notice,setNotice]=useState('');
  return <>
    <style>{`.operations-preview [aria-label="${date}の全送迎を編集"]{top:48px;min-height:0}.operations-preview{background:#f1f5f9;color:#0f172a}`}</style>
    <nav className="fixed inset-x-0 top-0 z-[200] flex h-12 items-center gap-2 overflow-x-auto border-b border-teal-200 bg-teal-50 px-3 text-xs text-teal-950" aria-label="変更確認のメニュー"><strong className="shrink-0">確認用・架空データ</strong><button type="button" onClick={()=>setPage('transport')} className="min-h-9 shrink-0 rounded bg-teal-700 px-3 font-bold text-white">配車画面</button><button type="button" onClick={()=>setPage('shift')} className="min-h-9 shrink-0 rounded border border-teal-300 bg-white px-3 font-bold">シフト画面</button><span className="shrink-0">本番へ保存されません／経路計算・地図通信は停止</span></nav>
    {page==='transport'&&<DailyTransportPlanner date={date} runs={runs} vehicles={vehicles} recorderProfiles={profiles} attendanceRecords={records} calendarEvents={events} childrenList={children} dailyChildPlans={plans} dailyTransportRequirements={requirements} routeSettings={{...DEFAULT_TRANSPORT_ROUTE_SETTINGS,facilityAddress:''}} transportMapLocations={[]} transportAreaZones={[]} onSaveRun={run=>setRuns(current=>[...current.filter(r=>r.id!==run.id),run])} onSaveRequirements={()=>undefined} onDeleteRun={id=>setRuns(current=>current.filter(r=>r.id!==id))} onClose={()=>{setPage('closed');setNotice('確認用画面を閉じました。操作内容はこのページ内だけに保存され、本番へは送信されません。');}}/>}
    {page==='shift'&&<main className="mx-auto max-w-[1600px] px-3 pb-8 pt-16"><StaffShiftManager templates={[]} records={records} recorderProfiles={profiles} shiftRequests={requests} calendarEvents={events} childrenList={children} dailyChildPlans={plans} dailyTransportRequirements={requirements} transportRuns={runs} selectedDate={date} onSaveRecords={updates=>setRecords(current=>[...current.filter(r=>!updates.some(u=>u.id===r.id)),...updates])} onDeleteRecord={record=>setRecords(current=>current.filter(r=>r.id!==record.id))}/></main>}
    {page==='closed'&&<main className="mx-auto max-w-xl p-6 pt-24"><h1 className="text-xl font-bold">Dサポート 変更確認</h1><p className="my-4">{notice}</p><button type="button" onClick={()=>setPage('transport')} className="rounded-xl bg-teal-700 p-3 font-bold text-white">配車画面をもう一度開く</button></main>}
  </>;
}
document.body.classList.add('operations-preview');
createRoot(document.getElementById('root')!).render(<Preview/>);
