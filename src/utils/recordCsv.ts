import type { SupportRecord } from '../types';
import { formatHomeworkDetails } from './homeworkField';

function escapeCsv(value: unknown) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ');
  return `"${text.replace(/"/g, '""')}"`;
}

function sectionSummary(record: SupportRecord) {
  return Object.values(record.sectionAnswers || {}).map((section) => {
    const answers = Object.values(section.answers || {})
      .map((answer) => {
        if (answer.homeworkDetails) return formatHomeworkDetails(answer.homeworkDetails);
        if (answer.value && answer.note) return `${answer.value}（${answer.note}）`;
        return answer.value || answer.note || '';
      })
      .filter(Boolean)
      .join('／');
    const abc = section.abcAnalysis?.summary || '';
    return `${section.sectionTitle}：${[answers, abc].filter(Boolean).join('／')}`;
  }).filter((value) => !value.endsWith('：')).join('｜');
}

export function downloadRecordsCsv(records: SupportRecord[]) {
  const headers = [
    '記録日',
    '児童名',
    '出欠',
    '出欠備考',
    '表情',
    '表情備考',
    'おやつ',
    'おやつ備考',
    '記録者',
    '確認状態',
    '児発管コメント',
    '記録内容',
    '更新日時',
  ];
  const rows = records.map((record) => [
    record.date,
    record.childName,
    record.attendance,
    record.attendanceNote || '',
    record.expressions.join('、'),
    record.expressionNote || '',
    record.snack,
    record.snackNote || '',
    record.recorderName,
    record.approvalStatus,
    record.jihatsukanComment || '',
    sectionSummary(record),
    record.updatedAt,
  ]);
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const dates = records.map((record) => record.date).sort();
  anchor.href = url;
  anchor.download = `支援経過記録_${dates[0] || '一覧'}_${dates.at(-1) || '一覧'}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
