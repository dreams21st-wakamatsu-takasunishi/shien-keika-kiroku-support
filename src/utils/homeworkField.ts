import type { HomeworkFieldDetails } from '../types';

export const HOMEWORK_SUBJECTS = ['宿題無し', '国語', '算数', '理科', '社会', '英語', '自学', 'その他'] as const;
export const HOMEWORK_ACADEMIC_SUBJECTS = ['国語', '算数', '理科', '社会', '英語'] as const;
export const HOMEWORK_FREE_TEXT_SUBJECTS = ['自学', 'その他'] as const;
export const HOMEWORK_MATERIALS = ['プリント', 'ドリル/ワーク', 'ノート'] as const;

export const HOMEWORK_FIELD_HELP =
  '教科を複数選択できます。「宿題無し」は単独選択です。主要5教科では教材を、自学・その他では内容を入力してください。';

export function createEmptyHomeworkDetails(): HomeworkFieldDetails {
  return {
    subjects: [],
    materials: {},
    notes: {},
  };
}

export function normalizeHomeworkDetails(
  details?: HomeworkFieldDetails,
  legacyValue = '',
): HomeworkFieldDetails {
  if (details && Array.isArray(details.subjects)) {
    return {
      subjects: details.subjects.filter((subject) =>
        HOMEWORK_SUBJECTS.includes(subject as (typeof HOMEWORK_SUBJECTS)[number])
      ),
      materials: details.materials && typeof details.materials === 'object' ? details.materials : {},
      notes: details.notes && typeof details.notes === 'object' ? details.notes : {},
    };
  }

  const subjects = legacyValue
    .split(/[、,]/)
    .map((value) => value.trim())
    .filter((value) => HOMEWORK_SUBJECTS.includes(value as (typeof HOMEWORK_SUBJECTS)[number]));

  return {
    ...createEmptyHomeworkDetails(),
    subjects,
  };
}

export function formatHomeworkDetails(details: HomeworkFieldDetails): string {
  return HOMEWORK_SUBJECTS
    .filter((subject) => details.subjects.includes(subject))
    .map((subject) => {
      if (subject === '宿題無し') return subject;
      if (HOMEWORK_ACADEMIC_SUBJECTS.includes(subject as (typeof HOMEWORK_ACADEMIC_SUBJECTS)[number])) {
        const materials = details.materials[subject] || [];
        return materials.length > 0 ? `${subject}（${materials.join('・')}）` : subject;
      }
      const note = details.notes[subject]?.trim();
      return note ? `${subject}（${note}）` : subject;
    })
    .join('、');
}
