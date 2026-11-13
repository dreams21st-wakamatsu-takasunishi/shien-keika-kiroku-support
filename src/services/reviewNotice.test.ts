import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from '../types';
import { canLoadWordNotice, LessonRequestError, wordNoticeErrorGuidance } from '../learning/reviewNotice';
const profile = { role: 'staff', recorderProfileId: 'fake-recorder', accessDeviceKind: 'personal', fieldModeOnly: false } as UserProfile;
test('Word notification eligibility mirrors learning access without weakening personal-device restrictions', () => {
  assert.equal(canLoadWordNotice(undefined), false);
  assert.equal(canLoadWordNotice(profile), false);
  assert.equal(canLoadWordNotice({ ...profile, accessDeviceKind: 'facility_shared' }), true);
  for (const role of ['admin', 'manager'] as const) assert.equal(canLoadWordNotice({ ...profile, role }), true);
  assert.equal(canLoadWordNotice({ ...profile, role: 'admin', fieldModeOnly: true }), false);
  assert.equal(canLoadWordNotice({ ...profile, recorderProfileId: undefined }), true);
});
test('notification failures explain next steps, never claim zero requests', () => {
  assert.match(wordNoticeErrorGuidance(new LessonRequestError('safe', 403)), /権限/);
  assert.match(wordNoticeErrorGuidance(new LessonRequestError('safe', 401)), /再ログイン/);
  assert.match(wordNoticeErrorGuidance(new LessonRequestError('safe', 503)), /エラー履歴/);
  assert.match(wordNoticeErrorGuidance(new Error('network')), /0件であることを意味しません/);
});
