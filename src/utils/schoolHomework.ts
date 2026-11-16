import type { SectionFieldAnswer } from '../types';
import { STUDY_FOCUS_SCALE_OPTIONS } from '../data/weekdayTemplate';

export const HOMEWORK_OUTCOMES = ['すべて終わった', '残った', 'やっていない', 'その他'] as const;
export const homeworkLabel = (answer?:SectionFieldAnswer) => answer?.nestedDetails?.schoolHomework ? '学校の宿題' : '宿題内容';
export const studyFocusLabel = (answer?:SectionFieldAnswer) => STUDY_FOCUS_SCALE_OPTIONS.includes(answer?.value || '') || answer?.nestedDetails?.previousStudyAttitude ? '学習中の集中' : '宿題への取り組み';
export function changeSchoolHomework(answer: SectionFieldAnswer, available: 'ある' | 'ない', outcome = ''): SectionFieldAnswer {
  const oldValue = answer.nestedDetails?.previousHomeworkValue
    || (!answer.nestedDetails?.schoolHomework && answer.value) || '';
  const result = available === 'ある' && HOMEWORK_OUTCOMES.some(item => item === outcome) ? outcome : '';
  return {
    value: result ? `ある／${result}` : available,
    note: answer.note || '',
    homeworkDetails: answer.homeworkDetails,
    nestedDetails: { ...answer.nestedDetails, schoolHomework: available, homeworkOutcome: result,
      ...(oldValue ? {previousHomeworkValue: oldValue} : {}) },
  };
}
