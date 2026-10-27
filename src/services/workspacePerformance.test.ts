import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceLoadPlan,runWorkspaceQueries,selectWorkspacePatch,WORKSPACE_TABLES} from './workspaceLoadPlan';
import {createWorkspaceRefreshQueue} from './workspaceRefreshQueue';
import {recordSaveSnapshotFilter,RECORD_DRAFT_SUMMARY_SELECT} from './recordReadModel';
import {addPerformanceTiming,clearPerformanceTimings,measureOperation,readPerformanceSummary} from './performanceMetrics';
import {sameUserProfile} from '../utils/userProfileIdentity';
import type {SupportRecord,UserProfile} from '../types';
import type {WorkspaceData} from './dataService';
const sorted = (values: Iterable<string>) => [...values].sort();

test('morning edit performs one request, not twenty-nine or any support-record read', async () => {
  const reads: string[] = [];
  const result = await runWorkspaceQueries(['morning_meeting_records'],WORKSPACE_TABLES.map(table=>async()=>{reads.push(table);return table;}),'skipped');
  assert.deepEqual(reads,['morning_meeting_records']);assert.equal(result.length,29);
  assert.deepEqual(sorted(workspaceLoadPlan(['morning_meeting_records']).outputs),['morningMeetingRecords']);
});
test('full load and unknown events conservatively retain all twenty-nine requests', async () => {
  for (const changed of [undefined,['future_table']]) {
    let calls=0;await runWorkspaceQueries(changed,WORKSPACE_TABLES.map(()=>async()=>++calls),0);assert.equal(calls,29);
  }
  assert.equal(workspaceLoadPlan([]).queries.size,0);
});
test('school, recorder and vehicle changes refresh display dependencies but never old records', () => {
  assert.deepEqual(sorted(workspaceLoadPlan(['schools']).queries),['child_regular_day_schedules','children','schools']);
  assert.deepEqual(sorted(workspaceLoadPlan(['handover_items']).queries),['handover_items','recorder_profiles']);
  assert.deepEqual(sorted(workspaceLoadPlan(['vehicles']).queries),['recorder_profiles','transport_runs','vehicles']);
  const recorder=workspaceLoadPlan(['recorder_profiles']);
  assert.equal(recorder.outputs.has('attendanceRecords'),true);assert.equal(recorder.outputs.has('transportRuns'),true);
  assert.equal(recorder.queries.has('support_records'),false);
});
test('transport notifications reload runs plus name dependencies, not the full workspace', () => {
  assert.deepEqual(sorted(workspaceLoadPlan(['transport_stop_events','transport_run_covers']).queries),['recorder_profiles','transport_runs','vehicles']);
});
test('patch never replaces unrelated state with placeholder empty lists', () => {
  const workspace={records:['keep'],morningMeetingRecords:[],children:['keep-child']} as unknown as WorkspaceData;
  assert.deepEqual(selectWorkspacePatch(workspace,['morning_meeting_records']),{morningMeetingRecords:[]});
});
test('unselected factories are never evaluated and failures propagate without an empty result',async()=>{
  const factories=WORKSPACE_TABLES.map(table=>()=>{if(table==='morning_meeting_records')return Promise.reject(Error('offline'));throw Error('unrelated query');});
  await assert.rejects(()=>runWorkspaceQueries(['morning_meeting_records'],factories,null),/offline/);
  await assert.rejects(()=>runWorkspaceQueries([],[],null),/mismatch/);
});
test('notifications arriving during initial load coalesce by table without repeating full load',async()=>{
  const queue=createWorkspaceRefreshQueue();queue.reset('account-a');
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),calls:(string[]|undefined)[]=[];
  const work=async(tables:string[]|undefined)=>{calls.push(tables);if(calls.length===1)await gate;};
  const first=queue.request(undefined,work);
  queue.request(['morning_meeting_records'],work);queue.request(['morning_meeting_records','attendance_records'],work);
  release();await first;
  assert.deepEqual(calls,[undefined,['morning_meeting_records','attendance_records']]);
});
test('late old-account response cannot publish or block new-account initial load',async()=>{
  const queue=createWorkspaceRefreshQueue();queue.reset('account-a');
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),published:string[]=[];
  const old=queue.request(undefined,async(_tables,current)=>{await gate;if(current())published.push('a');});
  queue.reset('account-b');await queue.request(undefined,async(_tables,current)=>{if(current())published.push('b');});
  release();await old;assert.deepEqual(published,['b']);
});
test('explicit full refresh takes precedence and a failed read can be retried',async()=>{
  const queue=createWorkspaceRefreshQueue();let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),calls:unknown[]=[];
  const work=async(tables:unknown)=>{calls.push(tables);if(calls.length===1)await gate;};
  const first=queue.request(['schools'],work);queue.request(['children'],work);queue.request(undefined,work);release();await first;
  assert.deepEqual(calls,[['schools'],undefined]);
  await assert.rejects(()=>queue.request([],async()=>{throw Error('offline');}),/offline/);
  let retried=false;await queue.request([],async()=>{retried=true;});assert.equal(retried,true);
});
test('save snapshot unifies active day/ID matches and deleted incoming IDs without dropping full comparisons',()=>{
  const records=[{id:'record-a',childId:'child-a',date:'2026-10-16'},{id:'record-b',childId:'child-a',date:'2026-10-16'}] as SupportRecord[];
  assert.equal(recordSaveSnapshotFilter(records),'and(deleted_at.is.null,child_id.in.("child-a"),record_date.in.("2026-10-16")),id.in.("record-a","record-b")');
  const escaped=recordSaveSnapshotFilter([{id:'id",),evil',childId:'a\\b',date:'2026-10-16'}] as SupportRecord[]);
  assert.ok(escaped.includes('"id\\",),evil"'));assert.ok(escaped.includes('"a\\\\b"'));
});
test('draft list projects every summary field without downloading child answers or full payload',()=>{
  for(const field of ['selectedChildIds','recorderId','recorderName','selectedTemplateId','takenOverFromDraftKeys','takenOverFromDraftKey','takenOverAt','date','currentStepIndex'])assert.ok(RECORD_DRAFT_SUMMARY_SELECT.includes(`${field}:payload->${field}`));
  assert.ok(!RECORD_DRAFT_SUMMARY_SELECT.split(',').includes('payload'));
  assert.ok(!RECORD_DRAFT_SUMMARY_SELECT.includes('childDrafts'));
});
test('token refresh reuses identity only when all role, user, device and recorder properties match',()=>{
  const profile={id:'a',organizationId:'org',displayName:'Test',role:'staff',fieldModeOnly:false,accessDeviceId:'device',recorderProfileId:'recorder'} as UserProfile;
  assert.equal(sameUserProfile(profile,{...profile}),true);assert.equal(sameUserProfile(null,profile),false);
  for(const change of [{role:'admin'},{id:'b'},{organizationId:'other'},{fieldModeOnly:true},{accessDeviceId:'other'},{recorderProfileId:'other'},{facilityLogin:true}])assert.equal(sameUserProfile(profile,{...profile,...change} as UserProfile),false);
});
test('timings are bounded, allowlisted, session-only and contain no arbitrary fields',async()=>{
  clearPerformanceTimings();addPerformanceTiming('private name' as any,12,true);addPerformanceTiming('record.write',Infinity,true);
  assert.deepEqual(readPerformanceSummary(),[]);
  for(let index=0;index<110;index++)addPerformanceTiming('record.write',index,true);
  assert.equal(readPerformanceSummary()[0].count,100);
  await assert.rejects(()=>measureOperation('record.snapshot',async()=>{throw Error('secret name https://private/token');}),/secret/);
  await measureOperation('record.write',async()=>({secret:'must not be stored'}));
  assert.equal(readPerformanceSummary().find(row=>row.phase==='record.snapshot')?.failed,1);
  assert.ok(!JSON.stringify(readPerformanceSummary()).includes('secret'));clearPerformanceTimings();assert.deepEqual(readPerformanceSummary(),[]);
});
test('old in-flight timings cannot leak into the next login session',async()=>{
  clearPerformanceTimings();let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  const old=measureOperation('workspace.initial',()=>gate);clearPerformanceTimings();release();await old;
  assert.deepEqual(readPerformanceSummary(),[]);
});
