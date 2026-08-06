import type { HomeworkFieldDetails } from '../types';

export const HOMEWORK_SUBJECTS = ['国語', '算数', '理科', '社会', '英語', '自学', 'その他'] as const;
export const HOMEWORK_ACADEMIC_SUBJECTS = ['国語', '算数', '理科', '社会', '英語'] as const;
export const HOMEWORK_FREE_TEXT_SUBJECTS = ['自学', 'その他'] as const;
export const HOMEWORK_MATERIALS = ['プリント', 'ドリル/ワーク', 'ノート'] as const;
export const HOMEWORK_OTHER_MODES = ['取り組みなし', '宿題なし'] as const;

export const HOMEWORK_FIELD_HELP =
  '教科を複数選択できます。主要5教科では教材を、自学では内容を入力してください。宿題がない場合などは「その他」を開いて選択します。';

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
    const legacyNoHomework = details.subjects.includes('宿題無し');
    return {
      subjects: legacyNoHomework
        ? ['その他']
        : details.subjects.filter((subject) =>
            HOMEWORK_SUBJECTS.includes(subject as (typeof HOMEWORK_SUBJECTS)[number])
          ),
      materials: details.materials && typeof details.materials === 'object' ? details.materials : {},
      notes: {
        ...(details.notes && typeof details.notes === 'object' ? details.notes : {}),
        ...(legacyNoHomework ? { 'その他区分': '宿題なし' } : {}),
      },
    };
  }

  const subjects = legacyValue
    .split(/[、,]/)
    .map((value) => value.trim())
    .filter((value) => value === '宿題無し' || HOMEWORK_SUBJECTS.includes(value as (typeof HOMEWORK_SUBJECTS)[number]));

  const legacyNoHomework = subjects.includes('宿題無し');

  return {
    ...createEmptyHomeworkDetails(),
    subjects: legacyNoHomework ? ['その他'] : subjects,
    notes: legacyNoHomework ? { 'その他区分': '宿題なし' } : {},
  };
}

export function formatHomeworkDetails(details: HomeworkFieldDetails): string {
  return HOMEWORK_SUBJECTS
    .filter((subject) => details.subjects.includes(subject))
    .map((subject) => {
      if (HOMEWORK_ACADEMIC_SUBJECTS.includes(subject as (typeof HOMEWORK_ACADEMIC_SUBJECTS)[number])) {
        const materials = details.materials[subject] || [];
        return materials.length > 0 ? `${subject}（${materials.join('・')}）` : subject;
      }
      if (subject === 'その他') {
        const mode = details.notes['その他区分']?.trim();
        const note = details.notes['その他備考']?.trim();
        if (!mode) return subject;
        return note ? `${mode}（${note}）` : mode;
      }
      const note = details.notes[subject]?.trim();
      return note ? `${subject}（${note}）` : subject;
    })
    .join('、');
}
