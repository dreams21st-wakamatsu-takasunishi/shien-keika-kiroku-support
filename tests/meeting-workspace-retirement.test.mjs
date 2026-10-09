import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../'+path, import.meta.url), 'utf8');

test('meeting workspace exposes preparation/handoff and meeting notes only, without retired reads or writes', () => {
  const source = read('src/meeting/MeetingWorkspace.tsx');
  assert.match(source, /const steps: Step\[\] = \['準備・Tiroへ渡す', '会議中'\]/);
  for (const retired of ['listMeetingTranscripts','addMeetingTranscript','listMeetingProgressForCase','saveMeetingProgress','generatePDFFromElement','composeMeetingProgress','initialChildId']) assert.ok(!source.includes(retired), retired);
  assert.ok(!read('src/components/RecordList.tsx').includes('MeetingProgressList'));
  assert.ok(!read('src/App.tsx').includes('onOpenMeetings'));
});
test('hidden historical content and revision guards survive the UI retirement', () => {
  const source = read('src/meeting/MeetingWorkspace.tsx');
  assert.match(source, /content: \{ \.\.\.current\.content, \.\.\.patch \}/);
  assert.match(source, /revision: base\.revision/);
  assert.match(source, /beforeunload/);
  assert.ok(source.indexOf('await logMeetingExport') < source.indexOf('await navigator.clipboard.writeText'));
  assert.match(source, /recordingExplainedAt && saved && !hasUnsavedChanges && !saving/);
});
test('meeting menu and manual no longer instruct users to import transcripts or create derived records', () => {
  const item = JSON.parse(read('docs/manuals/sections.json')).find(item => item.id === 'meeting');
  assert.deepEqual(item.flow, ['対象児童・案件を作る','準備・Tiroへ渡す','会議中の確認・メモ']);
  assert.ok(!item.steps.some(step=>step.includes('スクリプトをDサポートへ取り込み')));
  const navigation = read('src/utils/navigation.ts').split('\n').find(line=>line.includes("id: 'meetings'"));
  assert.ok(navigation.includes('Tiroへの受け渡し') && !navigation.includes('支援経過'));
});
