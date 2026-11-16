import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChildProfile } from '../types';
import { newVisitActivity, newVisitReport, sortedVisitActivities, sortedVisitActivityEntries, validateVisitReport, visitingReportChildren, visitReportPrintDate } from './visitingSupportReport';

const id = '10000000-0000-4000-8000-000000000001';
const child: ChildProfile = { id: 'fixture-child', name: '架空の児童', careType: '保育所等訪問支援', birthDate: '2017-04-05', schoolName: '架空小学校', schoolClass: ' 3年1組 ', sex: ' 男性 ' };
const newReport = () => newVisitReport(child, '架空の職員', '2026-11-16', id);

test('visit report includes visiting-only and dual-service children, not day services alone', () => {
  const day = { ...child, id: 'day', careType: '放課後等デイサービス' } as const;
  assert.deepEqual(visitingReportChildren([child, day, { ...day, id: 'dual', visitingSupportEnabled: true }]).map(item => item.id), [child.id, 'dual']);
});

test('visit report prefills roster data; visits appear in time order without placeholder rows', () => {
  const report = newReport();
  assert.equal(report.content.childName, child.name);
  assert.equal(Object.hasOwn(report.content, 'birthDate'), false);
  assert.equal(report.destination, child.schoolName);
  assert.equal(report.content.sex, '男性');
  assert.equal(report.content.affiliation, '3年1組');
  const unregistered = newVisitReport({ ...child, schoolClass: undefined, sex: undefined }, '架空の職員', '2026-11-16', id);
  assert.equal(unregistered.content.sex, '');
  assert.equal(unregistered.content.affiliation, '');
  assert.equal(visitReportPrintDate('2026-11-16'), '令和8年11月16日');
  const first = { ...newVisitActivity(), activity: '開始時の観察', startTime: '09:55' };
  const second = { ...newVisitActivity(), activity: '集団での活動', startTime: '10:00', endTime: '10:30' };
  report.content.timeline = [second, newVisitActivity(), first];
  assert.equal(validateVisitReport(report), null);
  assert.deepEqual(sortedVisitActivities(report.content.timeline), [first, second]);
  assert.deepEqual(sortedVisitActivityEntries(report.content.timeline).map(entry => entry.index), [2, 0]);
  assert.equal(report.content.timeline[0], second);
});

test('visit report validates missing activity, date order, missing start, and reversed time ranges', () => {
  const report = newReport();
  assert.match(validateVisitReport(report)!, /1件以上/);
  report.content.timeline[0].activity = '観察';
  assert.match(validateVisitReport(report)!, /開始時刻/);
  report.content.timeline[0].startTime = '10:30';
  report.content.timeline[0].endTime = '10:20';
  assert.match(validateVisitReport(report)!, /終了時刻/);
  report.report_date = '2026-11-15';
  assert.match(validateVisitReport(report)!, /作成日は訪問日以降/);
});
