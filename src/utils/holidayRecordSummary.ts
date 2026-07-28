import type { SectionAnswer, SectionFieldAnswer, SupportRecord } from '../types';

function answerText(answer?: SectionFieldAnswer) {
  if (!answer?.value?.trim() && !answer?.note?.trim()) return '未回答';
  const value = answer.value?.trim() || '未選択';
  return answer.note?.trim() ? `${value}（${answer.note.trim()}）` : value;
}

function periodLines(section: SectionAnswer, periodNumber: 1 | 2) {
  const prefix = `${section.sectionId}_period${periodNumber}`;
  const mode = section.answers[`${prefix}_type`]?.value;
  const heading = `［${periodNumber}コマ目：${mode || '未回答'}］`;
  if (mode === '学習') {
    return [
      heading,
      `宿題内容：${answerText(section.answers[`${prefix}_study_homework`])}`,
      `宿題の取り組み：${answerText(section.answers[`${prefix}_study_attitude`])}`,
      `宿題以外の取り組み：${answerText(section.answers[`${prefix}_study_extras`])}`,
      `姿勢：${answerText(section.answers[`${prefix}_study_posture`])}`,
    ];
  }
  if (mode === 'パソコン') {
    return [
      heading,
      `パソコン取り組み内容：${answerText(section.answers[`${prefix}_pc_content`])}`,
      `タイピング時の指使い：${answerText(section.answers[`${prefix}_pc_finger`])}`,
      `取り組み時の姿勢：${answerText(section.answers[`${prefix}_pc_posture`])}`,
      `自由時間からの切り替え：${answerText(section.answers[`${prefix}_pc_transition`])}`,
    ];
  }
  return [heading, `内容：${answerText(section.answers[`${prefix}_type`])}`];
}

function workBlockLines(section: SectionAnswer | undefined, blockLabel: string) {
  if (!section) return [`［${blockLabel}］未回答`];
  const prefix = section.sectionId;
  const mode = section.answers[`${prefix}_type`]?.value;
  const heading = `［${blockLabel}：${mode || '未回答'}］`;

  if (mode === '学習/パソコン') {
    return [
      heading,
      ...periodLines(section, 1),
      ...periodLines(section, 2),
      `［3コマ目］${answerText(section.answers[`${prefix}_period3_type`])}`,
    ];
  }
  if (mode === '学習') {
    return [
      heading,
      `宿題内容：${answerText(section.answers[`${prefix}_study_homework`])}`,
      `宿題の取り組み：${answerText(section.answers[`${prefix}_study_attitude`])}`,
      `宿題以外の取り組み：${answerText(section.answers[`${prefix}_study_extras`])}`,
      `姿勢：${answerText(section.answers[`${prefix}_study_posture`])}`,
    ];
  }
  if (mode === 'パソコン') {
    return [
      heading,
      `パソコン取り組み内容：${answerText(section.answers[`${prefix}_pc_content`])}`,
      `タイピング時の指使い：${answerText(section.answers[`${prefix}_pc_finger`])}`,
      `取り組み時の姿勢：${answerText(section.answers[`${prefix}_pc_posture`])}`,
      `自由時間からの切り替え：${answerText(section.answers[`${prefix}_pc_transition`])}`,
    ];
  }
  if (mode === '活動') {
    return [
      heading,
      `活動内容：${answerText(section.answers[`${prefix}_activity_content`])}`,
      `活動への積極性：${answerText(section.answers[`${prefix}_activity_initiative`])}`,
    ];
  }
  return [heading, `内容：${answerText(section.answers[`${prefix}_type`])}`];
}

export function generateStructuredHolidaySummary(
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
  const lunch = record.sectionAnswers.lunch;
  const special = record.sectionAnswers.special;
  const expression = record.expressions?.[0] || '';
  const expressionText = record.expressionNote?.trim()
    ? `${expression || '未回答'}（${record.expressionNote.trim()}）`
    : expression || '未回答';
  const snackText = record.snackNote?.trim()
    ? `${record.snack || '未回答'}（${record.snackNote.trim()}）`
    : record.snack || '未回答';

  const specialText = special?.abcAnalysis?.inputMode === 'free'
    ? special.abcAnalysis.freeText?.trim()
    : special?.abcAnalysis?.summary?.trim();

  return [
    `記録者：${record.recorderName || '未選択'}`,
    [
      '【生活】',
      `表情：${expressionText}`,
      `疲労感：${answerText(life?.answers.fatigue)}`,
      `準備：${answerText(life?.answers.preparation)}`,
      `声掛けへの反応：${answerText(life?.answers.response_to_prompt)}`,
      `※服薬：${answerText(life?.answers.medication)}`,
    ].join('\n'),
    ['【午前】', ...workBlockLines(record.sectionAnswers.morning, '午前')].join('\n'),
    `【昼食】\n${answerText(lunch?.answers.lunch_details)}`,
    ['【午後】', ...workBlockLines(record.sectionAnswers.afternoon, '午後')].join('\n'),
    `【おやつ】\nおやつ：${snackText}`,
    `【特記】\n${specialText || '特記事項なし'}`,
  ].join('\n\n');
}

export function hasStructuredHolidayAnswers(record: Pick<SupportRecord, 'sectionAnswers'>) {
  return Boolean(
    record.sectionAnswers.morning
    && record.sectionAnswers.lunch
    && record.sectionAnswers.afternoon
    && record.sectionAnswers.special
  );
}
