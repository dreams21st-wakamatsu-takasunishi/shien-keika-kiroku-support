import type { Template } from '../types';
import { STANDARD_WEEKDAY_TEMPLATE } from './weekdayTemplate';

export const UNIFIED_TEMPLATE_ID = 'template-unified';

export const UNIFIED_TEMPLATE: Template = {
  id: UNIFIED_TEMPLATE_ID,
  name: '支援経過記録（統合）',
  type: 'カスタム',
  isDefault: true,
  description: 'その日に行った内容だけを選んで記録する統合フォーマット',
  wizardQuestions: STANDARD_WEEKDAY_TEMPLATE.wizardQuestions,
  sections: [
    {
      id: 'life',
      title: '来所時の様子',
      fields: (STANDARD_WEEKDAY_TEMPLATE.sections.find((section) => section.id === 'life')?.fields || [])
        .map((field) => ({ ...field })),
    },
  ],
};
