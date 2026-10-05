import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActivityPlanSheet } from '../components/ActivityPlanSheet';
import { activityTemplates, copyActivity, emptyActivity, restoreActivityDraft, validateActivity } from './activityPlans';

test('sheet matches reference headings, preserves all content and escapes user text', () => {
  const p = copyActivity(activityTemplates[0]);
  Object.assign(p.content, { staffCount: '3', childCount: '8', travelMinutes: '0', summary: '<script>概要</script>', roles: '役割テスト', considerations: '配慮テスト', safety: '安全テスト', reflection: '振り返りテスト', nextTime: '改善テスト' });
  p.content.steps[0].stage = '導入';
  const html = renderToStaticMarkup(createElement(ActivityPlanSheet, { plan: p, dirty: true }));
  for (const label of ['支援項目', '講師名', '職員人数', '児童人数', '往復時間', 'ねらい', '用意するもの', '段階', '指導内容', '指導上の留意点', '自己評価', '改善案', '役割テスト', '配慮テスト', '安全テスト', '振り返りテスト', '改善テスト', '導入', '未保存の入力内容', '14:00～14:05']) assert.ok(html.includes(label), label);
  assert.ok(html.includes('&lt;script&gt;概要&lt;/script&gt;'));
  assert.ok(html.includes('往復時間　0 分程度'));
  const flow = html.split('class="activity-sheet-flow"')[1].split('</table>')[0];
  assert.equal((flow.match(/<tr>/g) || []).length, 13, 'one heading and twelve reference rows');
});

test('old saved plans remain readable without fabricating new numbers', () => {
  const p = emptyActivity();
  for (const key of ['staffCount', 'childCount', 'travelMinutes', 'supportItem', 'summary'] as const) delete p.content[key];
  assert.deepEqual(restoreActivityDraft(JSON.stringify(p)), p);
  const html = renderToStaticMarkup(createElement(ActivityPlanSheet, { plan: p }));
  assert.ok(!html.includes('undefined'));
  assert.ok(!html.includes('NaN'));
});

test('optional reference fields validate and survive draft restore', () => {
  const p = copyActivity(activityTemplates[0]);
  p.content.staffCount = '2'; p.content.childCount = '8'; p.content.travelMinutes = '0';
  assert.deepEqual(validateActivity(p), []);
  assert.deepEqual(restoreActivityDraft(JSON.stringify(p)), p);
  for (const invalid of ['-1', '1.5', 'abc', '1001']) { p.content.staffCount = invalid; assert.ok(validateActivity(p).some((e) => e.includes('人数'))); }
  p.content.staffCount = '2'; p.content.travelMinutes = '1441'; assert.ok(validateActivity(p).some((e) => e.includes('往復時間')));
});

test('long plans retain every step beyond the twelve reference blank rows', () => {
  const p = copyActivity(activityTemplates[0]);
  p.content.steps = Array.from({ length: 40 }, (_, i) => ({ id: String(i), title: `指導内容${i + 1}`, support: `留意点${i + 1}`, minutes: 10 }));
  const html = renderToStaticMarkup(createElement(ActivityPlanSheet, { plan: p }));
  for (let i = 1; i <= 40; i++) assert.ok(html.includes(`指導内容${i}`) && html.includes(`留意点${i}`));
});
