import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {LegalTrainingWorkspace} from '../../src/components/LegalTrainingWorkspace';import {SettingsHub} from '../../src/components/SettingsHub';
import {DEFAULT_AI_WRITING_SETTINGS,DEFAULT_TRANSPORT_ROUTE_SETTINGS,type UserProfile} from '../../src/types';import '../../src/index.css';
function Fixture(){
 const [page,setPage]=useState('learn'),[other,setOther]=useState(false),[signedOut,setSignedOut]=useState(false);
 const role=new URLSearchParams(location.search).get('role');
 const user:UserProfile={id:other?'44444444-4444-4444-8444-444444444444':'11111111-1111-4111-8111-111111111111',organizationId:'22222222-2222-4222-8222-222222222222',displayName:other?'架空職員 B':'架空職員 A',role:role==='staff'?'staff':role==='classroom_manager'?'classroom_manager':'manager'};
 const noop=()=>{};
 return <main className="mx-auto max-w-6xl space-y-4 p-4"><nav className="flex flex-wrap gap-3"><button onClick={()=>setPage('learn')}>試験用：受講</button><button onClick={()=>setPage('settings')}>試験用：設定</button><button onClick={()=>setOther(value=>!value)}>試験用：職員切替</button></nav>
  {signedOut?<p role="status">試験用：ログアウトしました</p>:page==='learn'?<LegalTrainingWorkspace key={user.id} user={user} onSignOut={()=>setSignedOut(true)}/>:<SettingsHub key={user.id} currentUser={user} aiWritingSettings={DEFAULT_AI_WRITING_SETTINGS} templates={[]} childrenList={[]} schools={[]} facilityAddress="" routeSettings={DEFAULT_TRANSPORT_ROUTE_SETTINGS} mapLocations={[]} areaZones={[]} recorderProfiles={[]} staffShiftTemplates={[]} rolePermissions={[]} vehicles={[]} canManageChildren={false} canManageRecordSettings={false} canManageTransport={false} onSaveAiWritingSettings={noop} onSaveTemplate={noop} onDeleteTemplate={noop} onSaveSchool={noop} onDeleteSchool={noop} onSaveMapLocation={noop} onSaveAreaZone={noop} onDeleteAreaZone={noop} onSaveRouteSettings={noop} onSaveStaffShiftTemplate={noop} onDeleteStaffShiftTemplate={noop} onSaveRolePermission={noop} onSaveVehicle={noop} onDeleteVehicle={noop}/>}
 </main>;
}createRoot(document.getElementById('root')!).render(<Fixture/>);
