import React, { useState } from 'react';
import { Template, TemplateSection, TemplateField, WizardQuestionId } from '../types';
import { Plus, Trash2, Edit, Copy, Save, MoveUp, MoveDown, Check, Settings, Sparkles } from 'lucide-react';
import { FATIGUE_SCALE_HELP, FATIGUE_SCALE_OPTIONS, normalizeTemplateFatigueScale } from '../utils/templateNormalizer';
import { getWizardQuestions, WIZARD_QUESTION_LABELS, WIZARD_QUESTION_ORDER } from '../utils/wizardQuestions';

interface TemplateEditorProps {
  templates: Template[];
  onSaveTemplate: (template: Template) => void;
  onDeleteTemplate: (templateId: string) => void;
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({
  templates,
  onSaveTemplate,
  onDeleteTemplate,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(templates[0]);
  const [editingTemplate, setEditingTemplate] = useState<Template>({ ...templates[0] });
  const [isSavedNotice, setIsSavedNotice] = useState(false);

  // Switch active template
  const handleSelectTemplate = (template: Template) => {
    setSelectedTemplate(template);
    setEditingTemplate(JSON.parse(JSON.stringify(template)));
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
              type: 'radio',
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
  };

  // Save template
  const handleSave = () => {
    const normalizedTemplate = normalizeTemplateFatigueScale(editingTemplate);
    onSaveTemplate(normalizedTemplate);
    setEditingTemplate(normalizedTemplate);
    setSelectedTemplate(normalizedTemplate);
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 2500);
  };

  // Section Management
  const handleAddSection = () => {
    const newSec: TemplateSection = {
      id: `sec-${Date.now()}`,
      title: '新しい項目',
      fields: [
        {
          id: `f-${Date.now()}`,
          label: '【新チェック項目】',
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
  };

  const handleRemoveSection = (secId: string) => {
    setEditingTemplate({
      ...editingTemplate,
      sections: editingTemplate.sections.filter((s) => s.id !== secId),
    });
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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
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

        <div className="flex items-center gap-2">
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
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
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

            {editingTemplate.sections.map((sec, secIdx) => (
              <div
                key={sec.id}
                className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden"
              >
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
                  <div className="grid gap-3 rounded-lg border border-slate-200 bg-indigo-50/40 p-3 sm:grid-cols-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean(sec.hasSubTitleField)}
                        onChange={(event) => setEditingTemplate({
                          ...editingTemplate,
                          sections: editingTemplate.sections.map((item) => item.id === sec.id ? { ...item, hasSubTitleField: event.target.checked } : item),
                        })}
                      />
                      取組内容・活動名の質問を表示
                    </label>
                    <label className="text-xs font-bold text-slate-700">質問内の項目名
                      <input
                        value={sec.subTitleLabel || ''}
                        disabled={!sec.hasSubTitleField}
                        onChange={(event) => setEditingTemplate({
                          ...editingTemplate,
                          sections: editingTemplate.sections.map((item) => item.id === sec.id ? { ...item, subTitleLabel: event.target.value } : item),
                        })}
                        placeholder="例：取組内容"
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 font-normal disabled:opacity-50"
                      />
                    </label>
                  </div>
                  {sec.fields.map((field) => (
                    <div
                      key={field.id}
                      className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2 text-xs"
                    >
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
                            入力形式
                          </label>
                          <select
                            value={field.type}
                            onChange={(e) =>
                              handleUpdateField(sec.id, field.id, {
                                type: e.target.value as any,
                              })
                            }
                            className="w-full bg-white border border-slate-300 rounded-md p-1.5"
                          >
                            <option value="radio">単一選択 (ラジオボタン)</option>
                            <option value="checkbox">複数選択 (チェックボックス)</option>
                            <option value="number">数値入力 (時間・回数)</option>
                            <option value="text">テキスト入力</option>
                            <option value="textarea">長文入力</option>
                            <option value="time_select">時刻入力</option>
                            <option value="hand_count">左手・右手の指本数（固定ラベル）</option>
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
                            disabled={!['radio', 'checkbox'].includes(field.type)}
                            className="w-full bg-white border border-slate-300 rounded-md p-1.5 disabled:opacity-50"
                          />
                        </div>
                      </div>

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
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
