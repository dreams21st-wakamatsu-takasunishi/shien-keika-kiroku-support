import test from 'node:test';
import assert from 'node:assert/strict';
import { activityTemplates, activityDuration, activityText, activityTimeline, copyActivity, emptyActivity, restoreActivityDraft, validateActivity } from './activityPlans';

test('four reusable activity templates validate without inventing participants or observations', () => {
  assert.equal(activityTemplates.length, 4);
  for (const template of activityTemplates) {
    const plan = copyActivity(template);
    assert.deepEqual(validateActivity(plan), []);
    assert.equal(plan.content.target, '');
    assert.equal(plan.content.reflection, '');
    assert.equal(activityDuration(plan), 45);
    assert.equal(plan.isTemplate, false);
  }
});
test('copying resets identity, date, completion and retrospective notes without mutating the source', () => {
  const p = copyActivity(activityTemplates[0]); p.id = 'existing'; p.revision = 3; p.status = '実施済み';
  p.content.reflection = '記録'; p.content.nextTime = '次回'; p.content.preparations[0].done = true;
  const copy = copyActivity(p);
  assert.equal(copy.id, ''); assert.equal(copy.revision, 0); assert.equal(copy.status, '下書き');
  assert.equal(copy.content.reflection, ''); assert.equal(copy.content.nextTime, ''); assert.equal(copy.content.preparations[0].done, false);
  assert.equal(p.content.preparations[0].done, true);
  assert.equal(copyActivity(p, true).date, ''); assert.equal(copyActivity(p, true).isTemplate, true);
});
test('sequential times include midnight rollover and missing start time is never guessed', () => {
  const p = copyActivity(activityTemplates[0]); p.content.startTime = '23:50';
  assert.deepEqual(activityTimeline(p), ['23:50～23:55', '23:55～翌日 00:25', '翌日 00:25～翌日 00:35']);
  p.content.startTime = ''; assert.ok(activityTimeline(p).every((t) => t === '時刻未設定'));
});
test('invalid dates, title, times, item counts and durations are rejected', () => {
  const p = emptyActivity(); assert.ok(validateActivity(p).some((e) => e.includes('活動名')));
  p.title = 'テスト'; p.date = '2026-02-30'; assert.ok(validateActivity(p).some((e) => e.includes('実施日')));
  p.date = '2026-10-04'; p.content.startTime = '25:00'; assert.ok(validateActivity(p).some((e) => e.includes('開始時刻')));
  p.content.startTime = '14:00'; p.content.steps = [{ id: '1', title: '活動', minutes: 1.5, support: '' }];
  assert.ok(validateActivity(p).some((e) => e.includes('1～600分')));
  p.content.steps = Array.from({ length: 41 }, (_, i) => ({ id: `${i}`, title: '活動', minutes: 10, support: '' }));
  assert.ok(validateActivity(p).some((e) => e.includes('40件')));
});
test('ready status requires real preparation checks but drafts remain saveable', () => {
  const p = copyActivity(activityTemplates[2]); assert.deepEqual(validateActivity(p), []);
  p.status = '準備完了'; assert.ok(validateActivity(p).some((e) => e.includes('チェック')));
  p.content.preparations.forEach((x) => x.done = true); assert.deepEqual(validateActivity(p), []);
  p.content.goal = ''; assert.ok(validateActivity(p).some((e) => e.includes('ねらい')));
});
test('print/copy text uses edited roles, timing and reflections, including unconfirmed preparations', () => {
  const p = copyActivity(activityTemplates[0]); p.content.leader = '担当A'; p.content.reflection = '実施結果';
  const text = activityText(p);
  assert.ok(text.includes('担当A')); assert.ok(text.includes('14:00～14:05')); assert.ok(text.includes('未確認：材料')); assert.ok(text.includes('実施結果'));
});
test('bounded drafts restore only known structures and keep unfinished editing', () => {
  const p = emptyActivity(); const raw = JSON.stringify(p); assert.deepEqual(restoreActivityDraft(raw), p);
  assert.equal(restoreActivityDraft('{invalid'), null); assert.equal(restoreActivityDraft('x'.repeat(200001)), null);
  assert.equal(restoreActivityDraft(JSON.stringify({ ...p, content: { ...p.content, steps: 'wrong' } })), null);
  assert.equal(restoreActivityDraft(JSON.stringify({ ...p, content: { ...p.content, goal: 123 } })), null);
});
test('invalid editing durations never display fabricated fractional clock times', () => {
  const p = copyActivity(activityTemplates[0]); p.content.steps[0].minutes = 1.5;
  assert.ok(activityTimeline(p).every((t) => t === '時刻未確定'));
});
test('oversized combined text is rejected before submitting it to the database', () => {
  const p = copyActivity(activityTemplates[0]);
  for (const key of ['goal','target','location','leader','considerations','safety','roles'] as const) p.content[key] = 'あ'.repeat(10000);
  assert.ok(validateActivity(p).some((e) => e.includes('文章量')));
});
