import test from 'node:test';
import assert from 'node:assert/strict';
import { activityDraftStorageKey, hasPendingActivityDraft, installActivityDraftCloseWarning } from './activityDraftWarning';
import { emptyActivity } from './activityPlans';

test('activity draft close guard reads current pending state, cancels unload, and cleans up', () => {
  let pending = false;
  const handlers = new Map<string, (event: any) => void>();
  const target = { addEventListener: (name: string, handler: any) => handlers.set(name, handler), removeEventListener: (name: string, handler: any) => { if (handlers.get(name) === handler) handlers.delete(name); } };
  const cleanup = installActivityDraftCloseWarning(target as any, () => pending);
  const fire = () => { let prevented = false; const event = { preventDefault: () => { prevented = true; }, returnValue: 'unchanged' }; handlers.get('beforeunload')?.(event); return { prevented, value: event.returnValue }; };
  assert.deepEqual(fire(), { prevented: false, value: 'unchanged' });
  pending = true;
  assert.deepEqual(fire(), { prevented: true, value: '' });
  assert.deepEqual(fire(), { prevented: true, value: '' }); // cancelling close must not clear the warning
  pending = false;
  assert.equal(fire().prevented, false);
  cleanup(); assert.equal(handlers.size, 0);
});

test('pending activity warnings only read the exact current account and organization', () => {
  const key = activityDraftStorageKey('facility-a', 'staff-a');
  const draft = { ...emptyActivity(), title: '架空の未保存指導案' };
  const rows = new Map([[key, JSON.stringify(draft)]]);
  const reads: string[] = [];
  const storage = { getItem: (requested: string) => { reads.push(requested); return rows.get(requested) ?? null; } };
  assert.equal(hasPendingActivityDraft(storage, key), true);
  assert.equal(hasPendingActivityDraft(storage, activityDraftStorageKey('facility-a', 'staff-b')), false);
  assert.equal(hasPendingActivityDraft(storage, activityDraftStorageKey('facility-b', 'staff-a')), false);
  assert.equal(reads.length, 3);
  assert.equal(rows.get(key), JSON.stringify(draft)); // no deletion or mutation on warning
});

test('missing, malformed, or unavailable session storage does not trap a clean editor', () => {
  for (const raw of [null, '', '{', '{}', JSON.stringify({ id: 'broken', content: {} })]) {
    assert.equal(hasPendingActivityDraft({ getItem: () => raw }, 'key'), false);
  }
  assert.equal(hasPendingActivityDraft({ getItem: () => { throw Error('Storage disabled'); } }, 'key'), false);
});
