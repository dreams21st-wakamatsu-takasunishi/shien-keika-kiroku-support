import type { SectionAnswer, SupportRecord } from '../types';

const MODULE_META_SECTION_ID = '__record_modules';
const MODULE_LABELS: Record<string, string> = {
  study: '学習',
  pc: 'パソコン',
  certification: '検定',
  activity: '活動',
  lunch: 'お昼ごはん',
  snack: 'おやつ',
  special: '特記',
  other: 'その他',
};

const LIFE_LABELS: Record<string, string> = {
  fatigue: '疲労感',
  preparation: '準備',
  response_to_prompt: '声掛けへの反応',
  medication: '※服薬',
};

const FIELD_LABELS: Record<string, string> = {
  module_study_homework: '宿題内容',
  module_study_attitude: '宿題への取り組み',
  module_study_extras: '宿題以外の取り組み',
  module_study_posture: '学習時の姿勢',
  module_pc_content: 'パソコン取り組み内容',
  module_pc_finger: 'タイピング時の指使い',
  module_pc_posture: '取り組み時の姿勢',
  module_pc_transition: '自由時間からの切り替え',
  module_period3_type: '検定内容',
  module_activity_content: '活動内容',
  module_activity_initiative: '活動への積極性',
  module_lunch_details: 'お昼ごはんの様子',
  module_other_note: 'その他の記録',
};

function compactValue(value?: string, note?: string) {
  return [value?.trim(), note?.trim()].filter(Boolean).join('／');
}

function sectionLines(section?: SectionAnswer) {
  if (!section) return [];
  const answers = Object.entries(section.answers || {})
    .map(([fieldId, answer]) => {
      const value = compactValue(answer.value, answer.note);
      return value ? `${FIELD_LABELS[fieldId] || fieldId}：${value}` : '';
    })
    .filter(Boolean);
  const abc = section.abcAnalysis;
  const special = abc?.inputMode === 'free'
    ? abc.freeText?.trim()
    : abc?.summary?.trim() || [
        abc?.antecedent?.trim() ? `A：${abc.antecedent.trim()}` : '',
        abc?.behavior?.trim() ? `B：${abc.behavior.trim()}` : '',
        abc?.consequence?.trim() ? `C：${abc.consequence.trim()}` : '',
      ].filter(Boolean).join('\n');
  return [...answers, ...(special ? [special] : [])];
}

export function hasUnifiedRecordAnswers(record: Pick<SupportRecord, 'templateId' | 'sectionAnswers'>) {
  return record.templateId === 'template-unified' || Boolean(record.sectionAnswers?.[MODULE_META_SECTION_ID]);
}

export function generateUnifiedRecordSummary(record: Pick<SupportRecord,
  'recorderName' | 'attendance' | 'attendanceNote' | 'expressions' | 'expressionNote' | 'snack' | 'snackNote' | 'sectionAnswers'
>) {
  const parts: string[] = [`記録者：${record.recorderName || '未設定'}`, '【来所時の様子】'];
  parts.push(`出欠：${compactValue(record.attendance, record.attendanceNote) || '未入力'}`);
  parts.push(`表情：${compactValue(record.expressions?.join('、'), record.expressionNote) || '未入力'}`);
  const life = record.sectionAnswers?.life;
  Object.entries(life?.answers || {}).forEach(([fieldId, answer]) => {
    const value = compactValue(answer.value, answer.note);
    if (value) parts.push(`${LIFE_LABELS[fieldId] || fieldId}：${value}`);
  });

  const metadata = record.sectionAnswers?.[MODULE_META_SECTION_ID];
  const modules = Object.entries(metadata?.answers || {})
    .map(([id, answer]) => ({ id, type: answer.value, order: Number.parseInt(answer.note || '0', 10) || 0 }))
    .sort((left, right) => left.order - right.order);
  const counts: Record<string, number> = {};
  const totals = modules.reduce<Record<string, number>>((result, module) => ({ ...result, [module.type]: (result[module.type] || 0) + 1 }), {});

  modules.forEach((module) => {
    counts[module.type] = (counts[module.type] || 0) + 1;
    const label = MODULE_LABELS[module.type] || 'その他';
    const numberedLabel = totals[module.type] > 1 ? `${label}${counts[module.type]}` : label;
    parts.push('', `【${numberedLabel}】`);
    if (module.type === 'snack') {
      parts.push(compactValue(record.snack, record.snackNote) || '未入力');
      return;
    }
    const lines = sectionLines(record.sectionAnswers?.[`record-module-${module.id}`]);
    parts.push(...(lines.length ? lines : ['未入力']));
  });

  return parts.join('\n');
}
