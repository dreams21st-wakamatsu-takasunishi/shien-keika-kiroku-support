import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('backup readiness does not dump data, read keys or claim approved storage',()=>{
 const source=read('scripts/check-backup-readiness.ps1');assert.match(source,/realDataExported = \$false/);assert.match(source,/productionBackupReady = \$false/);assert.doesNotMatch(source,/PGPASSWORD|service_role|SUPABASE_ACCESS_TOKEN|Start-Process|Invoke-WebRequest|Remove-Item/);
});
test('synthetic restore has no remote-client path and reports production limitations',()=>{
 const source=read('scripts/check-backup-rehearsal.mjs');assert.match(source,/Network is disabled/);assert.match(source,/realDataExported:false/);assert.match(source,/productionRestoreVerified:false/);assert.doesNotMatch(source,/lesson-operation-client|createClient|postgres:\/\/|supabase\.co/);
});
test('record read optimization preserves the helper and changes no rows, grants or write policies',()=>{
 const source=read('supabase/migrations/202610260001_record_read_access_initplan.sql');assert.match(source,/provolatile='s'/);assert.match(source,/differs from expected/);assert.match(source,/using\(organization_id=\(select public.current_organization_id\(\)\)\)/);assert.doesNotMatch(source,/\b(delete from|insert into|update public|grant|drop table|create or replace function)\b/i);
});
