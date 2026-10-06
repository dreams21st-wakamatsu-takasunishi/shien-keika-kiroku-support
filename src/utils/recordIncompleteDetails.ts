import type { SectionFieldAnswer } from '../types';
import {manualLessonIssues,readManualLessonExercises} from '../learning/manualLessonPractice';
import {
  HOMEWORK_ACADEMIC_SUBJECTS,
  HOMEWORK_OTHER_MODES,
  normalizeHomeworkDetails,
} from './homeworkField';

type NestedDetails = Record<string, string | string[]>;

export interface IncompleteSelection {
  selection: string;
  missing: string[];
}

export interface MockExamAttempt {
  characterCount: string;
  pastRound: string;
}

function detailArray(details: NestedDetails, key: string): string[] {
  const value = details[key];
  return Array.isArray(value) ? value : [];
}

export function getMockExamAttempts(details: NestedDetails): MockExamAttempt[] {
  const counts = detailArray(details, 'mockCharacterCounts');
  const rounds = detailArray(details, 'mockPastRounds');
  const legacyCount = String(details.mockCharacterCount || '');
  const legacyRound = String(details.mockPastRound || '');
  const count = Math.max(counts.length, rounds.length, legacyCount || legacyRound ? 1 : 0, 1);
  return Array.from({ length: count }, (_, index) => ({
    characterCount: String(counts[index] ?? (index === 0 ? legacyCount : '')),
    pastRound: String(rounds[index] ?? (index === 0 ? legacyRound : '')),
  }));
}

export function getIncompleteHomeworkSubjects(answer?: SectionFieldAnswer): string[] {
  if (!answer) return [];
  const homework = normalizeHomeworkDetails(answer.homeworkDetails, answer.value);
  return homework.subjects.filter((subject) =>
    HOMEWORK_ACADEMIC_SUBJECTS.includes(subject as (typeof HOMEWORK_ACADEMIC_SUBJECTS)[number])
      ? !(homework.materials[subject] || []).length
      : subject === 'その他'
        ? !HOMEWORK_OTHER_MODES.includes(homework.notes['その他区分'] as (typeof HOMEWORK_OTHER_MODES)[number])
        : !homework.notes[subject]?.trim()
  );
}

export function getIncompleteStudyExtras(details?: NestedDetails): IncompleteSelection[] {
  if (!details) return [];
  const selections = detailArray(details, 'selections');
  const issues: IncompleteSelection[] = [];
  if (selections.includes('漢検')) {
    const missing = [
      !String(details.kankenGrade || '').trim() ? '級' : '',
      detailArray(details, 'kankenActivities').length === 0 ? '取り組み内容' : '',
      detailArray(details, 'kankenActivities').includes('その他') && !String(details.kankenOtherNote || '').trim() ? 'その他の内容' : '',
    ].filter(Boolean);
    if (missing.length) issues.push({ selection: '漢検', missing });
  }
  if (selections.includes('エジソン') && detailArray(details, 'edisonActivities').length === 0) {
    issues.push({ selection: 'エジソン', missing: ['取り組み内容'] });
  }
  if (selections.includes('その他') && !String(details.otherNote || '').trim()) {
    issues.push({ selection: 'その他', missing: ['内容'] });
  }
  return issues;
}

export function getIncompletePcActivities(details?: NestedDetails,hasImportedEvidence=false): IncompleteSelection[] {
  if (!details) return [];
  const selections = detailArray(details, 'selections');
  const issues: IncompleteSelection[] = [];
  if (selections.includes('Dレッスン')) {
    let count=0;
    try{count=readManualLessonExercises(details).length;}catch{/* Reported as a manual format issue below. */}
    const missing=manualLessonIssues(details);
    if (!hasImportedEvidence && !count && !missing.length && !detailArray(details,'dLessonActivities').length) missing.unshift('練習内容');
    if (missing.length) issues.push({selection:'Dレッスン',missing});
  }
  if (selections.includes('文章入力模擬試験')) {
    const incompleteAttempt = getMockExamAttempts(details)
      .some((attempt) => !attempt.characterCount.trim() || !attempt.pastRound.trim());
    if (incompleteAttempt) issues.push({ selection: '文章入力模擬試験', missing: ['文字数または過去問回'] });
  }
  if (selections.includes('その他') && !String(details.otherNote || '').trim()) {
    issues.push({ selection: 'その他', missing: ['内容'] });
  }
  return issues;
}
