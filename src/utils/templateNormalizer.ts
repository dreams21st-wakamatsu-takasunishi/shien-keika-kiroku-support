import type { Template, TemplateField } from '../types';
import { HOMEWORK_FIELD_HELP, HOMEWORK_SUBJECTS } from './homeworkField';

export const FATIGUE_SCALE_OPTIONS = [
  '1：非常に強い',
  '2：強い',
  '3：中程度',
  '4：少ない',
  '5：なし',
] as const;

export const FATIGUE_SCALE_HELP = '疲労感を1（非常に強い）から5（なし）の5段階で選択してください。5がよい状態、1が悪い状態です。';

export function isFatigueField(field: Pick<TemplateField, 'id' | 'label'>) {
  return field.id === 'fatigue' || field.label.includes('疲労感');
}

export function normalizeFatigueValue(value?: string) {
  const raw = value?.trim() || '';
  const exact = FATIGUE_SCALE_OPTIONS.find((option) => option === raw);
  if (exact) return exact;
  if (raw.includes('なし')) return FATIGUE_SCALE_OPTIONS[4];
  if (raw.includes('少ない') || raw.includes('少し')) return FATIGUE_SCALE_OPTIONS[3];
  if (raw.includes('非常に強い')) return FATIGUE_SCALE_OPTIONS[0];
  if (raw.includes('強い')) return FATIGUE_SCALE_OPTIONS[1];
  if (raw.includes('中程度') || raw.includes('疲れた')) return FATIGUE_SCALE_OPTIONS[2];
  const byNumber = FATIGUE_SCALE_OPTIONS.find((option) => option.startsWith(`${raw}：`));
  if (byNumber) return byNumber;
  if (raw === 'あり') return FATIGUE_SCALE_OPTIONS[2];
  return raw || FATIGUE_SCALE_OPTIONS[4];
}

export function parseHandCount(value?: string) {
  const raw = value || '';
  const left = raw.match(/左手\s*[：:]\s*(\d*)/)?.[1] || '';
  const right = raw.match(/右手\s*[：:]\s*(\d*)/)?.[1] || '';
  return { left, right };
}

export function formatHandCount(left: string, right: string) {
  return `左手：${left ? `${left}本` : '未入力'}／右手：${right ? `${right}本` : '未入力'}`;
}

export function normalizeTemplateFatigueScale(template: Template): Template {
  return {
    ...template,
    sections: template.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => {
        if (field.type === 'fatigue_scale' || (isFatigueField(field) && field.type !== 'rating_scale')) {
          return {
            ...field,
            type: 'fatigue_scale',
            options: [...FATIGUE_SCALE_OPTIONS],
            defaultValue: normalizeFatigueValue(field.defaultValue),
            helpText: field.helpText || FATIGUE_SCALE_HELP,
          };
        }
        if (field.id === 'finger_usage') {
          const handCount = parseHandCount(field.defaultValue);
          return {
            ...field,
            type: 'hand_count',
            defaultValue: formatHandCount(handCount.left, handCount.right),
            helpText: field.helpText || '左手・右手それぞれで使用した指の本数を入力してください。',
          };
        }
        if (field.type === 'homework_subjects') {
          return {
            ...field,
            options: [...HOMEWORK_SUBJECTS],
            defaultValue: '',
            hasNote: false,
            helpText: field.helpText || HOMEWORK_FIELD_HELP,
          };
        }
        return field;
      }),
    })),
  };
}
