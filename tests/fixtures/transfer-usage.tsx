import React from 'react';
import {createRoot} from 'react-dom/client';
import {SettingsHub} from '../../src/components/SettingsHub';
import {diagnosticFetch} from '../../src/services/diagnostics';
import type {TransportRouteSettings,UserProfile} from '../../src/types';
import '../../src/index.css';

const params=new URLSearchParams(location.search);
const noop=()=>{};
const currentUser={id:'fixture-admin',organizationId:params.get('org')||'fixture-org',role:params.get('role')||'admin'} as UserProfile;
const localResponses=Promise.all([
 diagnosticFetch(new URL('/rest/v1/children',location.origin),{method:'HEAD'}),
 diagnosticFetch(new URL('/functions/v1/lesson-learning',location.origin)),
]);
void localResponses.then(()=>{
 createRoot(document.getElementById('root')!).render(<main className="min-h-screen bg-slate-50 p-3"><SettingsHub
 currentUser={currentUser} templates={[]} childrenList={[]} schools={[]} facilityAddress="" routeSettings={{} as TransportRouteSettings}
 mapLocations={[]} areaZones={[]} recorderProfiles={[]} staffShiftTemplates={[]} rolePermissions={[]} vehicles={[]}
 canManageChildren={false} canManageRecordSettings={false} canManageTransport={false}
 onSaveTemplate={noop} onDeleteTemplate={noop} onSaveSchool={noop} onDeleteSchool={noop} onSaveMapLocation={noop}
 onSaveAreaZone={noop} onDeleteAreaZone={noop} onSaveRouteSettings={noop} onSaveStaffShiftTemplate={noop}
 onDeleteStaffShiftTemplate={noop} onSaveRolePermission={noop} onSaveVehicle={noop} onDeleteVehicle={noop}
 /></main>);
});
