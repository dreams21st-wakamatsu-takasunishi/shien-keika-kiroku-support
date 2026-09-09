import test from 'node:test';
import assert from 'node:assert/strict';
import { draftTimeBoardRows, groupDraftTimeBoardStops, timeBoardWindowMinutes } from '../src/utils/transportTimeBoard.ts';

const stop = (id, plannedTime, patch = {}) => ({ id, childId: id, childName: id, locationName: '確認小学校', locationType: '学校', location: '確認市1-2', plannedTime, order: 1, ...patch });
const run = (id, stops, direction = '迎え') => ({ id, name: id, stops, direction });
const group = (stops, window = 15) => groupDraftTimeBoardStops([run('1便', stops)], '迎え', window);

test('same school at 14:10 and 15:00 is split across runs, and rendered at each exact time', () => {
  const groups = groupDraftTimeBoardStops([run('1便', [stop('A', '14:10')]), run('2便', [stop('B', '15:00')])], '迎え', 15);
  assert.deepEqual(groups.map(g => g.firstTime), ['14:10', '15:00']);
  const rows = draftTimeBoardRows(groups);
  assert.deepEqual(rows.filter(row => row.groups.length).map(row => [row.time, row.groups[0].items[0].stop.childId]), [['14:10', 'A'], ['15:00', 'B']]);
  assert.equal(rows.find(row => row.time === '14:00').groups.length, 0);
});

test('same location within the configured inclusive window shares one card with a range', () => {
  const groups = group([stop('A', '14:10'), stop('B', '14:25'), stop('C', '14:26')]);
  assert.deepEqual(groups.map(g => g.items.map(i => i.stop.id)), [['A', 'B'], ['C']]);
  assert.equal(groups[0].lastTime, '14:25');
  assert.equal(group([stop('A', '14:10'), stop('B', '14:25')], 10).length, 2);
  assert.equal(group([stop('A', '14:10'), stop('B', '14:25')], 20).length, 1);
});

test('near times cannot transitively chain into a far-apart card, regardless of input order', () => {
  const stops = [stop('C', '14:30'), stop('A', '14:00'), stop('B', '14:15')];
  assert.deepEqual(group(stops).map(g => g.items.map(i => i.stop.id)), [['A', 'B'], ['C']]);
  assert.deepEqual(group([...stops].reverse()), group(stops));
});

test('zero-minute setting only combines exactly matching minutes, and formatting is normalized', () => {
  const groups = group([stop('A', '9:05'), stop('B', '09:05:00'), stop('C', '09:06')], 0);
  assert.deepEqual(groups.map(g => [g.firstTime, g.items.length]), [['09:05', 2], ['09:06', 1]]);
  assert.equal(timeBoardWindowMinutes(0), 0);
  assert.equal(timeBoardWindowMinutes(undefined), 15);
  assert.equal(timeBoardWindowMinutes(NaN), 15);
});

test('uncomputed and malformed times are never merged with timed stops or assigned a guessed time', () => {
  const groups = group([stop('A', undefined, { timeMode: 'arrival_backward', timeAnchorTime: '10:00' }), stop('B', '15:00'), stop('C', ''), stop('D', '24:00'), stop('E', '14:99')]);
  assert.equal(groups.length, 5);
  assert.equal(groups[0].firstTime, '15:00');
  assert.ok(groups.slice(1).every(g => g.firstTime === undefined && g.items.length === 1));
  assert.equal(draftTimeBoardRows(groups).flatMap(row => row.groups).length, 1);
  assert.deepEqual(draftTimeBoardRows(groups.slice(1)), []);
});

test('same location and minute across different vehicles retains run and stop identities', () => {
  const groups = groupDraftTimeBoardStops([run('車A', [stop('A', '15:30')]), run('車B', [stop('B', '15:30')])], '迎え', 15);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].items.map(item => item.runId), ['車A', '車B']);
  assert.equal(new Set(groups[0].items.map(item => item.key)).size, 2);
});

test('different addresses, missing addresses, and unregistered homes are not merged', () => {
  assert.equal(group([stop('A', '15:00', { location: '確認市1-23' }), stop('B', '15:00', { location: '確認市12-3' })]).length, 2);
  assert.equal(group([stop('A', '15:00', { location: '' }), stop('B', '15:00', { location: '' })]).length, 2);
  assert.equal(group([stop('A', '15:00', { location: '確認市１−２' }), stop('B', '15:00')]).length, 1);
});

test('pickup and dropoff are filtered independently and both use the time window', () => {
  const runs = [run('迎え1便', [stop('A', '14:00')]), run('送り1便', [stop('B', '17:00'), stop('C', '18:00')], '送り')];
  assert.deepEqual(groupDraftTimeBoardStops(runs, '迎え', 15).map(g => g.firstTime), ['14:00']);
  assert.deepEqual(groupDraftTimeBoardStops(runs, '送り', 15).map(g => g.firstTime), ['17:00', '18:00']);
});

test('early and late times are not clamped to 08:00 or 21:00, including midnight', () => {
  const groups = group([stop('A', '07:35'), stop('B', '21:45'), stop('C', '00:00'), stop('D', '23:59')]);
  assert.deepEqual(draftTimeBoardRows(groups).filter(row => row.groups.length).map(row => row.time), ['00:00', '07:35', '21:45', '23:59']);
});

test('editing times, clearing them, removing stops or changing destinations recalculates without mutating drafts', () => {
  const original = [run('1便', [stop('B', '15:00'), stop('A', '14:10')])];
  const snapshot = structuredClone(original);
  const groups = groupDraftTimeBoardStops(original, '迎え', 15);
  assert.deepEqual(original, snapshot);
  assert.equal(groups.length, 2);
  const updated = structuredClone(original);
  updated[0].stops[0].plannedTime = '14:15';
  assert.equal(groupDraftTimeBoardStops(updated, '迎え', 15).length, 1);
  updated[0].stops[0].plannedTime = undefined;
  assert.equal(groupDraftTimeBoardStops(updated, '迎え', 15).length, 2);
  updated[0].stops[0].plannedTime = '14:15';
  updated[0].stops[0].location = '別住所';
  assert.equal(groupDraftTimeBoardStops(updated, '迎え', 15).length, 2);
  updated[0].stops.splice(0, 1);
  assert.equal(groupDraftTimeBoardStops(updated, '迎え', 15)[0].items.length, 1);
  assert.deepEqual(groupDraftTimeBoardStops([], '迎え', 15), []);
});
