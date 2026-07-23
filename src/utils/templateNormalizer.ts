import type { Template, TemplateField } from '../types';

export const FATIGUE_SCALE_OPTIONS = [
  '1：なし',
  '2：少ない',
  '3：中程度',
  '4：強い',
  '5：非常に強い',
] as const;

export const FATIGUE_SCALE_HELP = '疲労感を1（なし）から5（非常に強い）の5段階で選択してください。';

export function isFatigueField(field: Pick<TemplateField, 'id' | 'label'>) {
  return field.id === 'fatigue' || field.label.includes('疲労感');
}

export function normalizeFatigueValue(value?: string) {
  const raw = value?.trim() || '';
  const exact = FATIGUE_SCALE_OPTIONS.find((option) => option === raw);
  if (exact) return exact;
  const byNumber = FATIGUE_SCALE_OPTIONS.find((option) => option.startsWith(`${raw}：`));
  if (byNumber) return byNumber;
  if (raw === 'なし') return FATIGUE_SCALE_OPTIONS[0];
  if (raw === 'あり') return FATIGUE_SCALE_OPTIONS[2];
  return raw || FATIGUE_SCALE_OPTIONS[0];
}

export function normalizeTemplateFatigueScale(template: Template): Template {
  return {
    ...template,
    sections: template.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => {
        if (!isFatigueField(field)) return field;
        return {
          ...field,
          type: 'radio',
          options: [...FATIGUE_SCALE_OPTIONS],
          defaultValue: normalizeFatigueValue(field.defaultValue),
          helpText: field.helpText || FATIGUE_SCALE_HELP,
        };
      }),
    })),
  };
}
