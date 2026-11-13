import React from 'react';
import {createRoot} from 'react-dom/client';
import {TodayWorkPanel} from '../../src/components/TodayWorkPanel';
import {loadWorkspacePatch} from '../../src/services/dataService';
import '../../src/index.css';
import type {OperationalLoader} from '../../src/components/useOperationalPeriod';
const empty=async()=>{};
function Fixture(){
 const [data,setData]=React.useState<Awaited<ReturnType<typeof loadWorkspacePatch>>>({});
 const load=React.useCallback<OperationalLoader>(async period=>{
  const patch=await loadWorkspacePatch('fixture-office',['attendance_records','transport_runs'],undefined,period);
  setData(patch);
 },[]);
 return <TodayWorkPanel initialDate="2026-11-13" onLoadOperationalPeriod={load} staffScheduleItems={[]} calendarEvents={[]} dailyChildPlans={[]} childrenList={[]}
  attendanceRecords={data.attendanceRecords||[]} vehicles={[]} transportRuns={data.transportRuns||[]} transportRouteSettings={{} as never}
  transportMapLocations={[]} transportAreaZones={[]} recorderProfiles={[]} canManage={false}
  onSaveStaffSchedule={empty} onDeleteStaffSchedule={empty} onSaveCalendarEvent={empty} onSaveAttendance={empty} onSaveTransportRun={empty}/>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
