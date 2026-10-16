import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('audit optimization retains organization and role checks without deleting or rewriting history',()=>{
 const sql=read('supabase/migrations/202610160002_audit_history_lookup.sql');
 for(const marker of ['organization_id,occurred_at desc,id desc','(select public.current_organization_id())','(select public.current_user_role())',"('manager','admin')",'for select to authenticated'])assert.ok(sql.includes(marker),marker);
 assert.doesNotMatch(sql,/\b(delete\s+from|update\s+public|truncate|disable row level|statement_timeout)\b/i);
});
test('audit requests are lazy, cancelable, scoped, bounded and separate from team list loading',()=>{
 const source=read('src/components/TeamManager.tsx'),refresh=source.split('const refresh = async () => {')[1].split('const loadAudits=')[0];
 assert.ok(!refresh.includes("from('audit_logs')"));
 for(const marker of ["activeSection==='audit'", ".eq('organization_id',currentUser.organizationId)",".order('id',{ascending:false}).limit(30)",'abortSignal(controller.signal)','監査履歴の読み込みを再試行',"result.error.code==='57014'",'request!==auditRequest.current'])assert.ok(source.includes(marker),marker);
 assert.ok(!source.includes("select('*')"));
});
