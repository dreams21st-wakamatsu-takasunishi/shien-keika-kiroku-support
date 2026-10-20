import test from 'node:test';
import assert from 'node:assert/strict';
import { sameMeetingCase, meetingSaveDelay } from './meetingAutosave';
import { emptyMeetingContent, type MeetingCase } from './types';

function sample(): MeetingCase {
  return { id: 'fake-meeting', organizationId: 'fake-org', childId: 'a', childIds: ['a', 'b'],
    title: '架空会議', meetingDate: '2026-10-20', meetingType: 'ケース会議', status: '準備中',
    revision: 1, createdBy: 'fake-user', updatedAt: '', editorUserIds: ['x', 'y'],
    content: { ...emptyMeetingContent(), agenda: [{ id: 'q', title: '確認', question: '', status: '未確認', memo: 'メモ', decision: '', owner: '', dueDate: '' }] } };
}

test('JSONB key order and omitted undefined fields do not trigger another save', () => {
  const draft = sample();
  draft.content.recordingExplainedAt = undefined;
  const reorder = (value: unknown): unknown => Array.isArray(value) ? value.map(reorder)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reorder(v)])) : value;
  const saved = reorder(JSON.parse(JSON.stringify(draft))) as MeetingCase;
  saved.revision = 9; saved.updatedAt = '2026-10-20T01:00:00Z';
  assert.equal(sameMeetingCase(draft, saved), true);
});

test('real edits including nested notes, optional consent, array order and context remain dirty', () => {
  const original = sample();
  const changes: Array<(m: MeetingCase) => void> = [
    m => { m.content.agenda[0].memo += '変更'; },
    m => { m.content.recordingExplainedAt = '2026-10-20T01:00:00Z'; },
    m => { m.childIds.reverse(); }, m => { m.editorUserIds.reverse(); },
    m => { m.content.outcome.agreements = '保持する合意'; },
    m => { m.title += '変更'; }, m => { m.status = '開催中'; },
    m => { m.organizationId = 'other'; }, m => { m.id = 'other'; },
  ];
  for (const change of changes) { const edited = structuredClone(original); change(edited); assert.equal(sameMeetingCase(original, edited), false); }
});

test('idle batching is 2.5 seconds with a 10 second maximum wait during continuous typing', () => {
  assert.equal(meetingSaveDelay(1000, 1000), 2500);
  assert.equal(meetingSaveDelay(1000, 10000), 1000);
  assert.equal(meetingSaveDelay(1000, 11000), 0);
  assert.equal(meetingSaveDelay(1000, 12000), 0);
});
