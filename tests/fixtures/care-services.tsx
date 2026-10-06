import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ChildrenManager} from '../../src/components/ChildrenManager';
import {SettingsHub} from '../../src/components/SettingsHub';
import {DEFAULT_AI_WRITING_SETTINGS,DEFAULT_TRANSPORT_ROUTE_SETTINGS,type ChildProfile,type UserProfile} from '../../src/types';
import '../../src/index.css';
const org='22222222-2222-4222-8222-222222222222';
function Fixture(){
 const [page,setPage]=useState<'children'|'settings'>('children');
 const [children,setChildren]=useState<ChildProfile[]>([{id:'combined',name:'架空 併用児',grade:'小学3年生',careType:'放課後等デイサービス',regularDays:['火']},{id:'visitor',name:'架空 訪問児',grade:'未就学',careType:'保育所等訪問支援',visitingSupportEnabled:true}]);
 const params=new URLSearchParams(location.search),role=params.get('role')==='manager'?'manager':'admin';
 const currentUser:UserProfile={id:'11111111-1111-4111-8111-111111111111',organizationId:org,role,displayName:'架空管理者'};
 const noop=()=>{};
 return <main className="mx-auto max-w-6xl space-y-4 p-4"><nav className="flex gap-2"><button onClick={()=>setPage('children')}>試験用：児童名簿</button><button onClick={()=>setPage('settings')}>試験用：設定</button></nav>
  {page==='children'?<ChildrenManager childrenList={children} canEdit onAddChild={child=>setChildren(rows=>[...rows,child])} onUpdateChild={child=>setChildren(rows=>rows.map(row=>row.id===child.id?child:row))} onDeleteChild={id=>setChildren(rows=>rows.filter(row=>row.id!==id))}/>:<SettingsHub currentUser={currentUser} aiWritingSettings={DEFAULT_AI_WRITING_SETTINGS} templates={[]} childrenList={children} schools={[]} facilityAddress="" routeSettings={DEFAULT_TRANSPORT_ROUTE_SETTINGS} mapLocations={[]} areaZones={[]} recorderProfiles={[]} staffShiftTemplates={[]} rolePermissions={[]} vehicles={[]} canManageChildren canManageRecordSettings canManageTransport onSaveAiWritingSettings={noop} onSaveTemplate={noop} onDeleteTemplate={noop} onSaveSchool={noop} onDeleteSchool={noop} onSaveMapLocation={noop} onSaveAreaZone={noop} onDeleteAreaZone={noop} onSaveRouteSettings={noop} onSaveStaffShiftTemplate={noop} onDeleteStaffShiftTemplate={noop} onSaveRolePermission={noop} onSaveVehicle={noop} onDeleteVehicle={noop}/>}
  <output aria-label="試験用の児童データ" className="hidden">{JSON.stringify(children)}</output>
 </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
