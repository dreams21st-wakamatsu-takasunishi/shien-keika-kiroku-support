import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Cloud,
  ListChecks,
  LoaderCircle,
  Save,
  Search,
  SkipForward,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  AttendanceType,
  ChildProfile,
  ExpressionType,
  RecorderProfile,
  SectionAnswer,
  SectionFieldAnswer,
  SnackType,
  SupportRecord,
  Template,
  TemplateField,
} from '../types';
import { summarizeABCWithAI } from '../utils/aiHelper';
import { deleteRecordDraft, loadRecordDraft, saveRecordDraft } from '../services/dataService';
import { QuickMemoPad } from './QuickMemoPad';
import {
  FATIGUE_SCALE_OPTIONS,
  formatHandCount,
  normalizeFatigueValue,
  parseHandCount,
} from '../utils/templateNormalizer';
import { calculateSchoolGrade } from '../utils/schoolGrade';
import { getWizardQuestions, renderQuestionText } from '../utils/wizardQuestions';
import { formatRegularDays, getRegularDaysForDate, getWeekdayFromDate } from '../utils/weekdays';
import {
  formatHomeworkDetails,
  HOMEWORK_ACADEMIC_SUBJECTS,
  HOMEWORK_MATERIALS,
  HOMEWORK_SUBJECTS,
  normalizeHomeworkDetails,
} from '../utils/homeworkField';
import { getCurrentDraftCycleKey, getNextDraftResetAt, isDraftCurrent } from '../utils/draftExpiry';
import { createRecordDraftKey, getDeviceId } from '../utils/deviceId';
import { isStructuredWeekdayTemplate } from '../data/weekdayTemplate';
import { generateStructuredWeekdaySummary } from '../utils/weekdayRecordSummary';

interface RecordFormProps {
  templates: Template[];
  childrenList: ChildProfile[];
  recorderProfiles: RecorderProfile[];
  initialRecord?: SupportRecord | null;
  organizationId?: string;
  userId?: string;
  userDisplayName?: string;
  draftKey?: string;
  activeRecorder?: RecorderProfile;
  assistantPrefill?: { childId: string; date: string; requestId: string } | null;
  onSaveRecords: (records: SupportRecord[]) => Promise<void> | void;
  onDraftChanged?: () => void;
  onCreateHandover?: (content: string) => Promise<void> | void;
}

type StepKind =
  | 'template'
  | 'children'
  | 'date'
  | 'recorder'
  | 'attendance'
  | 'expression'
  | 'snack'
  | 'section-subtitle'
  | 'field'
  | 'abc-behavior'
  | 'abc-consequence'
  | 'abc-antecedent'
  | 'abc-summary'
  | 'abc-sequence'
  | 'review';

interface WizardStep {
  id: string;
  kind: StepKind;
  title: string;
  help?: string;
  sectionId?: string;
  fieldId?: string;
  displayNumber?: number;
}

interface ChildDraft {
  recordId: string;
  attendance: AttendanceType | '';
  attendanceNote: string;
  expressions: ExpressionType[];
  expressionNote: string;
  snack: SnackType | '';
  snackNote: string;
  sectionAnswers: Record<string, SectionAnswer>;
  skippedQuestionIds: string[];
}

interface WizardDraft {
  version: 8;
  draftCycleKey: string;
  selectedTemplateId: string;
  selectedChildIds: string[];
  activeChildId: string;
  date: string;
  recorderId: string;
  recorderName: string;
  currentStepIndex: number;
  childStepIds: Record<string, string>;
  childDrafts: Record<string, ChildDraft>;
  updatedAt?: string;
}

type AnswerStatus = 'answered' | 'skipped' | 'unanswered';

interface PreSaveCheck {
  id: string;
  childId: string;
  childName: string;
  level: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
}

const inputClass = 'w-full min-h-12 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base sm:text-sm text-slate-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-200 outline-none';
const choiceClass = 'min-h-12 rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors text-center';

function HomeworkSubjectInput({
  answer,
  onChange,
}: {
  answer: SectionFieldAnswer;
  onChange: (answer: SectionFieldAnswer) => void;
}) {
  const details = normalizeHomeworkDetails(answer.homeworkDetails, answer.value);
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
  const commit = (nextDetails: typeof details) => {
    onChange({
      ...answer,
      value: formatHomeworkDetails(nextDetails),
      homeworkDetails: nextDetails,
    });
  };

  const toggleSubject = (subject: string) => {
    const selected = details.subjects.includes(subject);
    if (selected) {
      setExpandedSubject((current) => current === subject ? null : subject);
      return;
    }
    commit({
      ...details,
      subjects: [...details.subjects, subject],
    });
    setExpandedSubject(subject);
  };

  const removeSubject = (subject: string) => {
    const materials = { ...details.materials };
    const notes = { ...details.notes };
    delete materials[subject];
    delete notes[subject];
    commit({
      subjects: details.subjects.filter((value) => value !== subject),
      materials,
      notes,
    });
    setExpandedSubject(null);
  };

  const toggleMaterial = (subject: string, material: string) => {
    const current = details.materials[subject] || [];
    const selected = current.includes(material);
    commit({
      ...details,
      materials: {
        ...details.materials,
        [subject]: selected
          ? current.filter((value) => value !== material)
          : [...current, material],
      },
    });
  };

  const updateNote = (subject: string, value: string) => {
    commit({
      ...details,
      notes: {
        ...details.notes,
        [subject]: value,
      },
    });
  };

  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm leading-relaxed text-sky-950">
        教科をタップすると、そのすぐ下に詳しい内容が開きます。入力後は「完了して閉じる」を押してください。
      </p>
      {HOMEWORK_SUBJECTS.map((subject) => {
        const selected = details.subjects.includes(subject);
        const expanded = selected && expandedSubject === subject;
        const academic = HOMEWORK_ACADEMIC_SUBJECTS.includes(
          subject as (typeof HOMEWORK_ACADEMIC_SUBJECTS)[number]
        );
        const selectedMaterials = details.materials[subject] || [];
        const note = details.notes[subject]?.trim() || '';
        const summary = academic
          ? selectedMaterials.join('・')
          : note;

        return (
          <div
            key={subject}
            className={`overflow-hidden rounded-2xl border-2 ${
              selected ? 'border-teal-500 bg-teal-50/60' : 'border-slate-200 bg-white'
            }`}
          >
            <button
              type="button"
              aria-pressed={selected}
              aria-expanded={expanded}
              onClick={() => toggleSubject(subject)}
              className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left"
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 ${
                selected ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white text-transparent'
              }`}>
                <Check className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-black text-slate-900">{subject}</span>
                <span className={`mt-0.5 block text-sm ${selected ? 'font-bold text-teal-800' : 'text-slate-500'}`}>
                  {selected
                    ? summary || (academic ? '教材を選択してください' : '内容を入力してください')
                    : 'タップして選択'}
                </span>
              </span>
              {selected && (
                <ChevronRight className={`h-5 w-5 shrink-0 text-teal-700 transition-transform ${expanded ? 'rotate-90' : ''}`} />
              )}
            </button>

            {expanded && (
              <div className="space-y-3 border-t border-teal-200 bg-white p-4">
                {academic ? (
                  <>
                    <p className="text-sm font-bold leading-relaxed text-slate-700">
                      {subject}の教材を選択してください（複数選択可）
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {HOMEWORK_MATERIALS.map((material) => {
                        const materialSelected = selectedMaterials.includes(material);
                        return (
                          <button
                            key={material}
                            type="button"
                            aria-pressed={materialSelected}
                            onClick={() => toggleMaterial(subject, material)}
                            className={`${choiceClass} text-left text-base ${
                              materialSelected
                                ? 'border-indigo-600 bg-indigo-600 text-white'
                                : 'border-slate-300 bg-white text-slate-700'
                            }`}
                          >
                            {materialSelected && <Check className="mr-1 inline h-5 w-5" />}
                            {material}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <label className="block text-base font-bold text-slate-800">
                    {subject}の内容
                    <textarea
                      rows={3}
                      value={details.notes[subject] || ''}
                      onChange={(event) => updateNote(subject, event.target.value)}
                      placeholder={subject === '自学' ? '例：漢字練習、読書、調べ学習' : '宿題の内容を簡潔に入力'}
                      className={`${inputClass} mt-2`}
                    />
                  </label>
                )}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setExpandedSubject(null)}
                    className="min-h-12 rounded-xl bg-teal-600 px-4 text-sm font-black text-white"
                  >
                    入力を完了して閉じる
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSubject(subject)}
                    className="min-h-12 rounded-xl border border-rose-300 bg-white px-4 text-sm font-bold text-rose-700"
                  >
                    {subject}の選択を解除
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const KANKEN_GRADES = ['10級', '9級', '8級', '7級', '6級', '5級', '4級', '3級', '準2級', '2級', '準1級', '1級'];
const EDISON_OPTIONS = ['練習帳', '確認テスト'];
const D_LESSON_OPTIONS = ['マウス練習', 'ビジョントレーニング', 'タイピング練習', 'ブラインドタッチ練習', '文章入力練習', 'Word練習'];

function detailArray(details: Record<string, string | string[]> | undefined, key: string) {
  const value = details?.[key];
  return Array.isArray(value) ? value : [];
}

function clampHandCount(value: string) {
  if (!value) return '';
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return '';
  return String(Math.min(5, Math.max(0, parsed)));
}

function StudyExtrasInput({
  answer,
  onChange,
}: {
  answer: SectionFieldAnswer;
  onChange: (answer: SectionFieldAnswer) => void;
}) {
  const details = answer.nestedDetails || {};
  const selections = detailArray(details, 'selections');
  const [expanded, setExpanded] = useState<string | null>(null);

  const commit = (nextDetails: Record<string, string | string[]>) => {
    const nextSelections = detailArray(nextDetails, 'selections');
    const parts = nextSelections.map((selection) => {
      if (selection === '漢検') {
        const grade = String(nextDetails.kankenGrade || '').trim();
        return grade ? `漢検（${grade}）` : '漢検';
      }
      if (selection === 'エジソン') {
        const activities = detailArray(nextDetails, 'edisonActivities');
        return activities.length ? `エジソン（${activities.join('・')}）` : 'エジソン';
      }
      if (selection === 'その他') {
        const note = String(nextDetails.otherNote || '').trim();
        return note ? `その他（${note}）` : 'その他';
      }
      return selection;
    });
    onChange({ ...answer, value: parts.join('、'), nestedDetails: nextDetails });
  };

  const toggleSelection = (selection: string) => {
    const selected = selections.includes(selection);
    if (selected) {
      setExpanded((current) => current === selection ? null : selection);
      return;
    }
    const nextSelections = selection === '取り組みなし'
      ? ['取り組みなし']
      : [...selections.filter((item) => item !== '取り組みなし'), selection];
    commit({ ...details, selections: nextSelections });
    setExpanded(selection === '取り組みなし' ? null : selection);
  };

  const removeSelection = (selection: string) => {
    const next: Record<string, string | string[]> = { ...details, selections: selections.filter((item) => item !== selection) };
    if (selection === '漢検') delete next.kankenGrade;
    if (selection === 'エジソン') delete next.edisonActivities;
    if (selection === 'その他') delete next.otherNote;
    commit(next);
    setExpanded(null);
  };

  return (
    <div className="space-y-3">
      {['漢検', 'エジソン', '取り組みなし', 'その他'].map((selection) => {
        const selected = selections.includes(selection);
        const isExpanded = selected && expanded === selection;
        const summary = selection === '漢検'
          ? String(details.kankenGrade || '')
          : selection === 'エジソン'
            ? detailArray(details, 'edisonActivities').join('・')
            : selection === 'その他'
              ? String(details.otherNote || '')
              : '';
        return (
          <div key={selection} className={`overflow-hidden rounded-2xl border-2 ${selected ? 'border-teal-500 bg-teal-50' : 'border-slate-200 bg-white'}`}>
            <button type="button" aria-pressed={selected} aria-expanded={isExpanded} onClick={() => toggleSelection(selection)} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 ${selected ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 text-transparent'}`}><Check className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><strong className="block text-base text-slate-900">{selection}</strong>{selected && selection !== '取り組みなし' && <span className="block truncate text-xs font-bold text-teal-800">{summary || '詳細を入力してください'}</span>}</span>
              {selected && selection !== '取り組みなし' && <ChevronRight className={`h-5 w-5 text-teal-700 ${isExpanded ? 'rotate-90' : ''}`} />}
            </button>
            {isExpanded && (
              <div className="space-y-3 border-t border-teal-200 bg-white p-4">
                {selection === '漢検' && (
                  <label className="block text-sm font-bold text-slate-700">取り組んだ級
                    <select value={String(details.kankenGrade || '')} onChange={(event) => commit({ ...details, kankenGrade: event.target.value })} className={`${inputClass} mt-2`}>
                      <option value="">級を選択してください</option>
                      {KANKEN_GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                    </select>
                  </label>
                )}
                {selection === 'エジソン' && (
                  <div><p className="mb-2 text-sm font-bold text-slate-700">取り組んだ内容（複数選択可）</p><div className="grid grid-cols-2 gap-2">{EDISON_OPTIONS.map((option) => {
                    const selectedOption = detailArray(details, 'edisonActivities').includes(option);
                    return <button key={option} type="button" onClick={() => { const current = detailArray(details, 'edisonActivities'); commit({ ...details, edisonActivities: selectedOption ? current.filter((item) => item !== option) : [...current, option] }); }} className={`${choiceClass} ${selectedOption ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{selectedOption && <Check className="mr-1 inline h-4 w-4" />}{option}</button>;
                  })}</div></div>
                )}
                {selection === 'その他' && <textarea rows={3} value={String(details.otherNote || '')} onChange={(event) => commit({ ...details, otherNote: event.target.value })} placeholder="取り組み内容を簡潔に入力" className={inputClass} />}
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => setExpanded(null)} className="min-h-12 rounded-xl bg-teal-600 px-4 text-sm font-black text-white">入力を完了して閉じる</button>
                  <button type="button" onClick={() => removeSelection(selection)} className="min-h-12 rounded-xl border border-rose-300 px-4 text-sm font-bold text-rose-700">選択を解除</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PcActivitiesInput({
  answer,
  onChange,
}: {
  answer: SectionFieldAnswer;
  onChange: (answer: SectionFieldAnswer) => void;
}) {
  const details = answer.nestedDetails || {};
  const selections = detailArray(details, 'selections');
  const [expanded, setExpanded] = useState<string | null>(null);

  const commit = (nextDetails: Record<string, string | string[]>) => {
    const nextSelections = detailArray(nextDetails, 'selections');
    const parts = nextSelections.map((selection) => {
      if (selection === 'Dレッスン') {
        const activities = detailArray(nextDetails, 'dLessonActivities');
        return activities.length ? `Dレッスン（${activities.join('・')}）` : 'Dレッスン';
      }
      if (selection === '文章入力模擬試験') {
        const count = String(nextDetails.mockCharacterCount || '').trim();
        const round = String(nextDetails.mockPastRound || '').trim();
        const values = [count && `${count}文字`, round && `第${round}回過去問`].filter(Boolean);
        return values.length ? `文章入力模擬試験（${values.join('・')}）` : '文章入力模擬試験';
      }
      const note = String(nextDetails.otherNote || '').trim();
      return note ? `その他（${note}）` : 'その他';
    });
    onChange({ ...answer, value: parts.join('、'), nestedDetails: nextDetails });
  };

  const toggleSelection = (selection: string) => {
    if (selections.includes(selection)) {
      setExpanded((current) => current === selection ? null : selection);
      return;
    }
    commit({ ...details, selections: [...selections, selection] });
    setExpanded(selection);
  };

  const removeSelection = (selection: string) => {
    const next: Record<string, string | string[]> = { ...details, selections: selections.filter((item) => item !== selection) };
    if (selection === 'Dレッスン') delete next.dLessonActivities;
    if (selection === '文章入力模擬試験') {
      delete next.mockCharacterCount;
      delete next.mockPastRound;
    }
    if (selection === 'その他') delete next.otherNote;
    commit(next);
    setExpanded(null);
  };

  return (
    <div className="space-y-3">
      {['Dレッスン', '文章入力模擬試験', 'その他'].map((selection) => {
        const selected = selections.includes(selection);
        const isExpanded = selected && expanded === selection;
        const summary = selection === 'Dレッスン'
          ? detailArray(details, 'dLessonActivities').join('・')
          : selection === '文章入力模擬試験'
            ? [details.mockCharacterCount && `${details.mockCharacterCount}文字`, details.mockPastRound && `第${details.mockPastRound}回過去問`].filter(Boolean).join('・')
            : String(details.otherNote || '');
        return (
          <div key={selection} className={`overflow-hidden rounded-2xl border-2 ${selected ? 'border-teal-500 bg-teal-50' : 'border-slate-200 bg-white'}`}>
            <button type="button" aria-pressed={selected} aria-expanded={isExpanded} onClick={() => toggleSelection(selection)} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 ${selected ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 text-transparent'}`}><Check className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><strong className="block text-base text-slate-900">{selection}</strong>{selected && <span className="block truncate text-xs font-bold text-teal-800">{summary || '詳細を入力してください'}</span>}</span>
              {selected && <ChevronRight className={`h-5 w-5 text-teal-700 ${isExpanded ? 'rotate-90' : ''}`} />}
            </button>
            {isExpanded && (
              <div className="space-y-3 border-t border-teal-200 bg-white p-4">
                {selection === 'Dレッスン' && (
                  <div><p className="mb-2 text-sm font-bold text-slate-700">取り組んだ練習（複数選択可）</p><div className="grid gap-2 sm:grid-cols-2">{D_LESSON_OPTIONS.map((option) => {
                    const selectedOption = detailArray(details, 'dLessonActivities').includes(option);
                    return <button key={option} type="button" onClick={() => { const current = detailArray(details, 'dLessonActivities'); commit({ ...details, dLessonActivities: selectedOption ? current.filter((item) => item !== option) : [...current, option] }); }} className={`${choiceClass} text-left ${selectedOption ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{selectedOption && <Check className="mr-1 inline h-4 w-4" />}{option}</button>;
                  })}</div></div>
                )}
                {selection === '文章入力模擬試験' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-bold text-slate-700">入力文字数<div className="mt-2 flex items-center gap-2"><input type="number" min="0" inputMode="numeric" value={String(details.mockCharacterCount || '')} onChange={(event) => commit({ ...details, mockCharacterCount: event.target.value })} className={inputClass} /><span>文字</span></div></label>
                    <label className="text-sm font-bold text-slate-700">過去問<div className="mt-2 flex items-center gap-2"><span>第</span><input type="number" min="1" inputMode="numeric" value={String(details.mockPastRound || '')} onChange={(event) => commit({ ...details, mockPastRound: event.target.value })} className={inputClass} /><span>回</span></div></label>
                  </div>
                )}
                {selection === 'その他' && <textarea rows={3} value={String(details.otherNote || '')} onChange={(event) => commit({ ...details, otherNote: event.target.value })} placeholder="取り組み内容を簡潔に入力" className={inputClass} />}
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => setExpanded(null)} className="min-h-12 rounded-xl bg-teal-600 px-4 text-sm font-black text-white">入力を完了して閉じる</button>
                  <button type="button" onClick={() => removeSelection(selection)} className="min-h-12 rounded-xl border border-rose-300 px-4 text-sm font-bold text-rose-700">選択を解除</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function newRecordId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `rec-${crypto.randomUUID()}`;
  return `rec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createSectionAnswers(template?: Template, existing?: Record<string, SectionAnswer>) {
  if (!template) return existing || {};
  const next: Record<string, SectionAnswer> = {};
  template.sections.forEach((section) => {
    const previous = existing?.[section.id];
    const answers: SectionAnswer['answers'] = {};
    section.fields.forEach((field) => {
      const value = previous?.answers?.[field.id]?.value || field.defaultValue || '';
      answers[field.id] = previous?.answers?.[field.id] || {
        value,
        note: '',
      };
      if (field.type === 'fatigue_scale') {
        answers[field.id] = {
          ...answers[field.id],
          value: normalizeFatigueValue(value),
        };
      }
    });
    next[section.id] = {
      sectionId: section.id,
      sectionTitle: section.title,
      subTitleValue: previous?.subTitleValue || (section.hasSubTitleField ? '' : undefined),
      answers,
      detailText: previous?.detailText || '',
      abcAnalysis: previous?.abcAnalysis || { behavior: '', consequence: '', antecedent: '', summary: previous?.detailText || '' },
    };
  });
  return next;
}

function createChildDraft(template?: Template, record?: SupportRecord): ChildDraft {
  return {
    recordId: record?.id || newRecordId(),
    attendance: record?.attendance || '',
    attendanceNote: record?.attendanceNote || '',
    expressions: record?.expressions || [],
    expressionNote: record?.expressionNote || '',
    snack: record?.snack || '',
    snackNote: record?.snackNote || '',
    sectionAnswers: createSectionAnswers(template, record?.sectionAnswers),
    skippedQuestionIds: record?.skippedQuestionIds || [],
  };
}

function normalizeWizardDraft(value: unknown): WizardDraft | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as Partial<WizardDraft> & { version?: number };
  if (![2, 3, 4, 5, 6, 7, 8].includes(draft.version || 0) || !Array.isArray(draft.selectedChildIds) || !draft.childDrafts) return null;
  if (!isDraftCurrent(draft.draftCycleKey, draft.updatedAt)) return null;
  const previousStepIndex = draft.currentStepIndex || 0;
  const currentStepIndex = (draft.version || 0) < 4
    ? previousStepIndex === 1 ? 2 : previousStepIndex === 2 ? 1 : previousStepIndex
    : previousStepIndex;
  return {
    ...draft,
    version: 8,
    draftCycleKey: getCurrentDraftCycleKey(),
    recorderId: draft.recorderId || '',
    currentStepIndex,
    childStepIds: draft.childStepIds || {},
  } as WizardDraft;
}

export const RecordForm: React.FC<RecordFormProps> = ({
  templates,
  childrenList,
  recorderProfiles,
  initialRecord,
  organizationId,
  userId,
  userDisplayName,
  draftKey: requestedDraftKey,
  activeRecorder,
  assistantPrefill,
  onSaveRecords,
  onDraftChanged,
  onCreateHandover,
}) => {
  const storedTemplate = templates.find((template) => template.id === initialRecord?.templateId) || templates[0];
  const initialTemplate = initialRecord?.templateSectionsSnapshot?.length
    ? {
        id: initialRecord.templateId,
        name: initialRecord.templateName,
        type: initialRecord.templateType,
        sections: initialRecord.templateSectionsSnapshot,
        wizardQuestions: storedTemplate?.wizardQuestions,
      } satisfies Template
    : storedTemplate;
  const draftKey = useRef(
    requestedDraftKey
      || (initialRecord ? `record-edit-${initialRecord.id}` : createRecordDraftKey())
  ).current;
  const storageKey = `support-record-draft-v2:${organizationId || 'local'}:${userId || 'local'}:${draftKey}`;

  const createBaseDraft = (): WizardDraft => {
    const initialRecorder = activeRecorder || (initialRecord
      ? recorderProfiles.find(
          (profile) =>
            profile.id === initialRecord.recorderId ||
            profile.displayName === initialRecord.recorderName
        )
      : recorderProfiles.length === 1
        ? recorderProfiles[0]
        : undefined);
    const base: WizardDraft = {
      version: 8,
      draftCycleKey: getCurrentDraftCycleKey(),
      selectedTemplateId: initialTemplate?.id || '',
      selectedChildIds: initialRecord ? [initialRecord.childId] : assistantPrefill ? [assistantPrefill.childId] : [],
      activeChildId: initialRecord?.childId || assistantPrefill?.childId || '',
      date: initialRecord?.date || assistantPrefill?.date || new Date().toISOString().split('T')[0],
      recorderId: activeRecorder?.id || initialRecord?.recorderId || (!userDisplayName ? initialRecorder?.id : '') || '',
      recorderName: activeRecorder?.displayName || initialRecord?.recorderName || userDisplayName || initialRecorder?.displayName || '',
      currentStepIndex: 0,
      childStepIds: {},
      childDrafts: initialRecord
        ? { [initialRecord.childId]: createChildDraft(initialTemplate, initialRecord) }
        : assistantPrefill
          ? { [assistantPrefill.childId]: createChildDraft(initialTemplate) }
          : {},
    };
    return base;
  };

  const createInitialDraft = (): WizardDraft => {
    const base = createBaseDraft();
    try {
      const local = localStorage.getItem(storageKey);
      if (local) {
        const parsed = JSON.parse(local) as unknown;
        const restored = normalizeWizardDraft(parsed);
        if (restored) return restored;
        localStorage.removeItem(storageKey);
      }
    } catch {
      // Invalid or unavailable local storage does not block record entry.
    }
    return base;
  };

  const [wizard, setWizard] = useState<WizardDraft>(createInitialDraft);
  const [draftReady, setDraftReady] = useState(!organizationId || !userId);
  const [draftStatus, setDraftStatus] = useState<'restored' | 'saving' | 'saved' | 'deleted' | 'reset' | 'conflict' | 'error' | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [summarizingSectionId, setSummarizingSectionId] = useState<string | null>(null);
  const [showChildPicker, setShowChildPicker] = useState(false);
  const [childSearch, setChildSearch] = useState('');
  const [checksAcknowledged, setChecksAcknowledged] = useState(false);
  const draftCleared = useRef(false);
  const skipNextDraftSave = useRef(false);
  const deviceId = useRef(getDeviceId()).current;
  const remoteRevision = useRef<number | null>(null);

  const activeTemplate = initialRecord
    ? initialTemplate
    : templates.find((template) => template.id === wizard.selectedTemplateId) || templates[0];
  const wizardQuestions = getWizardQuestions(activeTemplate);
  const activeChild = childrenList.find((child) => child.id === wizard.activeChildId);
  const activeChildDraft = wizard.childDrafts[wizard.activeChildId];

  useEffect(() => {
    if (!organizationId || !userId) return;
    let alive = true;
    void loadRecordDraft(organizationId, draftKey)
      .then((remote) => {
        if (!alive || !remote) return;
        remoteRevision.current = remote.revision;
        const restored = normalizeWizardDraft(remote.payload);
        if (!restored) {
          localStorage.removeItem(storageKey);
          void deleteRecordDraft(organizationId, draftKey);
          return;
        }
        const remoteTime = new Date(remote.updatedAt).getTime();
        const localTime = wizard.updatedAt ? new Date(wizard.updatedAt).getTime() : 0;
        if (remoteTime > localTime) {
          setWizard({ ...restored, updatedAt: remote.updatedAt });
          localStorage.setItem(storageKey, JSON.stringify({ ...restored, updatedAt: remote.updatedAt }));
          setDraftStatus('restored');
        }
      })
      .catch(() => setDraftStatus('error'))
      .finally(() => { if (alive) setDraftReady(true); });
    return () => { alive = false; };
    // The initial local draft is intentionally compared once per form session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, userId, draftKey, storageKey]);

  useEffect(() => {
    if (!draftReady || draftCleared.current) return;
    if (skipNextDraftSave.current) {
      skipNextDraftSave.current = false;
      return;
    }
    setDraftStatus('saving');
    const timer = window.setTimeout(() => {
      const payload: WizardDraft = {
        ...wizard,
        version: 8,
        draftCycleKey: getCurrentDraftCycleKey(),
        updatedAt: new Date().toISOString(),
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch {
        setDraftStatus('error');
      }
      if (organizationId && userId) {
        void saveRecordDraft(organizationId, userId, draftKey, payload, {
          deviceId,
          expectedRevision: remoteRevision.current,
          recorderId: wizard.recorderId || null,
        })
          .then((saved) => {
            remoteRevision.current = saved.revision;
            setDraftStatus('saved');
            onDraftChanged?.();
          })
          .catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            setDraftStatus(message.includes('DRAFT_CONFLICT') ? 'conflict' : 'error');
          });
      } else {
        setDraftStatus('saved');
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [wizard, draftReady, storageKey, organizationId, userId, draftKey, deviceId, onDraftChanged]);

  useEffect(() => {
    let timer: number;
    const scheduleNextReset = () => {
      const now = new Date();
      const resetAt = getNextDraftResetAt(now);
      timer = window.setTimeout(() => {
        skipNextDraftSave.current = true;
        remoteRevision.current = null;
        localStorage.removeItem(storageKey);
        if (organizationId) void deleteRecordDraft(organizationId, draftKey);
        setWizard(createBaseDraft());
        setStepError(null);
        setSaveError(null);
        setDraftStatus('reset');
        onDraftChanged?.();
        scheduleNextReset();
      }, resetAt.getTime() - now.getTime());
    };
    scheduleNextReset();
    return () => window.clearTimeout(timer);
    // The form session keeps scheduling its next local 03:00 reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, organizationId, storageKey, onDraftChanged]);

  useEffect(() => {
    if (activeTemplate || templates.length === 0) return;
    setWizard((previous) => ({ ...previous, selectedTemplateId: templates[0].id }));
  }, [activeTemplate, templates]);

  const steps = useMemo<WizardStep[]>(() => {
    const questions = getWizardQuestions(activeTemplate);
    const next: WizardStep[] = [
      { id: 'template', kind: 'template', displayNumber: 1, ...questions.template },
      { id: 'date', kind: 'date', displayNumber: 2, ...questions.date },
      { id: 'children', kind: 'children', displayNumber: 3, ...questions.children },
    ];

    if (!activeRecorder && !userDisplayName) {
      next.push({ id: 'recorder', kind: 'recorder', ...questions.recorder });
    }

    if (isStructuredWeekdayTemplate(activeTemplate)) {
      next.push(
        { id: 'attendance', kind: 'attendance', displayNumber: 4, ...questions.attendance },
        { id: 'expression', kind: 'expression', displayNumber: 5, ...questions.expression },
      );

      const life = activeTemplate?.sections.find((section) => section.id === 'life');
      const addField = (sectionId: string, field: TemplateField, displayNumber: number) => next.push({
        id: `field-${sectionId}-${field.id}`,
        kind: 'field',
        sectionId,
        fieldId: field.id,
        displayNumber,
        title: field.questionTitle || `${field.label}はどうですか？`,
        help: field.helpText,
      });
      const lifeNumbers: Record<string, number> = {
        fatigue: 6,
        preparation: 7,
        response_to_prompt: 9,
        medication: 10,
      };
      life?.fields.forEach((field) => addField('life', field, lifeNumbers[field.id] || 10));
      const responseIndex = next.findIndex((step) => step.fieldId === 'response_to_prompt');
      next.splice(responseIndex, 0, { id: 'snack', kind: 'snack', displayNumber: 8, ...questions.snack });

      (['period1', 'period2'] as const).forEach((sectionId, sectionIndex) => {
        const section = activeTemplate?.sections.find((candidate) => candidate.id === sectionId);
        const baseNumber = sectionIndex === 0 ? 11 : 16;
        const questionOffset: Record<string, number> = {
          [`${sectionId}_type`]: 0,
          [`${sectionId}_study_homework`]: 1,
          [`${sectionId}_study_attitude`]: 2,
          [`${sectionId}_study_extras`]: 3,
          [`${sectionId}_study_posture`]: 4,
          [`${sectionId}_pc_content`]: 1,
          [`${sectionId}_pc_finger`]: 2,
          [`${sectionId}_pc_posture`]: 3,
          [`${sectionId}_pc_transition`]: 4,
        };
        section?.fields.forEach((field) => addField(sectionId, field, baseNumber + (questionOffset[field.id] || 0)));
      });

      next.push({
        id: 'abc-special',
        kind: 'abc-sequence',
        sectionId: 'special',
        displayNumber: 21,
        title: questions.abcBehavior.title,
        help: 'B（行動）→C（結果）→A（きっかけ）の順に入力します。各入力は箇条書きや短い言葉でまとめてください。',
      });
      next.push({ id: 'review', kind: 'review', title: 'フォーマット表示と文章合成プレビューを確認してください。' });
      return next;
    }

    next.push(
      { id: 'attendance', kind: 'attendance', ...questions.attendance },
      { id: 'expression', kind: 'expression', ...questions.expression },
      { id: 'snack', kind: 'snack', ...questions.snack },
    );
    activeTemplate?.sections.forEach((section) => {
      if (section.hasSubTitleField) {
        next.push({
          id: `subtitle-${section.id}`,
          kind: 'section-subtitle',
          sectionId: section.id,
          title: `${section.title}の「${section.subTitleLabel || '取組内容'}」は何ですか？`,
          help: '活動名や課題名を簡潔に入力してください。',
        });
      }
      section.fields.forEach((field) => next.push({
        id: `field-${section.id}-${field.id}`,
        kind: 'field',
        sectionId: section.id,
        fieldId: field.id,
        title: field.questionTitle || `${section.title}：${field.label}`,
        help: field.helpText,
      }));
      next.push(
        {
          id: `abc-b-${section.id}`,
          kind: 'abc-behavior',
          sectionId: section.id,
          ...renderQuestionText(questions.abcBehavior, section.title),
        },
        {
          id: `abc-c-${section.id}`,
          kind: 'abc-consequence',
          sectionId: section.id,
          ...renderQuestionText(questions.abcConsequence, section.title),
        },
        {
          id: `abc-a-${section.id}`,
          kind: 'abc-antecedent',
          sectionId: section.id,
          ...renderQuestionText(questions.abcAntecedent, section.title),
        },
        {
          id: `abc-summary-${section.id}`,
          kind: 'abc-summary',
          sectionId: section.id,
          ...renderQuestionText(questions.abcSummary, section.title),
        },
      );
    });
    next.push({ id: 'review', kind: 'review', title: '選択した児童全員の入力内容を確認してください。' });
    return next;
  }, [activeRecorder, activeTemplate, userDisplayName]);

  useEffect(() => {
    if (wizard.currentStepIndex < steps.length) return;
    setWizard((previous) => ({ ...previous, currentStepIndex: Math.max(0, steps.length - 1) }));
  }, [steps.length, wizard.currentStepIndex]);

  const currentStep = steps[wizard.currentStepIndex];
  const progress = currentStep?.kind === 'review'
    ? 100
    : currentStep?.displayNumber
      ? (currentStep.displayNumber / 21) * 100
      : steps.length > 0
        ? ((wizard.currentStepIndex + 1) / steps.length) * 100
        : 0;
  const isChildStep = currentStep && !['template', 'children', 'date', 'recorder', 'review'].includes(currentStep.kind);

  const updateWizard = (updates: Partial<WizardDraft>) => setWizard((previous) => ({ ...previous, ...updates }));

  const updateChildDraft = (childId: string, updater: (draft: ChildDraft) => ChildDraft) => {
    setWizard((previous) => {
      const current = previous.childDrafts[childId] || createChildDraft(activeTemplate);
      return { ...previous, childDrafts: { ...previous.childDrafts, [childId]: updater(current) } };
    });
  };

  const unskip = (draft: ChildDraft, stepId: string) => ({
    ...draft,
    skippedQuestionIds: draft.skippedQuestionIds.filter((id) => id !== stepId),
  });

  const selectTemplate = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    setWizard((previous) => ({
      ...previous,
      selectedTemplateId: templateId,
      childDrafts: Object.fromEntries((Object.entries(previous.childDrafts) as Array<[string, ChildDraft]>).map(([childId, draft]) => [
        childId,
        { ...draft, sectionAnswers: createSectionAnswers(template), skippedQuestionIds: [] },
      ])),
      childStepIds: {},
    }));
  };

  const toggleChild = (childId: string) => {
    if (initialRecord) return;
    setWizard((previous) => {
      const selected = previous.selectedChildIds.includes(childId);
      const selectedChildIds = selected
        ? previous.selectedChildIds.filter((id) => id !== childId)
        : [...previous.selectedChildIds, childId];
      const childDrafts = { ...previous.childDrafts };
      if (!selected && !childDrafts[childId]) childDrafts[childId] = createChildDraft(activeTemplate);
      const activeChildId = selected && previous.activeChildId === childId
        ? selectedChildIds[0] || ''
        : previous.activeChildId || childId;
      return { ...previous, selectedChildIds, activeChildId, childDrafts };
    });
  };

  const updateFieldAnswer = (
    sectionId: string,
    fieldId: string,
    updates: Partial<SectionFieldAnswer>,
  ) => {
    if (!wizard.activeChildId || !currentStep) return;
    updateChildDraft(wizard.activeChildId, (raw) => {
      const draft = unskip(raw, currentStep.id);
      const section = draft.sectionAnswers[sectionId] || { sectionId, sectionTitle: '', answers: {} };
      const answer = section.answers[fieldId] || { value: '', note: '' };
      return {
        ...draft,
        sectionAnswers: {
          ...draft.sectionAnswers,
          [sectionId]: {
            ...section,
            answers: {
              ...section.answers,
              [fieldId]: { ...answer, ...updates },
            },
          },
        },
      };
    });
  };

  const updateField = (sectionId: string, fieldId: string, value: string, note?: string) => {
    const updates: Partial<SectionFieldAnswer> = { value };
    if (note !== undefined) updates.note = note;
    updateFieldAnswer(sectionId, fieldId, updates);
  };

  const updateSection = (sectionId: string, updates: Partial<SectionAnswer>) => {
    if (!wizard.activeChildId || !currentStep) return;
    updateChildDraft(wizard.activeChildId, (raw) => {
      const draft = unskip(raw, currentStep.id);
      const section = draft.sectionAnswers[sectionId] || { sectionId, sectionTitle: '', answers: {} };
      return { ...draft, sectionAnswers: { ...draft.sectionAnswers, [sectionId]: { ...section, ...updates } } };
    });
  };

  const updateABC = (sectionId: string, key: 'behavior' | 'consequence' | 'antecedent' | 'summary', value: string) => {
    const section = activeChildDraft?.sectionAnswers[sectionId];
    updateSection(sectionId, {
      abcAnalysis: {
        behavior: section?.abcAnalysis?.behavior || '',
        consequence: section?.abcAnalysis?.consequence || '',
        antecedent: section?.abcAnalysis?.antecedent || '',
        summary: section?.abcAnalysis?.summary || '',
        [key]: value,
      },
      ...(key === 'summary' ? { detailText: value } : {}),
    });
  };

  const fieldForStep = (step: WizardStep) => activeTemplate?.sections
    .find((section) => section.id === step.sectionId)?.fields
    .find((field) => field.id === step.fieldId);

  const fieldIsVisible = (field: TemplateField, childDraft?: ChildDraft, sectionId?: string) => {
    if (!field.visibleWhen) return true;
    const controllingValue = childDraft?.sectionAnswers[sectionId || '']?.answers[field.visibleWhen.fieldId]?.value;
    const expectedValues = Array.isArray(field.visibleWhen.equals)
      ? field.visibleWhen.equals
      : [field.visibleWhen.equals];
    return expectedValues.includes(controllingValue || '');
  };

  const stepIsVisible = (step: WizardStep, childDraft?: ChildDraft) => {
    if (step.kind !== 'field') return true;
    const field = fieldForStep(step);
    return field ? fieldIsVisible(field, childDraft, step.sectionId) : false;
  };

  const answerStatus = (step: WizardStep, childDraft?: ChildDraft): AnswerStatus => {
    if (!childDraft) return 'unanswered';
    if (childDraft.skippedQuestionIds.includes(step.id)) return 'skipped';
    const section = step.sectionId ? childDraft.sectionAnswers[step.sectionId] : undefined;
    switch (step.kind) {
      case 'attendance': return childDraft.attendance ? 'answered' : 'unanswered';
      case 'expression': return childDraft.expressions.length > 0 ? 'answered' : 'unanswered';
      case 'snack': return childDraft.snack ? 'answered' : 'unanswered';
      case 'section-subtitle': return section?.subTitleValue?.trim() ? 'answered' : 'unanswered';
      case 'field': return section?.answers?.[step.fieldId || '']?.value?.trim() ? 'answered' : 'unanswered';
      case 'abc-behavior': return section?.abcAnalysis?.behavior?.trim() ? 'answered' : 'unanswered';
      case 'abc-consequence': return section?.abcAnalysis?.consequence?.trim() ? 'answered' : 'unanswered';
      case 'abc-antecedent': return section?.abcAnalysis?.antecedent?.trim() ? 'answered' : 'unanswered';
      case 'abc-summary': return section?.abcAnalysis?.summary?.trim() ? 'answered' : 'unanswered';
      case 'abc-sequence': return section?.abcAnalysis?.summary?.trim() ? 'answered' : 'unanswered';
      default: return 'answered';
    }
  };

  const allPerChildSteps = steps.filter((step) => !['template', 'children', 'date', 'recorder', 'review'].includes(step.kind));
  const childStepsForDraft = (draft?: ChildDraft) => allPerChildSteps.filter((step) => stepIsVisible(step, draft));
  const perChildSteps = childStepsForDraft(activeChildDraft);
  const unansweredForChild = (childId: string) => childStepsForDraft(wizard.childDrafts[childId]).filter((step) => answerStatus(step, wizard.childDrafts[childId]) === 'unanswered');
  const skippedForChild = (childId: string) => childStepsForDraft(wizard.childDrafts[childId]).filter((step) => answerStatus(step, wizard.childDrafts[childId]) === 'skipped');

  const getPreSaveChecks = (): PreSaveCheck[] => {
    const checks: PreSaveCheck[] = [];
    wizard.selectedChildIds.forEach((childId) => {
      const childName = childrenList.find((child) => child.id === childId)?.name || '児童';
      const draft = wizard.childDrafts[childId] || createChildDraft(activeTemplate);
      const unanswered = unansweredForChild(childId);
      const skipped = skippedForChild(childId);

      if (unanswered.length > 0) {
        checks.push({
          id: `${childId}-unanswered`,
          childId,
          childName,
          level: 'warning',
          title: `未回答が${unanswered.length}件あります`,
          detail: '回答漏れでないか、質問一覧から確認してください。',
        });
      }
      if (skipped.length > 0) {
        checks.push({
          id: `${childId}-skipped`,
          childId,
          childName,
          level: 'info',
          title: `スキップが${skipped.length}件あります`,
          detail: '意図してスキップした項目か確認してください。',
        });
      }

      activeTemplate?.sections.forEach((section) => {
        const sectionAnswer = draft.sectionAnswers[section.id];
        section.fields.forEach((field) => {
          if (!fieldIsVisible(field, draft, section.id)) return;
          const answer = sectionAnswer?.answers?.[field.id];
          const stepId = `field-${section.id}-${field.id}`;
          if (field.required && !answer?.value?.trim() && !draft.skippedQuestionIds.includes(stepId)) {
            checks.push({
              id: `${childId}-${stepId}-required`,
              childId,
              childName,
              level: 'error',
              title: `${section.title}：${field.label}は必須です`,
              detail: '入力してから保存してください。',
            });
          }
          if (field.type === 'homework_subjects' && answer?.homeworkDetails) {
            const homework = normalizeHomeworkDetails(answer.homeworkDetails, answer.value);
            const incomplete = homework.subjects.filter((subject) =>
              HOMEWORK_ACADEMIC_SUBJECTS.includes(subject as (typeof HOMEWORK_ACADEMIC_SUBJECTS)[number])
                ? !(homework.materials[subject] || []).length
                : !homework.notes[subject]?.trim()
            );
            if (incomplete.length > 0) {
              checks.push({
                id: `${childId}-${stepId}-homework`,
                childId,
                childName,
                level: 'warning',
                title: `${incomplete.join('・')}の詳しい内容が未入力です`,
                detail: '教科を選択した直下の教材または自由記入欄を確認してください。',
              });
            }
          }
          if (field.type === 'study_extras' && answer?.nestedDetails) {
            const details = answer.nestedDetails;
            const selections = detailArray(details, 'selections');
            const incomplete = [
              selections.includes('漢検') && !String(details.kankenGrade || '').trim() ? '漢検の級' : '',
              selections.includes('エジソン') && detailArray(details, 'edisonActivities').length === 0 ? 'エジソンの内容' : '',
              selections.includes('その他') && !String(details.otherNote || '').trim() ? 'その他の内容' : '',
            ].filter(Boolean);
            if (incomplete.length) {
              checks.push({
                id: `${childId}-${stepId}-study-extras`,
                childId,
                childName,
                level: 'warning',
                title: `${incomplete.join('・')}が未入力です`,
                detail: '選択した項目のすぐ下に表示される詳細欄を確認してください。',
              });
            }
          }
          if (field.type === 'pc_activities' && answer?.nestedDetails) {
            const details = answer.nestedDetails;
            const selections = detailArray(details, 'selections');
            const incomplete = [
              selections.includes('Dレッスン') && detailArray(details, 'dLessonActivities').length === 0 ? 'Dレッスンの練習内容' : '',
              selections.includes('文章入力模擬試験') && (!String(details.mockCharacterCount || '').trim() || !String(details.mockPastRound || '').trim()) ? '模擬試験の文字数または過去問回' : '',
              selections.includes('その他') && !String(details.otherNote || '').trim() ? 'その他の内容' : '',
            ].filter(Boolean);
            if (incomplete.length) {
              checks.push({
                id: `${childId}-${stepId}-pc-activities`,
                childId,
                childName,
                level: 'warning',
                title: `${incomplete.join('・')}が未入力です`,
                detail: '選択した項目のすぐ下に表示される詳細欄を確認してください。',
              });
            }
          }
          if (field.type === 'hand_count' && answer?.value && answer.value !== 'タイピング練習に取り組んでいない') {
            const counts = parseHandCount(answer.value);
            if (!counts.left || !counts.right) {
              checks.push({
                id: `${childId}-${stepId}-hand-count`,
                childId,
                childName,
                level: 'warning',
                title: '左右どちらかの指本数が未入力です',
                detail: '左・右の両方を0～5本で入力するか、「タイピング練習に取り組んでいない」を選択してください。',
              });
            }
          }
        });

        const abc = sectionAnswer?.abcAnalysis;
        const abcCount = [abc?.antecedent, abc?.behavior, abc?.consequence]
          .filter((value) => value?.trim()).length;
        if (abcCount > 0 && abcCount < 3) {
          checks.push({
            id: `${childId}-${section.id}-abc`,
            childId,
            childName,
            level: 'warning',
            title: `${section.title}のABC記録が一部のみ入力されています`,
            detail: 'A（きっかけ）・B（行動）・C（結果）の3要素を確認してください。',
          });
        }
      });

      if (draft.attendance.includes('欠席')) {
        const hasObservation = draft.expressions.length > 0
          || Boolean(draft.snack)
          || (Object.values(draft.sectionAnswers) as SectionAnswer[]).some((section) =>
            Boolean(section.subTitleValue?.trim())
            || (Object.values(section.answers || {}) as SectionFieldAnswer[]).some((answer) => Boolean(answer.value?.trim() || answer.note?.trim()))
            || Boolean(
              section.abcAnalysis?.antecedent?.trim()
              || section.abcAnalysis?.behavior?.trim()
              || section.abcAnalysis?.consequence?.trim()
              || section.abcAnalysis?.summary?.trim()
            )
          );
        if (hasObservation) {
          checks.push({
            id: `${childId}-absence-content`,
            childId,
            childName,
            level: 'warning',
            title: '欠席ですが支援中の内容が入力されています',
            detail: '出欠選択または活動・おやつ等の入力が正しいか確認してください。',
          });
        }
      }
    });
    return checks;
  };

  const moveToStep = (index: number, childId = wizard.activeChildId) => {
    setStepError(null);
    setSaveError(null);
    const targetIndex = Math.max(0, Math.min(index, steps.length - 1));
    const targetStep = steps[targetIndex];
    const targetIsChildStep = targetStep && !['template', 'children', 'date', 'recorder', 'review'].includes(targetStep.kind);
    setWizard((previous) => ({
      ...previous,
      activeChildId: childId || previous.activeChildId,
      currentStepIndex: targetIndex,
      childStepIds: targetIsChildStep && childId
        ? { ...previous.childStepIds, [childId]: targetStep.id }
        : previous.childStepIds,
    }));
    document.getElementById('question-index')?.removeAttribute('open');
    document.getElementById('record-wizard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const switchChild = (childId: string) => {
    const rememberedStepId = wizard.childStepIds[childId];
    const firstUnanswered = unansweredForChild(childId)[0];
    const targetSteps = childStepsForDraft(wizard.childDrafts[childId]);
    const target = targetSteps.find((step) => step.id === rememberedStepId) || firstUnanswered || targetSteps[0];
    moveToStep(target ? steps.findIndex((step) => step.id === target.id) : wizard.currentStepIndex, childId);
  };

  const validateGlobalStep = () => {
    if (currentStep?.kind === 'template' && !activeTemplate) return '記録フォーマットを選択してください。';
    if (currentStep?.kind === 'children' && wizard.selectedChildIds.length === 0) return '対象児童を1名以上選択してください。';
    if (currentStep?.kind === 'date' && !wizard.date) return '記録日付を入力してください。';
    if (currentStep?.kind === 'recorder' && recorderProfiles.length === 0) {
      return '記録者名簿が未登録です。管理者または児発管に登録を依頼してください。';
    }
    if (
      currentStep?.kind === 'recorder' &&
      !wizard.recorderId &&
      !(initialRecord && wizard.recorderName.trim())
    ) {
      return '記録者を選択してください。';
    }
    return null;
  };

  const goNext = () => {
    const error = validateGlobalStep();
    if (error) return setStepError(error);
    const currentChildSteps = childStepsForDraft(activeChildDraft);
    const currentChildStepIndex = currentStep ? currentChildSteps.findIndex((step) => step.id === currentStep.id) : -1;
    if (currentChildStepIndex === currentChildSteps.length - 1 && currentChildStepIndex >= 0 && wizard.selectedChildIds.length > 1) {
      const activeIndex = wizard.selectedChildIds.indexOf(wizard.activeChildId);
      const remainingIds = [...wizard.selectedChildIds.slice(activeIndex + 1), ...wizard.selectedChildIds.slice(0, activeIndex)];
      const nextChildId = remainingIds.find((id) => unansweredForChild(id).length > 0);
      if (nextChildId) {
        const firstUnanswered = unansweredForChild(nextChildId)[0];
        moveToStep(steps.findIndex((step) => step.id === firstUnanswered.id), nextChildId);
        return;
      }
    }
    let targetIndex = wizard.currentStepIndex + 1;
    while (targetIndex < steps.length) {
      const target = steps[targetIndex];
      const targetIsChildStep = !['template', 'children', 'date', 'recorder', 'review'].includes(target.kind);
      if (!targetIsChildStep || stepIsVisible(target, activeChildDraft)) break;
      targetIndex += 1;
    }
    moveToStep(targetIndex);
  };

  const goPrevious = () => {
    let targetIndex = wizard.currentStepIndex - 1;
    while (targetIndex >= 0) {
      const target = steps[targetIndex];
      const targetIsChildStep = !['template', 'children', 'date', 'recorder', 'review'].includes(target.kind);
      if (!targetIsChildStep || stepIsVisible(target, activeChildDraft)) break;
      targetIndex -= 1;
    }
    moveToStep(targetIndex);
  };

  const skipCurrent = () => {
    if (!isChildStep || !wizard.activeChildId || !currentStep) return;
    updateChildDraft(wizard.activeChildId, (draft) => ({
      ...draft,
      skippedQuestionIds: draft.skippedQuestionIds.includes(currentStep.id)
        ? draft.skippedQuestionIds
        : [...draft.skippedQuestionIds, currentStep.id],
    }));
    goNext();
  };

  const summarizeABC = async (sectionId: string) => {
    const section = activeChildDraft?.sectionAnswers[sectionId];
    const abc = section?.abcAnalysis;
    if (!abc || (!abc.behavior.trim() && !abc.consequence.trim() && !abc.antecedent.trim())) {
      setStepError('A・B・Cのいずれかを入力してから要約してください。');
      return;
    }
    setSummarizingSectionId(sectionId);
    setStepError(null);
    const summary = await summarizeABCWithAI(section.sectionTitle, abc.behavior, abc.consequence, abc.antecedent, initialRecord?.id);
    updateABC(sectionId, 'summary', summary);
    setSummarizingSectionId(null);
  };

  const renderField = (field: TemplateField, sectionId: string) => {
    const answer = activeChildDraft?.sectionAnswers[sectionId]?.answers[field.id] || { value: field.defaultValue || '', note: '' };
    const selectedValues = answer.value ? answer.value.split('、').filter(Boolean) : [];
    const ratingField = field.type === 'rating_scale' || field.type === 'fatigue_scale';
    const ratingOptions = field.options?.length
      ? field.options
      : field.type === 'fatigue_scale'
        ? [...FATIGUE_SCALE_OPTIONS]
        : [];
    return (
      <div className="space-y-4">
        {ratingField && <div>
          <div className="grid gap-2">{ratingOptions.map((option) => {
            const [level, label] = option.split('：');
            const selected = answer.value === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => updateField(sectionId, field.id, option)}
                aria-label={option}
                aria-pressed={selected}
                className={`flex min-h-14 items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
                  selected
                    ? 'border-teal-600 bg-teal-600 text-white shadow-sm'
                    : 'border-slate-300 bg-white text-slate-700'
                  }`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-black ${selected ? 'bg-white/20' : 'bg-slate-100 text-slate-900'}`}>{level}</span>
                <span className="text-sm font-bold leading-relaxed sm:text-base">{label || option}</span>
              </button>
            );
          })}</div>
          {(field.scaleLowLabel || field.scaleHighLabel) && <div className="mt-2 flex justify-between gap-3 text-[11px] font-bold text-slate-500"><span>{field.scaleLowLabel}</span><span className="text-right">{field.scaleHighLabel}</span></div>}
        </div>}
        {field.type === 'radio' && !ratingField && field.options && <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{field.options.map((option) => (
          <button key={option} type="button" onClick={() => updateField(sectionId, field.id, option)} className={`${choiceClass} ${answer.value === option ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}>
            {answer.value === option && <Check className="inline w-4 h-4 mr-1" />}{option}
          </button>
        ))}</div>}
        {field.type === 'checkbox' && field.options && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{field.options.map((option) => {
          const selected = selectedValues.includes(option);
          return <button key={option} type="button" onClick={() => updateField(sectionId, field.id, (selected ? selectedValues.filter((item) => item !== option) : [...selectedValues, option]).join('、'))} className={`${choiceClass} text-left ${selected ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}>{selected && <Check className="inline w-4 h-4 mr-1" />}{option}</button>;
        })}</div>}
        {field.type === 'homework_subjects' && (
          <HomeworkSubjectInput
            answer={answer}
            onChange={(nextAnswer) => updateFieldAnswer(sectionId, field.id, nextAnswer)}
          />
        )}
        {field.type === 'study_extras' && (
          <StudyExtrasInput
            answer={answer}
            onChange={(nextAnswer) => updateFieldAnswer(sectionId, field.id, nextAnswer)}
          />
        )}
        {field.type === 'pc_activities' && (
          <PcActivitiesInput
            answer={answer}
            onChange={(nextAnswer) => updateFieldAnswer(sectionId, field.id, nextAnswer)}
          />
        )}
        {field.type === 'number' && <div className="flex items-center gap-3"><input type="number" value={answer.value} onChange={(event) => updateField(sectionId, field.id, event.target.value)} className={inputClass} />{field.unit && <span className="shrink-0 text-sm font-bold text-slate-600">{field.unit}</span>}</div>}
        {field.type === 'hand_count' && (() => {
          const notPracticed = answer.value === 'タイピング練習に取り組んでいない';
          const handCount = parseHandCount(answer.value);
          return <div className="space-y-3">
            <button type="button" onClick={() => updateField(sectionId, field.id, notPracticed ? '' : 'タイピング練習に取り組んでいない')} className={`flex min-h-12 w-full items-center gap-3 rounded-xl border-2 px-4 text-left text-sm font-bold ${notPracticed ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}><span className={`flex h-6 w-6 items-center justify-center rounded-md border ${notPracticed ? 'border-white bg-white/20' : 'border-slate-300'}`}>{notPracticed && <Check className="h-4 w-4" />}</span>タイピング練習に取り組んでいない</button>
            {!notPracticed && <div className="grid grid-cols-2 gap-3">
              <label className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-black text-slate-700">左
                <div className="mt-2 flex items-center gap-2"><input aria-label="左手の指本数" type="number" min="0" max="5" inputMode="numeric" value={handCount.left} onChange={(event) => updateField(sectionId, field.id, formatHandCount(clampHandCount(event.target.value), handCount.right))} className={inputClass} /><span className="font-bold">本</span></div>
              </label>
              <label className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-black text-slate-700">右
                <div className="mt-2 flex items-center gap-2"><input aria-label="右手の指本数" type="number" min="0" max="5" inputMode="numeric" value={handCount.right} onChange={(event) => updateField(sectionId, field.id, formatHandCount(handCount.left, clampHandCount(event.target.value)))} className={inputClass} /><span className="font-bold">本</span></div>
              </label>
            </div>}
          </div>;
        })()}
        {field.type === 'text' && <input type="text" value={answer.value} onChange={(event) => updateField(sectionId, field.id, event.target.value)} className={inputClass} />}
        {field.type === 'textarea' && <textarea rows={5} value={answer.value} onChange={(event) => updateField(sectionId, field.id, event.target.value)} className={inputClass} />}
        {field.type === 'time_select' && <input type="time" value={answer.value} onChange={(event) => updateField(sectionId, field.id, event.target.value)} className={inputClass} />}
        {field.hasNote && !['homework_subjects', 'study_extras', 'pc_activities'].includes(field.type) && <label className="block text-sm font-bold text-slate-700">備考（任意）<textarea rows={3} value={answer.note || ''} onChange={(event) => updateField(sectionId, field.id, answer.value, event.target.value)} placeholder={field.notePlaceholder || '補足事項を入力'} className={`${inputClass} mt-2`} /></label>}
      </div>
    );
  };

  const renderStep = () => {
    if (!currentStep) return null;
    switch (currentStep.kind) {
      case 'template':
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((template) => {
              const selected = wizard.selectedTemplateId === template.id;
              return (
                <button key={template.id} type="button" onClick={() => selectTemplate(template.id)} aria-pressed={selected} className={`min-h-24 rounded-2xl border-2 p-4 text-left transition-all ${selected ? 'border-teal-600 bg-teal-50 shadow-sm' : 'border-slate-200 bg-white hover:border-teal-300'}`}>
                  <span className="flex items-start justify-between gap-3"><span><strong className="block text-base font-black text-slate-900">{template.name}</strong><span className="mt-1 block text-xs font-bold text-teal-700">{template.type}</span></span><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 text-transparent'}`}><Check className="h-4 w-4" /></span></span>
                  {template.description && <span className="mt-2 block text-xs leading-relaxed text-slate-500">{template.description}</span>}
                </button>
              );
            })}
          </div>
        );
      case 'children':
        {
          const targetWeekday = getWeekdayFromDate(wizard.date);
          const regularChildren = childrenList.filter((child) => {
            const regularDays = getRegularDaysForDate(child, wizard.date);
            return !regularDays.length || regularDays.includes(targetWeekday);
          });
          const additionalSelected = childrenList.filter((child) => wizard.selectedChildIds.includes(child.id) && !regularChildren.some((item) => item.id === child.id));
          const displayedChildren = [...regularChildren, ...additionalSelected];
          const searchValue = childSearch.trim().toLocaleLowerCase('ja');
          const pickerChildren = childrenList.filter((child) =>
            !searchValue ||
            child.name.toLocaleLowerCase('ja').includes(searchValue) ||
            child.kana?.toLocaleLowerCase('ja').includes(searchValue)
          );
          return (
          <div className="space-y-4">
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
              <strong>{wizard.date}（{targetWeekday}）の定期利用児童</strong>
              <p className="mt-1 text-xs text-teal-700">曜日未設定の児童も候補に表示しています。</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pr-1">
              {displayedChildren.map((child) => {
                const selected = wizard.selectedChildIds.includes(child.id);
                const isAdditional = additionalSelected.some((item) => item.id === child.id);
                return <button key={child.id} type="button" disabled={Boolean(initialRecord)} onClick={() => toggleChild(child.id)} className={`${choiceClass} flex items-center justify-between text-left ${selected ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-700'} disabled:opacity-80`}><span>{child.name}<span className="block text-[11px] font-normal opacity-75">{calculateSchoolGrade(child.birthDate) || child.grade || '学年未設定'}・{isAdditional ? '追加利用' : formatRegularDays(getRegularDaysForDate(child, wizard.date))}</span></span>{selected && <Check className="w-5 h-5" />}</button>;
              })}
            </div>
            {displayedChildren.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">この曜日の定期利用児童は登録されていません。</p>}
            {!initialRecord && <button type="button" onClick={() => { setChildSearch(''); setShowChildPicker(true); }} className="min-h-12 w-full px-4 rounded-xl border border-dashed border-teal-500 bg-white text-teal-700 text-sm font-bold flex items-center justify-center gap-2"><UserPlus className="w-5 h-5" />児童を追加</button>}

            {showChildPicker && (
              <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-950/60 p-0 sm:p-4">
                <div className="max-h-[88vh] w-full max-w-lg overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl">
                  <div className="flex items-center justify-between border-b border-slate-200 p-4">
                    <div><h3 className="font-bold text-slate-900">児童を追加</h3><p className="text-xs text-slate-500">追加利用の児童を一覧または名前検索から選択</p></div>
                    <button type="button" onClick={() => setShowChildPicker(false)} aria-label="閉じる" className="min-h-10 min-w-10 rounded-lg text-slate-500 hover:bg-slate-100 flex items-center justify-center"><X className="w-5 h-5" /></button>
                  </div>
                  <div className="p-4">
                    <label className="relative block">
                      <Search className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                      <input autoFocus value={childSearch} onChange={(event) => setChildSearch(event.target.value)} placeholder="児童名・フリガナで検索" className={`${inputClass} pl-10`} />
                    </label>
                    <div className="mt-3 max-h-[55vh] space-y-2 overflow-y-auto">
                      {pickerChildren.map((child) => {
                        const selected = wizard.selectedChildIds.includes(child.id);
                        return <button key={child.id} type="button" onClick={() => toggleChild(child.id)} className={`w-full min-h-14 rounded-xl border p-3 text-left flex items-center gap-3 ${selected ? 'border-teal-500 bg-teal-50 text-teal-900' : 'border-slate-200 bg-white text-slate-700'}`}><span className={`h-6 w-6 shrink-0 rounded-md border flex items-center justify-center ${selected ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300'}`}>{selected && <Check className="w-4 h-4" />}</span><span><strong className="block text-sm">{child.name}</strong><span className="text-[11px] text-slate-500">{calculateSchoolGrade(child.birthDate) || child.grade || '学年未設定'}・{wizard.date}時点の定期利用 {formatRegularDays(getRegularDaysForDate(child, wizard.date))}</span></span></button>;
                      })}
                      {pickerChildren.length === 0 && <p className="py-8 text-center text-sm text-slate-400">一致する児童がいません。</p>}
                    </div>
                    <button type="button" onClick={() => setShowChildPicker(false)} className="mt-4 min-h-12 w-full rounded-xl bg-teal-600 text-sm font-bold text-white">選択を完了</button>
                  </div>
                </div>
              </div>
            )}
          </div>
          );
        }
      case 'date': return <input type="date" value={wizard.date} onChange={(event) => updateWizard({ date: event.target.value })} className={inputClass} />;
      case 'recorder': {
        const selectedIsLegacy =
          Boolean(initialRecord?.recorderName) &&
          !recorderProfiles.some((profile) => profile.id === wizard.recorderId);
        if (activeRecorder) {
          return (
            <div className="rounded-2xl border-2 border-teal-300 bg-teal-50 p-5">
              <p className="text-xs font-bold text-teal-700">本人確認済みの指導員</p>
              <p className="mt-1 text-xl font-black text-teal-950">{activeRecorder.displayName}</p>
              <p className="mt-2 text-xs leading-relaxed text-teal-800">
                記録者の取り違え防止のため、現在の指導員として固定されています。変更する場合は画面上部の「指導員を切替」を押してください。
              </p>
            </div>
          );
        }
        return (
          <div className="space-y-3">
            <select
              value={wizard.recorderId}
              onChange={(event) => {
                const selected = recorderProfiles.find((profile) => profile.id === event.target.value);
                updateWizard({
                  recorderId: selected?.id || '',
                  recorderName: selected?.displayName || '',
                });
              }}
              disabled={recorderProfiles.length === 0}
              className={`${inputClass} disabled:bg-slate-100 disabled:text-slate-500`}
            >
              <option value="">
                {selectedIsLegacy ? `過去の記録者：${wizard.recorderName}` : '記録者を選択してください'}
              </option>
              {recorderProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.displayName}</option>
              ))}
            </select>
            {recorderProfiles.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                記録者名簿がまだ登録されていません。「職員」画面から管理者または児発管が登録してください。
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                共有アカウントでログインしている場合も、実際に記録を入力する指導員を選択してください。
              </p>
            )}
          </div>
        );
      }
      case 'attendance':
        return <div className="space-y-4"><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{(wizardQuestions.attendance.options || []).map((item) => <button key={item} type="button" onClick={() => updateChildDraft(wizard.activeChildId, (draft) => ({ ...unskip(draft, currentStep.id), attendance: item }))} className={`${choiceClass} ${activeChildDraft?.attendance === item ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}>{activeChildDraft?.attendance === item && <Check className="inline w-4 h-4 mr-1" />}{item}</button>)}</div><label className="block text-sm font-bold text-slate-700">{wizardQuestions.attendance.noteLabel}<textarea rows={3} value={activeChildDraft?.attendanceNote || ''} onChange={(event) => updateChildDraft(wizard.activeChildId, (draft) => ({ ...unskip(draft, currentStep.id), attendanceNote: event.target.value }))} placeholder={wizardQuestions.attendance.notePlaceholder} className={`${inputClass} mt-2`} /></label></div>;
      case 'expression':
        return <div className="space-y-4"><div className={isStructuredWeekdayTemplate(activeTemplate) ? 'grid gap-2' : 'grid grid-cols-2 gap-2 sm:grid-cols-3'}>{(wizardQuestions.expression.options || []).map((item) => {
          const selected = activeChildDraft?.expressions.includes(item);
          if (isStructuredWeekdayTemplate(activeTemplate)) {
            const [level, description] = item.split('：');
            return <button key={item} type="button" onClick={() => updateChildDraft(wizard.activeChildId, (raw) => ({ ...unskip(raw, currentStep.id), expressions: [item] }))} className={`flex min-h-14 items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left ${selected ? 'border-amber-500 bg-amber-50 text-amber-950' : 'border-slate-300 bg-white text-slate-700'}`}><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-black ${selected ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-900'}`}>{level}</span><span className="text-sm font-bold leading-relaxed sm:text-base">{description}</span>{selected && <Check className="ml-auto h-5 w-5 shrink-0" />}</button>;
          }
          return <button key={item} type="button" onClick={() => updateChildDraft(wizard.activeChildId, (raw) => { const draft = unskip(raw, currentStep.id); return { ...draft, expressions: selected ? draft.expressions.filter((value) => value !== item) : [...draft.expressions, item] }; })} className={`${choiceClass} ${selected ? 'bg-amber-500 border-amber-500 text-slate-950' : 'bg-white border-slate-300 text-slate-700'}`}>{selected && <Check className="inline w-4 h-4 mr-1" />}{item}</button>;
        })}</div>{isStructuredWeekdayTemplate(activeTemplate) && <div className="flex justify-between text-[11px] font-bold text-slate-500"><span>1：笑顔</span><span>5：暗い表情</span></div>}<label className="block text-sm font-bold text-slate-700">{wizardQuestions.expression.noteLabel}<textarea rows={3} value={activeChildDraft?.expressionNote || ''} onChange={(event) => updateChildDraft(wizard.activeChildId, (draft) => ({ ...unskip(draft, currentStep.id), expressionNote: event.target.value }))} placeholder={wizardQuestions.expression.notePlaceholder} className={`${inputClass} mt-2`} /></label></div>;
      case 'snack':
        return <div className="space-y-4"><div className="grid grid-cols-2 gap-2">{(wizardQuestions.snack.options || []).map((item) => <button key={item} type="button" onClick={() => updateChildDraft(wizard.activeChildId, (draft) => ({ ...unskip(draft, currentStep.id), snack: item }))} className={`${choiceClass} ${activeChildDraft?.snack === item ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}>{activeChildDraft?.snack === item && <Check className="inline w-4 h-4 mr-1" />}{item}</button>)}</div><label className="block text-sm font-bold text-slate-700">{wizardQuestions.snack.noteLabel}<textarea rows={3} value={activeChildDraft?.snackNote || ''} onChange={(event) => updateChildDraft(wizard.activeChildId, (draft) => ({ ...unskip(draft, currentStep.id), snackNote: event.target.value }))} placeholder={wizardQuestions.snack.notePlaceholder} className={`${inputClass} mt-2`} /></label></div>;
      case 'section-subtitle': {
        const section = activeChildDraft?.sectionAnswers[currentStep.sectionId || ''];
        return <input value={section?.subTitleValue || ''} onChange={(event) => updateSection(currentStep.sectionId!, { subTitleValue: event.target.value })} className={inputClass} />;
      }
      case 'field': {
        const field = fieldForStep(currentStep);
        return field && currentStep.sectionId ? renderField(field, currentStep.sectionId) : null;
      }
      case 'abc-behavior':
      case 'abc-consequence':
      case 'abc-antecedent': {
        const section = activeChildDraft?.sectionAnswers[currentStep.sectionId || ''];
        const key = currentStep.kind === 'abc-behavior' ? 'behavior' : currentStep.kind === 'abc-consequence' ? 'consequence' : 'antecedent';
        const placeholders = { behavior: '・席を立ち、入口へ向かった\n・大きな声で「やりたくない」と話した', consequence: '・職員が選択肢を示すと席へ戻った\n・5分後に課題を再開した', antecedent: '・難しい課題へ切り替わった直後\n・周囲の音が大きくなった' };
        return <div><textarea rows={7} maxLength={500} value={section?.abcAnalysis?.[key] || ''} onChange={(event) => updateABC(currentStep.sectionId!, key, event.target.value)} placeholder={placeholders[key]} className={inputClass} /><p className="mt-2 text-right text-[11px] text-slate-400">{section?.abcAnalysis?.[key]?.length || 0} / 500文字</p></div>;
      }
      case 'abc-summary': {
        const section = activeChildDraft?.sectionAnswers[currentStep.sectionId || ''];
        const abc = section?.abcAnalysis;
        return <div className="space-y-4"><div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs space-y-2"><p><strong>A：</strong>{abc?.antecedent || '未入力'}</p><p><strong>B：</strong>{abc?.behavior || '未入力'}</p><p><strong>C：</strong>{abc?.consequence || '未入力'}</p></div><button type="button" disabled={summarizingSectionId === currentStep.sectionId} onClick={() => summarizeABC(currentStep.sectionId!)} className="w-full min-h-12 rounded-xl bg-violet-600 disabled:bg-slate-400 text-white font-bold text-sm flex items-center justify-center gap-2">{summarizingSectionId === currentStep.sectionId ? <LoaderCircle className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}ABC分析を要約する</button><label className="block text-sm font-bold text-slate-700">要約文（修正できます）<textarea rows={7} value={abc?.summary || ''} onChange={(event) => updateABC(currentStep.sectionId!, 'summary', event.target.value)} className={`${inputClass} mt-2`} /></label></div>;
      }
      case 'abc-sequence': {
        const section = activeChildDraft?.sectionAnswers[currentStep.sectionId || ''];
        const abc = section?.abcAnalysis;
        const behaviorReady = Boolean(abc?.behavior.trim());
        const consequenceReady = Boolean(abc?.consequence.trim());
        const antecedentReady = Boolean(abc?.antecedent.trim());
        const behaviorQuestion = renderQuestionText(wizardQuestions.abcBehavior);
        const consequenceQuestion = renderQuestionText(wizardQuestions.abcConsequence);
        const antecedentQuestion = renderQuestionText(wizardQuestions.abcAntecedent);
        const summaryQuestion = renderQuestionText(wizardQuestions.abcSummary);
        return (
          <div className="space-y-5">
            <label className="block text-sm font-black text-slate-800">
              <span className="mb-1 block text-violet-700">B（行動）</span>
              {behaviorQuestion.title}
              <span className="mt-1 block text-xs font-medium leading-relaxed text-slate-500">{behaviorQuestion.help}</span>
              <textarea rows={5} maxLength={500} value={abc?.behavior || ''} onChange={(event) => updateABC(currentStep.sectionId!, 'behavior', event.target.value)} placeholder={'・席を立ち、入口へ向かった\n・「やりたくない」と大きな声で話した'} className={`${inputClass} mt-2`} />
            </label>
            {behaviorReady && (
              <label className="block border-t border-slate-200 pt-5 text-sm font-black text-slate-800">
                <span className="mb-1 block text-violet-700">C（結果）</span>
                {consequenceQuestion.title}
                <span className="mt-1 block text-xs font-medium leading-relaxed text-slate-500">{consequenceQuestion.help}</span>
                <textarea rows={5} maxLength={500} value={abc?.consequence || ''} onChange={(event) => updateABC(currentStep.sectionId!, 'consequence', event.target.value)} placeholder={'・職員が選択肢を示すと席へ戻った\n・5分後に課題を再開した'} className={`${inputClass} mt-2`} />
              </label>
            )}
            {behaviorReady && consequenceReady && (
              <label className="block border-t border-slate-200 pt-5 text-sm font-black text-slate-800">
                <span className="mb-1 block text-violet-700">A（きっかけ）</span>
                {antecedentQuestion.title}
                <span className="mt-1 block text-xs font-medium leading-relaxed text-slate-500">{antecedentQuestion.help}</span>
                <textarea rows={5} maxLength={500} value={abc?.antecedent || ''} onChange={(event) => updateABC(currentStep.sectionId!, 'antecedent', event.target.value)} placeholder={'・難しい課題へ切り替わった直後\n・周囲の音が大きくなった'} className={`${inputClass} mt-2`} />
              </label>
            )}
            {behaviorReady && consequenceReady && antecedentReady && (
              <div className="space-y-4 border-t border-slate-200 pt-5">
                <button type="button" disabled={summarizingSectionId === currentStep.sectionId} onClick={() => summarizeABC(currentStep.sectionId!)} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-black text-white disabled:bg-slate-400">{summarizingSectionId === currentStep.sectionId ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}{summarizingSectionId === currentStep.sectionId ? '要約中...' : 'ABC行動分析に基づいて要約する'}</button>
                <label className="block text-sm font-black text-slate-800">{summaryQuestion.title}<span className="mt-1 block text-xs font-medium leading-relaxed text-slate-500">{summaryQuestion.help}</span><textarea rows={7} value={abc?.summary || ''} onChange={(event) => updateABC(currentStep.sectionId!, 'summary', event.target.value)} placeholder="「要約する」を押すと、ここに文章が表示されます。" className={`${inputClass} mt-2`} /></label>
              </div>
            )}
          </div>
        );
      }
      case 'review':
        return (
          <ReviewAllChildren
            wizard={wizard}
            childrenList={childrenList}
            template={activeTemplate}
            getStepsForChild={(childId) => childStepsForDraft(wizard.childDrafts[childId])}
            answerStatus={answerStatus}
            checks={getPreSaveChecks()}
            checksAcknowledged={checksAcknowledged}
            onChecksAcknowledged={setChecksAcknowledged}
            onJump={(childId, stepId) => moveToStep(steps.findIndex((step) => step.id === stepId), childId)}
          />
        );
      default: return null;
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaveError(null);
    if (
      !activeTemplate ||
      wizard.selectedChildIds.length === 0 ||
      !wizard.date ||
      !wizard.recorderName.trim()
    ) {
      setSaveError('テンプレート、児童、日付、記録者を確認してください。');
      return;
    }
    const checks = getPreSaveChecks();
    const errors = checks.filter((check) => check.level === 'error');
    const notices = checks.filter((check) => check.level !== 'error');
    if (errors.length > 0) {
      setSaveError(`保存できない項目が${errors.length}件あります。赤色の点検結果を修正してください。`);
      return;
    }
    if (notices.length > 0 && !checksAcknowledged) {
      setSaveError('注意事項を確認し、「点検結果を確認しました」にチェックしてください。');
      return;
    }

    const now = new Date().toISOString();
    const records = wizard.selectedChildIds.map((childId) => {
      const child = childrenList.find((item) => item.id === childId);
      const childDraft = wizard.childDrafts[childId] || createChildDraft(activeTemplate);
      const previous = initialRecord?.childId === childId ? initialRecord : undefined;
      const record = {
        id: childDraft.recordId,
        templateId: activeTemplate.id,
        templateName: activeTemplate.name,
        templateType: activeTemplate.type,
        templateSectionsSnapshot: activeTemplate.sections,
        childId,
        childName: child?.name || previous?.childName || '名称未記入',
        date: wizard.date,
        attendance: childDraft.attendance,
        attendanceNote: childDraft.attendanceNote || undefined,
        expressions: childDraft.expressions,
        expressionNote: childDraft.expressionNote || undefined,
        snack: childDraft.snack,
        snackNote: childDraft.snackNote || undefined,
        recorderId: wizard.recorderId || undefined,
        recorderName: wizard.recorderName.trim(),
        serviceStartTime: previous?.serviceStartTime,
        serviceEndTime: previous?.serviceEndTime,
        transportation: previous?.transportation,
        supportPlanId: previous?.supportPlanId,
        fiveDomains: previous?.fiveDomains,
        goalProgress: previous?.goalProgress,
        sectionAnswers: childDraft.sectionAnswers,
        skippedQuestionIds: childDraft.skippedQuestionIds,
        approvalStatus: previous?.approvalStatus === '要修正' ? '未確認' : previous?.approvalStatus || '未確認',
        jihatsukanComment: previous?.jihatsukanComment,
        reviewIssues: previous?.reviewIssues?.map((issue) => ({ ...issue, resolved: true })),
        reviewedBy: previous?.reviewedBy,
        reviewedAt: previous?.reviewedAt,
        createdAt: previous?.createdAt || now,
        updatedAt: now,
      } satisfies SupportRecord;
      return isStructuredWeekdayTemplate(activeTemplate)
        ? { ...record, synthesizedSummary: generateStructuredWeekdaySummary(record) }
        : record;
    });

    setIsSaving(true);
    try {
      await onSaveRecords(records);
      draftCleared.current = true;
      remoteRevision.current = null;
      localStorage.removeItem(storageKey);
      if (organizationId) await deleteRecordDraft(organizationId, draftKey);
      onDraftChanged?.();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存できませんでした。');
      draftCleared.current = false;
    } finally {
      setIsSaving(false);
    }
  };

  const clearCurrentDraft = async () => {
    const actionLabel = initialRecord ? '編集中の変更' : '入力中の記録';
    const confirmed = window.confirm(
      `${actionLabel}をすべて削除しますか？保存済みの支援記録は削除されません。`
    );
    if (!confirmed) return;

    skipNextDraftSave.current = true;
    remoteRevision.current = null;
    localStorage.removeItem(storageKey);
    setWizard(createBaseDraft());
    setStepError(null);
    setSaveError(null);
    setDraftStatus('deleted');
    document.getElementById('record-wizard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (organizationId) {
      try {
        await deleteRecordDraft(organizationId, draftKey);
        onDraftChanged?.();
      } catch {
        setDraftStatus('error');
      }
    }
  };

  const resolveDraftConflict = async (preferLocal: boolean) => {
    if (!organizationId || !userId) return;
    try {
      const remote = await loadRecordDraft(organizationId, draftKey);
      if (!remote) {
        remoteRevision.current = null;
        setDraftStatus(null);
        return;
      }
      if (preferLocal) {
        if (!window.confirm('別端末の更新内容を、この端末の入力内容で置き換えますか？')) return;
        remoteRevision.current = remote.revision;
        const payload: WizardDraft = {
          ...wizard,
          version: 8,
          draftCycleKey: getCurrentDraftCycleKey(),
          updatedAt: new Date().toISOString(),
        };
        const saved = await saveRecordDraft(organizationId, userId, draftKey, payload, {
          deviceId,
          expectedRevision: remote.revision,
          recorderId: wizard.recorderId || null,
        });
        remoteRevision.current = saved.revision;
        localStorage.setItem(storageKey, JSON.stringify(payload));
        setDraftStatus('saved');
      } else {
        if (!window.confirm('この端末の未保存変更を破棄して、別端末の最新内容を読み込みますか？')) return;
        const restored = normalizeWizardDraft(remote.payload);
        if (!restored) throw new Error('別端末の下書きは期限切れ、または読み込めない形式です。');
        remoteRevision.current = remote.revision;
        skipNextDraftSave.current = true;
        setWizard({ ...restored, updatedAt: remote.updatedAt });
        localStorage.setItem(storageKey, JSON.stringify({ ...restored, updatedAt: remote.updatedAt }));
        setDraftStatus('restored');
      }
      onDraftChanged?.();
    } catch {
      setDraftStatus('error');
    }
  };

  const currentStatus = isChildStep && currentStep ? answerStatus(currentStep, activeChildDraft) : 'answered';
  const currentFieldWarning = currentStep?.kind === 'field' ? fieldForStep(currentStep)?.warningText : undefined;
  const draftStatusLabel = draftStatus === 'saving'
    ? '下書き保存中'
    : draftStatus === 'restored'
      ? '下書きを復元しました'
      : draftStatus === 'deleted'
        ? '入力中の記録を削除しました'
        : draftStatus === 'reset'
          ? '午前3時に下書きをリセットしました'
          : draftStatus === 'conflict'
            ? '別端末の更新を検出しました'
          : draftStatus === 'error'
            ? '下書きの共有保存に失敗'
            : '下書き自動保存';

  return (
    <form id="record-wizard" onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-4 scroll-mt-20">
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-bold text-slate-700">
            {currentStep?.kind === 'review'
              ? '最終確認'
              : currentStep?.displayNumber
                ? `質問 ${currentStep.displayNumber} / 21`
                : `入力設定 ${wizard.currentStepIndex + 1} / ${steps.length}`}
          </span>
          <span
            aria-live="polite"
            className={`flex items-center gap-1 ${
              draftStatus === 'error' || draftStatus === 'conflict'
                ? 'text-rose-600'
                : draftStatus === 'deleted' || draftStatus === 'reset'
                  ? 'font-bold text-amber-700'
                  : 'text-slate-500'
            }`}
          >
            <Cloud className="h-4 w-4" />{draftStatusLabel}
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-teal-500 transition-all" style={{ width: `${progress}%` }} /></div>
        <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-slate-600">
            入力内容は自動保存され、毎日午前3時にリセットされます。
          </p>
          <button
            type="button"
            onClick={() => void clearCurrentDraft()}
            className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-rose-300 bg-white px-4 text-sm font-bold text-rose-700 hover:bg-rose-50"
          >
            <Trash2 className="h-4 w-4" />
            入力中の記録を削除
          </button>
        </div>
        {draftStatus === 'conflict' && (
          <div className="mt-3 rounded-xl border-2 border-rose-300 bg-rose-50 p-4">
            <p className="text-sm font-black text-rose-900">同じ下書きが別端末で更新されています</p>
            <p className="mt-1 text-xs leading-relaxed text-rose-800">
              自動上書きを停止しました。残したい内容を選択してください。
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void resolveDraftConflict(false)}
                className="min-h-12 rounded-xl border border-rose-300 bg-white px-4 text-sm font-bold text-rose-800"
              >
                別端末の最新内容を読み込む
              </button>
              <button
                type="button"
                onClick={() => void resolveDraftConflict(true)}
                className="min-h-12 rounded-xl bg-rose-700 px-4 text-sm font-bold text-white"
              >
                この端末の内容を残す
              </button>
            </div>
          </div>
        )}
      </div>

      {wizard.selectedChildIds.length > 0 && wizard.currentStepIndex >= 2 && (
        <div className="sticky top-16 z-20 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {wizard.selectedChildIds.map((childId) => {
              const child = childrenList.find((item) => item.id === childId);
              const unanswered = unansweredForChild(childId).length;
              return <button key={childId} type="button" onClick={() => switchChild(childId)} className={`shrink-0 min-h-11 rounded-lg border px-3 text-xs font-bold ${wizard.activeChildId === childId ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}>{child?.name || '児童'}<span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${unanswered === 0 ? 'bg-emerald-100 text-emerald-800' : wizard.activeChildId === childId ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'}`}>{unanswered === 0 ? '完了' : `未${unanswered}`}</span></button>;
            })}
          </div>
        </div>
      )}

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 sm:p-7 border-b border-slate-100">
          {isChildStep && <p className="text-xs font-bold text-teal-700 mb-2 flex items-center gap-1"><Users className="w-4 h-4" />{activeChild?.name || '児童を選択してください'}の記録</p>}
          <div className="flex items-start gap-3"><div className={`mt-1 h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${currentStatus === 'answered' ? 'bg-emerald-100 text-emerald-700' : currentStatus === 'skipped' ? 'bg-slate-200 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>{currentStatus === 'answered' ? <Check className="w-4 h-4" /> : currentStatus === 'skipped' ? <SkipForward className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}</div><div><h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-relaxed">{currentStep?.title}</h2>{currentFieldWarning && <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-black leading-relaxed text-rose-700">{currentFieldWarning}</p>}{currentStep?.help && <p className="mt-2 text-sm leading-relaxed text-slate-500">{currentStep.help}</p>}</div></div>
        </div>
        <div className="p-5 sm:p-7">{renderStep()}{stepError && <div className="mt-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="w-5 h-5 shrink-0" />{stepError}</div>}</div>
      </section>

      {wizard.selectedChildIds.length > 0 && (
        <details id="question-index" className="rounded-xl border border-slate-200 bg-white p-4 text-xs">
          <summary className="cursor-pointer font-bold text-slate-700 flex items-center gap-2"><ListChecks className="w-4 h-4 text-teal-600" />質問一覧・未回答を確認</summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {perChildSteps.map((step) => {
              const status = answerStatus(step, activeChildDraft);
              return <button key={step.id} type="button" onClick={() => moveToStep(steps.findIndex((item) => item.id === step.id))} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-left"><span className={`h-2.5 w-2.5 rounded-full ${status === 'answered' ? 'bg-emerald-500' : status === 'skipped' ? 'bg-slate-400' : 'bg-amber-500'}`} /><span className="truncate">{step.title}</span><span className="ml-auto shrink-0 text-[10px] text-slate-500">{status === 'answered' ? '回答済' : status === 'skipped' ? 'スキップ' : '未回答'}</span></button>;
            })}
          </div>
        </details>
      )}

      {saveError && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{saveError}</div>}

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <button type="button" onClick={goPrevious} disabled={wizard.currentStepIndex === 0} className="min-h-12 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 disabled:opacity-40 flex items-center justify-center gap-2"><ChevronLeft className="w-4 h-4" />前の質問</button>
        <div className="flex flex-col sm:flex-row gap-2">
          {isChildStep && <button type="button" onClick={(event) => { event.preventDefault(); skipCurrent(); }} className="min-h-12 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-600 flex items-center justify-center gap-2"><SkipForward className="w-4 h-4" />この質問をスキップ</button>}
          {currentStep?.kind === 'review' ? <button type="submit" disabled={isSaving} className="min-h-12 rounded-xl bg-emerald-600 disabled:bg-slate-400 px-6 text-sm font-bold text-white flex items-center justify-center gap-2"><Save className="w-4 h-4" />{isSaving ? '保存中...' : `${wizard.selectedChildIds.length}名分を保存`}</button> : <button type="button" onClick={(event) => { event.preventDefault(); goNext(); }} className="min-h-12 rounded-xl bg-teal-600 px-6 text-sm font-bold text-white flex items-center justify-center gap-2">次の質問<ChevronRight className="w-4 h-4" /></button>}
        </div>
      </div>

      <QuickMemoPad
        organizationId={organizationId}
        userId={userId}
        recorderId={activeRecorder?.id}
        onCreateHandover={onCreateHandover}
      />

    </form>
  );
};

function ReviewAllChildren({
  wizard,
  childrenList,
  template,
  getStepsForChild,
  answerStatus,
  checks,
  checksAcknowledged,
  onChecksAcknowledged,
  onJump,
}: {
  wizard: WizardDraft;
  childrenList: ChildProfile[];
  template?: Template;
  getStepsForChild: (childId: string) => WizardStep[];
  answerStatus: (step: WizardStep, draft?: ChildDraft) => AnswerStatus;
  checks: PreSaveCheck[];
  checksAcknowledged: boolean;
  onChecksAcknowledged: (checked: boolean) => void;
  onJump: (childId: string, stepId: string) => void;
}) {
  const errors = checks.filter((check) => check.level === 'error');
  const notices = checks.filter((check) => check.level !== 'error');
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm"><p><strong>日付：</strong>{wizard.date}</p><p><strong>記録者：</strong>{wizard.recorderName}</p><p><strong>テンプレート：</strong>{template?.name}</p></div>
      <section className={`rounded-xl border-2 p-4 ${
        errors.length > 0
          ? 'border-rose-300 bg-rose-50'
          : notices.length > 0
            ? 'border-amber-300 bg-amber-50'
            : 'border-emerald-300 bg-emerald-50'
      }`}>
        <h3 className="flex items-center gap-2 text-sm font-black text-slate-900">
          <ListChecks className="h-5 w-5" />保存前の自動点検
        </h3>
        {checks.length === 0 ? (
          <p className="mt-2 text-sm font-bold text-emerald-800">入力内容に問題は見つかりませんでした。</p>
        ) : (
          <>
            <div className="mt-3 space-y-2">
              {checks.map((check) => (
                <div key={check.id} className={`rounded-lg border bg-white p-3 ${
                  check.level === 'error'
                    ? 'border-rose-200'
                    : check.level === 'warning'
                      ? 'border-amber-200'
                      : 'border-slate-200'
                }`}>
                  <p className={`text-xs font-black ${
                    check.level === 'error'
                      ? 'text-rose-800'
                      : check.level === 'warning'
                        ? 'text-amber-900'
                        : 'text-slate-700'
                  }`}>
                    {check.level === 'error' ? '修正必須' : check.level === 'warning' ? '要確認' : '確認'}・{check.childName}
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{check.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{check.detail}</p>
                </div>
              ))}
            </div>
            {errors.length === 0 && notices.length > 0 && (
              <label className="mt-3 flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-amber-300 bg-white px-4 text-sm font-black text-amber-950">
                <input
                  type="checkbox"
                  checked={checksAcknowledged}
                  onChange={(event) => onChecksAcknowledged(event.target.checked)}
                  className="h-5 w-5 rounded border-slate-300 text-teal-600"
                />
                点検結果を確認しました
              </label>
            )}
          </>
        )}
      </section>
      {wizard.selectedChildIds.map((childId) => {
        const child = childrenList.find((item) => item.id === childId);
        const draft = wizard.childDrafts[childId];
        const childSteps = getStepsForChild(childId);
        const unanswered = childSteps.filter((step) => answerStatus(step, draft) === 'unanswered');
        const skipped = childSteps.filter((step) => answerStatus(step, draft) === 'skipped');
        return (
          <article key={childId} className="rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-900">{child?.name || '児童'}</h3><div className="flex gap-2 text-[10px] font-bold"><span className={`rounded-full px-2 py-1 ${unanswered.length ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{unanswered.length ? `未回答 ${unanswered.length}` : '全回答済み'}</span>{skipped.length > 0 && <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">スキップ {skipped.length}</span>}</div></div>
            <p className="text-xs text-slate-600">出欠：{draft?.attendance || '未回答'}{draft?.attendanceNote ? `（${draft.attendanceNote}）` : ''} ／ 表情：{draft?.expressions.join('、') || '未回答'} ／ おやつ：{draft?.snack || '未回答'}</p>
            {unanswered.length > 0 && <div className="rounded-lg bg-amber-50 p-3"><p className="text-xs font-bold text-amber-900 mb-2">未回答の質問</p><div className="flex flex-wrap gap-2">{unanswered.map((step) => <button key={step.id} type="button" onClick={() => onJump(childId, step.id)} className="rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] text-amber-900">{step.title}</button>)}</div></div>}
            {template && isStructuredWeekdayTemplate(template) ? (
              <div className="overflow-hidden rounded-xl border border-slate-300">
                <div className="border-b border-slate-200 bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">文章合成プレビュー</div>
                <pre className="whitespace-pre-wrap bg-white p-4 font-sans text-xs leading-relaxed text-slate-800">{generateStructuredWeekdaySummary({
                  recorderName: wizard.recorderName,
                  expressions: draft?.expressions || [],
                  expressionNote: draft?.expressionNote,
                  snack: draft?.snack || '',
                  snackNote: draft?.snackNote,
                  sectionAnswers: draft?.sectionAnswers || {},
                })}</pre>
              </div>
            ) : <div className="space-y-2">{template?.sections.map((section) => {
              const answer = draft?.sectionAnswers[section.id];
              return <div key={section.id} className="rounded-lg bg-slate-50 p-3 text-xs"><p className="font-bold mb-1">{section.title}</p>{answer?.abcAnalysis?.summary ? <p className="whitespace-pre-wrap leading-relaxed">{answer.abcAnalysis.summary}</p> : <p className="text-slate-400">ABC要約なし</p>}</div>;
            })}</div>}
          </article>
        );
      })}
    </div>
  );
}
