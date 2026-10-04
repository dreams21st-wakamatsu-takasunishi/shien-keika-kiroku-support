import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('facility data has organization isolation, device checks, audit and no direct stock or deletion grants', () => {
  const sql = read('supabase/migrations/202610040002_facility_work.sql');
  for (const table of ['facility_documents', 'supply_items', 'supply_movements']) {
    assert.ok(sql.includes(`alter table public.${table} enable row level security`));
    assert.ok(sql.includes(`revoke all on public.facility_documents, public.supply_items, public.supply_movements from public, anon, authenticated`));
  }
  for (const name of ['facility_document_read', 'facility_document_insert', 'facility_document_update', 'supply_item_read', 'supply_item_insert', 'supply_item_update', 'supply_movement_read']) {
    const block = sql.split(`create policy ${name}`)[1].split(';')[0];
    assert.ok(block.includes('organization_id = public.current_organization_id()'));
    assert.ok(block.includes("public.current_request_device_kind() = 'facility_shared'"));
  }
  assert.ok(!/grant\s+(all|delete)/i.test(sql));
  const updateGrant = sql.match(/grant update \(([^)]+)\) on public.supply_items/)[1];
  assert.ok(!updateGrant.includes('quantity')); assert.ok(!/grant insert[^;]+supply_movements/.test(sql));
  assert.ok(sql.includes('for update;')); assert.ok(sql.includes('unique (organization_id,request_id)'));
  assert.ok(sql.includes('v_movement.created_by <> auth.uid()')); assert.ok(sql.includes('public.write_audit_log()'));
});
test('UI drafts and optimistic document saves are scoped; child records and automatic delivery are untouched', () => {
  const service = read('src/services/facilityWorkService.ts');
  assert.ok(service.includes(".eq('revision', doc.revision)")); assert.ok(service.includes(".eq('revision', item.revision)"));
  assert.ok(service.includes(".rpc('move_supply_stock'"));
  assert.ok(!service.includes("from('support_records')")); assert.ok(!service.includes("from('children')"));
  assert.ok(read('src/components/FacilityWorkspace.tsx').includes('d-support-facility-draft-v1:${organizationId}:${userId}'));
  assert.ok(read('src/hooks/useAuth.ts').includes("key.startsWith('d-support-facility-draft-v1:')"));
  assert.ok(read('src/App.tsx').includes("activeTab === 'facilityWork' && !auth.profile?.fieldModeOnly"));
});
