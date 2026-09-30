import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getIncompleteHomeworkSubjects,
  getIncompletePcActivities,
  getIncompleteStudyExtras,
  getMockExamAttempts,
} from './recordIncompleteDetails';

test('legacy homework answers without structured details still receive a subject warning', () => {
  assert.deepEqual(getIncompleteHomeworkSubjects({ value: '国語、算数' }), ['国語', '算数']);
  assert.deepEqual(getIncompleteHomeworkSubjects({ value: '宿題無し' }), []);
  assert.deepEqual(getIncompleteHomeworkSubjects({
    value: '国語（プリント）',
    homeworkDetails: { subjects: ['国語'], materials: { 国語: ['プリント'] }, notes: {} },
  }), []);
});

test('study extras warnings identify each selected detail panel separately', () => {
  assert.deepEqual(getIncompleteStudyExtras({
    selections: ['漢検', 'エジソン', 'その他'],
    kankenActivities: ['その他'],
  }), [
    { selection: '漢検', missing: ['級', 'その他の内容'] },
    { selection: 'エジソン', missing: ['取り組み内容'] },
    { selection: 'その他', missing: ['内容'] },
  ]);
  assert.deepEqual(getIncompleteStudyExtras({
    selections: ['漢検', 'エジソン'],
    kankenGrade: '5級',
    kankenActivities: ['ドリル/ワーク'],
    edisonActivities: ['練習帳'],
  }), []);
});

test('PC warnings distinguish D lesson, each mock exam attempt, and other details', () => {
  assert.deepEqual(getIncompletePcActivities({
    selections: ['Dレッスン', '文章入力模擬試験', 'その他'],
    mockCharacterCounts: ['100', ''],
    mockPastRounds: ['1', '2'],
  }), [
    { selection: 'Dレッスン', missing: ['練習内容'] },
    { selection: '文章入力模擬試験', missing: ['文字数または過去問回'] },
    { selection: 'その他', missing: ['内容'] },
  ]);
  assert.deepEqual(getIncompletePcActivities({
    selections: ['文章入力模擬試験'],
    mockCharacterCount: '200',
    mockPastRound: '3',
  }), []);
  assert.deepEqual(getMockExamAttempts({ mockCharacterCount: '200', mockPastRound: '3' }), [
    { characterCount: '200', pastRound: '3' },
  ]);
});
