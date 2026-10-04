import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFacilityDocument, emptyFacilityDocument, emptySupply, facilityDocumentText, inspectionCounts, needsRestock, restoreFacilityDocument, validateFacilityDocument, validateMovement, validateSupply } from './facilityWork';

test('inspection examples start unconfirmed and completion cannot bypass checking', () => {
  const doc = emptyFacilityDocument('inspection');
  assert.deepEqual(validateFacilityDocument(doc), []);
  assert.deepEqual(inspectionCounts(doc), { total: 5, checked: 0, outstanding: 0 });
  doc.status = '完了'; assert.ok(validateFacilityDocument(doc).some((m) => m.includes('すべて')));
  doc.content.author = '検証担当'; doc.content.items.forEach((i) => { i.result = '問題なし'; });
  assert.deepEqual(validateFacilityDocument(doc), []);
});
test('issues require a memo and remain visible after inspection completion until resolved', () => {
  const doc = emptyFacilityDocument('inspection'); doc.content.author = '担当'; doc.status = '完了';
  doc.content.items.forEach((i) => { i.result = '問題なし'; }); doc.content.items[0].result = '要対応';
  assert.ok(validateFacilityDocument(doc).some((m) => m.includes('対応メモ')));
  doc.content.items[0].note = '補充を依頼'; assert.deepEqual(validateFacilityDocument(doc), []);
  assert.equal(inspectionCounts(doc).outstanding, 1); assert.ok(facilityDocumentText(doc).includes('対応残り'));
  doc.content.items[0].resolved = true; assert.equal(inspectionCounts(doc).outstanding, 0);
});
test('reusable inspection copies reset authors, results, notes, status and identity', () => {
  const doc = emptyFacilityDocument('inspection'); doc.id = 'original'; doc.revision = 4; doc.content.author = '担当'; doc.content.items[0].result = '要対応'; doc.content.items[0].note = '対応記録'; doc.content.items[0].resolved = true;
  const copy = copyFacilityDocument(doc, true);
  assert.equal(copy.id, ''); assert.equal(copy.revision, 0); assert.equal(copy.date, ''); assert.equal(copy.status, '下書き');
  assert.equal(copy.content.author, ''); assert.equal(copy.content.items[0].result, ''); assert.equal(copy.content.items[0].resolved, false);
  assert.notEqual(copy.content.items[0].id, doc.content.items[0].id); assert.equal(doc.content.items[0].note, '対応記録');
  assert.deepEqual(validateFacilityDocument(copy), []);
});
test('newsletters are plain authored text without automatic child data or fake body', () => {
  const doc = emptyFacilityDocument('newsletter'); assert.equal(doc.content.body, ''); doc.status = '完了';
  assert.ok(validateFacilityDocument(doc).some((m) => m.includes('本文')));
  doc.content.body = '工作活動のお知らせ'; doc.content.upcoming = '10月の予定';
  assert.deepEqual(validateFacilityDocument(doc), []);
  assert.ok(facilityDocumentText(doc).includes('今後の予定\n10月の予定'));
  assert.equal(copyFacilityDocument(doc).content.body, doc.content.body);
});
test('document validation rejects impossible dates, oversized text and duplicate item IDs', () => {
  const doc = emptyFacilityDocument('inspection'); doc.date = '2026-02-30'; assert.ok(validateFacilityDocument(doc).some((m) => m.includes('日付')));
  doc.date = '2026-10-04'; doc.content.items.push(doc.content.items[0]); assert.ok(validateFacilityDocument(doc).some((m) => m.includes('重複')));
  doc.content.items.pop(); doc.content.notes = 'a'.repeat(10001); assert.ok(validateFacilityDocument(doc).some((m) => m.includes('10,000')));
});
test('scoped document drafts restore unfinished fields but reject wrong or unbounded structures', () => {
  const doc = emptyFacilityDocument('inspection'); doc.content.items[0].label = '';
  assert.deepEqual(restoreFacilityDocument(JSON.stringify(doc), 'inspection'), doc);
  assert.equal(restoreFacilityDocument(JSON.stringify(doc), 'newsletter'), null);
  assert.equal(restoreFacilityDocument('{broken', 'inspection'), null);
  assert.equal(restoreFacilityDocument('x'.repeat(200001), 'inspection'), null);
  assert.equal(restoreFacilityDocument(JSON.stringify({ ...doc, content: { ...doc.content, items: [{ ...doc.content.items[0], resolved: 'true' }] } }), 'inspection'), null);
});
test('stock thresholds, archive and quantities cannot silently create negative or fractional inventory', () => {
  const item = emptySupply(); item.name = '工作材料'; assert.deepEqual(validateSupply(item), []); assert.equal(needsRestock(item), true);
  item.quantity = 5; assert.equal(needsRestock(item), false); item.threshold = 5; assert.equal(needsRestock(item), true);
  item.archived = true; assert.equal(needsRestock(item), false);
  item.quantity = -1; assert.ok(validateSupply(item).length); item.quantity = 1.5; assert.ok(validateSupply(item).length);
});
test('movement signs, limits and reasons are validated for safe atomic adjustments', () => {
  assert.deepEqual(validateMovement('入庫', 3, '購入'), []); assert.deepEqual(validateMovement('使用', -2, '活動で使用'), []); assert.deepEqual(validateMovement('調整', -1, '実数確認'), []);
  for (const [kind, delta, note] of [['入庫', -1, '誤り'], ['使用', 1, '誤り'], ['調整', 0, '誤り'], ['調整', 1.5, '誤り'], ['入庫', 3, ''], ['調整', 1000001, '誤り']] as const) assert.ok(validateMovement(kind, delta, note).length);
});
