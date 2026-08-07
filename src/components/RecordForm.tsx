import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Award,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Circle,
  Cloud,
  Eye,
  GripVertical,
  Info,
  ListChecks,
  LoaderCircle,
  Monitor,
  MessageSquareText,
  NotebookPen,
  Palette,
  Save,
  Search,
  SkipForward,
  Sparkles,
  Trash2,
  Utensils,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  AttendanceType,
  CalendarEvent,
  ChildProfile,
  DailyChildPlan,
  ExpressionType,
  HandoverItem,
  RecordDraftSummary,
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
import { ChildInfoDialog } from './ChildInfoDialog';
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
  HOMEWORK_OTHER_MODES,
  HOMEWORK_SUBJECTS,
  normalizeHomeworkDetails,
} from '../utils/homeworkField';
import { getCurrentDraftCycleKey } from '../utils/draftExpiry';
import { createRecordDraftKey, getDeviceId } from '../utils/deviceId';
import {
  isStructuredWeekdayTemplate,
  POSTURE_BACK_OPTIONS,
  POSTURE_CATEGORIES,
  POSTURE_LEG_OPTIONS,
  STANDARD_WEEKDAY_TEMPLATE,
} from '../data/weekdayTemplate';
import { generateStructuredWeekdaySummary } from '../utils/weekdayRecordSummary';
import { isIntegratedHolidayTemplate, isStructuredHolidayTemplate, STANDARD_HOLIDAY_TEMPLATE } from '../data/holidayTemplate';
import { UNIFIED_TEMPLATE, UNIFIED_TEMPLATE_ID } from '../data/unifiedTemplate';
import { generateStructuredHolidaySummary } from '../utils/holidayRecordSummary';
import { generateUnifiedRecordSummary } from '../utils/unifiedRecordSummary';

interface RecordFormProps {
  templates: Template[];
  childrenList: ChildProfile[];
  calendarEvents?: CalendarEvent[];
  dailyChildPlans?: DailyChildPlan[];
  recorderProfiles: RecorderProfile[];
  initialRecord?: SupportRecord | null;
  organizationId?: string;
  userId?: string;
  userDisplayName?: string;
  draftKey?: string;
  activeRecorder?: RecorderProfile;
  assistantPrefill?: { childId: string; date: string; requestId: string } | null;
  initialStepId?: string;
  resolvedIssueId?: string;
  readOnly?: boolean;
  readOnlyOwnerName?: string;
  readOnlyInitialChildId?: string;
  readOnlyDrafts?: RecordDraftSummary[];
  onReadOnlyDraftChange?: (draftKey: string, ownerName?: string, childId?: string) => void;
  onBackToRecordStatus?: () => void;
  lockedChildren?: Record<string, string>;
  onSaveRecords: (
    records: SupportRecord[],
    options?: { keepFormOpen?: boolean },
  ) => Promise<void> | void;
  onDraftChanged?: () => void;
  onCreateHandover?: (content: string) => Promise<void> | void;
  handoverItems?: HandoverItem[];
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
  | 'modules'
  | 'review';

type RecordModuleType = 'study' | 'pc' | 'certification' | 'activity' | 'lunch' | 'snack' | 'special' | 'other';

interface RecordModuleDraft {
  id: string;
  type: RecordModuleType;
}

interface WizardStep {
  id: string;
  kind: StepKind;
  title: string;
  help?: string;
  sectionId?: string;
  fieldId?: string;
  displayNumber?: number;
  field?: TemplateField;
  moduleId?: string;
  moduleType?: RecordModuleType;
}

interface ChildDraft {
  recordId: string;
  templateId?: string;
  attendance: AttendanceType | '';
  attendanceNote: string;
  expressions: ExpressionType[];
  expressionNote: string;
  snack: SnackType | '';
  snackNote: string;
  sectionAnswers: Record<string, SectionAnswer>;
  recordModules: RecordModuleDraft[];
  skippedQuestionIds: string[];
}

interface WizardDraft {
  version: 12;
  draftCycleKey: string;
  selectedTemplateId: string;
  childTemplateIds: Record<string, string>;
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
  stepId?: string;
}

interface DraftPreviewEntry {
  id: string;
  label: string;
  value: string;
  status: AnswerStatus;
}

interface DraftPreviewGroup {
  label: string;
  entries: DraftPreviewEntry[];
}

interface DraftPreviewChild {
  id: string;
  name: string;
  groups: DraftPreviewGroup[];
  answered: number;
  skipped: number;
  total: number;
}

interface DraftPreviewNavigationChild {
  childId: string;
  childName: string;
  draftKey: string;
  ownerName?: string;
}

interface TakeoverNotice {
  kind: 'transferred-out' | 'received';
  childNames: string[];
  nextRecorderName?: string;
  allTransferred: boolean;
  syncing: boolean;
  syncFailed: boolean;
}

const MODULE_META_SECTION_ID = '__record_modules';

const RECORD_MODULE_LABELS: Record<RecordModuleType, string> = {
  study: '学習',
  pc: 'パソコン',
  certification: '検定',
  activity: '活動',
  lunch: 'お昼ごはん',
  snack: 'おやつ',
  special: '特記',
  other: 'その他',
};

const SINGLE_RECORD_MODULES = new Set<RecordModuleType>(['lunch', 'snack']);

function isUnifiedTemplate(template?: Template) {
  return template?.id === UNIFIED_TEMPLATE_ID;
}

function moduleSectionId(moduleId: string) {
  return `record-module-${moduleId}`;
}

function cloneModuleField(field: TemplateField, sourcePrefix: string): TemplateField {
  const rewriteCondition = (condition: { fieldId: string; equals: string | string[] }) => ({
    ...condition,
    fieldId: condition.fieldId.replace(`${sourcePrefix}_`, 'module_'),
  });
  const visibleWhen = field.visibleWhen
    ? (Array.isArray(field.visibleWhen) ? field.visibleWhen : [field.visibleWhen])
        .filter((condition) => !condition.fieldId.endsWith('_type'))
        .map(rewriteCondition)
    : undefined;
  const hiddenWhen = field.hiddenWhen
    ? (Array.isArray(field.hiddenWhen) ? field.hiddenWhen : [field.hiddenWhen]).map(rewriteCondition)
    : undefined;
  return {
    ...field,
    id: field.id.replace(`${sourcePrefix}_`, 'module_'),
    visibleWhen: visibleWhen?.length ? visibleWhen : undefined,
    hiddenWhen: hiddenWhen?.length ? hiddenWhen : undefined,
  };
}

function fieldsForRecordModule(type: RecordModuleType): TemplateField[] {
  const weekdayPeriod = STANDARD_WEEKDAY_TEMPLATE.sections.find((section) => section.id === 'period1')?.fields || [];
  if (type === 'study') {
    return weekdayPeriod
      .filter((field) => field.id.includes('_study_'))
      .map((field) => cloneModuleField(field, 'period1'));
  }
  if (type === 'pc') {
    return weekdayPeriod
      .filter((field) => field.id.includes('_pc_'))
      .map((field) => cloneModuleField(field, 'period1'));
  }
  if (type === 'certification') {
    return [{
      id: 'module_period3_type',
      label: '検定内容',
      questionTitle: '検定の取り組み内容はなんですか？',
      type: 'radio',
      options: ['漢検', 'パソコン', 'その他'],
      defaultValue: '',
      helpText: '取り組みを選ぶと、そのすぐ下に詳しい入力欄が表示されます。',
      required: true,
    }];
  }
  if (type === 'activity') {
    const source = STANDARD_HOLIDAY_TEMPLATE.sections.find((section) => section.id === 'morning')?.fields || [];
    return source
      .filter((field) => field.id.includes('_activity_'))
      .map((field) => cloneModuleField(field, 'morning'));
  }
  if (type === 'lunch') {
    return (STANDARD_HOLIDAY_TEMPLATE.sections.find((section) => section.id === 'lunch')?.fields || [])
      .map((field) => ({ ...field, id: 'module_lunch_details', visibleWhen: undefined }));
  }
  if (type === 'other') {
    return [{
      id: 'module_other_note',
      label: 'その他の記録',
      questionTitle: '記録内容を入力してください。',
      type: 'textarea',
      defaultValue: '',
      helpText: '既存の項目に当てはまらない内容を入力してください。',
      required: true,
    }];
  }
  return [];
}

function createRecordModule(type: RecordModuleType): RecordModuleDraft {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { id: `${type}-${random}`, type };
}

function createModuleSection(module: RecordModuleDraft, existing?: SectionAnswer): SectionAnswer {
  const fields = fieldsForRecordModule(module.type);
  const answers = Object.fromEntries(fields.map((field) => [
    field.id,
    existing?.answers?.[field.id] || { value: field.defaultValue || '', note: '' },
  ]));
  return {
    sectionId: moduleSectionId(module.id),
    sectionTitle: RECORD_MODULE_LABELS[module.type],
    answers,
    detailText: existing?.detailText || '',
    abcAnalysis: module.type === 'special'
      ? existing?.abcAnalysis || { inputMode: 'abc', behavior: '', consequence: '', antecedent: '', summary: '', freeText: '' }
      : existing?.abcAnalysis,
  };
}

function readRecordModules(sectionAnswers?: Record<string, SectionAnswer>): RecordModuleDraft[] {
  const metadata = sectionAnswers?.[MODULE_META_SECTION_ID];
  if (!metadata) return [];
  return Object.entries(metadata.answers || {})
    .map(([id, answer]) => ({
      id,
      type: answer.value as RecordModuleType,
      order: Number.parseInt(answer.note || '0', 10) || 0,
    }))
    .filter((module) => module.type in RECORD_MODULE_LABELS)
    .sort((left, right) => left.order - right.order)
    .map(({ id, type }) => ({ id, type }));
}

function withRecordModuleMetadata(
  sectionAnswers: Record<string, SectionAnswer>,
  modules: RecordModuleDraft[],
) {
  return {
    ...sectionAnswers,
    [MODULE_META_SECTION_ID]: {
      sectionId: MODULE_META_SECTION_ID,
      sectionTitle: '記録項目',
      answers: Object.fromEntries(modules.map((module, index) => [module.id, { value: module.type, note: String(index) }])),
    },
  };
}

const SortableChildTab: React.FC<{
  childId: string;
  childName: string;
  index: number;
  unanswered: number;
  active: boolean;
  reordering: boolean;
  onSelect: () => void;
}> = ({ childId, childName, index, unanswered, active, reordering, onSelect }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: childId, disabled: !reordering });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)',
  };

  return (
    <div
      ref={setNodeRef}
      data-child-tab-id={childId}
      style={style}
      className={`relative flex shrink-0 overflow-hidden rounded-lg border will-change-transform ${
        isDragging
          ? 'z-10 border-amber-400 opacity-25 shadow-none'
          : isOver && reordering
            ? 'border-teal-500 shadow-[0_0_0_3px_rgba(20,184,166,0.18)]'
            : active
              ? 'border-teal-600 shadow-sm'
              : 'border-slate-300'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className={`min-h-11 px-3 text-xs font-bold ${
          active ? 'bg-teal-600 text-white' : 'bg-white text-slate-700'
        }`}
      >
        {childName}
        <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${
          unanswered === 0
            ? 'bg-emerald-100 text-emerald-800'
            : active
              ? 'bg-white/20 text-white'
              : 'bg-amber-100 text-amber-800'
        }`}>
          {unanswered === 0 ? '完了' : `未${unanswered}`}
        </span>
      </button>
      {reordering && (
        <div className="flex items-stretch border-l border-slate-200 bg-amber-50">
          <button
            type="button"
            aria-label={`${childName}を長押しして並べ替え。現在${index + 1}番目`}
            title="長押ししてドラッグ"
            {...attributes}
            {...listeners}
            style={{ touchAction: 'pan-y' }}
            className="flex min-h-11 min-w-11 cursor-grab select-none items-center justify-center text-amber-900 transition-colors hover:bg-amber-100 active:cursor-grabbing active:bg-amber-200"
          >
            <GripVertical className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
};

const ChildTabDragPreview: React.FC<{
  childName: string;
  unanswered: number;
}> = ({ childName, unanswered }) => (
  <div className="pointer-events-none flex min-h-12 rotate-[0.8deg] scale-[1.04] items-center overflow-hidden rounded-xl border-2 border-amber-400 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.28)]">
    <span className="px-4 text-sm font-black text-slate-900">{childName}</span>
    <span className={`mr-2 rounded-full px-2 py-1 text-[10px] font-black ${
      unanswered === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
    }`}>
      {unanswered === 0 ? '完了' : `未${unanswered}`}
    </span>
    <span className="grid min-h-12 min-w-12 place-items-center border-l border-amber-200 bg-amber-50 text-amber-900">
      <GripVertical className="h-5 w-5" />
    </span>
  </div>
);

const PersistentNoteDetails: React.FC<{
  hasContent: boolean;
  summary: React.ReactNode;
  children: React.ReactNode;
}> = ({ hasContent, summary, children }) => {
  const [open, setOpen] = useState(hasContent);

  useEffect(() => {
    if (hasContent) setOpen(true);
  }, [hasContent]);

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="rounded-xl border border-slate-200 bg-slate-50 p-3"
    >
      <summary className="cursor-pointer text-sm font-bold text-slate-700">{summary}</summary>
      {children}
    </details>
  );
};

const DraftProgressOverview: React.FC<{
  loading: boolean;
  ownerName?: string;
  date: string;
  templateName?: string;
  recorderName?: string;
  updatedAt?: string;
  children: DraftPreviewChild[];
  initialChildId?: string;
  currentDraftKey: string;
  navigationChildren?: DraftPreviewNavigationChild[];
  onSelectNavigationChild?: (item: DraftPreviewNavigationChild) => void;
  onBack?: () => void;
}> = ({
  loading,
  ownerName,
  date,
  templateName,
  recorderName,
  updatedAt,
  children,
  initialChildId,
  currentDraftKey,
  navigationChildren = [],
  onSelectNavigationChild,
  onBack,
}) => {
  const [activeChildId, setActiveChildId] = useState('');

  useEffect(() => {
    if (initialChildId && children.some((child) => child.id === initialChildId)) {
      if (activeChildId !== initialChildId) setActiveChildId(initialChildId);
      return;
    }
    if (children.some((child) => child.id === activeChildId)) return;
    setActiveChildId(children[0]?.id || '');
  }, [activeChildId, children, initialChildId]);

  if (loading) {
    return (
      <div className="mx-auto flex min-h-72 max-w-5xl items-center justify-center rounded-2xl border border-sky-200 bg-white shadow-sm">
        <LoaderCircle className="h-7 w-7 animate-spin text-sky-600" />
        <span className="ml-3 text-sm font-black text-slate-700">入力状況を読み込んでいます…</span>
      </div>
    );
  }

  const activeChild = children.find((child) => child.id === activeChildId) || children[0];
  const completion = activeChild?.total
    ? Math.round(((activeChild.answered + activeChild.skipped) / activeChild.total) * 100)
    : 0;
  const availableChildren = navigationChildren.length > 0
    ? navigationChildren
    : children.map((child) => ({
        childId: child.id,
        childName: child.name,
        draftKey: currentDraftKey,
        ownerName: recorderName,
      }));

  return (
    <section className="mx-auto w-full max-w-5xl space-y-4" aria-label="入力中の記録プレビュー">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 shadow-sm hover:bg-slate-50"
        >
          <ChevronLeft className="h-4 w-4" />本日の運用状況へ戻る
        </button>
      )}
      <header className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 bg-gradient-to-r from-sky-700 to-teal-700 p-4 text-white sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15"><Eye className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-100">閲覧専用・自動更新</p>
              <h2 className="truncate text-lg font-black">本日の入力状況</h2>
              <p className="mt-0.5 text-xs text-sky-100">{ownerName || recorderName || '別の指導員'}が入力中の内容を一覧表示しています。</p>
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-[10px] font-black"><Cloud className="h-3.5 w-3.5" />5秒ごとに最新化</span>
        </div>
        <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
          <div className="bg-white px-4 py-3"><span className="block text-[10px] font-bold text-slate-400">支援日</span><strong className="text-sm text-slate-900">{date || '未設定'}</strong></div>
          <div className="bg-white px-4 py-3"><span className="block text-[10px] font-bold text-slate-400">フォーマット</span><strong className="text-sm text-slate-900">{templateName || '未設定'}</strong></div>
          <div className="bg-white px-4 py-3"><span className="block text-[10px] font-bold text-slate-400">最終更新</span><strong className="text-sm text-slate-900">{updatedAt ? new Date(updatedAt).toLocaleString('ja-JP') : '確認中'}</strong></div>
        </div>
      </header>

      {children.length === 0 || !activeChild ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-bold text-slate-500">閲覧できる児童の入力内容がありません。</div>
      ) : (
        <>
          <nav className="ui-scrollbar flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="同日の入力中児童">
            {availableChildren.map((item) => {
              const child = children.find((candidate) => candidate.id === item.childId);
              const selected = item.draftKey === currentDraftKey && item.childId === activeChild.id;
              const remaining = child ? Math.max(0, child.total - child.answered - child.skipped) : null;
              return (
                <button
                  key={`${item.draftKey}:${item.childId}`}
                  type="button"
                  onClick={() => {
                    if (item.draftKey === currentDraftKey && child) setActiveChildId(item.childId);
                    else onSelectNavigationChild?.(item);
                  }}
                  aria-pressed={selected}
                  className={`min-h-12 shrink-0 rounded-xl border px-3 text-left transition-colors ${selected ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-200 bg-white text-slate-800'}`}
                >
                  <strong className="block text-sm">{item.childName}</strong>
                  <span className={`block max-w-36 truncate text-[10px] font-bold ${selected ? 'text-teal-50' : remaining ? 'text-amber-700' : 'text-slate-500'}`}>
                    {remaining === null ? `${item.ownerName || '職員'}が入力中` : remaining ? `未回答 ${remaining}件` : '入力完了'}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-[10px] font-black text-teal-700">児童別プレビュー</p><h2 className="text-xl font-black text-slate-950">{activeChild.name}さんの様子</h2></div>
              <div className="text-right"><strong className="text-2xl font-black text-teal-700">{completion}%</strong><p className="text-[10px] font-bold text-slate-500">回答 {activeChild.answered}・スキップ {activeChild.skipped}・全 {activeChild.total}</p></div>
            </div>
            <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${completion}%` }} /></div>

            <div className="space-y-4">
              {activeChild.groups.map((group) => (
                <section key={group.label} className="overflow-hidden rounded-2xl border border-slate-200">
                  <h3 className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-black text-slate-800">{group.label}</h3>
                  <div className="grid gap-px bg-slate-200 sm:grid-cols-2">
                    {group.entries.map((entry) => (
                      <article key={entry.id} className="min-w-0 bg-white p-3">
                        <div className="flex items-center gap-2">
                          <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${entry.status === 'answered' ? 'bg-emerald-100 text-emerald-700' : entry.status === 'skipped' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700'}`}>
                            {entry.status === 'answered' ? <Check className="h-3.5 w-3.5" /> : entry.status === 'skipped' ? <SkipForward className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                          </span>
                          <strong className="min-w-0 text-xs text-slate-600">{entry.label}</strong>
                        </div>
                        <p className={`mt-1.5 whitespace-pre-wrap break-words pl-7 text-sm font-bold leading-relaxed ${entry.status === 'answered' ? 'text-slate-950' : entry.status === 'skipped' ? 'text-slate-500' : 'text-amber-800'}`}>{entry.value}</p>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
};

const inputClass = 'box-border min-w-0 w-full max-w-full min-h-12 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base sm:text-sm text-slate-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-200 outline-none';
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
    const notes = { ...details.notes };
    const subjects = subject !== 'その他' && details.subjects.includes('その他')
      ? details.subjects.filter((value) => value !== 'その他')
      : details.subjects;
    if (subject !== 'その他') {
      delete notes['その他区分'];
      delete notes['その他備考'];
    }
    commit({ ...details, subjects: [...subjects, subject], notes });
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

  const updateOtherMode = (mode: string) => {
    commit({
      subjects: ['その他'],
      materials: {},
      notes: {
        その他区分: mode,
        その他備考: details.notes['その他備考'] || '',
      },
    });
  };

  return (
    <div className="space-y-3">
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
          : subject === 'その他'
            ? [details.notes['その他区分'], details.notes['その他備考']].filter(Boolean).join('・')
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
                    ? summary || (academic ? '教材を選択してください' : subject === 'その他' ? '取り組みなし／宿題なしを選択' : '内容を入力してください')
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
                ) : subject === 'その他' ? (
                  <div className="space-y-3">
                    <div>
                      <p className="mb-2 text-sm font-bold text-slate-700">該当する内容を選択してください</p>
                      <div className="grid grid-cols-2 gap-2">
                        {HOMEWORK_OTHER_MODES.map((mode) => {
                          const modeSelected = details.notes['その他区分'] === mode;
                          return (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => updateOtherMode(mode)}
                              className={`${choiceClass} ${modeSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}
                            >
                              {modeSelected && <Check className="mr-1 inline h-4 w-4" />}{mode}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <label className="block text-base font-bold text-slate-800">
                      備考（任意）
                      <textarea
                        rows={3}
                        value={details.notes['その他備考'] || ''}
                        onChange={(event) => updateNote('その他備考', event.target.value)}
                        placeholder="理由や当日の状況を入力"
                        className={`${inputClass} mt-2`}
                      />
                    </label>
                  </div>
                ) : (
                  <label className="block text-base font-bold text-slate-800">
                    {subject}の内容
                    <textarea
                      rows={3}
                      value={details.notes[subject] || ''}
                      onChange={(event) => updateNote(subject, event.target.value)}
                      placeholder="例：漢字練習、読書、調べ学習"
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

interface MockExamAttempt {
  characterCount: string;
  pastRound: string;
}

function getMockExamAttempts(details: Record<string, string | string[]>): MockExamAttempt[] {
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

function withMockExamAttempts(
  details: Record<string, string | string[]>,
  attempts: MockExamAttempt[],
) {
  const next: Record<string, string | string[]> = {
    ...details,
    mockCharacterCounts: attempts.map((attempt) => attempt.characterCount),
    mockPastRounds: attempts.map((attempt) => attempt.pastRound),
  };
  delete next.mockCharacterCount;
  delete next.mockPastRound;
  return next;
}

function clampHandCount(value: string) {
  if (!value) return '';
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return '';
  return String(Math.min(5, Math.max(0, parsed)));
}

function MealDetailsInput({
  answer,
  options,
  onChange,
}: {
  answer: SectionFieldAnswer;
  options: string[];
  onChange: (answer: SectionFieldAnswer) => void;
}) {
  const details = answer.nestedDetails || {};
  const minutes = String(details.minutes || '');
  const portion = String(details.portion || '');
  const didNotEat = portion === '食べていない';
  const commit = (
    nextMinutes: string,
    nextPortion: string,
    nextNote = answer.note || '',
  ) => {
    const parts = [
      nextMinutes ? `食事時間：${nextMinutes}分` : '',
      nextPortion ? `食事量：${nextPortion}` : '',
    ].filter(Boolean);
    onChange({
      ...answer,
      value: parts.join('／'),
      note: nextNote,
      nestedDetails: { ...details, minutes: nextMinutes, portion: nextPortion },
    });
  };

  return (
    <div className="space-y-4">
      {didNotEat ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
          「食べていない」のため、食事時間の入力は不要です。
        </p>
      ) : (
        <label className="block rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-black text-slate-700">
          食事にかかった時間
          <div className="mt-2 flex items-center gap-3">
            <input
              aria-label="昼食にかかった時間"
              type="number"
              min="0"
              max="180"
              inputMode="numeric"
              value={minutes}
              onChange={(event) => commit(event.target.value, portion)}
              className={inputClass}
            />
            <span className="shrink-0 font-bold">分</span>
          </div>
        </label>
      )}
      <div>
        <p className="mb-2 text-sm font-black text-slate-700">食べた量</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {options.map((option) => {
            const selected = portion === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => commit(option === '食べていない' ? '' : minutes, option)}
                className={`${choiceClass} ${selected ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}
              >
                {selected && <Check className="mr-1 inline h-4 w-4" />}
                {option}
              </button>
            );
          })}
        </div>
      </div>
      <label className="block text-sm font-bold text-slate-700">
        昼食の備考（任意）
        <textarea
          rows={3}
          value={answer.note || ''}
          onChange={(event) => commit(didNotEat ? '' : minutes, portion, event.target.value)}
          placeholder="食事中の様子、食べにくかった物、必要だった声掛けなどを入力してください。"
          className={`${inputClass} mt-2`}
        />
      </label>
    </div>
  );
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
        const activities = detailArray(nextDetails, 'kankenActivities');
        const other = activities.includes('その他') ? String(nextDetails.kankenOtherNote || '').trim() : '';
        const detailParts = [grade, ...activities.filter((item) => item !== 'その他'), other && `その他：${other}`].filter(Boolean);
        return detailParts.length ? `漢検（${detailParts.join('・')}）` : '漢検';
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
    if (selection === '漢検') {
      delete next.kankenGrade;
      delete next.kankenActivities;
      delete next.kankenOtherNote;
    }
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
          ? [String(details.kankenGrade || ''), ...detailArray(details, 'kankenActivities')].filter(Boolean).join('・')
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
                  <div className="space-y-3">
                    <label className="block text-sm font-bold text-slate-700">取り組んだ級
                      <select value={String(details.kankenGrade || '')} onChange={(event) => commit({ ...details, kankenGrade: event.target.value })} className={`${inputClass} mt-2`}>
                        <option value="">級を選択してください</option>
                        {KANKEN_GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                      </select>
                    </label>
                    <div>
                      <p className="mb-2 text-sm font-bold text-slate-700">取り組んだ内容（複数選択可）</p>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {['ドリル/ワーク', '過去問題', 'その他'].map((option) => {
                          const current = detailArray(details, 'kankenActivities');
                          const optionSelected = current.includes(option);
                          return <button key={option} type="button" onClick={() => commit({ ...details, kankenActivities: optionSelected ? current.filter((item) => item !== option) : [...current, option] })} className={`${choiceClass} ${optionSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{optionSelected && <Check className="mr-1 inline h-4 w-4" />}{option}</button>;
                        })}
                      </div>
                    </div>
                    {detailArray(details, 'kankenActivities').includes('その他') && <textarea rows={2} value={String(details.kankenOtherNote || '')} onChange={(event) => commit({ ...details, kankenOtherNote: event.target.value })} placeholder="漢検のその他の内容" className={inputClass} />}
                  </div>
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
        const attempts = getMockExamAttempts(nextDetails);
        const values = attempts
          .map((attempt, index) => {
            const detail = [
              attempt.characterCount.trim() && `${attempt.characterCount.trim()}文字`,
              attempt.pastRound.trim() && `第${attempt.pastRound.trim()}回過去問`,
            ].filter(Boolean).join('・');
            return detail ? `${index + 1}回目：${detail}` : '';
          })
          .filter(Boolean);
        return values.length ? `文章入力模擬試験（${values.join('／')}）` : '文章入力模擬試験';
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
      delete next.mockCharacterCounts;
      delete next.mockPastRounds;
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
            ? getMockExamAttempts(details).map((attempt, index) => {
                const values = [
                  attempt.characterCount && `${attempt.characterCount}文字`,
                  attempt.pastRound && `第${attempt.pastRound}回過去問`,
                ].filter(Boolean).join('・');
                return values ? `${index + 1}回目：${values}` : '';
              }).filter(Boolean).join('／')
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
                  <div className="space-y-3">
                    {getMockExamAttempts(details).map((attempt, index, attempts) => (
                      <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="text-sm font-black text-slate-800">{index + 1}回目</p>
                          {attempts.length > 1 && (
                            <button
                              type="button"
                              onClick={() => commit(withMockExamAttempts(details, attempts.filter((_, attemptIndex) => attemptIndex !== index)))}
                              className="min-h-9 rounded-lg border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700"
                            >
                              この回を削除
                            </button>
                          )}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-sm font-bold text-slate-700">入力文字数<div className="mt-2 flex items-center gap-2"><input type="number" min="0" inputMode="numeric" value={attempt.characterCount} onChange={(event) => commit(withMockExamAttempts(details, attempts.map((item, attemptIndex) => attemptIndex === index ? { ...item, characterCount: event.target.value } : item)))} className={inputClass} /><span>文字</span></div></label>
                          <label className="text-sm font-bold text-slate-700">過去問<div className="mt-2 flex items-center gap-2"><span>第</span><input type="number" min="1" inputMode="numeric" value={attempt.pastRound} onChange={(event) => commit(withMockExamAttempts(details, attempts.map((item, attemptIndex) => attemptIndex === index ? { ...item, pastRound: event.target.value } : item)))} className={inputClass} /><span>回</span></div></label>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => commit(withMockExamAttempts(details, [...getMockExamAttempts(details), { characterCount: '', pastRound: '' }]))}
                      className="min-h-12 w-full rounded-xl border-2 border-dashed border-teal-400 bg-teal-50 px-4 text-sm font-black text-teal-800"
                    >
                      ＋ 取り組みを追加
                    </button>
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

function PostureObservationInput({
  answer,
  onChange,
}: {
  answer: SectionFieldAnswer;
  onChange: (answer: SectionFieldAnswer) => void;
}) {
  const storedDetails = answer.nestedDetails || {};
  const legacySelections = answer.value.split('、').map((value) => value.trim()).filter(Boolean);
  const details = Object.keys(storedDetails).length > 0
    ? storedDetails
    : {
        backSelections: legacySelections.filter((value) => POSTURE_BACK_OPTIONS.includes(value)),
        legSelections: legacySelections
          .map((value) => value === '貧乏ゆすりあり' ? '貧乏ゆすりをしている' : value)
          .filter((value) => POSTURE_LEG_OPTIONS.includes(value)),
        otherNote: legacySelections.filter((value) =>
          !POSTURE_BACK_OPTIONS.includes(value)
          && !POSTURE_LEG_OPTIONS.includes(value)
          && value !== '貧乏ゆすりあり'
          && value !== 'その他'
        ).join('・'),
      };
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const backSelections = detailArray(details, 'backSelections');
  const legSelections = detailArray(details, 'legSelections');

  const commit = (nextDetails: Record<string, string | string[]>) => {
    const back = detailArray(nextDetails, 'backSelections');
    const legs = detailArray(nextDetails, 'legSelections');
    const backNote = String(nextDetails.backNote || '').trim();
    const legNote = String(nextDetails.legNote || '').trim();
    const otherNote = String(nextDetails.otherNote || '').trim();
    const parts = [
      back.length || backNote
        ? `背すじ（${[...back, backNote].filter(Boolean).join('・')}）`
        : '',
      legs.length || legNote
        ? `足（${[...legs, legNote].filter(Boolean).join('・')}）`
        : '',
      otherNote ? `その他（${otherNote}）` : '',
    ].filter(Boolean);
    onChange({ ...answer, value: parts.join('、'), nestedDetails: nextDetails });
  };

  const toggleOption = (key: 'backSelections' | 'legSelections', option: string) => {
    const values = detailArray(details, key);
    commit({
      ...details,
      [key]: values.includes(option)
        ? values.filter((value) => value !== option)
        : [...values, option],
    });
  };

  const categorySummary = (category: string) => {
    if (category === '背すじ') {
      return [...backSelections, String(details.backNote || '').trim()].filter(Boolean).join('・');
    }
    if (category === '足') {
      return [...legSelections, String(details.legNote || '').trim()].filter(Boolean).join('・');
    }
    return String(details.otherNote || '').trim();
  };

  return (
    <div className="min-w-0 space-y-2">
      <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1.5">
        {POSTURE_CATEGORIES.map((category) => {
          const selected = expandedCategory === category;
          const summary = categorySummary(category);
          return (
            <button
              key={category}
              type="button"
              aria-expanded={selected}
              onClick={() => setExpandedCategory(selected ? null : category)}
              className={`min-h-11 min-w-0 rounded-lg px-2 text-xs font-black transition-colors ${selected ? 'bg-teal-600 text-white shadow-sm' : summary ? 'bg-white text-teal-800 ring-1 ring-teal-300' : 'bg-white text-slate-600'}`}
            >
              <span className="flex items-center justify-center gap-1 truncate">{summary && <Check className="h-3.5 w-3.5 shrink-0" />}{category}</span>
            </button>
          );
        })}
      </div>
      {expandedCategory && (
        <section className="ui-panel-enter min-w-0 space-y-3 rounded-xl border border-teal-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-sm text-slate-900">{expandedCategory}を入力</strong>
            <button type="button" onClick={() => setExpandedCategory(null)} className="min-h-9 rounded-lg bg-slate-100 px-3 text-xs font-black text-slate-600">閉じる</button>
          </div>
          {expandedCategory === '背すじ' && (
            <div className="grid gap-2 sm:grid-cols-3">
              {POSTURE_BACK_OPTIONS.map((option) => {
                const selected = backSelections.includes(option);
                return <button key={option} type="button" onClick={() => toggleOption('backSelections', option)} className={`${choiceClass} text-left ${selected ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{selected && <Check className="mr-1 inline h-4 w-4" />}{option}</button>;
              })}
            </div>
          )}
          {expandedCategory === '足' && (
            <div className="grid gap-2 sm:grid-cols-2">
              {POSTURE_LEG_OPTIONS.map((option) => {
                const selected = legSelections.includes(option);
                return <button key={option} type="button" onClick={() => toggleOption('legSelections', option)} className={`${choiceClass} text-left ${selected ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{selected && <Check className="mr-1 inline h-4 w-4" />}{option}</button>;
              })}
            </div>
          )}
          <label className="block text-xs font-bold text-slate-700">
            {expandedCategory === 'その他' ? 'その他の様子' : `${expandedCategory}の備考（任意）`}
            <textarea
              rows={2}
              value={String(details[expandedCategory === '背すじ' ? 'backNote' : expandedCategory === '足' ? 'legNote' : 'otherNote'] || '')}
              onChange={(event) => commit({
                ...details,
                [expandedCategory === '背すじ' ? 'backNote' : expandedCategory === '足' ? 'legNote' : 'otherNote']: event.target.value,
              })}
              placeholder={expandedCategory === 'その他' ? '顔の位置や姿勢の変化などを入力' : '変化した時刻や具体的な様子を入力'}
              className={`${inputClass} mt-1`}
            />
          </label>
        </section>
      )}
    </div>
  );
}

function ThirdPeriodInput({
  answer,
  onChange,
}: {
  answer: SectionFieldAnswer;
  onChange: (answer: SectionFieldAnswer) => void;
}) {
  const details = answer.nestedDetails || {};
  const legacyMode = ['漢検', 'パソコン', 'その他'].find((mode) => answer.value.startsWith(mode)) || '';
  const mode = String(details.mode || legacyMode);

  const commit = (nextDetails: Record<string, string | string[]>) => {
    const nextMode = String(nextDetails.mode || '');
    let value = nextMode;
    if (nextMode === '漢検') {
      const grade = String(nextDetails.kankenGrade || '').trim();
      const activities = detailArray(nextDetails, 'kankenActivities');
      const other = activities.includes('その他') ? String(nextDetails.kankenOtherNote || '').trim() : '';
      const detailParts = [grade, ...activities.filter((item) => item !== 'その他'), other && `その他：${other}`].filter(Boolean);
      value = detailParts.length ? `漢検（${detailParts.join('・')}）` : '漢検';
    } else if (nextMode === 'パソコン') {
      const activities = detailArray(nextDetails, 'pcActivities');
      const other = activities.includes('その他') ? String(nextDetails.pcOtherNote || '').trim() : '';
      const detailParts = [...activities.filter((item) => item !== 'その他'), other && `その他：${other}`].filter(Boolean);
      value = detailParts.length ? `パソコン（${detailParts.join('・')}）` : 'パソコン';
    } else if (nextMode === 'その他') {
      const other = String(nextDetails.otherNote || '').trim();
      value = other ? `その他（${other}）` : 'その他';
    }
    onChange({ ...answer, value, nestedDetails: nextDetails });
  };

  const selectMode = (nextMode: string) => {
    commit({
      mode: nextMode,
      ...(nextMode === '漢検' ? {
        kankenGrade: details.kankenGrade || '',
        kankenActivities: detailArray(details, 'kankenActivities'),
        kankenOtherNote: details.kankenOtherNote || '',
      } : {}),
      ...(nextMode === 'パソコン' ? {
        pcActivities: detailArray(details, 'pcActivities'),
        pcOtherNote: details.pcOtherNote || '',
      } : {}),
      ...(nextMode === 'その他' ? { otherNote: details.otherNote || '' } : {}),
    });
  };

  const toggleActivity = (key: 'kankenActivities' | 'pcActivities', option: string) => {
    const current = detailArray(details, key);
    commit({
      ...details,
      mode,
      [key]: current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option],
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {['漢検', 'パソコン', 'その他'].map((option) => (
          <button key={option} type="button" onClick={() => selectMode(option)} className={`${choiceClass} ${mode === option ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
            {mode === option && <Check className="mr-1 inline h-4 w-4" />}{option}
          </button>
        ))}
      </div>
      {mode === '漢検' && (
        <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/50 p-3">
          <label className="block text-sm font-bold text-slate-700">級数
            <select value={String(details.kankenGrade || '')} onChange={(event) => commit({ ...details, mode, kankenGrade: event.target.value })} className={`${inputClass} mt-1`}>
              <option value="">級を選択してください</option>
              {KANKEN_GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
            </select>
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            {['ドリル/ワーク', '過去問題', 'その他'].map((option) => {
              const selected = detailArray(details, 'kankenActivities').includes(option);
              return <button key={option} type="button" onClick={() => toggleActivity('kankenActivities', option)} className={`${choiceClass} ${selected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{selected && <Check className="mr-1 inline h-4 w-4" />}{option}</button>;
            })}
          </div>
          {detailArray(details, 'kankenActivities').includes('その他') && <textarea rows={2} value={String(details.kankenOtherNote || '')} onChange={(event) => commit({ ...details, mode, kankenOtherNote: event.target.value })} placeholder="漢検のその他の内容" className={inputClass} />}
        </div>
      )}
      {mode === 'パソコン' && (
        <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/50 p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            {['タッチタイピング', '文章入力練習', 'その他'].map((option) => {
              const selected = detailArray(details, 'pcActivities').includes(option);
              return <button key={option} type="button" onClick={() => toggleActivity('pcActivities', option)} className={`${choiceClass} ${selected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{selected && <Check className="mr-1 inline h-4 w-4" />}{option}</button>;
            })}
          </div>
          {detailArray(details, 'pcActivities').includes('その他') && <textarea rows={2} value={String(details.pcOtherNote || '')} onChange={(event) => commit({ ...details, mode, pcOtherNote: event.target.value })} placeholder="パソコンのその他の内容" className={inputClass} />}
        </div>
      )}
      {mode === 'その他' && <textarea rows={3} value={String(details.otherNote || '')} onChange={(event) => commit({ ...details, mode, otherNote: event.target.value })} placeholder="3コマ目の取り組み内容を入力" className={inputClass} />}
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
      abcAnalysis: previous?.abcAnalysis
        ? {
            inputMode: previous.abcAnalysis.inputMode || 'abc',
            behavior: previous.abcAnalysis.behavior || '',
            consequence: previous.abcAnalysis.consequence || '',
            antecedent: previous.abcAnalysis.antecedent || '',
            summary: previous.abcAnalysis.summary || '',
            freeText: previous.abcAnalysis.freeText || '',
          }
        : {
            inputMode: 'abc',
            behavior: '',
            consequence: '',
            antecedent: '',
            summary: previous?.detailText || '',
            freeText: '',
          },
    };
  });
  return next;
}

function createChildDraft(template?: Template, record?: SupportRecord): ChildDraft {
  const recordModules = isUnifiedTemplate(template) ? readRecordModules(record?.sectionAnswers) : [];
  const sectionAnswers = createSectionAnswers(template, record?.sectionAnswers);
  recordModules.forEach((module) => {
    const sectionId = moduleSectionId(module.id);
    sectionAnswers[sectionId] = createModuleSection(module, record?.sectionAnswers?.[sectionId]);
  });
  return {
    recordId: record?.id || newRecordId(),
    templateId: template?.id || record?.templateId,
    attendance: record?.attendance || '',
    attendanceNote: record?.attendanceNote || '',
    expressions: record?.expressions || [],
    expressionNote: record?.expressionNote || '',
    snack: record?.snack || '',
    snackNote: record?.snackNote || '',
    sectionAnswers,
    recordModules,
    skippedQuestionIds: record?.skippedQuestionIds || [],
  };
}

function migrateLegacyHolidayBlock(section: SectionAnswer | undefined, prefix: 'morning' | 'afternoon') {
  if (!section) return section;
  const answers = section.answers || {};
  const legacyMode = answers[`${prefix}_type`]?.value;
  if (legacyMode !== '学習' && legacyMode !== 'パソコン') return section;

  const periodPrefix = `${prefix}_period1`;
  const migratedAnswers = {
    ...answers,
    [`${prefix}_type`]: {
      ...answers[`${prefix}_type`],
      value: '学習/パソコン',
    },
    [`${periodPrefix}_type`]: {
      value: legacyMode,
      note: '',
    },
  };
  const suffixes = legacyMode === '学習'
    ? ['study_homework', 'study_attitude', 'study_extras', 'study_posture']
    : ['pc_content', 'pc_finger', 'pc_posture', 'pc_transition'];
  suffixes.forEach((suffix) => {
    const legacyAnswer = answers[`${prefix}_${suffix}`];
    if (legacyAnswer) migratedAnswers[`${periodPrefix}_${suffix}`] = legacyAnswer;
  });
  return { ...section, answers: migratedAnswers };
}

function migrateLegacyHolidayDraft(draft: WizardDraft) {
  if (draft.selectedTemplateId !== 'template-holiday') return draft;
  return {
    ...draft,
    childDrafts: Object.fromEntries(
      Object.entries(draft.childDrafts).map(([childId, childDraft]) => [
        childId,
        {
          ...childDraft,
          sectionAnswers: {
            ...childDraft.sectionAnswers,
            morning: migrateLegacyHolidayBlock(childDraft.sectionAnswers.morning, 'morning'),
            afternoon: migrateLegacyHolidayBlock(childDraft.sectionAnswers.afternoon, 'afternoon'),
          },
        },
      ]),
    ),
  };
}

function normalizeWizardDraft(value: unknown): WizardDraft | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as Partial<WizardDraft> & { version?: number };
  if (![2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(draft.version || 0) || !Array.isArray(draft.selectedChildIds) || !draft.childDrafts) return null;
  const previousStepIndex = draft.currentStepIndex || 0;
  const currentStepIndex = (draft.version || 0) < 4
    ? previousStepIndex === 1 ? 2 : previousStepIndex === 2 ? 1 : previousStepIndex
    : previousStepIndex;
  const normalized = {
    ...draft,
    version: 12,
    draftCycleKey: getCurrentDraftCycleKey(),
    recorderId: draft.recorderId || '',
    childTemplateIds: draft.childTemplateIds || Object.fromEntries(
      (draft.selectedChildIds || []).map((childId) => [childId, draft.selectedTemplateId || ''])
    ),
    currentStepIndex,
    childStepIds: draft.childStepIds || {},
    childDrafts: Object.fromEntries(Object.entries(draft.childDrafts).map(([childId, childDraft]) => [
      childId,
      {
        ...childDraft,
        recordModules: childDraft.recordModules || readRecordModules(childDraft.sectionAnswers),
      },
    ])),
  } as WizardDraft;
  return (draft.version || 0) < 9 ? migrateLegacyHolidayDraft(normalized) : normalized;
}

function describeDraftSaveError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '原因不明のエラー');
  if (/failed to fetch|network|load failed|通信|offline/i.test(message)) {
    return '通信状態を確認できず、共有データベースへ保存できませんでした。入力内容はこの端末内に残っています。';
  }
  if (/jwt|session|unauthorized|not authenticated/i.test(message)) {
    return 'ログイン状態を確認できず、共有保存できませんでした。画面を再読み込みせず、まず再試行してください。';
  }
  return `共有データベースへの保存に失敗しました。入力内容はこの端末内に残っています。詳細: ${message.slice(0, 240)}`;
}

export const RecordForm: React.FC<RecordFormProps> = ({
  templates,
  childrenList,
  calendarEvents = [],
  dailyChildPlans = [],
  recorderProfiles,
  initialRecord,
  organizationId,
  userId,
  userDisplayName,
  draftKey: requestedDraftKey,
  activeRecorder,
  assistantPrefill,
  initialStepId,
  resolvedIssueId,
  readOnly = false,
  readOnlyOwnerName,
  readOnlyInitialChildId,
  readOnlyDrafts = [],
  onReadOnlyDraftChange,
  onBackToRecordStatus,
  lockedChildren = {},
  onSaveRecords,
  onDraftChanged,
  onCreateHandover,
  handoverItems = [],
}) => {
  const storedTemplate = templates.find((template) => template.id === initialRecord?.templateId) || templates[0];
  const initialTemplate = initialRecord?.templateId === UNIFIED_TEMPLATE_ID
    ? UNIFIED_TEMPLATE
    : initialRecord?.templateSectionsSnapshot?.length
    ? {
        id: initialRecord.templateId,
        name: initialRecord.templateName,
        type: initialRecord.templateType,
        sections: initialRecord.templateSectionsSnapshot,
        wizardQuestions: storedTemplate?.wizardQuestions,
      } satisfies Template
    : initialRecord
      ? storedTemplate
      : UNIFIED_TEMPLATE;
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
    const initialChildId = initialRecord?.childId || assistantPrefill?.childId || '';
    const initialDate = initialRecord?.date || assistantPrefill?.date || new Date().toISOString().split('T')[0];
    const initialChildTemplate = initialRecord ? initialTemplate : UNIFIED_TEMPLATE;
    const base: WizardDraft = {
      version: 12,
      draftCycleKey: getCurrentDraftCycleKey(),
      selectedTemplateId: initialTemplate?.id || UNIFIED_TEMPLATE_ID,
      childTemplateIds: initialRecord
        ? { [initialRecord.childId]: initialChildTemplate?.id || '' }
        : assistantPrefill
          ? { [assistantPrefill.childId]: initialChildTemplate?.id || '' }
          : {},
      selectedChildIds: initialRecord ? [initialRecord.childId] : assistantPrefill ? [assistantPrefill.childId] : [],
      activeChildId: initialRecord?.childId || assistantPrefill?.childId || '',
      date: initialDate,
      recorderId: activeRecorder?.id || initialRecord?.recorderId || (!userDisplayName ? initialRecorder?.id : '') || '',
      recorderName: activeRecorder?.displayName || initialRecord?.recorderName || userDisplayName || initialRecorder?.displayName || '',
      currentStepIndex: 0,
      childStepIds: {},
      childDrafts: initialRecord
        ? { [initialRecord.childId]: createChildDraft(initialChildTemplate, initialRecord) }
        : assistantPrefill
          ? { [assistantPrefill.childId]: createChildDraft(initialChildTemplate) }
          : {},
    };
    return base;
  };

  const createInitialDraft = (): WizardDraft => {
    const base = createBaseDraft();
    if (readOnly && organizationId) return base;
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
  const [draftStatus, setDraftStatus] = useState<'restored' | 'saving' | 'saved' | 'deleted' | 'conflict' | 'locked' | 'taken-over' | 'error' | null>(null);
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const [draftRetryToken, setDraftRetryToken] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savingChildId, setSavingChildId] = useState<string | null>(null);
  const [summarizingSectionId, setSummarizingSectionId] = useState<string | null>(null);
  const [showChildPicker, setShowChildPicker] = useState(false);
  const [infoChild, setInfoChild] = useState<ChildProfile | null>(null);
  const [handoverReferenceOpen, setHandoverReferenceOpen] = useState(false);
  const [copiedHandoverId, setCopiedHandoverId] = useState<string | null>(null);
  const [childSearch, setChildSearch] = useState('');
  const [checksAcknowledged, setChecksAcknowledged] = useState(false);
  const [expandedGroupStepId, setExpandedGroupStepId] = useState<string | null>(null);
  const [pendingModuleStepId, setPendingModuleStepId] = useState<string | null>(null);
  const [reorderingChildTabs, setReorderingChildTabs] = useState(false);
  const [draggingChildId, setDraggingChildId] = useState<string | null>(null);
  const childTabSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [takeoverNotice, setTakeoverNotice] = useState<TakeoverNotice | null>(null);
  const draftWriteBlocked = draftStatus === 'locked' || draftStatus === 'taken-over' || Boolean(takeoverNotice);
  const editingDisabled = readOnly || draftWriteBlocked;
  const [questionIndexMode, setQuestionIndexMode] = useState<'unanswered' | 'all'>('unanswered');
  const draftCleared = useRef(false);
  const skipNextDraftSave = useRef(false);
  const deviceId = useRef(getDeviceId()).current;
  const remoteRevision = useRef<number | null>(null);
  const initialStepApplied = useRef(false);
  const formElement = useRef<HTMLFormElement | null>(null);
  const focusedEditor = useRef<{
    element: HTMLInputElement | HTMLTextAreaElement;
    selectionStart: number | null;
    selectionEnd: number | null;
    inputAt: number;
  } | null>(null);

  const rememberFocusedEditor = (target: EventTarget | null, inputEvent = false) => {
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return;
    const inputType = target instanceof HTMLInputElement ? target.type : 'textarea';
    if (!['text', 'search', 'tel', 'email', 'url', 'number', 'textarea'].includes(inputType)) return;
    let selectionStart: number | null = null;
    let selectionEnd: number | null = null;
    try {
      selectionStart = target.selectionStart;
      selectionEnd = target.selectionEnd;
    } catch {
      // Number inputs do not expose a text selection in every browser.
    }
    focusedEditor.current = {
      element: target,
      selectionStart,
      selectionEnd,
      inputAt: inputEvent ? performance.now() : 0,
    };
  };

  useLayoutEffect(() => {
    const snapshot = focusedEditor.current;
    if (!snapshot || snapshot.inputAt === 0 || performance.now() - snapshot.inputAt > 500) return;
    if (!snapshot.element.isConnected || document.activeElement === snapshot.element) return;
    if (document.activeElement !== document.body && document.activeElement !== document.documentElement) return;
    const animationFrame = window.requestAnimationFrame(() => {
      if (!snapshot.element.isConnected || !formElement.current?.contains(snapshot.element)) return;
      snapshot.element.focus({ preventScroll: true });
      if (snapshot.selectionStart === null || snapshot.selectionEnd === null) return;
      try {
        snapshot.element.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
      } catch {
        // Some input types do not support restoring a selection range.
      }
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [wizard]);

  const templateForChild = (childId?: string) => {
    if (initialRecord) return initialTemplate;
    const templateId = childId
      ? wizard.childDrafts[childId]?.templateId || wizard.childTemplateIds[childId]
      : undefined;
    if ((templateId || wizard.selectedTemplateId) === UNIFIED_TEMPLATE_ID) return UNIFIED_TEMPLATE;
    return templates.find((template) => template.id === (templateId || wizard.selectedTemplateId)) || templates[0];
  };
  const activeTemplate = templateForChild(wizard.activeChildId);
  const wizardQuestions = getWizardQuestions(activeTemplate);
  const activeChild = childrenList.find((child) => child.id === wizard.activeChildId);
  const activeChildDraft = wizard.childDrafts[wizard.activeChildId];
  const takeoverTarget = readOnlyDrafts
    .filter((draft) => draft.takenOverFromDraftKeys?.includes(draftKey))
    .sort((left, right) => (right.takenOverAt || right.updatedAt).localeCompare(left.takenOverAt || left.updatedAt))
    .find((draft) => draft.selectedChildIds.some((childId) => wizard.selectedChildIds.includes(childId)));
  const takeoverTargetSignature = takeoverTarget
    ? `${takeoverTarget.draftKey}:${takeoverTarget.revision}:${takeoverTarget.selectedChildIds.join(',')}`
    : '';
  const liveCurrentDraft = readOnlyDrafts.find((draft) => draft.draftKey === draftKey);
  const liveCurrentDraftSignature = liveCurrentDraft
    ? `${liveCurrentDraft.revision}:${liveCurrentDraft.selectedChildIds.join(',')}`
    : '';
  const relevantHandovers = useMemo(() => handoverItems
    .filter((item) => item.status !== '完了' && (!item.childId || item.childId === activeChild?.id))
    .sort((left, right) => {
      const rank = { 緊急: 0, 重要: 1, 通常: 2 };
      return rank[left.priority] - rank[right.priority] || right.updatedAt.localeCompare(left.updatedAt);
    }), [activeChild?.id, handoverItems]);

  useEffect(() => {
    if (!organizationId || !userId) return;
    let alive = true;
    void loadRecordDraft(organizationId, draftKey)
      .then((remote) => {
        if (!alive || !remote) return;
        remoteRevision.current = remote.revision;
        const restored = normalizeWizardDraft(remote.payload);
        if (!restored) {
          if (!readOnly) {
            localStorage.removeItem(storageKey);
            void deleteRecordDraft(organizationId, draftKey);
          }
          return;
        }
        const remoteTime = new Date(remote.updatedAt).getTime();
        const localTime = wizard.updatedAt ? new Date(wizard.updatedAt).getTime() : 0;
        if (readOnly || remoteTime > localTime) {
          setWizard({ ...restored, updatedAt: remote.updatedAt });
          if (!readOnly) {
            localStorage.setItem(storageKey, JSON.stringify({ ...restored, updatedAt: remote.updatedAt }));
          }
          setDraftStatus('restored');
        }
      })
      .catch((error) => {
        setDraftSaveError(describeDraftSaveError(error));
        setDraftStatus('error');
      })
      .finally(() => { if (alive) setDraftReady(true); });
    return () => { alive = false; };
    // The initial local draft is intentionally compared once per form session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, userId, draftKey, storageKey, readOnly]);

  useEffect(() => {
    if (
      readOnly
      || initialRecord
      || !organizationId
      || !draftReady
      || draftCleared.current
      || !takeoverTarget
    ) return;

    const transferredChildIds = takeoverTarget.selectedChildIds.filter((childId) =>
      wizard.selectedChildIds.includes(childId)
    );
    if (transferredChildIds.length === 0) return;

    const childNames = transferredChildIds.map((childId) =>
      childrenList.find((child) => child.id === childId)?.name || '児童'
    );
    let alive = true;
    skipNextDraftSave.current = true;
    setDraftStatus('taken-over');
    setTakeoverNotice({
      kind: 'transferred-out',
      childNames,
      nextRecorderName: takeoverTarget.recorderName,
      allTransferred: transferredChildIds.length === wizard.selectedChildIds.length,
      syncing: true,
      syncFailed: false,
    });

    void loadRecordDraft(organizationId, draftKey)
      .then((remote) => {
        if (!alive) return;
        if (!remote) {
          remoteRevision.current = null;
          localStorage.removeItem(storageKey);
          setTakeoverNotice((previous) => previous ? {
            ...previous,
            allTransferred: true,
            syncing: false,
          } : null);
          setDraftStatus('taken-over');
          return;
        }

        const restored = normalizeWizardDraft(remote.payload);
        if (!restored) throw new Error('引き継ぎ後の最新下書きを読み込めませんでした。');
        remoteRevision.current = remote.revision;
        skipNextDraftSave.current = true;
        const latest = { ...restored, updatedAt: remote.updatedAt };
        setWizard(latest);
        localStorage.setItem(storageKey, JSON.stringify(latest));
        setTakeoverNotice((previous) => previous ? {
          ...previous,
          allTransferred: restored.selectedChildIds.length === 0,
          syncing: false,
        } : null);
        setDraftStatus(restored.selectedChildIds.length === 0 ? 'taken-over' : 'restored');
        onDraftChanged?.();
      })
      .catch(() => {
        if (!alive) return;
        setTakeoverNotice((previous) => previous ? {
          ...previous,
          syncing: false,
          syncFailed: true,
        } : null);
        setDraftStatus('taken-over');
      });

    return () => { alive = false; };
    // The target signature is emitted by the shared draft Realtime refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takeoverTargetSignature, organizationId, draftKey, draftReady, initialRecord, readOnly, storageKey]);

  useEffect(() => {
    if (
      readOnly
      || initialRecord
      || !organizationId
      || !draftReady
      || draftCleared.current
      || !liveCurrentDraft
      || takeoverNotice
    ) return;

    const addedChildIds = liveCurrentDraft.selectedChildIds.filter((childId) =>
      !wizard.selectedChildIds.includes(childId)
    );
    if (addedChildIds.length === 0) return;

    const childNames = addedChildIds.map((childId) =>
      childrenList.find((child) => child.id === childId)?.name || '児童'
    );
    let alive = true;
    skipNextDraftSave.current = true;
    setTakeoverNotice({
      kind: 'received',
      childNames,
      nextRecorderName: liveCurrentDraft.recorderName,
      allTransferred: false,
      syncing: true,
      syncFailed: false,
    });

    void loadRecordDraft(organizationId, draftKey)
      .then((remote) => {
        if (!alive || !remote) throw new Error('統合後の下書きを取得できませんでした。');
        const restored = normalizeWizardDraft(remote.payload);
        if (!restored) throw new Error('統合後の下書きを読み込めませんでした。');
        remoteRevision.current = remote.revision;
        skipNextDraftSave.current = true;
        const latest = { ...restored, updatedAt: remote.updatedAt };
        setWizard(latest);
        localStorage.setItem(storageKey, JSON.stringify(latest));
        setTakeoverNotice((previous) => previous?.kind === 'received' ? {
          ...previous,
          syncing: false,
        } : previous);
        setDraftStatus('restored');
        onDraftChanged?.();
      })
      .catch(() => {
        if (!alive) return;
        setTakeoverNotice((previous) => previous?.kind === 'received' ? {
          ...previous,
          syncing: false,
          syncFailed: true,
        } : previous);
        setDraftStatus('taken-over');
      });

    return () => { alive = false; };
    // Realtime and the form-only polling refresh this summary signature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveCurrentDraftSignature, organizationId, draftKey, draftReady, initialRecord, readOnly, storageKey]);

  useEffect(() => {
    if (editingDisabled || !draftReady || draftCleared.current) return;
    if (!initialRecord && wizard.selectedChildIds.length === 0) {
      setDraftStatus(null);
      return;
    }
    if (skipNextDraftSave.current) {
      skipNextDraftSave.current = false;
      return;
    }
    setDraftStatus('saving');
    setDraftSaveError(null);
    let cancelled = false;
    let retryTimer: number | undefined;
    const timer = window.setTimeout(() => {
      const payload: WizardDraft = {
        ...wizard,
        version: 12,
        draftCycleKey: getCurrentDraftCycleKey(),
        updatedAt: new Date().toISOString(),
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch {
        setDraftStatus('error');
      }
      if (organizationId && userId) {
        const saveSharedDraft = async (attempt: number) => {
          try {
            const saved = await saveRecordDraft(organizationId, userId, draftKey, payload, {
              deviceId,
              expectedRevision: remoteRevision.current,
              recorderId: wizard.recorderId || null,
            });
            if (cancelled) return;
            remoteRevision.current = saved.revision;
            setDraftSaveError(null);
            setDraftStatus('saved');
            onDraftChanged?.();
          } catch (error) {
            if (cancelled) return;
            const message = error instanceof Error ? error.message : String(error);
            const knownStatus = message.includes('DRAFT_CHILD_LOCKED')
              ? 'locked' as const
              : message.includes('DRAFT_TAKEN_OVER') || message.includes('DRAFT_OWNED_BY_ANOTHER_RECORDER')
                ? 'taken-over' as const
                : message.includes('DRAFT_CONFLICT')
                  ? 'conflict' as const
                  : null;
            if (knownStatus) {
              setDraftSaveError(null);
              setDraftStatus(knownStatus);
              return;
            }
            if (attempt < 2 && navigator.onLine) {
              setDraftStatus('saving');
              retryTimer = window.setTimeout(() => void saveSharedDraft(attempt + 1), 1500 * (attempt + 1));
              return;
            }
            setDraftSaveError(describeDraftSaveError(error));
            setDraftStatus('error');
          }
        };
        void saveSharedDraft(0);
      } else {
        setDraftSaveError(null);
        setDraftStatus('saved');
      }
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [wizard, draftReady, storageKey, organizationId, userId, draftKey, deviceId, onDraftChanged, editingDisabled, initialRecord, draftRetryToken]);

  useEffect(() => {
    if (!readOnly || !organizationId) return;
    let alive = true;
    const refreshReadOnlyDraft = async () => {
      try {
        const remote = await loadRecordDraft(organizationId, draftKey);
        if (!alive || !remote || remote.revision === remoteRevision.current) return;
        const restored = normalizeWizardDraft(remote.payload);
        if (!restored) return;
        remoteRevision.current = remote.revision;
        setWizard({ ...restored, updatedAt: remote.updatedAt });
        setDraftStatus('restored');
      } catch {
        if (alive) setDraftStatus('error');
      }
    };
    const timer = window.setInterval(() => void refreshReadOnlyDraft(), 5000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshReadOnlyDraft();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [draftKey, organizationId, readOnly]);

  useEffect(() => {
    if (activeTemplate || templates.length === 0) return;
    setWizard((previous) => ({ ...previous, selectedTemplateId: templates[0].id }));
  }, [activeTemplate, templates]);

  const buildStepsForTemplate = (template?: Template, childDraft = activeChildDraft): WizardStep[] => {
    const activeTemplate = template;
    const questions = getWizardQuestions(activeTemplate);
    const next: WizardStep[] = isUnifiedTemplate(activeTemplate)
      ? [
          { id: 'date', kind: 'date', displayNumber: 1, ...questions.date },
          { id: 'children', kind: 'children', displayNumber: 2, ...questions.children },
        ]
      : [
          { id: 'template', kind: 'template', displayNumber: 1, ...questions.template },
          { id: 'date', kind: 'date', displayNumber: 2, ...questions.date },
          { id: 'children', kind: 'children', displayNumber: 3, ...questions.children },
        ];

    if (!activeRecorder && !userDisplayName) {
      next.push({ id: 'recorder', kind: 'recorder', ...questions.recorder });
    }

    if (isUnifiedTemplate(activeTemplate)) {
      next.push(
        { id: 'attendance', kind: 'attendance', displayNumber: 3, ...questions.attendance },
        { id: 'expression', kind: 'expression', displayNumber: 4, ...questions.expression },
      );
      const life = activeTemplate.sections.find((section) => section.id === 'life');
      life?.fields.forEach((field, index) => next.push({
        id: `field-life-${field.id}`,
        kind: 'field',
        sectionId: 'life',
        fieldId: field.id,
        field,
        displayNumber: 5 + index,
        title: field.questionTitle || `${field.label}はどうですか？`,
        help: field.helpText,
      }));
      next.push({
        id: 'module-menu',
        kind: 'modules',
        title: '何を記録しますか？',
        help: '本日行った内容だけを選んで入力してください。同じ項目を複数回追加できます。',
      });
      (childDraft?.recordModules || []).forEach((module) => {
        const sectionId = moduleSectionId(module.id);
        if (module.type === 'snack') {
          next.push({
            id: `module-${module.id}-snack`,
            kind: 'snack',
            sectionId,
            moduleId: module.id,
            moduleType: module.type,
            title: questions.snack.title,
            help: questions.snack.help,
          });
          return;
        }
        if (module.type === 'special') {
          next.push({
            id: `module-${module.id}-special`,
            kind: 'abc-sequence',
            sectionId,
            moduleId: module.id,
            moduleType: module.type,
            title: questions.abcBehavior.title,
            help: 'ABCで整理するか、自由記入を選べます。',
          });
          return;
        }
        fieldsForRecordModule(module.type).forEach((field) => next.push({
          id: `module-${module.id}-field-${field.id}`,
          kind: 'field',
          sectionId,
          fieldId: field.id,
          field,
          moduleId: module.id,
          moduleType: module.type,
          title: field.questionTitle || field.label,
          help: field.helpText,
        }));
      });
      next.push({ id: 'review', kind: 'review', title: '入力内容を確認してください。' });
      return next;
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

    if (isStructuredHolidayTemplate(activeTemplate)) {
      next.push(
        { id: 'attendance', kind: 'attendance', displayNumber: 4, ...questions.attendance },
        { id: 'expression', kind: 'expression', displayNumber: 5, ...questions.expression },
      );

      const addField = (sectionId: string, field: TemplateField, displayNumber: number) => next.push({
        id: `field-${sectionId}-${field.id}`,
        kind: 'field',
        sectionId,
        fieldId: field.id,
        displayNumber,
        title: field.questionTitle || `${field.label}はどうですか？`,
        help: field.helpText,
      });
      const life = activeTemplate?.sections.find((section) => section.id === 'life');
      const lifeNumbers: Record<string, number> = {
        fatigue: 6,
        preparation: 7,
        response_to_prompt: 8,
        medication: 9,
      };
      life?.fields.forEach((field) => addField('life', field, lifeNumbers[field.id] || 9));

      const addLegacyBlock = (sectionId: 'morning' | 'afternoon', baseNumber: number) => {
        const section = activeTemplate?.sections.find((candidate) => candidate.id === sectionId);
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
          [`${sectionId}_activity_content`]: 1,
          [`${sectionId}_activity_initiative`]: 2,
        };
        section?.fields.forEach((field) => addField(sectionId, field, baseNumber + (questionOffset[field.id] || 0)));
      };
      const addIntegratedBlock = (sectionId: 'morning' | 'afternoon', baseNumber: number) => {
        const section = activeTemplate?.sections.find((candidate) => candidate.id === sectionId);
        const questionOffset: Record<string, number> = {
          [`${sectionId}_type`]: 0,
          [`${sectionId}_period1_type`]: 1,
          [`${sectionId}_period1_study_homework`]: 2,
          [`${sectionId}_period1_study_attitude`]: 3,
          [`${sectionId}_period1_study_extras`]: 4,
          [`${sectionId}_period1_study_posture`]: 5,
          [`${sectionId}_period1_pc_content`]: 2,
          [`${sectionId}_period1_pc_finger`]: 3,
          [`${sectionId}_period1_pc_posture`]: 4,
          [`${sectionId}_period1_pc_transition`]: 5,
          [`${sectionId}_period2_type`]: 6,
          [`${sectionId}_period2_study_homework`]: 7,
          [`${sectionId}_period2_study_attitude`]: 8,
          [`${sectionId}_period2_study_extras`]: 9,
          [`${sectionId}_period2_study_posture`]: 10,
          [`${sectionId}_period2_pc_content`]: 7,
          [`${sectionId}_period2_pc_finger`]: 8,
          [`${sectionId}_period2_pc_posture`]: 9,
          [`${sectionId}_period2_pc_transition`]: 10,
          [`${sectionId}_period3_type`]: 11,
          [`${sectionId}_activity_content`]: 1,
          [`${sectionId}_activity_initiative`]: 2,
        };
        section?.fields.forEach((field) => addField(sectionId, field, baseNumber + (questionOffset[field.id] || 0)));
      };

      const lunch = activeTemplate?.sections.find((section) => section.id === 'lunch');
      if (isIntegratedHolidayTemplate(activeTemplate)) {
        addIntegratedBlock('morning', 10);
        lunch?.fields.forEach((field) => addField('lunch', field, 22));
        addIntegratedBlock('afternoon', 23);
      } else {
        addLegacyBlock('morning', 10);
        lunch?.fields.forEach((field) => addField('lunch', field, 15));
        addLegacyBlock('afternoon', 16);
      }

      next.push({
        id: 'snack',
        kind: 'snack',
        displayNumber: isIntegratedHolidayTemplate(activeTemplate) ? 35 : 21,
        ...questions.snack,
      });
      next.push({
        id: 'abc-special',
        kind: 'abc-sequence',
        sectionId: 'special',
        displayNumber: isIntegratedHolidayTemplate(activeTemplate) ? 36 : 22,
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
  };
  const activeModuleSignature = (activeChildDraft?.recordModules || []).map((module) => `${module.id}:${module.type}`).join('|');
  const steps = useMemo<WizardStep[]>(
    () => buildStepsForTemplate(activeTemplate, activeChildDraft),
    // Step definitions change only when the active child/template or recorder gate changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeRecorder, activeTemplate, userDisplayName, activeModuleSignature],
  );

  useEffect(() => {
    if (wizard.currentStepIndex < steps.length) return;
    setWizard((previous) => ({ ...previous, currentStepIndex: Math.max(0, steps.length - 1) }));
  }, [steps.length, wizard.currentStepIndex]);

  useEffect(() => {
    if (!draftReady || initialStepApplied.current || !initialStepId || steps.length === 0) return;
    const targetIndex = steps.findIndex((step) => step.id === initialStepId);
    if (targetIndex < 0) return;
    initialStepApplied.current = true;
    setWizard((previous) => ({
      ...previous,
      currentStepIndex: targetIndex,
      childStepIds: previous.activeChildId
        ? { ...previous.childStepIds, [previous.activeChildId]: initialStepId }
        : previous.childStepIds,
    }));
  }, [draftReady, initialStepId, steps]);

  const currentStep = steps[wizard.currentStepIndex];
  const questionTotal = isUnifiedTemplate(activeTemplate)
    ? Math.max(1, steps.filter((step) => !['date', 'children', 'recorder', 'modules', 'review'].includes(step.kind)).length)
    : isIntegratedHolidayTemplate(activeTemplate)
      ? 36
      : isStructuredHolidayTemplate(activeTemplate)
        ? 22
        : 21;
  const progress = currentStep?.kind === 'review'
    ? 100
    : isUnifiedTemplate(activeTemplate)
      ? steps.length > 0 ? ((wizard.currentStepIndex + 1) / steps.length) * 100 : 0
      : currentStep?.displayNumber
        ? (currentStep.displayNumber / questionTotal) * 100
        : steps.length > 0
          ? ((wizard.currentStepIndex + 1) / steps.length) * 100
          : 0;
  const isChildStep = currentStep && !['template', 'children', 'date', 'recorder', 'review'].includes(currentStep.kind);

  const updateWizard = (updates: Partial<WizardDraft>) => {
    if (editingDisabled) return;
    setWizard((previous) => ({ ...previous, ...updates }));
  };

  const updateChildDraft = (childId: string, updater: (draft: ChildDraft) => ChildDraft) => {
    if (editingDisabled) return;
    setWizard((previous) => {
      const current = previous.childDrafts[childId] || createChildDraft(activeTemplate);
      return { ...previous, childDrafts: { ...previous.childDrafts, [childId]: updater(current) } };
    });
  };

  const openRecordModule = (module: RecordModuleDraft) => {
    const step = module.type === 'snack'
      ? `module-${module.id}-snack`
      : module.type === 'special'
        ? `module-${module.id}-special`
        : `module-${module.id}-field-${fieldsForRecordModule(module.type)[0]?.id || ''}`;
    setPendingModuleStepId(step);
  };

  const addRecordModule = (type: RecordModuleType) => {
    if (!wizard.activeChildId || editingDisabled) return;
    const existing = activeChildDraft?.recordModules.find((module) => module.type === type);
    if (existing && SINGLE_RECORD_MODULES.has(type)) {
      openRecordModule(existing);
      return;
    }
    const module = createRecordModule(type);
    updateChildDraft(wizard.activeChildId, (draft) => ({
      ...draft,
      recordModules: [...draft.recordModules, module],
      sectionAnswers: {
        ...draft.sectionAnswers,
        [moduleSectionId(module.id)]: createModuleSection(module),
      },
    }));
    openRecordModule(module);
  };

  const removeRecordModule = (moduleId: string) => {
    if (!wizard.activeChildId || editingDisabled) return;
    const module = activeChildDraft?.recordModules.find((item) => item.id === moduleId);
    if (!module || !window.confirm(`${RECORD_MODULE_LABELS[module.type]}の入力欄と内容を削除しますか？`)) return;
    updateChildDraft(wizard.activeChildId, (draft) => {
      const sectionAnswers = { ...draft.sectionAnswers };
      delete sectionAnswers[moduleSectionId(moduleId)];
      return {
        ...draft,
        ...(module.type === 'snack' ? { snack: '', snackNote: '' } : {}),
        recordModules: draft.recordModules.filter((item) => item.id !== moduleId),
        sectionAnswers,
        skippedQuestionIds: draft.skippedQuestionIds.filter((id) => !id.includes(moduleId)),
      };
    });
  };

  const moveRecordModule = (moduleId: string, direction: -1 | 1) => {
    if (!wizard.activeChildId || editingDisabled) return;
    updateChildDraft(wizard.activeChildId, (draft) => {
      const index = draft.recordModules.findIndex((module) => module.id === moduleId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= draft.recordModules.length) return draft;
      return { ...draft, recordModules: arrayMove(draft.recordModules, index, target) };
    });
  };

  const unskip = (draft: ChildDraft, stepId: string) => ({
    ...draft,
    skippedQuestionIds: draft.skippedQuestionIds.filter((id) => id !== stepId),
  });

  const setAttendance = (attendance: string) => {
    if (!wizard.activeChildId) return;
    updateChildDraft(wizard.activeChildId, (raw) => {
      const draft = unskip(raw, 'attendance');
      if (!attendance.includes('欠席')) return { ...draft, attendance };
      if (isUnifiedTemplate(activeTemplate)) return { ...draft, attendance };
      return {
        ...draft,
        attendance,
        expressions: [],
        expressionNote: '',
        snack: '',
        snackNote: '',
        sectionAnswers: createSectionAnswers(activeTemplate),
        skippedQuestionIds: [],
      };
    });
  };

  const selectTemplate = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    setWizard((previous) => ({
      ...previous,
      selectedTemplateId: templateId,
      childTemplateIds: Object.fromEntries(previous.selectedChildIds.map((childId) => [childId, templateId])),
      childDrafts: Object.fromEntries((Object.entries(previous.childDrafts) as Array<[string, ChildDraft]>).map(([childId, draft]) => [
        childId,
        { ...draft, templateId, sectionAnswers: createSectionAnswers(template), skippedQuestionIds: [] },
      ])),
      childStepIds: {},
    }));
  };

  const recommendedTemplateForChild = (childId: string, date = wizard.date) => {
    if (!initialRecord) return UNIFIED_TEMPLATE;
    const plan = dailyChildPlans.find((candidate) => candidate.childId === childId && candidate.date === date);
    if (!plan) return templates.find((template) => template.id === wizard.selectedTemplateId) || templates[0];
    const preferredId = plan.recordFormat === '休日' ? 'template-holiday' : 'template-weekday';
    return templates.find((template) => template.id === preferredId)
      || templates.find((template) => template.type === plan.recordFormat)
      || templates.find((template) => template.id === wizard.selectedTemplateId)
      || templates[0];
  };

  const setChildTemplate = (childId: string, templateId: string) => {
    const template = templates.find((candidate) => candidate.id === templateId);
    if (!template) return;
    setWizard((previous) => ({
      ...previous,
      childTemplateIds: { ...previous.childTemplateIds, [childId]: templateId },
      childDrafts: {
        ...previous.childDrafts,
        [childId]: {
          ...(previous.childDrafts[childId] || createChildDraft(template)),
          templateId,
          sectionAnswers: createSectionAnswers(template),
          skippedQuestionIds: [],
        },
      },
      childStepIds: { ...previous.childStepIds, [childId]: 'attendance' },
    }));
  };

  const setRecordDate = (date: string) => {
    setWizard((previous) => {
      if (previous.selectedTemplateId === UNIFIED_TEMPLATE_ID) return { ...previous, date };
      const childTemplateIds = { ...previous.childTemplateIds };
      const childDrafts = { ...previous.childDrafts };
      previous.selectedChildIds.forEach((childId) => {
        const plan = dailyChildPlans.find((candidate) => candidate.childId === childId && candidate.date === date);
        if (!plan) return;
        const preferredId = plan.recordFormat === '休日' ? 'template-holiday' : 'template-weekday';
        const template = templates.find((candidate) => candidate.id === preferredId)
          || templates.find((candidate) => candidate.type === plan.recordFormat);
        if (!template || childTemplateIds[childId] === template.id) return;
        childTemplateIds[childId] = template.id;
        childDrafts[childId] = {
          ...(childDrafts[childId] || createChildDraft(template)),
          templateId: template.id,
          sectionAnswers: createSectionAnswers(template),
          skippedQuestionIds: [],
        };
      });
      return { ...previous, date, childTemplateIds, childDrafts };
    });
  };

  const toggleChild = (childId: string) => {
    if (initialRecord) return;
    const lockOwner = lockedChildren[`${wizard.date}:${childId}`];
    if (lockOwner) {
      setStepError(`${lockOwner}が同日の記録を入力中のため、この児童は選択できません。ホームから入力状況を確認できます。`);
      return;
    }
    setWizard((previous) => {
      const selected = previous.selectedChildIds.includes(childId);
      const selectedChildIds = selected
        ? previous.selectedChildIds.filter((id) => id !== childId)
        : [...previous.selectedChildIds, childId];
      const childDrafts = { ...previous.childDrafts };
      const childTemplateIds = { ...previous.childTemplateIds };
      const recommendedTemplate = recommendedTemplateForChild(childId, previous.date);
      if (!selected && !childTemplateIds[childId]) childTemplateIds[childId] = recommendedTemplate?.id || previous.selectedTemplateId;
      if (!selected && !childDrafts[childId]) childDrafts[childId] = createChildDraft(recommendedTemplate);
      const activeChildId = selected && previous.activeChildId === childId
        ? selectedChildIds[0] || ''
        : previous.activeChildId || childId;
      return { ...previous, selectedChildIds, activeChildId, childDrafts, childTemplateIds };
    });
  };

  const updateFieldAnswer = (
    sectionId: string,
    fieldId: string,
    updates: Partial<SectionFieldAnswer>,
  ) => {
    if (!wizard.activeChildId) return;
    updateChildDraft(wizard.activeChildId, (raw) => {
      const draft = unskip(raw, `field-${sectionId}-${fieldId}`);
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

  const updateABC = (
    sectionId: string,
    key: 'behavior' | 'consequence' | 'antecedent' | 'summary' | 'freeText',
    value: string,
  ) => {
    const section = activeChildDraft?.sectionAnswers[sectionId];
    updateSection(sectionId, {
      abcAnalysis: {
        inputMode: section?.abcAnalysis?.inputMode || 'abc',
        behavior: section?.abcAnalysis?.behavior || '',
        consequence: section?.abcAnalysis?.consequence || '',
        antecedent: section?.abcAnalysis?.antecedent || '',
        summary: section?.abcAnalysis?.summary || '',
        freeText: section?.abcAnalysis?.freeText || '',
        [key]: value,
      },
      ...(key === 'summary' || key === 'freeText' ? { detailText: value } : {}),
    });
  };

  const setABCInputMode = (sectionId: string, inputMode: 'abc' | 'free') => {
    const section = activeChildDraft?.sectionAnswers[sectionId];
    updateSection(sectionId, {
      abcAnalysis: {
        inputMode,
        behavior: section?.abcAnalysis?.behavior || '',
        consequence: section?.abcAnalysis?.consequence || '',
        antecedent: section?.abcAnalysis?.antecedent || '',
        summary: section?.abcAnalysis?.summary || '',
        freeText: section?.abcAnalysis?.freeText || '',
      },
      detailText: inputMode === 'free'
        ? section?.abcAnalysis?.freeText || ''
        : section?.abcAnalysis?.summary || '',
    });
  };

  const fieldForStep = (step: WizardStep, template = activeTemplate) => step.field || template?.sections
    .find((section) => section.id === step.sectionId)?.fields
    .find((field) => field.id === step.fieldId);

  const fieldIsVisible = (field: TemplateField, childDraft?: ChildDraft, sectionId?: string) => {
    const visibleConditions = field.visibleWhen
      ? Array.isArray(field.visibleWhen) ? field.visibleWhen : [field.visibleWhen]
      : [];
    const visible = visibleConditions.every((condition) => {
      const controllingValue = childDraft?.sectionAnswers[sectionId || '']?.answers[condition.fieldId]?.value;
      const expectedValues = Array.isArray(condition.equals) ? condition.equals : [condition.equals];
      return expectedValues.includes(controllingValue || '');
    });
    if (!visible) return false;
    if (/_study_attitude$/.test(field.id)) {
      const homeworkFieldId = field.id.replace(/_study_attitude$/, '_study_homework');
      const homeworkAnswer = childDraft?.sectionAnswers[sectionId || '']?.answers[homeworkFieldId];
      const homework = normalizeHomeworkDetails(homeworkAnswer?.homeworkDetails, homeworkAnswer?.value);
      if (
        homework.subjects.includes('その他')
        && HOMEWORK_OTHER_MODES.includes(homework.notes['その他区分'] as (typeof HOMEWORK_OTHER_MODES)[number])
      ) return false;
    }
    if (!field.hiddenWhen) return true;
    const hiddenConditions = Array.isArray(field.hiddenWhen) ? field.hiddenWhen : [field.hiddenWhen];
    const hidden = hiddenConditions.some((condition) => {
      const controllingValue = childDraft?.sectionAnswers[sectionId || '']?.answers[condition.fieldId]?.value;
      const expectedValues = Array.isArray(condition.equals) ? condition.equals : [condition.equals];
      return expectedValues.includes(controllingValue || '');
    });
    return !hidden;
  };

  const stepIsVisible = (step: WizardStep, childDraft?: ChildDraft, template = activeTemplate, childId = wizard.activeChildId) => {
    const dailyPlan = dailyChildPlans.find((plan) => plan.childId === childId && plan.date === wizard.date);
    if (dailyPlan && !isUnifiedTemplate(template)) {
      if (step.kind === 'snack' && !dailyPlan.hasSnack) return false;
      if (isStructuredHolidayTemplate(template)) {
        if (step.sectionId === 'morning' && !dailyPlan.hasMorningProgram) return false;
        if (step.sectionId === 'lunch' && !dailyPlan.hasLunch) return false;
        if (step.sectionId === 'afternoon' && !dailyPlan.hasAfternoonProgram) return false;
      }
    }
    if (
      childDraft?.attendance.includes('欠席')
      && !['attendance', 'review'].includes(step.kind)
    ) return false;
    if (step.kind !== 'field') return true;
    const field = fieldForStep(step, template);
    return field ? fieldIsVisible(field, childDraft, step.sectionId) : false;
  };

  const fieldAnswerIsComplete = (field: TemplateField, answer?: SectionFieldAnswer) => {
    if (!answer?.value?.trim()) return false;
    if (field.type === 'homework_subjects') {
      const homework = normalizeHomeworkDetails(answer.homeworkDetails, answer.value);
      return homework.subjects.length > 0 && homework.subjects.every((subject) =>
        HOMEWORK_ACADEMIC_SUBJECTS.includes(subject as (typeof HOMEWORK_ACADEMIC_SUBJECTS)[number])
          ? (homework.materials[subject] || []).length > 0
          : subject === 'その他'
            ? HOMEWORK_OTHER_MODES.includes(homework.notes['その他区分'] as (typeof HOMEWORK_OTHER_MODES)[number])
            : Boolean(homework.notes[subject]?.trim())
      );
    }
    if (field.type === 'study_extras') {
      const details = answer.nestedDetails || {};
      const selections = detailArray(details, 'selections');
      return selections.length > 0
        && (!selections.includes('漢検') || (
          Boolean(String(details.kankenGrade || '').trim())
          && detailArray(details, 'kankenActivities').length > 0
          && (!detailArray(details, 'kankenActivities').includes('その他') || Boolean(String(details.kankenOtherNote || '').trim()))
        ))
        && (!selections.includes('エジソン') || detailArray(details, 'edisonActivities').length > 0)
        && (!selections.includes('その他') || Boolean(String(details.otherNote || '').trim()));
    }
    if (field.type === 'pc_activities') {
      const details = answer.nestedDetails || {};
      const selections = detailArray(details, 'selections');
      const attempts = getMockExamAttempts(details);
      return selections.length > 0
        && (!selections.includes('Dレッスン') || detailArray(details, 'dLessonActivities').length > 0)
        && (!selections.includes('文章入力模擬試験') || attempts.every((attempt) =>
          Boolean(attempt.characterCount.trim()) && Boolean(attempt.pastRound.trim())
        ))
        && (!selections.includes('その他') || Boolean(String(details.otherNote || '').trim()));
    }
    if (field.type === 'meal_details') {
      const details = answer.nestedDetails || {};
      const portion = String(details.portion || '').trim();
      return Boolean(portion) && (portion === '食べていない' || Boolean(String(details.minutes || '').trim()));
    }
    if (field.type === 'hand_count' && answer.value !== 'タイピング練習に取り組んでいない') {
      const counts = parseHandCount(answer.value);
      return Boolean(counts.left) && Boolean(counts.right);
    }
    return true;
  };

  const answerStatus = (step: WizardStep, childDraft?: ChildDraft, template = activeTemplate): AnswerStatus => {
    if (!childDraft) return 'unanswered';
    if (childDraft.skippedQuestionIds.includes(step.id)) return 'skipped';
    const section = step.sectionId ? childDraft.sectionAnswers[step.sectionId] : undefined;
    switch (step.kind) {
      case 'attendance': return childDraft.attendance ? 'answered' : 'unanswered';
      case 'expression': return childDraft.expressions.length > 0 ? 'answered' : 'unanswered';
      case 'snack': return childDraft.snack ? 'answered' : 'unanswered';
      case 'section-subtitle': return section?.subTitleValue?.trim() ? 'answered' : 'unanswered';
      case 'field': {
        const field = fieldForStep(step, template);
        return field && fieldAnswerIsComplete(field, section?.answers?.[step.fieldId || ''])
          ? 'answered'
          : 'unanswered';
      }
      case 'abc-behavior': return section?.abcAnalysis?.behavior?.trim() ? 'answered' : 'unanswered';
      case 'abc-consequence': return section?.abcAnalysis?.consequence?.trim() ? 'answered' : 'unanswered';
      case 'abc-antecedent': return section?.abcAnalysis?.antecedent?.trim() ? 'answered' : 'unanswered';
      case 'abc-summary': return section?.abcAnalysis?.summary?.trim() ? 'answered' : 'unanswered';
      case 'abc-sequence':
        return section?.abcAnalysis?.inputMode === 'free'
          ? section.abcAnalysis.freeText?.trim() ? 'answered' : 'unanswered'
          : section?.abcAnalysis?.summary?.trim() ? 'answered' : 'unanswered';
      default: return 'answered';
    }
  };

  const perChildStepsFrom = (template?: Template, draft?: ChildDraft) => buildStepsForTemplate(template, draft)
    .filter((step) => !['template', 'children', 'date', 'recorder', 'modules', 'review'].includes(step.kind));
  const allPerChildSteps = perChildStepsFrom(activeTemplate, activeChildDraft);
  const pageGroupKey = (step?: WizardStep) => {
    if (!step) return '';
    if (isUnifiedTemplate(activeTemplate)) {
      if (step.kind === 'attendance' || step.kind === 'expression' || step.sectionId === 'life') return 'arrival';
      if (step.kind === 'modules') return 'modules';
      if (step.moduleId) return `module:${step.moduleId}`;
      return step.id;
    }
    if (!isStructuredWeekdayTemplate(activeTemplate) && !isStructuredHolidayTemplate(activeTemplate)) return step.id;
    if (['attendance', 'expression', 'field-life-fatigue'].includes(step.id)) return 'arrival';
    if (
      ['field-life-preparation', 'field-life-response_to_prompt'].includes(step.id)
      || (step.id === 'snack' && isStructuredWeekdayTemplate(activeTemplate))
    ) return 'readiness';
    if (step.kind === 'field' && /_study_(homework|attitude|extras|posture)$/.test(step.fieldId || '')) {
      return `${step.sectionId}:${(step.fieldId || '').replace(/_study_(homework|attitude|extras|posture)$/, '')}:study`;
    }
    if (step.kind === 'field' && /_pc_(content|finger|posture|transition)$/.test(step.fieldId || '')) {
      return `${step.sectionId}:${(step.fieldId || '').replace(/_pc_(content|finger|posture|transition)$/, '')}:pc`;
    }
    if (step.kind === 'field' && /_activity_(content|initiative)$/.test(step.fieldId || '')) {
      return `${step.sectionId}:activity`;
    }
    return step.id;
  };
  const pageTitle = (step?: WizardStep) => {
    const key = pageGroupKey(step);
    if (key === 'arrival') return '来所時の様子';
    if (key === 'modules') return '何を記録しますか？';
    if (key.startsWith('module:')) return step?.moduleType ? RECORD_MODULE_LABELS[step.moduleType] : '記録項目';
    if (key === 'readiness') return isStructuredWeekdayTemplate(activeTemplate)
      ? '準備・おやつ・声掛けへの反応'
      : '準備・声掛けへの反応';
    if (key.endsWith(':study')) return '学習の様子';
    if (key.endsWith(':pc')) return 'パソコン学習の様子';
    if (key.endsWith(':activity')) return '活動の様子';
    return step?.title || '';
  };
  const pageStepsFor = (step?: WizardStep, draft = activeChildDraft) => {
    if (!step) return [];
    const key = pageGroupKey(step);
    const visibleSteps = allPerChildSteps.filter((candidate) =>
      pageGroupKey(candidate) === key && stepIsVisible(candidate, draft)
    );
    const postureFirst = key.endsWith(':study')
      || key.endsWith(':pc')
      || (key.startsWith('module:') && (step.moduleType === 'study' || step.moduleType === 'pc'));
    if (!postureFirst) return visibleSteps;
    return [...visibleSteps].sort((left, right) => {
      const leftIsPosture = /_(study|pc)_posture$/.test(left.fieldId || '');
      const rightIsPosture = /_(study|pc)_posture$/.test(right.fieldId || '');
      return Number(rightIsPosture) - Number(leftIsPosture);
    });
  };
  const childStepsForDraft = (draft?: ChildDraft, childId = wizard.activeChildId) => {
    const template = templateForChild(childId);
    return perChildStepsFrom(template, draft).filter((step) => stepIsVisible(step, draft, template, childId));
  };
  const perChildSteps = childStepsForDraft(activeChildDraft, wizard.activeChildId);
  const unansweredForChild = (childId: string) => {
    const template = templateForChild(childId);
    return childStepsForDraft(wizard.childDrafts[childId], childId)
      .filter((step) => answerStatus(step, wizard.childDrafts[childId], template) === 'unanswered');
  };
  const skippedForChild = (childId: string) => {
    const template = templateForChild(childId);
    return childStepsForDraft(wizard.childDrafts[childId], childId)
      .filter((step) => answerStatus(step, wizard.childDrafts[childId], template) === 'skipped');
  };

  const currentPageSteps = pageStepsFor(currentStep);

  useEffect(() => {
    setExpandedGroupStepId(null);
  }, [currentStep?.id, wizard.activeChildId]);

  const groupedStepSummary = (step: WizardStep, status: AnswerStatus) => {
    if (status === 'skipped') return 'スキップ済み';
    const section = step.sectionId ? activeChildDraft?.sectionAnswers[step.sectionId] : undefined;
    let summary = '';
    if (step.kind === 'attendance') {
      summary = [activeChildDraft?.attendance, activeChildDraft?.attendanceNote].filter(Boolean).join('・');
    } else if (step.kind === 'expression') {
      summary = [...(activeChildDraft?.expressions || []), activeChildDraft?.expressionNote || ''].filter(Boolean).join('・');
    } else if (step.kind === 'snack') {
      summary = [activeChildDraft?.snack, activeChildDraft?.snackNote].filter(Boolean).join('・');
    } else if (step.kind === 'field') {
      const answer = section?.answers?.[step.fieldId || ''];
      summary = [answer?.value, answer?.note].filter(Boolean).join('・');
    }
    if (summary) return summary.length > 120 ? `${summary.slice(0, 120)}…` : summary;
    return /_(study|pc)_posture$/.test(step.fieldId || '')
      ? '変化があった時にすぐ入力できます'
      : 'タップして入力';
  };

  const questionIndexGroupLabel = (step: WizardStep) => {
    const key = pageGroupKey(step);
    if (key === 'arrival') return '来所時の様子';
    if (key.startsWith('module:')) return step.moduleType ? RECORD_MODULE_LABELS[step.moduleType] : '記録項目';
    if (key === 'readiness') return '生活の様子';
    const sectionTitle = activeTemplate?.sections.find((section) => section.id === step.sectionId)?.title;
    if (key.endsWith(':study')) return `${sectionTitle || ''}・学習`;
    if (key.endsWith(':pc')) return `${sectionTitle || ''}・パソコン`;
    if (key.endsWith(':activity')) return `${sectionTitle || ''}・活動`;
    if (step.sectionId === 'life') return '生活の様子';
    if (step.sectionId === 'lunch') return '昼食';
    if (step.kind === 'snack') return 'おやつ';
    if (step.kind === 'abc-sequence') return '特記';
    return sectionTitle || 'その他';
  };

  const draftPreviewLabel = (step: WizardStep) => {
    if (step.kind === 'attendance') return '本日の出欠';
    if (step.kind === 'expression') return '来所時の表情';
    if (step.kind === 'snack') return 'おやつ';
    if (step.kind === 'field') return fieldForStep(step)?.label.replace(/[【】]/g, '') || step.title;
    if (step.kind === 'section-subtitle') return step.title;
    if (step.kind === 'abc-behavior') return 'B（行動）';
    if (step.kind === 'abc-consequence') return 'C（結果）';
    if (step.kind === 'abc-antecedent') return 'A（きっかけ）';
    if (step.kind === 'abc-summary' || step.kind === 'abc-sequence') return '特記';
    return step.title;
  };

  const draftPreviewValue = (step: WizardStep, childDraft: ChildDraft | undefined, status: AnswerStatus) => {
    if (status === 'skipped') return 'スキップ済み';
    if (status === 'unanswered' || !childDraft) return '未回答';
    const section = step.sectionId ? childDraft.sectionAnswers[step.sectionId] : undefined;
    if (step.kind === 'attendance') {
      return [childDraft.attendance, childDraft.attendanceNote].filter(Boolean).join('・');
    }
    if (step.kind === 'expression') {
      return [...childDraft.expressions, childDraft.expressionNote || ''].filter(Boolean).join('・');
    }
    if (step.kind === 'snack') {
      return [childDraft.snack, childDraft.snackNote].filter(Boolean).join('・');
    }
    if (step.kind === 'section-subtitle') return section?.subTitleValue?.trim() || '未回答';
    if (step.kind === 'field') {
      const answer = section?.answers?.[step.fieldId || ''];
      return [answer?.value?.trim(), answer?.note?.trim()].filter(Boolean).join('\n') || '未回答';
    }
    const abc = section?.abcAnalysis;
    if (step.kind === 'abc-behavior') return abc?.behavior?.trim() || '未回答';
    if (step.kind === 'abc-consequence') return abc?.consequence?.trim() || '未回答';
    if (step.kind === 'abc-antecedent') return abc?.antecedent?.trim() || '未回答';
    if (step.kind === 'abc-summary') return abc?.summary?.trim() || '未回答';
    if (step.kind === 'abc-sequence') {
      if (abc?.inputMode === 'free') return abc.freeText?.trim() || '未回答';
      return abc?.summary?.trim() || [
        abc?.antecedent?.trim() ? `A：${abc.antecedent.trim()}` : '',
        abc?.behavior?.trim() ? `B：${abc.behavior.trim()}` : '',
        abc?.consequence?.trim() ? `C：${abc.consequence.trim()}` : '',
      ].filter(Boolean).join('\n') || '未回答';
    }
    return '回答済み';
  };

  const draftPreviewChildren = wizard.selectedChildIds.map<DraftPreviewChild>((childId) => {
    const childDraft = wizard.childDrafts[childId];
    const childTemplate = templateForChild(childId);
    const childSteps = childStepsForDraft(childDraft, childId);
    const entries = childSteps.map<DraftPreviewEntry>((step) => {
      const status = answerStatus(step, childDraft, childTemplate);
      return {
        id: step.id,
        label: draftPreviewLabel(step),
        value: draftPreviewValue(step, childDraft, status),
        status,
      };
    });
    const groups = entries.reduce<DraftPreviewGroup[]>((result, entry, index) => {
      const label = questionIndexGroupLabel(childSteps[index]);
      const group = result.find((item) => item.label === label);
      if (group) group.entries.push(entry);
      else result.push({ label, entries: [entry] });
      return result;
    }, []);
    return {
      id: childId,
      name: childrenList.find((child) => child.id === childId)?.name || '名称未登録',
      groups,
      answered: entries.filter((entry) => entry.status === 'answered').length,
      skipped: entries.filter((entry) => entry.status === 'skipped').length,
      total: entries.length,
    };
  });

  const readOnlyNavigationChildren = (() => {
    const byChildId = new Map<string, DraftPreviewNavigationChild>();
    readOnlyDrafts
      .filter((draft) => !wizard.date || !draft.date || draft.date === wizard.date)
      .forEach((draft) => {
        draft.selectedChildIds.forEach((childId) => {
          if (byChildId.has(childId)) return;
          byChildId.set(childId, {
            childId,
            childName: childrenList.find((child) => child.id === childId)?.name || '名称未登録',
            draftKey: draft.draftKey,
            ownerName: draft.recorderName,
          });
        });
      });
    return [
      ...childrenList.filter((child) => byChildId.has(child.id)).map((child) => byChildId.get(child.id)!),
      ...[...byChildId.values()].filter((item) => !childrenList.some((child) => child.id === item.childId)),
    ];
  })();

  if (readOnly) {
    return (
      <DraftProgressOverview
        loading={!draftReady}
        ownerName={readOnlyOwnerName}
        date={wizard.date}
        templateName={activeTemplate?.name}
        recorderName={wizard.recorderName}
        updatedAt={wizard.updatedAt}
        children={draftPreviewChildren}
        initialChildId={readOnlyInitialChildId}
        currentDraftKey={draftKey}
        navigationChildren={readOnlyNavigationChildren}
        onSelectNavigationChild={(item) => onReadOnlyDraftChange?.(item.draftKey, item.ownerName, item.childId)}
        onBack={onBackToRecordStatus}
      />
    );
  }

  const unansweredCount = perChildSteps.filter((step) => answerStatus(step, activeChildDraft) === 'unanswered').length;
  const skippedCount = perChildSteps.filter((step) => answerStatus(step, activeChildDraft) === 'skipped').length;
  const indexedQuestionSteps = questionIndexMode === 'unanswered'
    ? perChildSteps.filter((step) => answerStatus(step, activeChildDraft) === 'unanswered')
    : perChildSteps;
  const indexedQuestionGroups = indexedQuestionSteps.reduce<Array<{ label: string; steps: WizardStep[] }>>((groups, step) => {
    const label = questionIndexGroupLabel(step);
    const existing = groups.find((group) => group.label === label);
    if (existing) existing.steps.push(step);
    else groups.push({ label, steps: [step] });
    return groups;
  }, []).map((group) => ({
    ...group,
    steps: [...group.steps].sort((left, right) => {
      const leftIsPosture = /_(study|pc)_posture$/.test(left.fieldId || '');
      const rightIsPosture = /_(study|pc)_posture$/.test(right.fieldId || '');
      return Number(rightIsPosture) - Number(leftIsPosture);
    }),
  }));

  const getPreSaveChecks = (childIds = wizard.selectedChildIds): PreSaveCheck[] => {
    const checks: PreSaveCheck[] = [];
    childIds.forEach((childId) => {
      const childName = childrenList.find((child) => child.id === childId)?.name || '児童';
      const childTemplate = templateForChild(childId);
      const childPerSteps = perChildStepsFrom(childTemplate, wizard.childDrafts[childId]);
      const dailyPlan = dailyChildPlans.find((plan) => plan.childId === childId && plan.date === wizard.date);
      const draft = wizard.childDrafts[childId] || createChildDraft(childTemplate);
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
          stepId: unanswered[0]?.id,
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
          stepId: skipped[0]?.id,
        });
      }

      // 欠席時は出欠だけを記録対象とし、以降の必須項目を検査しない。
      if (draft.attendance.includes('欠席')) return;

      const sectionsToCheck = childTemplate
        ? [
            ...childTemplate.sections,
            ...(isUnifiedTemplate(childTemplate)
              ? draft.recordModules.map((module) => ({
                  id: moduleSectionId(module.id),
                  title: RECORD_MODULE_LABELS[module.type],
                  fields: fieldsForRecordModule(module.type),
                }))
              : []),
          ]
        : [];

      sectionsToCheck.forEach((section) => {
        if (isStructuredHolidayTemplate(childTemplate) && dailyPlan) {
          if (section.id === 'morning' && !dailyPlan.hasMorningProgram) return;
          if (section.id === 'lunch' && !dailyPlan.hasLunch) return;
          if (section.id === 'afternoon' && !dailyPlan.hasAfternoonProgram) return;
        }
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
              stepId,
            });
          }
          if (field.type === 'homework_subjects' && answer?.homeworkDetails) {
            const homework = normalizeHomeworkDetails(answer.homeworkDetails, answer.value);
            const incomplete = homework.subjects.filter((subject) =>
              HOMEWORK_ACADEMIC_SUBJECTS.includes(subject as (typeof HOMEWORK_ACADEMIC_SUBJECTS)[number])
                ? !(homework.materials[subject] || []).length
                : subject === 'その他'
                  ? !HOMEWORK_OTHER_MODES.includes(homework.notes['その他区分'] as (typeof HOMEWORK_OTHER_MODES)[number])
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
                stepId,
              });
            }
          }
          if (field.type === 'study_extras' && answer?.nestedDetails) {
            const details = answer.nestedDetails;
            const selections = detailArray(details, 'selections');
            const incomplete = [
              selections.includes('漢検') && !String(details.kankenGrade || '').trim() ? '漢検の級' : '',
              selections.includes('漢検') && detailArray(details, 'kankenActivities').length === 0 ? '漢検の取り組み内容' : '',
              selections.includes('漢検') && detailArray(details, 'kankenActivities').includes('その他') && !String(details.kankenOtherNote || '').trim() ? '漢検のその他内容' : '',
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
                stepId,
              });
            }
          }
          if (field.type === 'pc_activities' && answer?.nestedDetails) {
            const details = answer.nestedDetails;
            const selections = detailArray(details, 'selections');
            const incomplete = [
              selections.includes('Dレッスン') && detailArray(details, 'dLessonActivities').length === 0 ? 'Dレッスンの練習内容' : '',
              selections.includes('文章入力模擬試験') && getMockExamAttempts(details).some((attempt) => !attempt.characterCount.trim() || !attempt.pastRound.trim()) ? '模擬試験の文字数または過去問回' : '',
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
                stepId,
              });
            }
          }
          if (field.type === 'meal_details') {
            const details = answer?.nestedDetails || {};
            const portion = String(details.portion || '').trim();
            const missing = [
              portion !== '食べていない' && !String(details.minutes || '').trim() ? '食事時間' : '',
              !portion ? '食べた量' : '',
            ].filter(Boolean);
            if (missing.length > 0) {
              checks.push({
                id: `${childId}-${stepId}-meal-details`,
                childId,
                childName,
                level: 'warning',
                title: `${missing.join('・')}が未入力です`,
                detail: portion === '食べていない'
                  ? '食べた量を確認してください。食事時間は入力不要です。'
                  : '昼食の時間と食べた量を確認してください。',
                stepId,
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
                stepId,
              });
            }
          }
        });

        const abc = sectionAnswer?.abcAnalysis;
        if (abc?.inputMode === 'free') return;
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
            stepId: childPerSteps.find((step) => step.sectionId === section.id && step.kind.startsWith('abc'))?.id,
          });
        }
      });

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

  useEffect(() => {
    if (!pendingModuleStepId) return;
    const targetIndex = steps.findIndex((step) => step.id === pendingModuleStepId);
    if (targetIndex < 0) return;
    setPendingModuleStepId(null);
    moveToStep(targetIndex);
    // moveToStep intentionally follows the latest dynamic module step list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingModuleStepId, steps]);

  const moveToChildStep = (childId: string, stepId: string) => {
    const targetSteps = buildStepsForTemplate(templateForChild(childId), wizard.childDrafts[childId]);
    const targetIndex = targetSteps.findIndex((step) => step.id === stepId);
    if (targetIndex < 0) return;
    setStepError(null);
    setSaveError(null);
    setWizard((previous) => ({
      ...previous,
      activeChildId: childId,
      currentStepIndex: targetIndex,
      childStepIds: { ...previous.childStepIds, [childId]: stepId },
    }));
    document.getElementById('question-index')?.removeAttribute('open');
    document.getElementById('record-wizard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const switchChild = (childId: string) => {
    const rememberedStepId = wizard.childStepIds[childId];
    const firstUnanswered = unansweredForChild(childId)[0];
    const targetSteps = childStepsForDraft(wizard.childDrafts[childId], childId);
    const target = targetSteps.find((step) => step.id === rememberedStepId) || firstUnanswered || targetSteps[0];
    const targetTemplateSteps = buildStepsForTemplate(templateForChild(childId), wizard.childDrafts[childId]);
    const targetIndex = target ? targetTemplateSteps.findIndex((step) => step.id === target.id) : wizard.currentStepIndex;
    setStepError(null);
    setSaveError(null);
    setWizard((previous) => ({
      ...previous,
      activeChildId: childId,
      currentStepIndex: Math.max(0, targetIndex),
      childStepIds: target ? { ...previous.childStepIds, [childId]: target.id } : previous.childStepIds,
    }));
    document.getElementById('question-index')?.removeAttribute('open');
    document.getElementById('record-wizard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleChildTabDragStart = ({ active }: DragStartEvent) => {
    if (!reorderingChildTabs || editingDisabled) return;
    setDraggingChildId(String(active.id));
  };

  const handleChildTabDragEnd = ({ active, over }: DragEndEvent) => {
    setDraggingChildId(null);
    if (!over || editingDisabled || active.id === over.id) return;
    setWizard((previous) => {
      const sourceIndex = previous.selectedChildIds.indexOf(String(active.id));
      const targetIndex = previous.selectedChildIds.indexOf(String(over.id));
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return previous;
      return {
        ...previous,
        selectedChildIds: arrayMove(previous.selectedChildIds, sourceIndex, targetIndex),
      };
    });
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
    const error = readOnly ? null : validateGlobalStep();
    if (error) return setStepError(error);
    if (currentStep?.moduleId && isUnifiedTemplate(activeTemplate)) {
      const moduleMenuIndex = steps.findIndex((step) => step.kind === 'modules');
      if (moduleMenuIndex >= 0) {
        moveToStep(moduleMenuIndex);
        return;
      }
    }
    const currentChildSteps = childStepsForDraft(activeChildDraft, wizard.activeChildId);
    const currentChildStepIndex = currentStep ? currentChildSteps.findIndex((step) => step.id === currentStep.id) : -1;
    if (currentChildStepIndex === currentChildSteps.length - 1 && currentChildStepIndex >= 0 && wizard.selectedChildIds.length > 1) {
      const activeIndex = wizard.selectedChildIds.indexOf(wizard.activeChildId);
      const remainingIds = [...wizard.selectedChildIds.slice(activeIndex + 1), ...wizard.selectedChildIds.slice(0, activeIndex)];
      const nextChildId = remainingIds.find((id) => unansweredForChild(id).length > 0);
      if (nextChildId) {
        const firstUnanswered = unansweredForChild(nextChildId)[0];
        const nextSteps = buildStepsForTemplate(templateForChild(nextChildId), wizard.childDrafts[nextChildId]);
        setStepError(null);
        setWizard((previous) => ({
          ...previous,
          activeChildId: nextChildId,
          currentStepIndex: Math.max(0, nextSteps.findIndex((step) => step.id === firstUnanswered.id)),
          childStepIds: { ...previous.childStepIds, [nextChildId]: firstUnanswered.id },
        }));
        return;
      }
    }
    const currentPageLastIndex = Math.max(
      wizard.currentStepIndex,
      ...currentPageSteps.map((step) => steps.findIndex((candidate) => candidate.id === step.id)),
    );
    let targetIndex = currentPageLastIndex + 1;
    while (targetIndex < steps.length) {
      const target = steps[targetIndex];
      const targetIsChildStep = !['template', 'children', 'date', 'recorder', 'review'].includes(target.kind);
      if (!targetIsChildStep || stepIsVisible(target, activeChildDraft)) break;
      targetIndex += 1;
    }
    moveToStep(targetIndex);
  };

  const goToReview = () => {
    const reviewIndex = steps.findIndex((step) => step.kind === 'review');
    if (reviewIndex < 0) return;
    moveToStep(reviewIndex);
  };

  const goPrevious = () => {
    if (currentStep?.moduleId && isUnifiedTemplate(activeTemplate)) {
      const moduleMenuIndex = steps.findIndex((step) => step.kind === 'modules');
      if (moduleMenuIndex >= 0) {
        moveToStep(moduleMenuIndex);
        return;
      }
    }
    const currentPageFirstIndex = Math.min(
      wizard.currentStepIndex,
      ...currentPageSteps.map((step) => steps.findIndex((candidate) => candidate.id === step.id)),
    );
    let targetIndex = currentPageFirstIndex - 1;
    while (targetIndex >= 0) {
      const target = steps[targetIndex];
      const targetIsChildStep = !['template', 'children', 'date', 'recorder', 'review'].includes(target.kind);
      if (!targetIsChildStep || stepIsVisible(target, activeChildDraft)) break;
      targetIndex -= 1;
    }
    moveToStep(targetIndex);
  };

  const toggleStepSkipped = (stepId: string) => {
    if (!wizard.activeChildId) return;
    updateChildDraft(wizard.activeChildId, (draft) => ({
      ...draft,
      skippedQuestionIds: draft.skippedQuestionIds.includes(stepId)
        ? draft.skippedQuestionIds.filter((id) => id !== stepId)
        : [...draft.skippedQuestionIds, stepId],
    }));
  };

  const skipCurrent = () => {
    if (!isChildStep || !currentStep) return;
    toggleStepSkipped(currentStep.id);
    goNext();
  };

  const summarizeABC = async (sectionId: string) => {
    if (editingDisabled) return;
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

  const renderField = (field: TemplateField, sectionId: string, compact = false) => {
    const answer = activeChildDraft?.sectionAnswers[sectionId]?.answers[field.id] || { value: field.defaultValue || '', note: '' };
    const selectedValues = answer.value ? answer.value.split('、').filter(Boolean) : [];
    const postureField = /_(study|pc)_posture$/.test(field.id);
    const ratingField = field.type === 'rating_scale' || field.type === 'fatigue_scale';
    const ratingOptions = field.options?.length
      ? field.options
      : field.type === 'fatigue_scale'
        ? [...FATIGUE_SCALE_OPTIONS]
        : [];
    return (
      <div className="space-y-4">
        {ratingField && <div>
          <div className={compact ? 'grid grid-cols-5 gap-1.5' : 'grid gap-2'}>{ratingOptions.map((option) => {
            const [level, label] = option.split('：');
            const selected = answer.value === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => updateField(sectionId, field.id, option)}
                aria-label={option}
                aria-pressed={selected}
                className={`${compact ? 'flex min-h-12 flex-col items-center justify-center rounded-xl border-2 px-1 py-1.5 text-center' : 'flex min-h-14 items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left'} transition-all ${
                  selected
                    ? 'border-teal-600 bg-teal-600 text-white shadow-sm'
                    : 'border-slate-300 bg-white text-slate-700'
                  }`}
              >
                <span className={`${compact ? 'text-lg' : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg'} font-black ${selected && !compact ? 'bg-white/20' : !compact ? 'bg-slate-100 text-slate-900' : ''}`}>{level}</span>
                {!compact && <span className="text-sm font-bold leading-relaxed sm:text-base">{label || option}</span>}
              </button>
            );
          })}</div>
          {compact && answer.value && <p className="mt-2 rounded-lg bg-teal-50 px-3 py-2 text-xs font-bold leading-relaxed text-teal-900">{answer.value}</p>}
          {(field.scaleLowLabel || field.scaleHighLabel) && <div className="mt-2 flex justify-between gap-3 text-[11px] font-bold text-slate-500"><span>{field.scaleLowLabel}</span><span className="text-right">{field.scaleHighLabel}</span></div>}
        </div>}
        {field.type === 'radio' && !ratingField && field.options && !field.id.endsWith('_period3_type') && <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{field.options.map((option) => (
          <button key={option} type="button" onClick={() => updateField(sectionId, field.id, option)} className={`${choiceClass} ${answer.value === option ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}>
            {answer.value === option && <Check className="inline w-4 h-4 mr-1" />}{option}
          </button>
        ))}</div>}
        {field.type === 'radio' && field.id.endsWith('_period3_type') && (
          <ThirdPeriodInput
            answer={answer}
            onChange={(nextAnswer) => updateFieldAnswer(sectionId, field.id, nextAnswer)}
          />
        )}
        {field.type === 'checkbox' && !postureField && field.options && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{field.options.map((option) => {
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
        {(field.type === 'posture_observation' || postureField) && (
          <PostureObservationInput
            answer={answer}
            onChange={(nextAnswer) => updateFieldAnswer(sectionId, field.id, nextAnswer)}
          />
        )}
        {field.type === 'meal_details' && (
          <MealDetailsInput
            answer={answer}
            options={field.id === 'lunch_details'
              ? Array.from(new Set([...(field.options || []), '食べていない']))
              : field.options || ['完食', '半量食べた', '1/4食べた', '食べていない']}
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
        {field.hasNote
          && !['homework_subjects', 'study_extras', 'pc_activities', 'posture_observation', 'meal_details'].includes(field.type)
          && !postureField
          && !field.id.endsWith('_period3_type')
          && (!(field.noteVisibleWhen || /_(type)$/.test(field.id))
            || (Array.isArray(field.noteVisibleWhen || 'その他') ? field.noteVisibleWhen || ['その他'] : [field.noteVisibleWhen || 'その他']).includes(answer.value))
          && <PersistentNoteDetails hasContent={Boolean(answer.note)} summary={<>備考を入力（任意）{answer.note ? '・入力あり' : ''}</>}>
            <textarea rows={3} value={answer.note || ''} onChange={(event) => updateField(sectionId, field.id, answer.value, event.target.value)} placeholder={field.notePlaceholder || '補足事項を入力'} className={`${inputClass} mt-2`} />
          </PersistentNoteDetails>}
      </div>
    );
  };

  const renderGroupedQuestionBody = (step: WizardStep) => {
    if (step.kind === 'field') {
      const field = fieldForStep(step);
      return field && step.sectionId ? renderField(field, step.sectionId, true) : null;
    }
    if (step.kind === 'attendance') {
      return (
        <div className="min-w-0 max-w-full space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(wizardQuestions.attendance.options || []).map((item) => (
              <button key={item} type="button" onClick={() => setAttendance(item)} className={`${choiceClass} ${activeChildDraft?.attendance === item ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
                {activeChildDraft?.attendance === item && <Check className="mr-1 inline h-4 w-4" />}{item}
              </button>
            ))}
          </div>
          {activeChildDraft?.attendance.includes('欠席') && <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-bold leading-relaxed text-sky-900">欠席のため、この後の支援中の質問は省略されます。</p>}
          <PersistentNoteDetails hasContent={Boolean(activeChildDraft?.attendanceNote)} summary={<>出欠の備考（任意）{activeChildDraft?.attendanceNote ? '・入力あり' : ''}</>}>
            <textarea rows={2} value={activeChildDraft?.attendanceNote || ''} onChange={(event) => updateChildDraft(wizard.activeChildId, (draft) => ({ ...unskip(draft, 'attendance'), attendanceNote: event.target.value }))} placeholder={wizardQuestions.attendance.notePlaceholder} className={`${inputClass} mt-2`} />
          </PersistentNoteDetails>
        </div>
      );
    }
    if (step.kind === 'expression') {
      const options = wizardQuestions.expression.options || [];
      const selectedValue = activeChildDraft?.expressions[0] || '';
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-5 gap-1.5">
            {options.map((item) => {
              const [level] = item.split('：');
              const selected = selectedValue === item;
              return <button key={item} type="button" aria-label={item} aria-pressed={selected} onClick={() => updateChildDraft(wizard.activeChildId, (raw) => ({ ...unskip(raw, 'expression'), expressions: [item] }))} className={`min-h-12 rounded-xl border-2 text-lg font-black ${selected ? 'border-amber-500 bg-amber-500 text-slate-950' : 'border-slate-300 bg-white text-slate-700'}`}>{level || item}</button>;
            })}
          </div>
          {selectedValue && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold leading-relaxed text-amber-950">{selectedValue}</p>}
          <div className="flex justify-between text-[11px] font-bold text-slate-500"><span>1：暗い表情</span><span>5：笑顔</span></div>
          <PersistentNoteDetails hasContent={Boolean(activeChildDraft?.expressionNote)} summary={<>表情の備考（任意）{activeChildDraft?.expressionNote ? '・入力あり' : ''}</>}>
            <textarea rows={2} value={activeChildDraft?.expressionNote || ''} onChange={(event) => updateChildDraft(wizard.activeChildId, (draft) => ({ ...unskip(draft, 'expression'), expressionNote: event.target.value }))} placeholder={wizardQuestions.expression.notePlaceholder} className={`${inputClass} mt-2`} />
          </PersistentNoteDetails>
        </div>
      );
    }
    if (step.kind === 'snack') {
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(wizardQuestions.snack.options || []).map((item) => (
              <button key={item} type="button" onClick={() => updateChildDraft(wizard.activeChildId, (draft) => ({ ...unskip(draft, 'snack'), snack: item }))} className={`${choiceClass} ${activeChildDraft?.snack === item ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
                {activeChildDraft?.snack === item && <Check className="mr-1 inline h-4 w-4" />}{item}
              </button>
            ))}
          </div>
          <PersistentNoteDetails hasContent={Boolean(activeChildDraft?.snackNote)} summary={<>おやつの備考（任意）{activeChildDraft?.snackNote ? '・入力あり' : ''}</>}>
            <textarea rows={2} value={activeChildDraft?.snackNote || ''} onChange={(event) => updateChildDraft(wizard.activeChildId, (draft) => ({ ...unskip(draft, 'snack'), snackNote: event.target.value }))} placeholder={wizardQuestions.snack.notePlaceholder} className={`${inputClass} mt-2`} />
          </PersistentNoteDetails>
        </div>
      );
    }
    return null;
  };

  const renderStep = () => {
    if (!currentStep) return null;
    if (currentPageSteps.length > 1) {
      return (
        <div className="space-y-3">
          {currentPageSteps.map((step) => {
            const status = answerStatus(step, activeChildDraft);
            const field = fieldForStep(step);
            const postureQuestion = step.kind === 'field' && /_(study|pc)_posture$/.test(step.fieldId || '');
            const expanded = expandedGroupStepId === step.id;
            const summary = groupedStepSummary(step, status);
            if (postureQuestion) {
              return (
                <section key={step.id} id={`group-question-${step.id}`} className="min-w-0 max-w-full rounded-2xl border-2 border-teal-400 bg-teal-50/60 p-3 shadow-sm sm:p-4">
                  <div className="mb-3 flex min-w-0 items-start gap-2">
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${status === 'answered' ? 'bg-emerald-600 text-white' : 'bg-teal-600 text-white'}`}>{status === 'answered' ? <Check className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5"><strong className="text-sm leading-relaxed text-slate-900">{step.title}</strong><span className="rounded-full bg-teal-600 px-2 py-0.5 text-[9px] font-black text-white">常時入力</span></span>
                      <span className={`block max-w-full overflow-hidden break-all text-[11px] leading-relaxed [overflow-wrap:anywhere] ${status === 'answered' ? 'font-bold text-emerald-800' : 'font-medium text-slate-500'}`}>{summary}</span>
                    </span>
                  </div>
                  {renderGroupedQuestionBody(step)}
                </section>
              );
            }
            return (
              <section
                key={step.id}
                id={`group-question-${step.id}`}
                className={`min-w-0 max-w-full overflow-hidden rounded-2xl border-2 shadow-sm ${
                  status === 'answered'
                      ? 'border-emerald-300 bg-emerald-50/40'
                      : status === 'skipped'
                        ? 'border-slate-300 bg-slate-50'
                        : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-stretch">
                  <button type="button" aria-expanded={expanded} onClick={() => setExpandedGroupStepId(expanded ? null : step.id)} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${status === 'answered' ? 'bg-emerald-600 text-white' : status === 'skipped' ? 'bg-slate-400 text-white' : 'bg-slate-100 text-slate-500'}`}>{status === 'answered' ? <Check className="h-4 w-4" /> : status === 'skipped' ? <SkipForward className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <strong className="text-sm leading-relaxed text-slate-900">{step.title}</strong>
                      </span>
                      <span className={`block max-w-full overflow-hidden break-all text-[11px] leading-relaxed [overflow-wrap:anywhere] ${status === 'answered' ? 'font-bold text-emerald-800' : 'font-medium text-slate-500'}`}>{summary}</span>
                    </span>
                    <ChevronRight className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                  </button>
                </div>
                {expanded && (
                  <div className="min-w-0 max-w-full space-y-3 border-t border-slate-200 bg-white p-3 sm:p-4">
                    {field?.warningText && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-black leading-relaxed text-rose-700">{field.warningText}</p>}
                    {step.help && <p className="text-xs leading-relaxed text-slate-500">{step.help}</p>}
                    {renderGroupedQuestionBody(step)}
                    {!editingDisabled && (
                      <div className="flex justify-end border-t border-slate-100 pt-3">
                        <button type="button" onClick={() => toggleStepSkipped(step.id)} className={`min-h-10 rounded-lg border px-3 text-xs font-black ${status === 'skipped' ? 'border-slate-400 bg-slate-100 text-slate-700' : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50'}`}>
                          {status === 'skipped' ? '回答する項目に戻す' : 'この項目をスキップ'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      );
    }
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
          const dayEvents = calendarEvents.filter((event) => calendarEventOccursOn(event, wizard.date));
          const dayPlans = dailyChildPlans.filter((plan) => plan.date === wizard.date);
          const overriddenChildIds = new Set(dayPlans.map((plan) => plan.childId));
          const plannedChildIds = new Set([
            ...dayEvents.filter((event) => ['追加利用', '通常利用'].includes(event.eventType)).flatMap((event) => event.childIds),
            ...dayPlans.filter((plan) => plan.attendancePlan !== '欠席').map((plan) => plan.childId),
          ]);
          const absentChildIds = new Set([
            ...dayEvents.filter((event) => event.eventType === '欠席').flatMap((event) => event.childIds).filter((childId) => !overriddenChildIds.has(childId)),
            ...dayPlans.filter((plan) => plan.attendancePlan === '欠席').map((plan) => plan.childId),
          ]);
          const regularChildren = childrenList.filter((child) => {
            const regularDays = getRegularDaysForDate(child, wizard.date);
            return !absentChildIds.has(child.id) && (plannedChildIds.has(child.id) || !regularDays.length || regularDays.includes(targetWeekday));
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
              <strong>{wizard.date}（{targetWeekday}）の利用予定児童</strong>
              <p className="mt-1 text-xs text-teal-700">定期利用に追加利用を加え、カレンダーで欠席登録された児童を除いています。</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pr-1">
              {displayedChildren.map((child) => {
                const selected = wizard.selectedChildIds.includes(child.id);
                const dayPlan = dayPlans.find((plan) => plan.childId === child.id);
                const isAdditional = dayPlan?.attendancePlan === '追加利用' || plannedChildIds.has(child.id) || additionalSelected.some((item) => item.id === child.id);
                const lockOwner = lockedChildren[`${wizard.date}:${child.id}`];
                const planSummary = dayPlan
                  ? [dayPlan.hasLunch && '昼食', dayPlan.hasSnack && 'おやつ', dayPlan.arrivalTime && `来所 ${dayPlan.arrivalTime}`].filter(Boolean).join('・') || '日別予定あり'
                  : isAdditional ? '追加利用' : formatRegularDays(getRegularDaysForDate(child, wizard.date));
                return <button key={child.id} type="button" disabled={Boolean(initialRecord) || Boolean(lockOwner)} onClick={() => toggleChild(child.id)} className={`${choiceClass} flex items-center justify-between text-left ${selected ? 'bg-teal-600 border-teal-600 text-white' : lockOwner ? 'border-amber-300 bg-amber-50 text-amber-900' : 'bg-white border-slate-300 text-slate-700'} disabled:opacity-80`}><span>{child.name}<span className="block text-[11px] font-normal opacity-75">{lockOwner ? `${lockOwner}が入力中` : `${calculateSchoolGrade(child.birthDate) || child.grade || '学年未設定'}・${planSummary}`}</span></span>{selected && <Check className="w-5 h-5" />}</button>;
              })}
            </div>
            {displayedChildren.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">この曜日の定期利用児童は登録されていません。</p>}
            {wizard.selectedChildIds.length > 0 && !isUnifiedTemplate(activeTemplate) && (
              <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-3">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
                  <div>
                    <h3 className="text-xs font-black text-violet-950">児童ごとの記録形式</h3>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-violet-800">日別予定がある児童は当日の流れから自動選択しています。平日・休日が混在しても一緒に入力できます。</p>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {wizard.selectedChildIds.map((childId) => {
                    const child = childrenList.find((candidate) => candidate.id === childId);
                    const plan = dailyChildPlans.find((candidate) => candidate.childId === childId && candidate.date === wizard.date);
                    const childTemplate = templateForChild(childId);
                    return (
                      <div key={childId} className="flex flex-col gap-2 rounded-xl border border-violet-100 bg-white p-3 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-slate-900">{child?.name || '児童'}</p>
                          <p className="mt-0.5 text-[10px] text-slate-500">{plan ? `当日予定：${[
                            plan.hasMorningProgram && '午前',
                            plan.hasLunch && '昼食',
                            plan.hasAfternoonProgram && '午後',
                            plan.hasSnack && 'おやつ',
                          ].filter(Boolean).join('・') || '個別予定'}` : '日別変更なし'}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 sm:w-52">
                          {(['平日', '休日'] as const).map((type) => {
                            const template = templates.find((candidate) => candidate.id === (type === '平日' ? 'template-weekday' : 'template-holiday'))
                              || templates.find((candidate) => candidate.type === type);
                            if (!template) return null;
                            const selected = childTemplate?.id === template.id;
                            return <button key={type} type="button" onClick={() => setChildTemplate(childId, template.id)} className={`min-h-10 rounded-lg border px-2 text-xs font-black ${selected ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{type}形式</button>;
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
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
                        const lockOwner = lockedChildren[`${wizard.date}:${child.id}`];
                        return <button key={child.id} type="button" disabled={Boolean(lockOwner)} onClick={() => toggleChild(child.id)} className={`w-full min-h-14 rounded-xl border p-3 text-left flex items-center gap-3 disabled:opacity-80 ${selected ? 'border-teal-500 bg-teal-50 text-teal-900' : lockOwner ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-700'}`}><span className={`h-6 w-6 shrink-0 rounded-md border flex items-center justify-center ${selected ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300'}`}>{selected && <Check className="w-4 h-4" />}</span><span><strong className="block text-sm">{child.name}</strong><span className="text-[11px] text-slate-500">{lockOwner ? `${lockOwner}が入力中` : `${calculateSchoolGrade(child.birthDate) || child.grade || '学年未設定'}・${wizard.date}時点の定期利用 ${formatRegularDays(getRegularDaysForDate(child, wizard.date))}`}</span></span></button>;
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
      case 'date': return <input type="date" value={wizard.date} onChange={(event) => setRecordDate(event.target.value)} className={inputClass} />;
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
            {recorderProfiles.length === 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                記録者名簿がまだ登録されていません。「職員」画面から管理者または児発管が登録してください。
              </div>
            )}
          </div>
        );
      }
      case 'modules': {
        const dailyPlan = dailyChildPlans.find((plan) => plan.childId === wizard.activeChildId && plan.date === wizard.date);
        const moduleTypes: Array<{ type: RecordModuleType; icon: React.ComponentType<{ className?: string }>; hint: string }> = [
          { type: 'study', icon: BookOpen, hint: '宿題・姿勢・宿題以外' },
          { type: 'pc', icon: Monitor, hint: 'PC課題・指使い・姿勢' },
          { type: 'certification', icon: Award, hint: '漢検などの検定' },
          { type: 'activity', icon: Palette, hint: '活動内容・積極性' },
          { type: 'lunch', icon: Utensils, hint: '食事量・時間・備考' },
          { type: 'snack', icon: NotebookPen, hint: 'おやつの状況・備考' },
          { type: 'special', icon: Sparkles, hint: 'ABC整理または自由記入' },
          { type: 'other', icon: NotebookPen, hint: 'ほかに残したい記録' },
        ];
        const recommended = new Set<RecordModuleType>([
          ...(dailyPlan?.hasLunch ? ['lunch' as const] : []),
          ...(dailyPlan?.hasSnack ? ['snack' as const] : []),
        ]);
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {moduleTypes.map(({ type, icon: Icon, hint }) => {
                const count = activeChildDraft?.recordModules.filter((module) => module.type === type).length || 0;
                const singleExisting = count > 0 && SINGLE_RECORD_MODULES.has(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => addRecordModule(type)}
                    className={`relative min-h-28 rounded-2xl border-2 p-3 text-left transition-all active:scale-[0.98] ${count ? 'border-teal-400 bg-teal-50' : 'border-slate-200 bg-white'}`}
                  >
                    <span className={`grid h-10 w-10 place-items-center rounded-xl ${count ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700'}`}><Icon className="h-5 w-5" /></span>
                    <strong className="mt-2 block text-sm text-slate-950">{RECORD_MODULE_LABELS[type]}</strong>
                    <span className="mt-0.5 block text-[10px] leading-relaxed text-slate-500">{singleExisting ? '入力内容を開く' : hint}</span>
                    {count > 0 && <span className="absolute right-2 top-2 rounded-full bg-teal-700 px-2 py-0.5 text-[9px] font-black text-white">{count}件</span>}
                    {recommended.has(type) && count === 0 && <span className="absolute right-2 top-2 rounded-full bg-amber-300 px-2 py-0.5 text-[9px] font-black text-amber-950">本日の予定</span>}
                  </button>
                );
              })}
            </div>

            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900">追加した記録項目</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">実際に行った順に並べられます。</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-600">{activeChildDraft?.recordModules.length || 0}件</span>
              </div>
              {!activeChildDraft?.recordModules.length ? (
                <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm font-bold text-slate-500">上の項目をタップして追加してください。</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {activeChildDraft.recordModules.map((module, index) => {
                    const moduleSteps = steps.filter((step) => step.moduleId === module.id);
                    const answered = moduleSteps.filter((step) => answerStatus(step, activeChildDraft) === 'answered').length;
                    const complete = moduleSteps.length > 0 && answered === moduleSteps.length;
                    return (
                      <article key={module.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${complete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{complete ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4" />}</span>
                        <button type="button" onClick={() => openRecordModule(module)} className="min-w-0 flex-1 text-left">
                          <strong className="block truncate text-sm text-slate-900">{RECORD_MODULE_LABELS[module.type]}{activeChildDraft.recordModules.filter((item) => item.type === module.type).length > 1 ? ` ${activeChildDraft.recordModules.filter((item) => item.type === module.type).indexOf(module) + 1}` : ''}</strong>
                          <span className={`text-[10px] font-bold ${complete ? 'text-emerald-700' : 'text-amber-700'}`}>{complete ? '入力済み' : '入力を確認'}</span>
                        </button>
                        <button type="button" disabled={index === 0} onClick={() => moveRecordModule(module.id, -1)} aria-label="1つ上へ" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-25"><ArrowUp className="h-4 w-4" /></button>
                        <button type="button" disabled={index === activeChildDraft.recordModules.length - 1} onClick={() => moveRecordModule(module.id, 1)} aria-label="1つ下へ" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-25"><ArrowDown className="h-4 w-4" /></button>
                        <button type="button" onClick={() => removeRecordModule(module.id)} aria-label="記録項目を削除" className="grid h-9 w-9 place-items-center rounded-lg border border-rose-200 text-rose-600"><Trash2 className="h-4 w-4" /></button>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        );
      }
      case 'attendance':
        return <div className="space-y-4"><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{(wizardQuestions.attendance.options || []).map((item) => <button key={item} type="button" onClick={() => setAttendance(item)} className={`${choiceClass} ${activeChildDraft?.attendance === item ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}>{activeChildDraft?.attendance === item && <Check className="inline w-4 h-4 mr-1" />}{item}</button>)}</div>{activeChildDraft?.attendance.includes('欠席') && <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-bold leading-relaxed text-sky-900">欠席のため、この後の支援中の質問は省略されます。備考を確認して「次の質問」を押してください。</p>}<label className="block text-sm font-bold text-slate-700">{wizardQuestions.attendance.noteLabel}<textarea rows={3} value={activeChildDraft?.attendanceNote || ''} onChange={(event) => updateChildDraft(wizard.activeChildId, (draft) => ({ ...unskip(draft, currentStep.id), attendanceNote: event.target.value }))} placeholder={wizardQuestions.attendance.notePlaceholder} className={`${inputClass} mt-2`} /></label></div>;
      case 'expression':
        return <div className="space-y-4"><div className={isStructuredWeekdayTemplate(activeTemplate) || isStructuredHolidayTemplate(activeTemplate) ? 'grid gap-2' : 'grid grid-cols-2 gap-2 sm:grid-cols-3'}>{(wizardQuestions.expression.options || []).map((item) => {
          const selected = activeChildDraft?.expressions.includes(item);
          if (isStructuredWeekdayTemplate(activeTemplate) || isStructuredHolidayTemplate(activeTemplate)) {
            const [level, description] = item.split('：');
            return <button key={item} type="button" onClick={() => updateChildDraft(wizard.activeChildId, (raw) => ({ ...unskip(raw, currentStep.id), expressions: [item] }))} className={`flex min-h-14 items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left ${selected ? 'border-amber-500 bg-amber-50 text-amber-950' : 'border-slate-300 bg-white text-slate-700'}`}><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-black ${selected ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-900'}`}>{level}</span><span className="text-sm font-bold leading-relaxed sm:text-base">{description}</span>{selected && <Check className="ml-auto h-5 w-5 shrink-0" />}</button>;
          }
          return <button key={item} type="button" onClick={() => updateChildDraft(wizard.activeChildId, (raw) => { const draft = unskip(raw, currentStep.id); return { ...draft, expressions: selected ? draft.expressions.filter((value) => value !== item) : [...draft.expressions, item] }; })} className={`${choiceClass} ${selected ? 'bg-amber-500 border-amber-500 text-slate-950' : 'bg-white border-slate-300 text-slate-700'}`}>{selected && <Check className="inline w-4 h-4 mr-1" />}{item}</button>;
        })}</div>{(isStructuredWeekdayTemplate(activeTemplate) || isStructuredHolidayTemplate(activeTemplate)) && <div className="flex justify-between text-[11px] font-bold text-slate-500"><span>1：暗い表情</span><span>5：笑顔</span></div>}<label className="block text-sm font-bold text-slate-700">{wizardQuestions.expression.noteLabel}<textarea rows={3} value={activeChildDraft?.expressionNote || ''} onChange={(event) => updateChildDraft(wizard.activeChildId, (draft) => ({ ...unskip(draft, currentStep.id), expressionNote: event.target.value }))} placeholder={wizardQuestions.expression.notePlaceholder} className={`${inputClass} mt-2`} /></label></div>;
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
        if (abc?.inputMode === 'free') {
          return (
            <div className="space-y-4">
              <ABCModeSelector mode="free" onChange={(mode) => setABCInputMode(currentStep.sectionId!, mode)} />
              <label className="block text-sm font-black text-slate-800">
                児童の様子・特記事項を自由に入力してください。
                <span className="mt-1 block text-xs font-medium leading-relaxed text-slate-500">
                  ABCの各要素やAI要約を使わず、この文章をそのまま特記として保存します。
                </span>
                <textarea
                  rows={12}
                  maxLength={3000}
                  value={abc.freeText || ''}
                  onChange={(event) => updateABC(currentStep.sectionId!, 'freeText', event.target.value)}
                  placeholder="児童の様子、支援内容、その後の結果などを自由に入力"
                  className={`${inputClass} mt-2`}
                />
              </label>
              <p className="text-right text-[11px] text-slate-400">{abc.freeText?.length || 0} / 3000文字</p>
            </div>
          );
        }
        return (
          <div className="space-y-5">
            <ABCModeSelector mode="abc" onChange={(mode) => setABCInputMode(currentStep.sectionId!, mode)} />
            <section className={`rounded-2xl border-2 p-4 transition-colors ${behaviorReady ? 'border-emerald-300 bg-emerald-50/70' : 'border-violet-400 bg-violet-50'}`}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="rounded-full bg-violet-700 px-3 py-1 text-xs font-black text-white">B（行動）</span>
                <span className={`flex items-center gap-1 text-xs font-black ${behaviorReady ? 'text-emerald-700' : 'text-violet-700'}`}>
                  {behaviorReady && <Check className="h-4 w-4" />}
                  {behaviorReady ? '入力済み' : 'ここから入力'}
                </span>
              </div>
              <label className="block text-sm font-black text-slate-800">
                {behaviorQuestion.title}
                <span className="mt-1 block text-xs font-medium leading-relaxed text-slate-500">{behaviorQuestion.help}</span>
                <textarea rows={5} maxLength={500} value={abc?.behavior || ''} onChange={(event) => updateABC(currentStep.sectionId!, 'behavior', event.target.value)} placeholder={'・席を立ち、入口へ向かった\n・「やりたくない」と大きな声で話した'} className={`${inputClass} mt-2`} />
              </label>
            </section>
            {behaviorReady && (
              <section className={`wizard-reveal rounded-2xl border-2 p-4 ${consequenceReady ? 'border-emerald-300 bg-emerald-50/70' : 'border-sky-500 bg-sky-50 shadow-md shadow-sky-100'}`}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="rounded-full bg-sky-700 px-3 py-1 text-xs font-black text-white">C（結果）</span>
                  <span className={`flex items-center gap-1 text-xs font-black ${consequenceReady ? 'text-emerald-700' : 'text-sky-800'}`}>
                    {consequenceReady && <Check className="h-4 w-4" />}
                    {consequenceReady ? '入力済み' : '次に入力'}
                  </span>
                </div>
                <label className="block text-sm font-black text-slate-800">
                  {consequenceQuestion.title}
                  <span className="mt-1 block text-xs font-medium leading-relaxed text-slate-500">{consequenceQuestion.help}</span>
                  <textarea rows={5} maxLength={500} value={abc?.consequence || ''} onChange={(event) => updateABC(currentStep.sectionId!, 'consequence', event.target.value)} placeholder={'・職員が選択肢を示すと席へ戻った\n・5分後に課題を再開した'} className={`${inputClass} mt-2 border-sky-300 ring-2 ring-sky-100`} />
                </label>
              </section>
            )}
            {behaviorReady && consequenceReady && (
              <section className={`wizard-reveal rounded-2xl border-2 p-4 ${antecedentReady ? 'border-emerald-300 bg-emerald-50/70' : 'border-amber-500 bg-amber-50 shadow-md shadow-amber-100'}`}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="rounded-full bg-amber-700 px-3 py-1 text-xs font-black text-white">A（きっかけ）</span>
                  <span className={`flex items-center gap-1 text-xs font-black ${antecedentReady ? 'text-emerald-700' : 'text-amber-900'}`}>
                    {antecedentReady && <Check className="h-4 w-4" />}
                    {antecedentReady ? '入力済み' : '次に入力'}
                  </span>
                </div>
                <label className="block text-sm font-black text-slate-800">
                  {antecedentQuestion.title}
                  <span className="mt-1 block text-xs font-medium leading-relaxed text-slate-500">{antecedentQuestion.help}</span>
                  <textarea rows={5} maxLength={500} value={abc?.antecedent || ''} onChange={(event) => updateABC(currentStep.sectionId!, 'antecedent', event.target.value)} placeholder={'・難しい課題へ切り替わった直後\n・周囲の音が大きくなった'} className={`${inputClass} mt-2 border-amber-300 ring-2 ring-amber-100`} />
                </label>
              </section>
            )}
            {behaviorReady && consequenceReady && antecedentReady && (
              <div className="wizard-reveal space-y-4 rounded-2xl border-2 border-violet-400 bg-violet-50 p-4 shadow-md shadow-violet-100">
                <p className="flex items-center gap-2 text-sm font-black text-violet-900"><Check className="h-5 w-5 text-emerald-600" />A・B・Cの入力がそろいました。内容を要約できます。</p>
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
            getTemplateForChild={templateForChild}
            getStepsForChild={(childId) => childStepsForDraft(wizard.childDrafts[childId], childId)}
            answerStatus={(childId, step, draft) => answerStatus(step, draft, templateForChild(childId))}
            checks={getPreSaveChecks()}
            checksAcknowledged={checksAcknowledged}
            onChecksAcknowledged={setChecksAcknowledged}
            onJump={moveToChildStep}
            onSaveChild={(childId) => void saveChildRecord(childId)}
            savingChildId={savingChildId}
            saveDisabled={editingDisabled || isSaving}
          />
        );
      default: return null;
    }
  };

  const buildRecordForChild = (childId: string, now: string): SupportRecord => {
    const childTemplate = templateForChild(childId);
    if (!childTemplate) throw new Error('テンプレートを確認してください。');
    const child = childrenList.find((item) => item.id === childId);
    const childDraft = wizard.childDrafts[childId] || createChildDraft(childTemplate);
    const previous = initialRecord?.childId === childId ? initialRecord : undefined;
    const sectionAnswers = isUnifiedTemplate(childTemplate)
      ? withRecordModuleMetadata(childDraft.sectionAnswers, childDraft.recordModules)
      : childDraft.sectionAnswers;
    const record = {
      id: childDraft.recordId,
      templateId: childTemplate.id,
      templateName: childTemplate.name,
      templateType: childTemplate.type,
      templateSectionsSnapshot: childTemplate.sections,
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
      sectionAnswers,
      skippedQuestionIds: childDraft.skippedQuestionIds,
      approvalStatus: previous?.approvalStatus === '要修正' ? '未確認' : previous?.approvalStatus || '未確認',
      jihatsukanComment: previous?.jihatsukanComment,
      reviewIssues: previous?.reviewIssues?.map((issue) => ({
        ...issue,
        resolved: resolvedIssueId ? issue.resolved || issue.id === resolvedIssueId : true,
      })),
      reviewedBy: previous?.reviewedBy,
      reviewedAt: previous?.reviewedAt,
      version: previous?.version,
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    } satisfies SupportRecord;
    return isUnifiedTemplate(childTemplate)
      ? { ...record, synthesizedSummary: generateUnifiedRecordSummary(record) }
      : isStructuredWeekdayTemplate(childTemplate)
      ? { ...record, synthesizedSummary: generateStructuredWeekdaySummary(record) }
      : isStructuredHolidayTemplate(childTemplate)
        ? { ...record, synthesizedSummary: generateStructuredHolidaySummary(record) }
        : record;
  };

  const saveChildRecord = async (childId: string) => {
    if (editingDisabled || !templateForChild(childId) || savingChildId) return;
    setSaveError(null);
    if (!wizard.date || !wizard.recorderName.trim()) {
      setSaveError('日付と記録者を確認してください。');
      return;
    }
    const checks = getPreSaveChecks([childId]);
    const errors = checks.filter((check) => check.level === 'error');
    const notices = checks.filter((check) => check.level !== 'error');
    if (errors.length > 0) {
      setSaveError(`この児童に保存できない項目が${errors.length}件あります。赤色の点検結果を修正してください。`);
      return;
    }
    if (notices.length > 0 && !checksAcknowledged) {
      setSaveError('この児童の注意事項を確認し、「点検結果を確認しました」にチェックしてください。');
      return;
    }

    const remainingChildIds = wizard.selectedChildIds.filter((id) => id !== childId);
    setSavingChildId(childId);
    try {
      await onSaveRecords(
        [buildRecordForChild(childId, new Date().toISOString())],
        { keepFormOpen: remainingChildIds.length > 0 },
      );
      if (remainingChildIds.length === 0) {
        draftCleared.current = true;
        remoteRevision.current = null;
        localStorage.removeItem(storageKey);
        if (organizationId) await deleteRecordDraft(organizationId, draftKey);
        onDraftChanged?.();
        return;
      }
      setWizard((previous) => {
        const childDrafts = { ...previous.childDrafts };
        const childStepIds = { ...previous.childStepIds };
        const childTemplateIds = { ...previous.childTemplateIds };
        delete childDrafts[childId];
        delete childStepIds[childId];
        delete childTemplateIds[childId];
        return {
          ...previous,
          selectedChildIds: previous.selectedChildIds.filter((id) => id !== childId),
          activeChildId: previous.activeChildId === childId ? remainingChildIds[0] : previous.activeChildId,
          childDrafts,
          childStepIds,
          childTemplateIds,
          updatedAt: new Date().toISOString(),
        };
      });
      setChecksAcknowledged(false);
      setSaveError(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存できませんでした。');
    } finally {
      setSavingChildId(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editingDisabled) return;
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
    const records = wizard.selectedChildIds.map((childId) => buildRecordForChild(childId, now));

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
    if (editingDisabled) return;
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
    if (readOnly) return;
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
          version: 12,
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

  const currentPageStatuses = currentPageSteps.map((step) => answerStatus(step, activeChildDraft));
  const currentStatus: AnswerStatus = !isChildStep
    ? 'answered'
    : currentPageStatuses.length > 0 && currentPageStatuses.every((status) => status === 'answered')
      ? 'answered'
      : currentPageStatuses.length > 0 && currentPageStatuses.every((status) => status === 'skipped')
        ? 'skipped'
        : 'unanswered';
  const currentFieldWarning = currentPageSteps.length <= 1 && currentStep?.kind === 'field'
    ? fieldForStep(currentStep)?.warningText
    : undefined;
  const currentPageNumbers = currentPageSteps
    .map((step) => step.displayNumber)
    .filter((value): value is number => typeof value === 'number');
  const questionPositionLabel = isUnifiedTemplate(activeTemplate)
    ? currentStep?.kind === 'modules'
      ? '記録項目を選択'
      : currentStep?.moduleType
        ? `${RECORD_MODULE_LABELS[currentStep.moduleType]}を入力`
        : pageGroupKey(currentStep) === 'arrival'
          ? '来所時の様子'
          : '記録の準備'
    : currentPageNumbers.length > 1
      ? `質問 ${Math.min(...currentPageNumbers)}〜${Math.max(...currentPageNumbers)} / ${questionTotal}`
      : currentStep?.displayNumber
        ? `質問 ${currentStep.displayNumber} / ${questionTotal}`
        : `入力設定 ${wizard.currentStepIndex + 1} / ${steps.length}`;
  const draftStatusLabel = readOnly
    ? '閲覧中（自動保存なし）'
    : draftStatus === 'saving'
    ? '下書き保存中'
    : draftStatus === 'restored'
      ? '下書きを復元しました'
      : draftStatus === 'deleted'
        ? '入力中の記録を削除しました'
        : draftStatus === 'conflict'
            ? '別端末の更新を検出しました'
          : draftStatus === 'locked'
            ? '別の職員が同じ児童を入力中'
          : draftStatus === 'taken-over'
            ? '別の職員へ引き継がれました'
          : draftStatus === 'error'
            ? '下書きの共有保存に失敗'
            : wizard.selectedChildIds.length === 0
              ? '児童選択後に自動保存'
              : '下書き自動保存';
  const draggingChild = draggingChildId
    ? childrenList.find((child) => child.id === draggingChildId)
    : undefined;
  const draggingChildUnanswered = draggingChildId ? unansweredForChild(draggingChildId).length : 0;

  return (
    <form
      ref={formElement}
      id="record-wizard"
      onSubmit={handleSubmit}
      onFocusCapture={(event) => rememberFocusedEditor(event.target)}
      onInputCapture={(event) => rememberFocusedEditor(event.target, true)}
      className="mx-auto w-full min-w-0 max-w-4xl space-y-4 scroll-mt-20"
    >
      {takeoverNotice && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4" role="alertdialog" aria-modal="true" aria-labelledby="takeover-alert-title">
          <div className="w-full max-w-lg rounded-2xl border-2 border-amber-400 bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                <AlertCircle className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <h2 id="takeover-alert-title" className="text-base font-black text-slate-950">
                  {takeoverNotice.kind === 'received'
                    ? '担当中の記録へ児童が追加されました'
                    : '記録が別の職員へ引き継がれました'}
                </h2>
                <p className="mt-2 text-sm font-bold leading-relaxed text-amber-950">
                  {takeoverNotice.childNames.join('、')}
                  {takeoverNotice.kind === 'transferred-out' && takeoverNotice.nextRecorderName
                    ? ` → ${takeoverNotice.nextRecorderName}`
                    : ''}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  {takeoverNotice.syncing
                    ? '重複入力を防ぐため、この画面からの入力と自動保存を停止し、最新状態へ同期しています。'
                    : takeoverNotice.syncFailed
                      ? '最新状態を取得できなかったため、この画面からの入力を停止しました。記録状況へ戻って状態を確認してください。'
                      : takeoverNotice.kind === 'received'
                        ? '引き継いだ児童を現在の入力画面へ追加しました。確認後、児童タブを切り替えながら入力できます。'
                      : takeoverNotice.allTransferred
                        ? 'この画面の児童はすべて引き継がれました。この端末からの入力と自動保存は停止しています。'
                        : '引き継がれた児童を入力画面から取り除きました。確認後、残っている児童の入力を続けられます。'}
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              {takeoverNotice.syncing ? (
                <span className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-600">
                  <LoaderCircle className="h-4 w-4 animate-spin" />同期中
                </span>
              ) : takeoverNotice.syncFailed || (takeoverNotice.kind === 'transferred-out' && takeoverNotice.allTransferred) ? (
                <button
                  type="button"
                  onClick={() => onBackToRecordStatus?.()}
                  className="min-h-12 rounded-xl bg-slate-900 px-5 text-sm font-black text-white"
                >
                  記録状況へ戻る
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setTakeoverNotice(null)}
                  className="min-h-12 rounded-xl bg-amber-600 px-5 text-sm font-black text-white"
                >
                  {takeoverNotice.kind === 'received'
                    ? '確認して入力を続ける'
                    : '確認して残りの入力を続ける'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {readOnly && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-sky-300 bg-sky-50 p-4 text-sky-950">
          <Eye className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-black">別指導員が入力中・閲覧のみ</p>
            <p className="mt-1 text-xs leading-relaxed">
              {readOnlyOwnerName || '別の指導員'}が編集中です。質問間の移動と入力状況の確認はできますが、内容は変更できません。
            </p>
          </div>
        </div>
      )}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-bold text-slate-700">
            {currentStep?.kind === 'review'
              ? '最終確認'
              : questionPositionLabel}
          </span>
          <span
            aria-live="polite"
            className={`flex items-center gap-1 ${
              draftStatus === 'error' || draftStatus === 'conflict' || draftWriteBlocked
                ? 'text-rose-600'
                : draftStatus === 'deleted'
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
            {wizard.selectedChildIds.length === 0
              ? '児童を選択するまでは入力中の記録として保存されません。'
              : '入力内容は自動保存され、保存または削除するまで入力中の記録として残ります。'}
          </p>
          {!editingDisabled && (wizard.selectedChildIds.length > 0 || Boolean(initialRecord)) && <button
            type="button"
            onClick={() => void clearCurrentDraft()}
            className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-rose-300 bg-white px-4 text-sm font-bold text-rose-700 hover:bg-rose-50"
          >
            <Trash2 className="h-4 w-4" />
            入力中の記録を削除
          </button>}
        </div>
        {draftStatus === 'error' && draftSaveError && !takeoverNotice && (
          <div className="mt-3 rounded-xl border-2 border-rose-300 bg-rose-50 p-4" role="alert">
            <p className="text-sm font-black text-rose-950">共有保存を完了できませんでした</p>
            <p className="mt-1 text-xs leading-relaxed text-rose-800">{draftSaveError}</p>
            <button
              type="button"
              onClick={() => setDraftRetryToken((previous) => previous + 1)}
              className="mt-3 min-h-11 rounded-xl bg-rose-700 px-4 text-sm font-black text-white"
            >
              共有保存を再試行
            </button>
          </div>
        )}
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
        {draftWriteBlocked && !takeoverNotice && (
          <div className="mt-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-4">
            <p className="text-sm font-black text-amber-950">
              {draftStatus === 'taken-over'
                ? 'この記録は別の職員へ引き継がれました'
                : '選択した児童は別の職員が入力中です'}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-900">
              重複記録を防ぐため、この画面からの入力と共有保存を停止しました。ホームの「本日の運用」から入力状況を確認してください。
            </p>
          </div>
        )}
      </div>

      {wizard.selectedChildIds.length > 0 && wizard.currentStepIndex >= 2 && (
        <div className="app-sticky-below-header sticky z-20 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <p className="text-[11px] font-black text-slate-600">
              {reorderingChildTabs ? '児童名側でスクロール・右端のハンドルを長押しして移動' : '児童切替'}
            </p>
            {wizard.selectedChildIds.length > 1 && !editingDisabled && (
              <button
                type="button"
                aria-pressed={reorderingChildTabs}
                onClick={() => {
                  setDraggingChildId(null);
                  setReorderingChildTabs((previous) => !previous);
                }}
                className={`flex min-h-9 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-black ${
                  reorderingChildTabs
                    ? 'border-teal-600 bg-teal-50 text-teal-800'
                    : 'border-slate-300 bg-white text-slate-600'
                }`}
              >
                <ArrowLeftRight className="h-4 w-4" />
                {reorderingChildTabs ? '並べ替えを終了' : 'ドラッグで並べ替え'}
              </button>
            )}
          </div>
          <DndContext
            sensors={childTabSensors}
            collisionDetection={closestCenter}
            onDragStart={handleChildTabDragStart}
            onDragCancel={() => setDraggingChildId(null)}
            onDragEnd={handleChildTabDragEnd}
          >
            <SortableContext items={wizard.selectedChildIds} strategy={horizontalListSortingStrategy}>
              <div className="ui-scrollbar flex gap-2 overflow-x-auto overscroll-x-contain pb-1" aria-label="記録対象児童の並び順">
                {wizard.selectedChildIds.map((childId, index) => {
                  const child = childrenList.find((item) => item.id === childId);
                  return (
                    <SortableChildTab
                      key={childId}
                      childId={childId}
                      childName={child?.name || '児童'}
                      index={index}
                      unanswered={unansweredForChild(childId).length}
                      active={wizard.activeChildId === childId}
                      reordering={reorderingChildTabs}
                      onSelect={() => switchChild(childId)}
                    />
                  );
                })}
              </div>
            </SortableContext>
            {typeof document !== 'undefined' && createPortal(
              <DragOverlay
                adjustScale={false}
                dropAnimation={{ duration: 190, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
                zIndex={150}
              >
                {draggingChild ? (
                  <ChildTabDragPreview
                    childName={draggingChild.name}
                    unanswered={draggingChildUnanswered}
                  />
                ) : null}
              </DragOverlay>,
              document.body,
            )}
          </DndContext>
        </div>
      )}

      <section className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="p-5 sm:p-7 border-b border-slate-100">
          {isChildStep && (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1 text-xs font-bold text-teal-700"><Users className="h-4 w-4" />{activeChild?.name || '児童を選択してください'}の記録</p>
              {activeChild && (
                <div className="flex flex-wrap justify-end gap-1.5">
                  <button type="button" onClick={() => setHandoverReferenceOpen(true)} className="flex min-h-10 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-black text-amber-900"><MessageSquareText className="h-4 w-4" />申し送り {relevantHandovers.length > 0 && <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] text-white">{relevantHandovers.length}</span>}</button>
                  <button type="button" onClick={() => setInfoChild(activeChild)} className="flex min-h-10 items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-3 text-xs font-black text-teal-800"><Info className="h-4 w-4" />児童情報</button>
                </div>
              )}
            </div>
          )}
          <div className="flex items-start gap-3">
            <div className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${currentStatus === 'answered' ? 'bg-emerald-100 text-emerald-700' : currentStatus === 'skipped' ? 'bg-slate-200 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>{currentStatus === 'answered' ? <Check className="h-4 w-4" /> : currentStatus === 'skipped' ? <SkipForward className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold leading-relaxed text-slate-900 sm:text-xl">{pageTitle(currentStep)}</h2>
                {currentPageSteps.length > 1 && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{currentPageStatuses.filter((status) => status === 'answered').length} / {currentPageSteps.length} 回答</span>}
              </div>
              {currentPageSteps.length > 1 && <p className="mt-1 text-xs font-medium text-slate-500">{
                currentPageSteps.some((step) => /_(study|pc)_posture$/.test(step.fieldId || ''))
                  ? '姿勢は上部からいつでも入力できます。ほかの項目はタップして1つずつ開きます。'
                  : '必要な項目をタップして入力してください。入力済みの内容は閉じた状態でも確認できます。'
              }</p>}
              {currentFieldWarning && <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-black leading-relaxed text-rose-700">{currentFieldWarning}</p>}
              {currentPageSteps.length <= 1 && currentStep?.help && <p className="mt-2 text-sm leading-relaxed text-slate-500">{currentStep.help}</p>}
            </div>
          </div>
        </div>
        <fieldset disabled={editingDisabled} className="box-border w-full min-w-0 max-w-full overflow-x-hidden p-5 disabled:opacity-80 sm:p-7">{renderStep()}{stepError && <div className="mt-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="w-5 h-5 shrink-0" />{stepError}</div>}</fieldset>
      </section>

      {wizard.selectedChildIds.length > 0 && (
        <details id="question-index" className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-xs shadow-sm">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 font-bold text-slate-800">
            <ListChecks className="h-5 w-5 shrink-0 text-teal-600" />
            <span className="min-w-0 flex-1"><span className="block text-sm">質問一覧・未回答を確認</span><span className="mt-0.5 block text-[11px] font-medium text-slate-500">質問を選ぶと、その質問を含む入力画面へ移動します</span></span>
            {unansweredCount > 0 ? <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-800">未回答 {unansweredCount}</span> : <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-800">全回答済み</span>}
          </summary>
          <div className="border-t border-slate-200 bg-slate-50 p-3 sm:p-4">
            <div className="mb-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setQuestionIndexMode('unanswered')} className={`min-h-11 rounded-xl border px-3 text-sm font-black ${questionIndexMode === 'unanswered' ? 'border-amber-500 bg-amber-100 text-amber-950' : 'border-slate-300 bg-white text-slate-600'}`}>未回答のみ（{unansweredCount}）</button>
              <button type="button" onClick={() => setQuestionIndexMode('all')} className={`min-h-11 rounded-xl border px-3 text-sm font-black ${questionIndexMode === 'all' ? 'border-teal-500 bg-teal-100 text-teal-950' : 'border-slate-300 bg-white text-slate-600'}`}>すべて（{perChildSteps.length}）</button>
            </div>
            {skippedCount > 0 && <p className="mb-3 rounded-lg bg-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700">スキップ済み：{skippedCount}件</p>}
            {indexedQuestionGroups.length === 0 ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                <Check className="mx-auto h-6 w-6 text-emerald-600" />
                <p className="mt-2 text-sm font-black text-emerald-900">未回答の質問はありません</p>
              </div>
            ) : (
              <div className="space-y-3">
                {indexedQuestionGroups.map((group) => (
                  <section key={group.label} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <h3 className="border-b border-slate-100 bg-slate-100/80 px-3 py-2 text-xs font-black text-slate-700">{group.label}</h3>
                    <div className="divide-y divide-slate-100">
                      {group.steps.map((step) => {
                        const status = answerStatus(step, activeChildDraft);
                        return <button key={step.id} type="button" onClick={() => moveToStep(steps.findIndex((item) => item.id === step.id))} className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"><span className={`h-3 w-3 shrink-0 rounded-full ${status === 'answered' ? 'bg-emerald-500' : status === 'skipped' ? 'bg-slate-400' : 'bg-amber-500'}`} /><span className="min-w-0 flex-1 text-sm font-bold leading-relaxed text-slate-800">{step.title}</span><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${status === 'answered' ? 'bg-emerald-100 text-emerald-800' : status === 'skipped' ? 'bg-slate-200 text-slate-700' : 'bg-amber-100 text-amber-800'}`}>{status === 'answered' ? '回答済' : status === 'skipped' ? 'スキップ' : '未回答'}</span></button>;
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </details>
      )}

      {saveError && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{saveError}</div>}

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <button type="button" onClick={goPrevious} disabled={wizard.currentStepIndex === 0} className="min-h-12 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 disabled:opacity-40 flex items-center justify-center gap-2"><ChevronLeft className="w-4 h-4" />前の質問</button>
        <div className="flex flex-col sm:flex-row gap-2">
          {isChildStep && currentStep?.kind !== 'modules' && currentPageSteps.length <= 1 && !editingDisabled && <button type="button" onClick={(event) => { event.preventDefault(); skipCurrent(); }} className="min-h-12 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-600 flex items-center justify-center gap-2"><SkipForward className="w-4 h-4" />この質問をスキップ</button>}
          {isChildStep && currentStep?.kind !== 'review' && !editingDisabled && (
            <button
              type="button"
              onClick={(event) => { event.preventDefault(); goToReview(); }}
              className="min-h-12 rounded-xl border-2 border-emerald-500 bg-emerald-50 px-5 text-sm font-black text-emerald-800"
            >
              入力を終えて確認
            </button>
          )}
          {currentStep?.kind === 'review'
            ? editingDisabled
              ? <span className="flex min-h-12 items-center justify-center rounded-xl bg-sky-100 px-6 text-sm font-black text-sky-900">{readOnly ? '閲覧モード' : '入力停止中'}</span>
              : <button type="submit" disabled={isSaving} className="min-h-12 rounded-xl bg-emerald-600 disabled:bg-slate-400 px-6 text-sm font-bold text-white flex items-center justify-center gap-2"><Save className="w-4 h-4" />{isSaving ? '保存中...' : `${wizard.selectedChildIds.length}名分を保存`}</button>
            : currentStep?.kind !== 'modules' && <button type="button" onClick={(event) => { event.preventDefault(); goNext(); }} className="min-h-12 rounded-xl bg-teal-600 px-6 text-sm font-bold text-white flex items-center justify-center gap-2">{currentStep?.moduleId ? '項目選択へ戻る' : '次の質問'}<ChevronRight className="w-4 h-4" /></button>}
        </div>
      </div>

      <QuickMemoPad
        organizationId={organizationId}
        userId={userId}
        recorderId={activeRecorder?.id}
        onCreateHandover={onCreateHandover}
      />
      <ChildInfoDialog child={infoChild} onClose={() => setInfoChild(null)} />
      {handoverReferenceOpen && (
        <div className="ui-fade-in fixed inset-0 z-[105] flex items-end justify-end bg-slate-950/50 sm:p-4" role="dialog" aria-modal="true" aria-label="申し送りを確認">
          <button type="button" aria-label="申し送りを閉じる" onClick={() => setHandoverReferenceOpen(false)} className="absolute inset-0 h-full w-full" />
          <aside className="ui-panel-enter relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-xl sm:rounded-3xl">
            <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-amber-50 p-4">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-amber-700">入力しながら参照</p>
                <h3 className="truncate text-lg font-black text-slate-950">{activeChild?.name}さんの申し送り</h3>
                <p className="mt-0.5 text-[10px] text-slate-600">「コピー」後、入力欄を長押しして貼り付けできます。</p>
              </div>
              <button type="button" onClick={() => setHandoverReferenceOpen(false)} aria-label="閉じる" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-slate-600 shadow-sm"><X className="h-5 w-5" /></button>
            </header>
            <div className="ui-scrollbar flex-1 space-y-2 overflow-y-auto p-3 sm:p-4">
              {relevantHandovers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-bold text-slate-400">未完了の申し送りはありません。</div>
              ) : relevantHandovers.map((item) => (
                <article key={item.id} className={`rounded-2xl border p-3 ${item.priority === '緊急' ? 'border-rose-300 bg-rose-50' : item.priority === '重要' ? 'border-amber-300 bg-amber-50/70' : 'border-slate-200 bg-white'}`}>
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-black">
                    <span className="rounded-full bg-slate-900 px-2 py-1 text-white">{item.category}</span>
                    <span className={`rounded-full px-2 py-1 ${item.priority === '緊急' ? 'bg-rose-600 text-white' : item.priority === '重要' ? 'bg-amber-400 text-amber-950' : 'bg-slate-100 text-slate-600'}`}>{item.priority}</span>
                    <span className="rounded-full bg-white/80 px-2 py-1 text-slate-600">{item.status}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm font-medium leading-relaxed text-slate-800">{item.content}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="truncate text-[10px] text-slate-500">{item.createdByRecorderName || '作成者未設定'}{item.dueDate ? `・期限 ${item.dueDate}` : ''}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(item.content);
                        setCopiedHandoverId(item.id);
                        window.setTimeout(() => setCopiedHandoverId((current) => current === item.id ? null : current), 1800);
                      }}
                      className="flex min-h-10 shrink-0 items-center gap-1 rounded-xl bg-slate-900 px-3 text-xs font-black text-white"
                    >
                      {copiedHandoverId === item.id ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}{copiedHandoverId === item.id ? 'コピー済み' : 'コピー'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <div className="border-t border-slate-200 p-3"><button type="button" onClick={() => setHandoverReferenceOpen(false)} className="min-h-12 w-full rounded-xl bg-teal-600 text-sm font-black text-white">入力画面へ戻る</button></div>
          </aside>
        </div>
      )}

    </form>
  );
};

function ABCModeSelector({
  mode,
  onChange,
}: {
  mode: 'abc' | 'free';
  onChange: (mode: 'abc' | 'free') => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs font-black text-slate-700">入力方法を選択</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange('abc')}
          className={`min-h-12 rounded-xl border-2 px-3 text-sm font-black ${mode === 'abc' ? 'border-violet-500 bg-violet-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}
        >
          ABCで整理
        </button>
        <button
          type="button"
          onClick={() => onChange('free')}
          className={`min-h-12 rounded-xl border-2 px-3 text-sm font-black ${mode === 'free' ? 'border-teal-500 bg-teal-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}
        >
          自由記入
        </button>
      </div>
    </div>
  );
}

function calendarEventOccursOn(event: CalendarEvent, date: string) {
  if (event.recurrence === 'なし') return event.endDate
    ? event.date <= date && event.endDate >= date
    : event.date === date;
  if (date < event.date || (event.endDate && date > event.endDate)) return false;
  if (event.recurrence === '毎日') return true;
  const start = new Date(`${event.date}T00:00:00`);
  const target = new Date(`${date}T00:00:00`);
  return event.recurrence === '毎週'
    ? start.getDay() === target.getDay()
    : start.getDate() === target.getDate();
}

function ReviewAllChildren({
  wizard,
  childrenList,
  getTemplateForChild,
  getStepsForChild,
  answerStatus,
  checks,
  checksAcknowledged,
  onChecksAcknowledged,
  onJump,
  onSaveChild,
  savingChildId,
  saveDisabled,
}: {
  wizard: WizardDraft;
  childrenList: ChildProfile[];
  getTemplateForChild: (childId: string) => Template | undefined;
  getStepsForChild: (childId: string) => WizardStep[];
  answerStatus: (childId: string, step: WizardStep, draft?: ChildDraft) => AnswerStatus;
  checks: PreSaveCheck[];
  checksAcknowledged: boolean;
  onChecksAcknowledged: (checked: boolean) => void;
  onJump: (childId: string, stepId: string) => void;
  onSaveChild: (childId: string) => void;
  savingChildId: string | null;
  saveDisabled: boolean;
}) {
  const errors = checks.filter((check) => check.level === 'error');
  const notices = checks.filter((check) => check.level !== 'error');
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm"><p><strong>日付：</strong>{wizard.date}</p><p><strong>記録者：</strong>{wizard.recorderName}</p></div>
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
                  {check.stepId && (
                    <button
                      type="button"
                      onClick={() => onJump(check.childId, check.stepId!)}
                      className="mt-2 min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-black text-slate-800"
                    >
                      未入力箇所へ移動
                    </button>
                  )}
                </div>
              ))}
            </div>
            {notices.length > 0 && (
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
        const template = getTemplateForChild(childId);
        const childSteps = getStepsForChild(childId);
        const unanswered = childSteps.filter((step) => answerStatus(childId, step, draft) === 'unanswered');
        const skipped = childSteps.filter((step) => answerStatus(childId, step, draft) === 'skipped');
        return (
          <article key={childId} className="rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold text-slate-900">{child?.name || '児童'}</h3>{template && !isUnifiedTemplate(template) && <p className="mt-0.5 text-[10px] font-bold text-violet-700">{template.name}</p>}</div><div className="flex gap-2 text-[10px] font-bold"><span className={`rounded-full px-2 py-1 ${unanswered.length ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{unanswered.length ? `未回答 ${unanswered.length}` : '全回答済み'}</span>{skipped.length > 0 && <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">スキップ {skipped.length}</span>}</div></div>
            <p className="text-xs text-slate-600">出欠：{draft?.attendance || '未回答'}{draft?.attendanceNote ? `（${draft.attendanceNote}）` : ''} ／ 表情：{draft?.expressions.join('、') || '未回答'}{draft?.recordModules.some((module) => module.type === 'snack') ? ` ／ おやつ：${draft.snack || '未回答'}` : ''}</p>
            {unanswered.length > 0 && <div className="rounded-lg bg-amber-50 p-3"><p className="text-xs font-bold text-amber-900 mb-2">未回答の質問</p><div className="flex flex-wrap gap-2">{unanswered.map((step) => <button key={step.id} type="button" onClick={() => onJump(childId, step.id)} className="rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] text-amber-900">{step.title}</button>)}</div></div>}
            {template && isUnifiedTemplate(template) ? (
              <details className="overflow-hidden rounded-xl border border-slate-300">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"><span>文章合成プレビュー</span><span className="text-[10px] text-slate-500">タップして表示</span></summary>
                <pre className="whitespace-pre-wrap bg-white p-4 font-sans text-xs leading-relaxed text-slate-800">{generateUnifiedRecordSummary({
                  recorderName: wizard.recorderName,
                  attendance: draft?.attendance || '',
                  attendanceNote: draft?.attendanceNote,
                  expressions: draft?.expressions || [],
                  expressionNote: draft?.expressionNote,
                  snack: draft?.snack || '',
                  snackNote: draft?.snackNote,
                  sectionAnswers: withRecordModuleMetadata(draft?.sectionAnswers || {}, draft?.recordModules || []),
                })}</pre>
              </details>
            ) : template && (isStructuredWeekdayTemplate(template) || isStructuredHolidayTemplate(template)) ? (
              <details className="overflow-hidden rounded-xl border border-slate-300">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">
                  <span>文章合成プレビュー</span><span className="text-[10px] text-slate-500">タップして表示</span>
                </summary>
                <pre className="whitespace-pre-wrap bg-white p-4 font-sans text-xs leading-relaxed text-slate-800">{(isStructuredHolidayTemplate(template) ? generateStructuredHolidaySummary : generateStructuredWeekdaySummary)({
                  recorderName: wizard.recorderName,
                  attendance: draft?.attendance || '',
                  attendanceNote: draft?.attendanceNote,
                  expressions: draft?.expressions || [],
                  expressionNote: draft?.expressionNote,
                  snack: draft?.snack || '',
                  snackNote: draft?.snackNote,
                  sectionAnswers: draft?.sectionAnswers || {},
                })}</pre>
              </details>
            ) : <details className="overflow-hidden rounded-xl border border-slate-300"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"><span>入力内容プレビュー</span><span className="text-[10px] text-slate-500">タップして表示</span></summary><div className="space-y-2 p-3">{template?.sections.map((section) => {
              const answer = draft?.sectionAnswers[section.id];
              const specialText = answer?.abcAnalysis?.inputMode === 'free'
                ? answer.abcAnalysis.freeText
                : answer?.abcAnalysis?.summary;
              return <div key={section.id} className="rounded-lg bg-slate-50 p-3 text-xs"><p className="font-bold mb-1">{section.title}</p>{specialText ? <p className="whitespace-pre-wrap leading-relaxed">{specialText}</p> : <p className="text-slate-400">特記事項なし</p>}</div>;
            })}</div></details>}
            <button
              type="button"
              disabled={saveDisabled || savingChildId !== null}
              onClick={() => onSaveChild(childId)}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-emerald-500 bg-emerald-50 px-4 text-sm font-black text-emerald-800 disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {savingChildId === childId ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {savingChildId === childId ? 'この児童を保存中...' : 'この児童だけ保存'}
            </button>
          </article>
        );
      })}
    </div>
  );
}
