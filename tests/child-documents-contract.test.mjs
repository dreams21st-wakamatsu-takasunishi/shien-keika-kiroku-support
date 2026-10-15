import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('private document metadata is not added to the general child profile or general workspace',()=>{
 const child=read('src/types.ts').split('export interface ChildProfile {')[1].split('\n}')[0];assert.doesNotMatch(child,/contractDate|monitoringMonths|documentEntries/);
 const app=read('src/App.tsx');assert.match(app,/currentUser=\{auth.profile\} onDocumentDirtyChange=\{setDocumentDirty\}/);assert.match(app,/documentDirty\?'保管書類'/);
 const service=read('src/services/childDocumentService.ts');assert.match(service,/get_child_document_register/);assert.doesNotMatch(service,/functions\.invoke|openai|tiro|localStorage\.setItem|storage\.from/);
});
test('document SQL restricts direct reads and writes and preserves all correction history',()=>{
 const sql=read('supabase/migrations/202610150006_child_document_register.sql');
 for(const marker of ["current_user_role() in ('admin','manager')","current_request_device_kind() is distinct from 'personal'",'p.active','enable row level security','revoke all on public.child_document_settings,public.child_document_entries','grant select on public.child_document_settings','DOCUMENT_HISTORY_IMMUTABLE','for update','DOCUMENT_CONFLICT','replaces_id uuid unique','p_expected_revision','created_by_name'])assert.ok(sql.includes(marker),marker);
 assert.doesNotMatch(sql,/\b(?:update|delete from|insert into)\s+public\.(?:support_records|children|profiles)\b/i);
 assert.doesNotMatch(sql,/grant\s+(?:all|insert|update|delete)\b[^;]+to\s+authenticated/i);
});
test('document UI cannot bypass the strict role check or silently discard an unsaved child',()=>{
 const source=read('src/components/ChildDocumentWorkspace.tsx');for(const marker of ['canManageChildDocuments(props.user)','dirtyRows','if (dirtyCount)','beforeunload','入力を戻す','api.entry','未確認・未入力だけ表示'])assert.ok(source.includes(marker),marker);
 assert.match(read('src/components/ChildrenManager.tsx'),/canDocuments&&currentUser\?<ChildDocumentWorkspace/);
});
