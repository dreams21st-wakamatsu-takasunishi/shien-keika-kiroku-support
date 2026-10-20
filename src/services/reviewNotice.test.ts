import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from '../types';
import { canLoadWordNotice, LessonRequestError, wordNoticeRetryDelay, wordNoticeErrorGuidance } from '../learning/reviewNotice';
const profile = { role: 'staff', recorderProfileId: 'fake-recorder', accessDeviceKind: 'personal', fieldModeOnly: false } as UserProfile;
test('Word notification eligibility mirrors learning access without weakening personal-device restrictions', () => {
  assert.equal(canLoadWordNotice(undefined), false);
  assert.equal(canLoadWordNotice(profile), false);
  assert.equal(canLoadWordNotice({ ...profile, accessDeviceKind: 'facility_shared' }), true);
  for (const role of ['admin', 'manager'] as const) assert.equal(canLoadWordNotice({ ...profile, role }), true);
  assert.equal(canLoadWordNotice({ ...profile, role: 'admin', fieldModeOnly: true }), false);
  assert.equal(canLoadWordNotice({ ...profile, recorderProfileId: undefined }), true);
});
test('permanent auth and configuration failures stop repeated polling; transient failures back off', () => {
  for (const status of [400, 401, 403, 404, 405, 422]) assert.equal(wordNoticeRetryDelay(new LessonRequestError('safe', status), 1), null);
  assert.deepEqual([1, 2, 3, 4, 10].map(n => wordNoticeRetryDelay(new LessonRequestError('safe', 503), n)), [60000, 120000, 240000, 300000, 300000]);
  assert.equal(wordNoticeRetryDelay(new Error('network'), 1), 60000);
});
test('notification failures explain next steps, never claim zero requests', () => {
  assert.match(wordNoticeErrorGuidance(new LessonRequestError('safe', 403)), /権限/);
  assert.match(wordNoticeErrorGuidance(new LessonRequestError('safe', 401)), /再ログイン/);
  assert.match(wordNoticeErrorGuidance(new LessonRequestError('safe', 503)), /エラー履歴/);
  assert.match(wordNoticeErrorGuidance(new Error('network')), /0件であることを意味しません/);
});
