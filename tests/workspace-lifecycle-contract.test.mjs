import {readFileSync} from 'node:fs';import {test} from 'node:test';import assert from 'node:assert/strict';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8'),sql=read('supabase/migrations/202610190001_workspace_trash_and_withdrawals.sql');
test('recoverable deletion is manager/admin only, scope-bound, revision-locked and audited',()=>{
 for(const marker of ["current_user_role() in ('admin','manager')","is distinct from 'personal'",'for update','p_expected_revision','revision=revision+1','organization_id=$1','WORKSPACE_ITEM_DELETED','WORKSPACE_DELETE_RPC_REQUIRED',"action in ('delete','restore','withdraw')",'actor_name text not null'])assert.ok(sql.includes(marker),marker);
 assert.ok(!/\btruncate\b|disable row level|delete from public\./i.test(sql.split('create function public.withdraw_own_workspace_request')[0]));
});
test('withdrawal locks the request, checks both creator and bound recorder, and keeps the snapshot private',()=>{
 const body=sql.split('create function public.withdraw_own_workspace_request')[1].split('-- A stale manager')[0];
 for(const marker of ['for update',"item->>'created_by' is distinct from auth.uid()::text","item->>'recorder_profile_id' is distinct from public.current_recorder_profile_id()::text","item->>'status'<>'申請中'",'p_expected_updated_at','request_snapshot'])assert.ok(body.includes(marker),marker);
 assert.ok(!body.includes('update public.attendance_records'));assert.ok(sql.includes('REQUEST_ALREADY_WITHDRAWN'));
 assert.ok(!sql.match(/grant select\([^)]*request_snapshot/));
});
test('all six retention resources have live filters, delete controls and central restore',()=>{
 for(const file of ['src/services/activityPlanService.ts','src/services/facilityWorkService.ts','src/meeting/meetingService.ts','src/services/dataService.ts'])assert.ok(read(file).includes("is('deleted_at',null)"),file);
 for(const [file,resources] of [['src/components/ActivityPlanWorkspace.tsx',['activity_plans']],['src/components/FacilityWorkspace.tsx',['facility_documents','supply_items']],['src/meeting/MeetingWorkspace.tsx',['meeting_cases']],['src/components/MorningMeetingPanel.tsx',['morning_meeting_records']],['src/components/HandoverPanel.tsx',['handover_items']]])for(const resource of resources)assert.ok(read(file).includes(`resource="${resource}"`),resource);
 assert.ok(read('src/components/SettingsHub.tsx').includes("page === 'trash'"));
 assert.ok(read('src/components/AttendanceHomePanel.tsx').includes('<OwnRequestWithdrawals'));
});
test('morning deletion stops autosave and preserves text without resurrecting the row',()=>{
 const source=read('src/components/MorningMeetingPanel.tsx');for(const token of ['deletedDateRef.current===targetDateRef.current','readOnly={deletedDate===targetDate}','入力は保持しています','d-support:workspace-item-deleted'])assert.ok(source.includes(token),token);
 assert.ok(source.includes('deletedDateRef.current!==detail.id'));
 assert.ok(source.includes('detail.id!==targetDateRef.current'));
 assert.ok(read('src/App.tsx').includes('restore:payload.new.deleted_at===null'));
});
test('lifecycle service and error diagnostics cannot export document bodies or raw exceptions',()=>{
 const source=read('src/services/workspaceLifecycle.ts');assert.ok(!source.includes('error.message'));assert.ok(source.includes("eq('actor_id',userId)"));
 assert.ok(!source.includes("select('*')"));assert.ok(!source.includes('request_snapshot'));
});
