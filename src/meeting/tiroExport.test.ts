import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTiroContext, buildTiroSheet, composeMeetingProgress } from './tiroExport';
import { emptyMeetingContent, type MeetingCase } from './types';

test('Tiro export includes only selected terms and no meeting outcome', () => {
  const meeting: MeetingCase = {
    id: 'meeting-1', organizationId: 'org-1', childId: 'child-1', childIds: ['child-1'],
    title: '担当者会議', meetingType: '担当者会議', meetingDate: '2026-09-29',
    status: '準備中', revision: 1, createdBy: 'user-1', updatedAt: '', editorUserIds: [],
    content: {
      ...emptyMeetingContent(), purpose: '進学時の支援を話す',
      terms: [
        { id: 'a', spelling: '白橋', reading: 'しらはし', hint: '人名', includeInTiro: true },
        { id: 'b', spelling: '内部メモ', reading: '', hint: '', includeInTiro: false },
      ],
      outcome: { ...emptyMeetingContent().outcome, agreements: '未確認の決定事項' },
    },
  };
  const child = { name: '山田 太郎', kana: 'やまだ たろう' };
  for (const output of [buildTiroContext(meeting, [child]), buildTiroSheet(meeting, [child])]) {
    assert.match(output, /白橋/);
    assert.doesNotMatch(output, /内部メモ|未確認の決定事項/);
  }
  assert.match(composeMeetingProgress(meeting), /未確認の決定事項/);
});

test('multi-child meeting lists everyone but keeps child wishes in each child progress', () => {
  const meeting: MeetingCase = {
    id: 'meeting-2', organizationId: 'org-1', childId: 'child-1', childIds: ['child-1', 'child-2'],
    title: '兄弟会議', meetingType: 'ケース会議', meetingDate: '2026-09-29',
    status: '結果確認済み', revision: 1, createdBy: 'user-1', updatedAt: '', editorUserIds: [],
    content: { ...emptyMeetingContent(), childWishes: { 'child-1': '兄の意向', 'child-2': '弟の意向' } },
  };
  const context = buildTiroContext(meeting, [{ name: '兄' }, { name: '弟' }]);
  assert.match(context, /兄、弟/);
  const older = composeMeetingProgress(meeting, 'child-1');
  const younger = composeMeetingProgress(meeting, 'child-2');
  assert.match(older, /兄の意向/);
  assert.doesNotMatch(older, /弟の意向/);
  assert.match(younger, /弟の意向/);
  assert.doesNotMatch(younger, /兄の意向/);
});
