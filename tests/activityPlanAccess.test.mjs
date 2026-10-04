import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('activity plans isolate organizations, exclude personal field devices and forbid deletion', () => {
  const sql = read('supabase/migrations/202610040001_activity_plans.sql');
  assert.ok(sql.includes('alter table public.activity_plans enable row level security'));
  for (const policy of ['read','insert','update']) {
    const block = sql.split(`create policy activity_plan_${policy}`)[1].split(';')[0];
    assert.ok(block.includes('organization_id = public.current_organization_id()'));
    assert.ok(block.includes("public.current_request_device_kind() = 'facility_shared'"));
  }
  assert.ok(!/grant\s+delete|grant\s+all/i.test(sql));
  assert.ok(sql.includes('public.write_audit_log()'));
  assert.ok(sql.includes('new.revision <> old.revision + 1'));
});
test('remote saves are optimistic, drafts are scoped and cleared on signout, child records are untouched', () => {
  const service = read('src/services/activityPlanService.ts');
  assert.ok(service.includes(".eq('revision', plan.revision)"));
  assert.ok(!service.includes("from('support_records')"));
  const component = read('src/components/ActivityPlanWorkspace.tsx');
  assert.ok(component.includes('d-support-activity-draft-v1:${organizationId}:${userId}'));
  assert.ok(component.includes("window.addEventListener('beforeunload', warn)"));
  assert.ok(read('src/hooks/useAuth.ts').includes("key.startsWith('d-support-activity-draft-v1:')"));
  assert.ok(read('src/App.tsx').includes("activeTab === 'activityPlans' && !auth.profile?.fieldModeOnly"));
});
