import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('personal-device mode still returns without loading the shared workspace and late scopes are rejected',()=>{
  const source=read('src/App.tsx'),refresh=source.split('const refreshRemoteData = useCallback')[1].split('const scheduleRemoteRefresh')[0];
  const guard=refresh.indexOf('if (auth.profile.fieldModeOnly)'),load=refresh.indexOf('await loadWorkspaceData(');
  assert.ok(guard>=0&&guard<load);assert.ok(refresh.slice(guard,load).includes('return;'));
  assert.ok(refresh.includes('workspaceScopeRef.current !== workspaceScope'));
  assert.ok(refresh.includes('!current()'));
  assert.equal((source.match(/table: 'recorder_profiles'.*scheduleRemoteRefresh/g)||[]).length,1);
  assert.ok(source.includes('previouslySubscribed && !workspaceRealtimeReadyRef.current'));
});
test('optimized snapshot retains organization and complete overwrite content, while guarded writes and draft CAS remain',()=>{
  const source=read('src/services/dataService.ts'),snapshot=source.split('export async function loadRecordSaveSnapshot')[1].split('export function saveRecords')[0];
  assert.equal((snapshot.match(/from\('support_records'\)/g)||[]).length,1);
  assert.ok(snapshot.includes("select('*')"));assert.ok(snapshot.includes("eq('organization_id', organizationId)"));
  for(const marker of ["rpc('save_support_records_guarded'", "rpc('save_record_draft_guarded'", ".eq('revision', expectedRevision)","payload.selectedChildIds.filter"])assert.ok(source.includes(marker),marker);
});
test('only known screen modules are lazily loaded behind the existing safe panel boundary',()=>{
  const app=read('src/App.tsx'),screens=read('src/components/DeferredAppScreens.tsx');
  for(const name of ['RecordForm','RecordList','TeamManager','ChildrenManager','MeetingWorkspace','LessonLearningManager']){
    assert.ok(screens.includes('export const '+name+' = createDeferredPanel'));
    assert.ok(!new RegExp(`import \\{ ${name} \\} from`).test(app));
  }
  assert.ok(read('src/components/DeferredPanel.tsx').includes('自動で画面更新は行いません'));
});
