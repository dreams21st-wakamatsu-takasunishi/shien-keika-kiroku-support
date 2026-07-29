import type { SectionAnswer, SectionFieldAnswer, SupportRecord } from '../types';

function answerText(answer?: SectionFieldAnswer) {
  if (!answer?.value?.trim() && !answer?.note?.trim()) return '未回答';
  const value = answer.value?.trim() || '未選択';
  return answer.note?.trim() ? `${value}（${answer.note.trim()}）` : value;
}

function periodLines(section: SectionAnswer | undefined, periodLabel: string, mode: '学習' | 'パソコン') {
  if (!section) return [];
  const prefix = section.sectionId;
  const selectedMode = section.answers[`${prefix}_type`]?.value;
  if (selectedMode !== mode) return [];

  if (mode === '学習') {
    const homework = answerText(section.answers[`${prefix}_study_homework`]);
    return [
      `［${periodLabel}］`,
      `宿題内容：${homework}`,
      ...(homework === '宿題無し'
        ? []
        : [`宿題の取り組み：${answerText(section.answers[`${prefix}_study_attitude`])}`]),
      `宿題以外の取り組み：${answerText(section.answers[`${prefix}_study_extras`])}`,
      `姿勢：${answerText(section.answers[`${prefix}_study_posture`])}`,
    ];
  }

  return [
    `［${periodLabel}］`,
    `パソコン取り組み内容：${answerText(section.answers[`${prefix}_pc_content`])}`,
    `タイピング時の指使い：${answerText(section.answers[`${prefix}_pc_finger`])}`,
    `取り組み時の姿勢：${answerText(section.answers[`${prefix}_pc_posture`])}`,
    `自由時間からの切り替え：${answerText(section.answers[`${prefix}_pc_transition`])}`,
  ];
}

export function generateStructuredWeekdaySummary(
  record: Pick<SupportRecord, 'recorderName' | 'attendance' | 'attendanceNote' | 'expressions' | 'expressionNote' | 'snack' | 'snackNote' | 'sectionAnswers'>,
) {
  if (record.attendance.includes('欠席')) {
    const note = record.attendanceNote?.trim();
    return [
      `記録者：${record.recorderName || '未選択'}`,
      `【出欠】\n欠席${note ? `（${note}）` : ''}`,
    ].join('\n\n');
  }
  const life = record.sectionAnswers.life;
  const period1 = record.sectionAnswers.period1;
  const period2 = record.sectionAnswers.period2;
  const special = record.sectionAnswers.special;
  const expression = record.expressions?.[0] || '';
  const expressionText = record.expressionNote?.trim()
    ? `${expression || '未回答'}（${record.expressionNote.trim()}）`
    : expression || '未回答';
  const snackText = record.snackNote?.trim()
    ? `${record.snack || '未回答'}（${record.snackNote.trim()}）`
    : record.snack || '未回答';
  const studyLines = [
    ...periodLines(period1, '1コマ目', '学習'),
    ...periodLines(period2, '2コマ目', '学習'),
  ];
  const pcLines = [
    ...periodLines(period1, '1コマ目', 'パソコン'),
    ...periodLines(period2, '2コマ目', 'パソコン'),
  ];
  const otherLines = [period1, period2].flatMap((section, index) => {
    if (!section) return [];
    const prefix = section.sectionId;
    const typeAnswer = section.answers[`${prefix}_type`];
    if (typeAnswer?.value !== 'その他') return [];
    return [`［${index + 1}コマ目］${answerText(typeAnswer)}`];
  });

  const blocks = [
    `記録者：${record.recorderName || '未選択'}`,
    [
      '【生活】',
      `表情：${expressionText}`,
      `おやつ：${snackText}`,
      `疲労感：${answerText(life?.answers.fatigue)}`,
      `準備：${answerText(life?.answers.preparation)}`,
      `声掛けへの反応：${answerText(life?.answers.response_to_prompt)}`,
      `※服薬：${answerText(life?.answers.medication)}`,
    ].join('\n'),
    ['【学習】', ...(studyLines.length ? studyLines : ['該当なし'])].join('\n'),
    ['【パソコン】', ...(pcLines.length ? pcLines : ['該当なし'])].join('\n'),
  ];

  if (otherLines.length) blocks.push(['【その他の取り組み】', ...otherLines].join('\n'));
  const specialText = special?.abcAnalysis?.inputMode === 'free'
    ? special.abcAnalysis.freeText?.trim()
    : special?.abcAnalysis?.summary?.trim();
  blocks.push(`【特記】\n${specialText || '特記事項なし'}`);
  return blocks.join('\n\n');
}

export function hasStructuredWeekdayAnswers(record: Pick<SupportRecord, 'sectionAnswers'>) {
  return Boolean(record.sectionAnswers.period1 && record.sectionAnswers.period2 && record.sectionAnswers.special);
}
