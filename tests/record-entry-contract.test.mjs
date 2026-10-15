import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('drawer form entry invokes only the coordinator, not a second navigation callback',()=>{
 const header=read('src/components/Header.tsx');
 assert.match(header,/if \(tab === 'form'\) onNewRecord\(\);\s*else setActiveTab\(tab\)/);
 assert.match(read('src/components/HomeScreen.tsx'),/if \(item.id === 'form'\) \{ onNewRecord\(\); return; \}/);
 const app=read('src/App.tsx');
 assert.match(app,/recordEntry\.request\(\{childId,date\}\)/);
 assert.match(app,/await recordEntry\.request\(\{childId:result\.clientAction\.childId/);
});
test('production merge verifies local answers and server revisions before the atomic RPC',()=>{
 const service=read('src/services/dataService.ts').split('export async function mergeOwnRecordDrafts')[1].split('export async function listRecordDrafts')[0];
 assert.ok(service.indexOf('loadRecordDraft(')<service.indexOf("rpc('merge_own_record_drafts'"));
 assert.ok(service.indexOf('assertDraftMergeSynced(')<service.indexOf("rpc('merge_own_record_drafts'"));
 assert.match(service,/localStorage\.getItem\(key\)!==raw/);
 assert.match(read('src/components/RecordForm.tsx'),/await draftWrites\.idle\(\)/);
});
test('merge RPC retains authorization, device guards, locked revisions and saved-record isolation',()=>{
 const sql=read('supabase/migrations/202610150001_merge_own_record_drafts.sql');
 for(const token of ['auth.uid()','public.current_organization_id()','public.current_recorder_profile_id()',"'app.support_device_token'",'row_value.user_id is distinct from auth.uid()','row_value.recorder_profile_id is distinct from p_recorder_profile_id','order by d.draft_key for update','DRAFT_MERGE_CHANGED','DRAFT_MERGE_OVERLAP','record-edit-%','record-correction-%','from public,anon','to authenticated'])assert.ok(sql.includes(token),token);
 assert.doesNotMatch(sql,/\b(?:update|delete from|insert into)\s+public\.support_records/i);
 assert.doesNotMatch(sql,/disable\s+(?:trigger|row level security)/i);
});
