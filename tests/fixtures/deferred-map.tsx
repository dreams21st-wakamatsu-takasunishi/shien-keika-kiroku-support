import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DailyTransportMiniMap,TransportMapPanel} from '../../src/components/DeferredTransportMaps';
import {createDeferredPanel} from '../../src/components/DeferredPanel';
import {DailyTransportPlanner} from '../../src/components/DailyTransportPlanner';
import {DEFAULT_TRANSPORT_ROUTE_SETTINGS} from '../../src/types';
import '../../src/index.css';

let attempts=0;
const RetryProbe=createDeferredPanel<{value:string}>(async()=>{
  attempts++;
  if(attempts===1)throw Error('Synthetic load failure');
  return {default:({value})=><p role="status">再試行完了：{value}</p>};
},'試験地図');

function Fixture(){
  if(new URL(location.href).searchParams.has('planner'))return <DailyTransportPlanner date="2026-10-07" runs={[]}
    vehicles={[{id:'fictional-vehicle',name:'試験車両',capacity:5,wheelchairAccessible:false,available:true,createdAt:'2026-10-07T00:00:00Z',updatedAt:'2026-10-07T00:00:00Z'}]}
    recorderProfiles={[{id:'fictional-driver',displayName:'架空運転者',active:true}]} childrenList={[]} dailyChildPlans={[]} dailyTransportRequirements={[]}
    routeSettings={DEFAULT_TRANSPORT_ROUTE_SETTINGS} transportMapLocations={[]} transportAreaZones={[]}
    onSaveRun={()=>undefined} onSaveRequirements={()=>undefined} onDeleteRun={()=>undefined} onClose={()=>undefined}/>;
  const [note,setNote]=useState(''),[time,setTime]=useState('14:10');
  const [panel,setPanel]=useState<'none'|'mini'|'settings'|'probe'>('none');
  return <main className="mx-auto max-w-6xl space-y-3 p-3">
    <h1>配車入力保持・地図試験（架空データのみ）</h1>
    <label className="block">配車メモ<input value={note} onChange={event=>setNote(event.target.value)} className="w-full rounded-lg border p-3"/></label>
    <label className="block">迎え時刻<input type="time" value={time} onChange={event=>setTime(event.target.value)} className="rounded-lg border p-3"/></label>
    <div className="flex flex-wrap gap-2">{[
      ['mini','ミニマップを表示'],['settings','送迎地点の地図を表示'],['probe','読み込み失敗試験'],['none','地図を収納'],
    ].map(([value,label])=><button key={value} type="button" className="min-h-11 rounded-lg border bg-white px-4" onClick={()=>setPanel(value as typeof panel)}>{label}</button>)}</div>
    {panel==='mini'&&<DailyTransportMiniMap direction="迎え" points={[]} expectedCount={0} routes={[]} onSelectRoute={()=>undefined}/>}
    {panel==='settings'&&<TransportMapPanel childrenList={[]} schools={[]} facilityAddress="" locations={[]} zones={[]} pinColors={{facility:'#123456',residential:'#234567',education:'#345678',other:'#456789'}} canManage={false} onSaveLocation={()=>undefined} onSaveZone={()=>undefined} onDeleteZone={()=>undefined}/>}
    {panel==='probe'&&<RetryProbe value={note}/>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
