import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTiroContext, buildTiroSheet, composeMeetingProgress } from './tiroExport';
import { emptyMeetingContent, type MeetingCase } from './types';

test('Tiro export includes only selected terms and no meeting outcome', () => {
  const meeting: MeetingCase = {
    id: 'meeting-1', organizationId: 'org-1', childId: 'child-1',
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
  for (const output of [buildTiroContext(meeting, child), buildTiroSheet(meeting, child)]) {
    assert.match(output, /白橋/);
    assert.doesNotMatch(output, /内部メモ|未確認の決定事項/);
  }
  assert.match(composeMeetingProgress(meeting), /未確認の決定事項/);
});
