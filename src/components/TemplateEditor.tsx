import React, { useState } from 'react';
import { FieldType, Template, TemplateSection, TemplateField, WizardQuestionId } from '../types';
import { Plus, Trash2, Copy, Save, Check, CheckCircle2, ChevronRight, GripVertical, HelpCircle, X } from 'lucide-react';
import { FATIGUE_SCALE_HELP, FATIGUE_SCALE_OPTIONS, normalizeTemplateFatigueScale } from '../utils/templateNormalizer';
import { getWizardQuestions, WIZARD_QUESTION_LABELS, WIZARD_QUESTION_ORDER } from '../utils/wizardQuestions';
import { HOMEWORK_FIELD_HELP, HOMEWORK_SUBJECTS } from '../utils/homeworkField';
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface TemplateEditorProps {
  templates: Template[];
  onSaveTemplate: (template: Template) => void;
  onDeleteTemplate: (templateId: string) => void;
}

const INPUT_TYPE_GUIDES: Array<{
  type: FieldType;
  name: string;
  description: string;
  example: string;
  special?: boolean;
}> = [
  { type: 'radio', name: '単一選択', description: '複数の候補から1つだけ選択します。', example: '機嫌：よい／普通／気になる' },
  { type: 'checkbox', name: '複数選択', description: '当てはまる候補を複数選択します。', example: '表情：笑顔＋落ち着いている' },
  { type: 'number', name: '数値入力', description: '時間・回数などを数字で入力します。', example: '取り組み時間：20分' },
  { type: 'text', name: '一行入力', description: '短い文章や名称を1行で入力します。', example: '活動名：カードゲーム' },
  { type: 'textarea', name: '長文入力', description: '複数行の文章を自由入力します。', example: '支援中の詳しい様子' },
  { type: 'time_select', name: '時刻入力', description: '時刻を時・分で選択します。', example: '開始時刻：15:30' },
  {
    type: 'fatigue_scale',
    name: '5段階評価',
    description: '1（疲労感が非常に強い）から5（疲労感なし）までを大きなボタンで選択します。',
    example: '疲労感：3 中程度',
    special: true,
  },
  {
    type: 'rating_scale',
    name: '説明付き5段階評価',
    description: '1～5それぞれの判断例を表示し、最も近い段階を1つ選択します。',
    example: '準備：5 自分で行えた',
    special: true,
  },
  {
    type: 'hand_count',
    name: '左右固定数値',
    description: '「左手」「右手」の見出しを固定し、それぞれの数値を入力します。',
    example: '左手：3本／右手：4本',
    special: true,
  },
  {
    type: 'homework_subjects',
    name: '教科連動選択',
    description: '教科を複数選択し、主要5教科では教材種別、自学・その他では自由記入欄を自動表示します。',
    example: '国語（ノート）＋算数（プリント）＋自学（漢字練習）',
    special: true,
  },
  {
    type: 'study_extras',
    name: '宿題以外の学習',
    description: '漢検の級、エジソンの内容、その他の自由記入を選択内容に応じて表示します。',
    example: '漢検（5級）＋エジソン（練習帳）',
    special: true,
  },
  {
    type: 'pc_activities',
    name: 'パソコン取り組み',
    description: 'Dレッスンの練習種別、模擬試験の文字数・回、その他の自由記入を表示します。',
    example: 'Dレッスン（タイピング練習）',
    special: true,
  },
  {
    type: 'meal_details',
    name: '食事詳細入力',
    description: '食事時間、食べた量、自由記入欄を1つの質問内にまとめて表示します。',
    example: '食事時間：25分／食事量：完食',
    special: true,
  },
];

function InputTypePreview({ type }: { type: FieldType }) {
  const [singleValue, setSingleValue] = useState('よい');
  const [multipleValues, setMultipleValues] = useState<string[]>(['笑顔']);
  const [numberValue, setNumberValue] = useState('20');
  const [textValue, setTextValue] = useState('');
  const [timeValue, setTimeValue] = useState('15:30');
  const [fatigueValue, setFatigueValue] = useState('3');
  const [leftValue, setLeftValue] = useState('3');
  const [rightValue, setRightValue] = useState('4');
  const [mealMinutes, setMealMinutes] = useState('25');
  const [mealPortion, setMealPortion] = useState('完食');
  const [homeworkSubjects, setHomeworkSubjects] = useState<string[]>([]);
  const [expandedHomework, setExpandedHomework] = useState<string | null>(null);
  const [homeworkMaterials, setHomeworkMaterials] = useState<Record<string, string[]>>({});
  const [homeworkNotes, setHomeworkNotes] = useState<Record<string, string>>({});

  const buttonClass = 'min-h-11 rounded-lg border px-3 py-2 text-sm font-bold';

  if (type === 'radio') {
    return (
      <div className="grid grid-cols-3 gap-2">
        {['よい', '普通', '気になる'].map((option) => (
          <button key={option} type="button" onClick={() => setSingleValue(option)} className={`${buttonClass} ${singleValue === option ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white'}`}>{option}</button>
        ))}
      </div>
    );
  }

  if (type === 'checkbox') {
    return (
      <div className="grid grid-cols-2 gap-2">
        {['笑顔', '落ち着いている', '緊張', '眠そう'].map((option) => {
          const selected = multipleValues.includes(option);
          return <button key={option} type="button" onClick={() => setMultipleValues(selected ? multipleValues.filter((value) => value !== option) : [...multipleValues, option])} className={`${buttonClass} ${selected ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white'}`}>{selected && <Check className="mr-1 inline h-4 w-4" />}{option}</button>;
        })}
      </div>
    );
  }

  if (type === 'number') {
    return <label className="block text-sm font-bold text-slate-700">取り組み時間<div className="mt-2 flex items-center gap-2"><input type="number" value={numberValue} onChange={(event) => setNumberValue(event.target.value)} className="min-h-12 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-base" /><span>分</span></div></label>;
  }

  if (type === 'text') {
    return <label className="block text-sm font-bold text-slate-700">活動名<input value={textValue} onChange={(event) => setTextValue(event.target.value)} placeholder="例：カードゲーム" className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 text-base" /></label>;
  }

  if (type === 'textarea') {
    return <label className="block text-sm font-bold text-slate-700">詳しい様子<textarea rows={3} value={textValue} onChange={(event) => setTextValue(event.target.value)} placeholder="複数行で入力できます" className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-base" /></label>;
  }

  if (type === 'time_select') {
    return <label className="block text-sm font-bold text-slate-700">開始時刻<input type="time" value={timeValue} onChange={(event) => setTimeValue(event.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 text-base" /></label>;
  }

  if (type === 'fatigue_scale' || type === 'rating_scale') {
    return (
      <div className="grid grid-cols-5 gap-1.5">
        {['1', '2', '3', '4', '5'].map((level) => (
          <button key={level} type="button" onClick={() => setFatigueValue(level)} className={`min-h-14 rounded-lg border text-lg font-black ${fatigueValue === level ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white'}`}>{level}</button>
        ))}
      </div>
    );
  }

  if (type === 'hand_count') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <label className="rounded-lg border border-slate-200 bg-white p-3 text-sm font-bold">左手<div className="mt-2 flex items-center gap-1"><input type="number" value={leftValue} onChange={(event) => setLeftValue(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-2 text-base" /><span>本</span></div></label>
        <label className="rounded-lg border border-slate-200 bg-white p-3 text-sm font-bold">右手<div className="mt-2 flex items-center gap-1"><input type="number" value={rightValue} onChange={(event) => setRightValue(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-2 text-base" /><span>本</span></div></label>
      </div>
    );
  }

  if (type === 'study_extras') {
    return <div className="grid grid-cols-2 gap-2">{['漢検（5級）', 'エジソン（練習帳）', '取り組みなし', 'その他'].map((option, index) => <button key={option} type="button" className={`${buttonClass} text-left ${index < 2 ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white'}`}>{index < 2 && <Check className="mr-1 inline h-4 w-4" />}{option}</button>)}</div>;
  }

  if (type === 'pc_activities') {
    return <div className="space-y-2"><button type="button" className={`${buttonClass} w-full border-teal-600 bg-teal-600 text-left text-white`}><Check className="mr-1 inline h-4 w-4" />Dレッスン（タイピング練習）</button><button type="button" className={`${buttonClass} w-full border-slate-300 bg-white text-left`}>文章入力模擬試験</button><button type="button" className={`${buttonClass} w-full border-slate-300 bg-white text-left`}>その他</button></div>;
  }

  if (type === 'meal_details') {
    return (
      <div className="space-y-3">
        <label className="block text-sm font-bold text-slate-700">食事にかかった時間<div className="mt-2 flex items-center gap-2"><input type="number" value={mealMinutes} onChange={(event) => setMealMinutes(event.target.value)} className="min-h-12 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-base" /><span>分</span></div></label>
        <div className="grid grid-cols-3 gap-2">{['完食', '半量食べた', '1/4食べた'].map((option) => <button key={option} type="button" onClick={() => setMealPortion(option)} className={`${buttonClass} ${mealPortion === option ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white'}`}>{mealPortion === option && <Check className="mr-1 inline h-4 w-4" />}{option}</button>)}</div>
        <textarea rows={2} placeholder="食事中の様子を入力" className="w-full rounded-lg border border-slate-300 p-3 text-base" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {HOMEWORK_SUBJECTS.map((subject) => {
        const selected = homeworkSubjects.includes(subject);
        const expanded = selected && expandedHomework === subject;
        const academic = ['国語', '算数', '理科', '社会', '英語'].includes(subject);
        const summary = academic
          ? (homeworkMaterials[subject] || []).join('・')
          : homeworkNotes[subject] || '';
        return (
          <div key={subject} className={`overflow-hidden rounded-xl border ${selected ? 'border-teal-500 bg-teal-50' : 'border-slate-300 bg-white'}`}>
            <button
              type="button"
              onClick={() => {
                if (!selected) {
                  setHomeworkSubjects([...homeworkSubjects, subject]);
                  setExpandedHomework(subject);
                } else {
                  setExpandedHomework(expanded ? null : subject);
                }
              }}
              className="flex min-h-12 w-full items-center gap-2 px-3 text-left"
            >
              <span className={`flex h-6 w-6 items-center justify-center rounded-md border ${selected ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300'}`}>{selected && <Check className="h-4 w-4" />}</span>
              <span className="flex-1"><strong>{subject}</strong>{selected && <span className="ml-2 text-xs text-teal-800">{summary || '詳細を入力'}</span>}</span>
              {selected && <ChevronRight className={`h-4 w-4 ${expanded ? 'rotate-90' : ''}`} />}
            </button>
            {expanded && (
              <div className="space-y-2 border-t border-teal-200 bg-white p-3">
                {academic ? (
                  <div className="grid gap-2">
                    {['プリント', 'ドリル/ワーク', 'ノート'].map((material) => {
                      const materials = homeworkMaterials[subject] || [];
                      const materialSelected = materials.includes(material);
                      return <button key={material} type="button" onClick={() => setHomeworkMaterials({ ...homeworkMaterials, [subject]: materialSelected ? materials.filter((value) => value !== material) : [...materials, material] })} className={`${buttonClass} text-left ${materialSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>{materialSelected && <Check className="mr-1 inline h-4 w-4" />}{material}</button>;
                    })}
                  </div>
                ) : (
                  <textarea rows={2} value={homeworkNotes[subject] || ''} onChange={(event) => setHomeworkNotes({ ...homeworkNotes, [subject]: event.target.value })} placeholder={`${subject}の内容`} className="w-full rounded-lg border border-slate-300 p-3 text-base" />
                )}
                <button type="button" onClick={() => setExpandedHomework(null)} className="min-h-11 w-full rounded-lg bg-teal-600 text-sm font-bold text-white">入力を完了して閉じる</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({
  templates,
  onSaveTemplate,
  onDeleteTemplate,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(templates[0]);
  const [editingTemplate, setEditingTemplate] = useState<Template>({ ...templates[0] });
  const [isSavedNotice, setIsSavedNotice] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [showInputGuide, setShowInputGuide] = useState(false);
  const [previewType, setPreviewType] = useState<FieldType | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const announceChange = (message: string, targetId?: string, focusSelector?: string) => {
    setFeedback(message);
    setHighlightedId(targetId || null);
    window.setTimeout(() => setFeedback(null), 2800);
    window.setTimeout(() => setHighlightedId(null), 2200);
    window.setTimeout(() => {
      const target = targetId
        ? document.querySelector(`[data-sortable-id="${targetId}"]`)
        : focusSelector ? document.querySelector(focusSelector) : null;
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (focusSelector) (document.querySelector(focusSelector) as HTMLElement | null)?.focus();
    }, 60);
  };

  // Switch active template
  const handleSelectTemplate = (template: Template) => {
    setSelectedTemplate(template);
    setEditingTemplate(JSON.parse(JSON.stringify(template)));
    setFeedback(null);
  };

  // Create new blank template
  const handleCreateNewTemplate = () => {
    const newTemp: Template = {
      id: `template-custom-${Date.now()}`,
      name: '新規記録テンプレート',
      type: 'カスタム',
      description: '事業所独自の記録項目に対応したカスタマイズフォーマット',
      sections: [
        {
          id: `sec-${Date.now()}-1`,
          title: '生活',
          fields: [
            {
              id: `f-${Date.now()}-1`,
              label: '【疲労感】',
              type: 'fatigue_scale',
              options: [...FATIGUE_SCALE_OPTIONS],
              defaultValue: FATIGUE_SCALE_OPTIONS[0],
              hasNote: true,
              helpText: FATIGUE_SCALE_HELP,
            },
            {
              id: `f-${Date.now()}-2`,
              label: '【機嫌】',
              type: 'radio',
              options: ['よい', 'わるい'],
              defaultValue: 'よい',
              hasNote: true,
            },
          ],
        },
      ],
    };

    setEditingTemplate(newTemp);
    setSelectedTemplate(newTemp);
    announceChange('新しいテンプレートを作成しました。名称を編集して保存してください。', undefined, '#template-name-input');
  };

  // Duplicate active template
  const handleDuplicateTemplate = () => {
    const dup: Template = {
      ...JSON.parse(JSON.stringify(editingTemplate)),
      id: `template-custom-${Date.now()}`,
      name: `${editingTemplate.name} (複製)`,
      type: 'カスタム',
      isDefault: false,
    };
    setEditingTemplate(dup);
    setSelectedTemplate(dup);
    announceChange('テンプレートを複製しました。名称を確認して保存してください。', undefined, '#template-name-input');
  };

  // Save template
  const handleSave = () => {
    const normalizedTemplate = normalizeTemplateFatigueScale(editingTemplate);
    onSaveTemplate(normalizedTemplate);
    setEditingTemplate(normalizedTemplate);
    setSelectedTemplate(normalizedTemplate);
    setIsSavedNotice(true);
    announceChange('テンプレートの変更を保存しました。');
    setTimeout(() => setIsSavedNotice(false), 2500);
  };

  // Section Management
  const handleAddSection = () => {
    const newSec: TemplateSection = {
      id: `sec-${Date.now()}`,
      title: '新しいセクション',
      fields: [
        {
          id: `f-${Date.now()}`,
          label: '【新しい質問】',
          type: 'radio',
          options: ['良い', '普通', '気になる'],
          defaultValue: '良い',
          hasNote: true,
        },
      ],
    };
    setEditingTemplate({
      ...editingTemplate,
      sections: [...editingTemplate.sections, newSec],
    });
    announceChange('新しいセクションを追加しました。', newSec.id);
  };

  const handleRemoveSection = (secId: string) => {
    setEditingTemplate({
      ...editingTemplate,
      sections: editingTemplate.sections.filter((s) => s.id !== secId),
    });
    announceChange('セクションを削除しました。');
  };

  const handleUpdateSectionTitle = (secId: string, title: string) => {
    setEditingTemplate({
      ...editingTemplate,
      sections: editingTemplate.sections.map((s) =>
        s.id === secId ? { ...s, title } : s
      ),
    });
  };

  // Field Management inside a Section
  const handleAddField = (secId: string) => {
    const newField: TemplateField = {
      id: `f-${Date.now()}`,
      label: '【新規項目】',
      type: 'radio',
      options: ['選択肢1', '選択肢2'],
      defaultValue: '選択肢1',
      hasNote: true,
      notePlaceholder: '補足記入',
    };

    setEditingTemplate({
      ...editingTemplate,
      sections: editingTemplate.sections.map((s) =>
        s.id === secId ? { ...s, fields: [...s.fields, newField] } : s
      ),
    });
    announceChange('新しい質問項目を追加しました。', newField.id);
  };

  const handleRemoveField = (secId: string, fieldId: string) => {
    setEditingTemplate({
      ...editingTemplate,
      sections: editingTemplate.sections.map((s) =>
        s.id === secId
          ? { ...s, fields: s.fields.filter((f) => f.id !== fieldId) }
          : s
      ),
    });
    announceChange('質問項目を削除しました。');
  };

  const handleUpdateField = (
    secId: string,
    fieldId: string,
    updates: Partial<TemplateField>
  ) => {
    setEditingTemplate({
      ...editingTemplate,
      sections: editingTemplate.sections.map((s) =>
        s.id === secId
          ? {
              ...s,
              fields: s.fields.map((f) =>
                f.id === fieldId ? { ...f, ...updates } : f
              ),
            }
          : s
      ),
    });
  };

  const handleChangeFieldType = (sectionId: string, fieldId: string, type: FieldType) => {
    const field = editingTemplate.sections
      .find((section) => section.id === sectionId)
      ?.fields.find((item) => item.id === fieldId);
    if (!field) return;

    if (type === 'fatigue_scale') {
      handleUpdateField(sectionId, fieldId, {
        type,
        options: [...FATIGUE_SCALE_OPTIONS],
        defaultValue: FATIGUE_SCALE_OPTIONS[0],
        helpText: field.helpText || FATIGUE_SCALE_HELP,
      });
      return;
    }

    if (type === 'rating_scale') {
      handleUpdateField(sectionId, fieldId, {
        type,
        options: ['1：段階1', '2：段階2', '3：段階3', '4：段階4', '5：段階5'],
        defaultValue: '',
      });
      return;
    }

    if (type === 'homework_subjects') {
      handleUpdateField(sectionId, fieldId, {
        type,
        label: field.label === '【新規項目】' ? '【宿題内容】' : field.label,
        options: [...HOMEWORK_SUBJECTS],
        defaultValue: '',
        hasNote: false,
        helpText: field.helpText || HOMEWORK_FIELD_HELP,
      });
      return;
    }

    if (type === 'study_extras') {
      handleUpdateField(sectionId, fieldId, {
        type,
        options: ['漢検', 'エジソン', '取り組みなし', 'その他'],
        defaultValue: '',
        hasNote: false,
      });
      return;
    }

    if (type === 'pc_activities') {
      handleUpdateField(sectionId, fieldId, {
        type,
        options: ['Dレッスン', '文章入力模擬試験', 'その他'],
        defaultValue: '',
        hasNote: false,
      });
      return;
    }

    if (type === 'meal_details') {
      handleUpdateField(sectionId, fieldId, {
        type,
        label: field.label === '【新規項目】' ? '昼食の様子' : field.label,
        options: ['完食', '半量食べた', '1/4食べた'],
        defaultValue: '',
        hasNote: false,
        helpText: field.helpText || '食事にかかった時間と食べた量を選び、必要に応じて様子を入力してください。',
      });
      return;
    }

    handleUpdateField(sectionId, fieldId, { type });
  };

  const handleUpdateWizardQuestion = (
    questionId: WizardQuestionId,
    updates: Partial<ReturnType<typeof getWizardQuestions>[WizardQuestionId]>,
  ) => {
    const current = getWizardQuestions(editingTemplate)[questionId];
    setEditingTemplate({
      ...editingTemplate,
      wizardQuestions: {
        ...editingTemplate.wizardQuestions,
        [questionId]: { ...current, ...updates },
      },
    });
  };

  const handleSectionDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const oldIndex = editingTemplate.sections.findIndex((section) => section.id === active.id);
    const newIndex = editingTemplate.sections.findIndex((section) => section.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setEditingTemplate({ ...editingTemplate, sections: arrayMove(editingTemplate.sections, oldIndex, newIndex) });
    announceChange('セクションの順番を変更しました。保存すると記録画面に反映されます。', String(active.id));
  };

  const handleFieldDragEnd = (sectionId: string, { active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const section = editingTemplate.sections.find((item) => item.id === sectionId);
    if (!section) return;
    const oldIndex = section.fields.findIndex((field) => field.id === active.id);
    const newIndex = section.fields.findIndex((field) => field.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setEditingTemplate({
      ...editingTemplate,
      sections: editingTemplate.sections.map((item) =>
        item.id === sectionId ? { ...item, fields: arrayMove(item.fields, oldIndex, newIndex) } : item
      ),
    });
    announceChange('質問の順番を変更しました。保存すると記録画面に反映されます。', String(active.id));
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {feedback && (
        <div role="status" aria-live="polite" className="fixed right-4 top-20 z-50 max-w-sm rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900 shadow-xl flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />{feedback}
        </div>
      )}
      {showInputGuide && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="input-guide-title"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setShowInputGuide(false);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white p-4 sm:p-5">
              <div>
                <p className="text-xs font-bold text-indigo-700">テンプレート編集マニュアル</p>
                <h3 id="input-guide-title" className="mt-1 text-lg font-black text-slate-900">入力形式と画面の動き</h3>
                <p className="mt-1 text-xs text-slate-500">質問に合う形式を選ぶ際の参考にしてください。</p>
              </div>
              <button
                type="button"
                aria-label="入力形式マニュアルを閉じる"
                onClick={() => setShowInputGuide(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
              {INPUT_TYPE_GUIDES.map((guide) => (
                <article
                  key={guide.type}
                  className={`rounded-xl border p-4 ${
                    guide.special
                      ? 'border-indigo-200 bg-indigo-50/70'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-black text-slate-900">{guide.name}</h4>
                    {guide.special && (
                      <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">特殊形式</span>
                    )}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-700">{guide.description}</p>
                  <p className="mt-2 rounded-lg bg-white px-3 py-2 text-[11px] text-slate-600">
                    <strong>表示例：</strong>{guide.example}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPreviewType((current) => current === guide.type ? null : guide.type)}
                    className="mt-3 min-h-11 w-full rounded-lg border border-indigo-300 bg-white px-3 text-sm font-bold text-indigo-800"
                  >
                    {previewType === guide.type ? 'プレビューを閉じる' : '実際の表示を試す'}
                  </button>
                  {previewType === guide.type && (
                    <div className="mt-3 rounded-xl border border-indigo-200 bg-white p-3">
                      <p className="mb-3 text-xs font-bold text-slate-600">操作プレビュー</p>
                      <InputTypePreview type={guide.type} />
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 rounded-xl border border-indigo-900 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <span className="bg-indigo-500/20 text-indigo-300 text-xs font-semibold px-2.5 py-1 rounded-md border border-indigo-500/30">
            記録項目カスタマイズ
          </span>
          <h2 className="text-lg font-bold mt-1 text-white flex items-center gap-2">
            テンプレート編集マスター
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            事業所特有の評価項目・チェック選択肢・補足欄を自由に変更・作成できます。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowInputGuide(true)}
            className="bg-white/10 hover:bg-white/15 text-white border border-white/20 text-xs font-bold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <HelpCircle className="w-4 h-4" />
            入力形式マニュアル
          </button>
          <button
            onClick={handleCreateNewTemplate}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            新規作成
          </button>
          <button
            onClick={handleDuplicateTemplate}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Copy className="w-4 h-4" />
            複製してカスタマイズ
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Template List Sidebar */}
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-4 space-y-3">
          <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider border-b pb-2">
            テンプレート一覧
          </h3>
          <div className="space-y-1.5">
            {templates.map((t) => {
              const isSelected = selectedTemplate.id === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => handleSelectTemplate(t)}
                  className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-950 font-bold shadow-xs'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{t.name}</span>
                    <span className="text-[10px] bg-white border px-1.5 py-0.5 rounded-md font-normal">
                      {t.type}
                    </span>
                  </div>
                  {t.description && (
                    <p className="text-[10px] text-slate-500 line-clamp-1 mt-1 font-normal">
                      {t.description}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Template Editor Form Area */}
        <div className="lg:col-span-3 space-y-6">
          {/* General Template Settings */}
          <div data-editor-target="basic" className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b pb-2 flex items-center justify-between">
              <span>基本設定</span>
              {isSavedNotice && (
                <span className="text-emerald-600 text-xs font-bold flex items-center gap-1">
                  <Check className="w-4 h-4" /> 保存完了
                </span>
              )}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  テンプレート名称
                </label>
                <input
                  id="template-name-input"
                  type="text"
                  value={editingTemplate.name}
                  onChange={(e) =>
                    setEditingTemplate({ ...editingTemplate, name: e.target.value })
                  }
                  className="w-full bg-slate-50 text-xs font-bold border border-slate-300 rounded-lg p-2 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  区分
                </label>
                <select
                  value={editingTemplate.type}
                  onChange={(e) =>
                    setEditingTemplate({
                      ...editingTemplate,
                      type: e.target.value as any,
                    })
                  }
                  className="w-full bg-slate-50 text-xs font-medium border border-slate-300 rounded-lg p-2 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="平日">平日 (放デイ等)</option>
                  <option value="休日">休日 (土祝・終日)</option>
                  <option value="カスタム">カスタム (独自の療育)</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  説明メモ
                </label>
                <input
                  type="text"
                  value={editingTemplate.description || ''}
                  onChange={(e) =>
                    setEditingTemplate({ ...editingTemplate, description: e.target.value })
                  }
                  placeholder="事業所内での用途（例: 未就学児向け個別プログラム用）"
                  className="w-full bg-slate-50 text-xs border border-slate-300 rounded-lg p-2 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          <details className="rounded-xl border border-slate-200 bg-white shadow-xs" open>
            <summary className="cursor-pointer p-5 text-sm font-bold text-slate-900">
              共通質問・ABC質問の編集
              <span className="ml-2 text-[10px] font-normal text-slate-500">これまで固定されていた質問です</span>
            </summary>
            <div className="border-t border-slate-200 p-4 space-y-3">
              {WIZARD_QUESTION_ORDER.map((questionId) => {
                const question = getWizardQuestions(editingTemplate)[questionId];
                const hasOptions = ['attendance', 'expression', 'snack'].includes(questionId);
                return (
                  <details key={questionId} className="rounded-lg border border-slate-200 bg-slate-50">
                    <summary className="cursor-pointer px-4 py-3 text-xs font-bold text-slate-800">
                      {WIZARD_QUESTION_LABELS[questionId]}
                    </summary>
                    <div className="grid gap-3 border-t border-slate-200 p-4 text-xs">
                      <label className="font-bold text-slate-700">質問文
                        <input value={question.title} onChange={(event) => handleUpdateWizardQuestion(questionId, { title: event.target.value })} className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 font-normal" />
                      </label>
                      {questionId.startsWith('abc') && <p className="text-[10px] text-slate-500">「{'{section}'}」は、生活・学習・PCなどのセクション名に置き換わります。</p>}
                      <label className="font-bold text-slate-700">質問の補足文
                        <input value={question.help || ''} onChange={(event) => handleUpdateWizardQuestion(questionId, { help: event.target.value })} className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 font-normal" />
                      </label>
                      {hasOptions && (
                        <>
                          <label className="font-bold text-slate-700">選択肢（カンマ区切り）
                            <input value={(question.options || []).join(', ')} onChange={(event) => handleUpdateWizardQuestion(questionId, { options: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 font-normal" />
                          </label>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="font-bold text-slate-700">備考欄の見出し
                              <input value={question.noteLabel || ''} onChange={(event) => handleUpdateWizardQuestion(questionId, { noteLabel: event.target.value })} className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 font-normal" />
                            </label>
                            <label className="font-bold text-slate-700">備考欄の入力例
                              <input value={question.notePlaceholder || ''} onChange={(event) => handleUpdateWizardQuestion(questionId, { notePlaceholder: event.target.value })} className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 font-normal" />
                            </label>
                          </div>
                        </>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          </details>

          {/* Sections & Fields List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                記録セクション＆項目デザイン ({editingTemplate.sections.length}区分)
              </h3>
              <button
                onClick={handleAddSection}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                新しいセクションを追加
              </button>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
              <SortableContext items={editingTemplate.sections.map((section) => section.id)} strategy={verticalListSortingStrategy}>
              {editingTemplate.sections.map((sec, secIdx) => (
              <SortableBlock
                key={sec.id}
                id={sec.id}
                highlighted={highlightedId === sec.id}
                className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden"
              >
                {(sectionDragHandleProps) => (<>
                {/* Section Title Bar */}
                <div className="bg-slate-100 border-b border-slate-200 p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-indigo-900 text-white font-bold text-xs flex items-center justify-center">
                      {secIdx + 1}
                    </span>
                    <input
                      type="text"
                      value={sec.title}
                      onChange={(e) => handleUpdateSectionTitle(sec.id, e.target.value)}
                      className="bg-white text-xs font-bold border border-slate-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-xs text-slate-500 font-medium">セクション</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      {...sectionDragHandleProps}
                      className="min-h-9 min-w-9 touch-none cursor-grab rounded-md border border-slate-300 bg-white text-slate-500 flex items-center justify-center active:cursor-grabbing"
                      aria-label={`${sec.title}セクションをドラッグして並べ替え`}
                      title="ドラッグして並べ替え"
                    >
                      <GripVertical className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddField(sec.id)}
                      className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-2.5 py-1 rounded-md border border-indigo-200 transition-colors flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      項目を追加
                    </button>
                    {editingTemplate.sections.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSection(sec.id)}
                        className="text-rose-600 hover:bg-rose-50 p-1 rounded-md"
                        title="セクション削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Section Fields list */}
                <div className="p-4 space-y-3">
                  <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                    <GripVertical className="w-3.5 h-3.5" />質問左上のハンドルをドラッグして順番を変更できます。
                  </p>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => handleFieldDragEnd(sec.id, event)}>
                    <SortableContext items={sec.fields.map((field) => field.id)} strategy={verticalListSortingStrategy}>
                  {sec.fields.map((field) => (
                    <SortableBlock
                      key={field.id}
                      id={field.id}
                      highlighted={highlightedId === field.id}
                      className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2 text-xs"
                    >
                      {(fieldDragHandleProps) => (<>
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <button
                          type="button"
                          {...fieldDragHandleProps}
                          className="min-h-9 touch-none cursor-grab rounded-md border border-slate-300 bg-white px-2 text-[11px] font-bold text-slate-600 flex items-center gap-1 active:cursor-grabbing"
                          aria-label={`${field.label}をドラッグして並べ替え`}
                          title="ドラッグして並べ替え"
                        >
                          <GripVertical className="w-4 h-4" />並べ替え
                        </button>
                        <span className="rounded-full bg-white px-2 py-1 text-[10px] text-slate-500">質問 {sec.fields.findIndex((item) => item.id === field.id) + 1}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-slate-700 block mb-0.5">
                            項目見出し
                          </label>
                          <input
                            type="text"
                            value={field.label}
                            onChange={(e) =>
                              handleUpdateField(sec.id, field.id, { label: e.target.value })
                            }
                            className="w-full bg-white font-bold border border-slate-300 rounded-md p-1.5"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-700 block mb-0.5">
                            記録画面の質問文
                          </label>
                          <input
                            type="text"
                            value={field.questionTitle || ''}
                            onChange={(e) => handleUpdateField(sec.id, field.id, { questionTitle: e.target.value })}
                            placeholder="未入力時は項目名から自動作成"
                            className="w-full bg-white border border-slate-300 rounded-md p-1.5"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-700 block mb-0.5">
                            入力形式
                          </label>
                          <select
                            value={field.type}
                            onChange={(e) => handleChangeFieldType(sec.id, field.id, e.target.value as FieldType)}
                            className="w-full bg-white border border-slate-300 rounded-md p-1.5"
                          >
                            <option value="radio">単一選択 (ラジオボタン)</option>
                            <option value="checkbox">複数選択 (チェックボックス)</option>
                            <option value="number">数値入力 (時間・回数)</option>
                            <option value="text">テキスト入力</option>
                            <option value="textarea">長文入力</option>
                            <option value="time_select">時刻入力</option>
                            <option value="fatigue_scale">5段階評価（疲労感）</option>
                            <option value="rating_scale">説明付き5段階評価</option>
                            <option value="hand_count">左右固定数値（左手・右手）</option>
                            <option value="homework_subjects">教科連動選択（宿題内容）</option>
                            <option value="study_extras">宿題以外の学習（条件入力）</option>
                            <option value="pc_activities">パソコン取り組み（条件入力）</option>
                            <option value="meal_details">食事詳細（時間・量・備考）</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-700 block mb-0.5">
                            選択肢 (カンマ区切り)
                          </label>
                          <input
                            type="text"
                            value={field.options ? field.options.join(', ') : ''}
                            onChange={(e) =>
                              handleUpdateField(sec.id, field.id, {
                                options: e.target.value
                                  .split(',')
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              })
                            }
                            placeholder="例: なし, あり"
                            disabled={!['radio', 'checkbox', 'rating_scale'].includes(field.type)}
                            className="w-full bg-white border border-slate-300 rounded-md p-1.5 disabled:opacity-50"
                          />
                        </div>
                      </div>

                      {field.type === 'homework_subjects' && (
                        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-[11px] leading-relaxed text-indigo-950">
                          <strong>教科連動選択：</strong>
                          教科は「{HOMEWORK_SUBJECTS.join('、')}」で固定されます。主要5教科を選ぶと教材種別、自学・その他を選ぶと自由記入欄が記録画面に表示されます。
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="text-[11px] font-bold text-slate-700">
                          質問の補足文
                          <input
                            type="text"
                            value={field.helpText || ''}
                            onChange={(e) => handleUpdateField(sec.id, field.id, { helpText: e.target.value })}
                            placeholder="例：当てはまるものをすべて選択してください。"
                            className="mt-1 w-full bg-white font-normal border border-slate-300 rounded-md p-1.5"
                          />
                        </label>
                        <label className="text-[11px] font-bold text-slate-700">
                          備考欄の案内文
                          <input
                            type="text"
                            value={field.notePlaceholder || ''}
                            onChange={(e) => handleUpdateField(sec.id, field.id, { notePlaceholder: e.target.value })}
                            placeholder="例：気になった点を簡潔に入力"
                            disabled={!field.hasNote}
                            className="mt-1 w-full bg-white font-normal border border-slate-300 rounded-md p-1.5 disabled:opacity-50"
                          />
                        </label>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                        <div className="flex flex-wrap gap-4">
                          <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                            <input
                              type="checkbox"
                              checked={field.hasNote || false}
                              onChange={(e) => handleUpdateField(sec.id, field.id, { hasNote: e.target.checked })}
                              disabled={['homework_subjects', 'study_extras', 'pc_activities', 'meal_details'].includes(field.type)}
                              className="rounded-xs text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>備考入力欄を表示</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                            <input
                              type="checkbox"
                              checked={field.required || false}
                              onChange={(e) => handleUpdateField(sec.id, field.id, { required: e.target.checked })}
                              className="rounded-xs text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>必須項目</span>
                          </label>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveField(sec.id, field.id)}
                          className="text-rose-600 hover:text-rose-800 text-[11px] font-semibold flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> 削除
                        </button>
                      </div>
                      </>)}
                    </SortableBlock>
                  ))}
                    </SortableContext>
                  </DndContext>
                </div>
                </>)}
              </SortableBlock>
            ))}
              </SortableContext>
            </DndContext>
          </div>

          {/* Bottom Save Bar */}
          <div className="bg-slate-900 text-white p-4 rounded-xl shadow-lg flex items-center justify-between border border-slate-800">
            <span className="text-xs text-slate-300">
              カスタマイズしたテンプレートは即座に記録作成画面に反映されます
            </span>
            <button
              onClick={handleSave}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-6 py-2.5 rounded-lg shadow-md transition-all flex items-center gap-2 active:scale-95"
            >
              <Save className="w-4 h-4" />
              テンプレートの変更を保存する
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

function SortableBlock({
  id,
  className,
  highlighted,
  children,
}: {
  key?: React.Key;
  id: string;
  className: string;
  highlighted?: boolean;
  children: (dragHandleProps: Record<string, unknown>) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 20 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-sortable-id={id}
      className={`${className} transition-[border-color,box-shadow,background-color] duration-500 ${
        highlighted ? 'border-emerald-500 ring-4 ring-emerald-200 shadow-lg' : ''
      }`}
    >
      {children({ ...attributes, ...listeners })}
    </div>
  );
}
