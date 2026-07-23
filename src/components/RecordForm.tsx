import React, { useEffect, useMemo, useState } from 'react';
import {
  Template,
  ChildProfile,
  SupportRecord,
  AttendanceType,
  ExpressionType,
  SnackType,
  SectionAnswer,
  SupportPlan,
  FiveDomain,
  GoalProgressStatus,
  TemplateField,
} from '../types';
import {
  AlertCircle,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FileText,
  Save,
  Sparkles,
  Target,
  User,
  UserPlus,
} from 'lucide-react';
import { polishRecordTextWithAI } from '../utils/aiHelper';
import { FIVE_DOMAINS } from '../constants';

interface RecordFormProps {
  templates: Template[];
  childrenList: ChildProfile[];
  supportPlans: SupportPlan[];
  initialRecord?: SupportRecord | null;
  defaultRecorderName?: string;
  onSaveRecord: (record: SupportRecord) => Promise<void> | void;
  onAddChild: (child: ChildProfile) => Promise<void> | void;
}

type StepKind =
  | 'template'
  | 'child'
  | 'date'
  | 'attendance'
  | 'expression'
  | 'snack'
  | 'recorder'
  | 'service-time'
  | 'transportation'
  | 'plan'
  | 'domains'
  | 'domain-progress'
  | 'section-subtitle'
  | 'field'
  | 'section-detail'
  | 'review';

interface WizardStep {
  id: string;
  kind: StepKind;
  title: string;
  help?: string;
  sectionId?: string;
  fieldId?: string;
  domain?: FiveDomain;
}

const inputClass = 'w-full min-h-12 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base sm:text-sm text-slate-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-200 outline-none';
const choiceClass = 'min-h-12 rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors text-center';

export const RecordForm: React.FC<RecordFormProps> = ({
  templates,
  childrenList,
  supportPlans,
  initialRecord,
  defaultRecorderName,
  onSaveRecord,
  onAddChild,
}) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    initialRecord?.templateId || templates[0]?.id || 'template-weekday'
  );
  const activeTemplate = templates.find((item) => item.id === selectedTemplateId) || templates[0];
  const [selectedChildId, setSelectedChildId] = useState(initialRecord?.childId || childrenList[0]?.id || '');
  const [date, setDate] = useState(initialRecord?.date || new Date().toISOString().split('T')[0]);
  const [attendance, setAttendance] = useState<AttendanceType>(initialRecord?.attendance || '出席');
  const [expression, setExpression] = useState<ExpressionType>(initialRecord?.expression || '笑顔');
  const [snack, setSnack] = useState<SnackType>(initialRecord?.snack || '完食');
  const [recorderName, setRecorderName] = useState(initialRecord?.recorderName || defaultRecorderName || '指導員');
  const [serviceStartTime, setServiceStartTime] = useState(initialRecord?.serviceStartTime || '');
  const [serviceEndTime, setServiceEndTime] = useState(initialRecord?.serviceEndTime || '');
  const [transportation, setTransportation] = useState<NonNullable<SupportRecord['transportation']>>(
    initialRecord?.transportation || '送迎なし'
  );
  const [supportPlanId, setSupportPlanId] = useState(initialRecord?.supportPlanId || '');
  const [fiveDomains, setFiveDomains] = useState<FiveDomain[]>(initialRecord?.fiveDomains || []);
  const [goalProgress, setGoalProgress] = useState(initialRecord?.goalProgress || []);
  const [sectionAnswers, setSectionAnswers] = useState<Record<string, SectionAnswer>>({});
  const [polishingSectionId, setPolishingSectionId] = useState<string | null>(null);
  const [showQuickChildModal, setShowQuickChildModal] = useState(false);
  const [newChildName, setNewChildName] = useState('');
  const [newChildGrade, setNewChildGrade] = useState('小学3年生');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const availablePlans = supportPlans.filter(
    (plan) => plan.childId === selectedChildId && plan.status === '有効'
  );
  const selectedChild = childrenList.find((child) => child.id === selectedChildId);
  const selectedPlan = supportPlans.find((plan) => plan.id === supportPlanId);

  useEffect(() => {
    if (!selectedChildId && childrenList[0]) setSelectedChildId(childrenList[0].id);
  }, [childrenList, selectedChildId]);

  useEffect(() => {
    if (initialRecord?.childId === selectedChildId) return;
    const plan = supportPlans.find((item) => item.childId === selectedChildId && item.status === '有効');
    setSupportPlanId(plan?.id || '');
    setFiveDomains(plan ? FIVE_DOMAINS.filter((domain) => Boolean(plan.domainGoals[domain])) : []);
    setGoalProgress([]);
  }, [selectedChildId, supportPlans, initialRecord]);

  useEffect(() => {
    if (initialRecord?.sectionAnswers) {
      setSectionAnswers(initialRecord.sectionAnswers);
      return;
    }
    if (!activeTemplate) return;
    const initialized: Record<string, SectionAnswer> = {};
    activeTemplate.sections.forEach((section) => {
      const answers: Record<string, { value: string; note?: string }> = {};
      section.fields.forEach((field) => {
        answers[field.id] = {
          value: field.defaultValue || (field.options ? field.options[0] : ''),
          note: '',
        };
      });
      initialized[section.id] = {
        sectionId: section.id,
        sectionTitle: section.title,
        subTitleValue: section.hasSubTitleField ? '' : undefined,
        answers,
        detailText: '',
      };
    });
    setSectionAnswers(initialized);
  }, [selectedTemplateId, initialRecord, activeTemplate]);

  const steps = useMemo<WizardStep[]>(() => {
    const nextSteps: WizardStep[] = [
      { id: 'template', kind: 'template', title: 'どの記録フォーマットを使いますか？', help: '利用日の種類に合うものを選択してください。' },
      { id: 'child', kind: 'child', title: '誰の記録を作成しますか？', help: '対象児童を1名選択します。' },
      { id: 'date', kind: 'date', title: 'いつの支援記録ですか？' },
      { id: 'attendance', kind: 'attendance', title: '本日の出欠を教えてください。' },
      { id: 'expression', kind: 'expression', title: '来所時の表情はどうでしたか？' },
      { id: 'snack', kind: 'snack', title: 'おやつの状況を選んでください。' },
      { id: 'recorder', kind: 'recorder', title: 'この記録を入力する職員は誰ですか？' },
    ];

    if (attendance !== '欠席') {
      nextSteps.push({ id: 'service-time', kind: 'service-time', title: '支援時間は何時から何時までですか？' });
    }

    nextSteps.push(
      { id: 'transportation', kind: 'transportation', title: '送迎の状況を選んでください。' },
      { id: 'plan', kind: 'plan', title: '個別支援計画と関連付けますか？', help: '該当する計画がなければ「関連付けなし」で進められます。' },
      { id: 'domains', kind: 'domains', title: '本日の支援に関連する5領域はどれですか？', help: '複数選択できます。該当しない場合は選択せず進められます。' }
    );

    fiveDomains.forEach((domain) => {
      nextSteps.push({
        id: `domain-${domain}`,
        kind: 'domain-progress',
        domain,
        title: `「${domain}」の目標に対する状況は？`,
      });
    });

    activeTemplate?.sections.forEach((section) => {
      if (section.hasSubTitleField) {
        nextSteps.push({
          id: `subtitle-${section.id}`,
          kind: 'section-subtitle',
          sectionId: section.id,
          title: `${section.title}の「${section.subTitleLabel || '取組内容'}」は何ですか？`,
          help: '具体的な活動名や課題名を入力してください。未実施の場合は空欄でも進められます。',
        });
      }
      section.fields.forEach((field) => {
        nextSteps.push({
          id: `field-${section.id}-${field.id}`,
          kind: 'field',
          sectionId: section.id,
          fieldId: field.id,
          title: `${section.title}：${field.label}`,
        });
      });
      nextSteps.push({
        id: `detail-${section.id}`,
        kind: 'section-detail',
        sectionId: section.id,
        title: `${section.title}での具体的な様子を記録しますか？`,
        help: '職員の関わりと本人の反応を入力すると、AIで記録文へ整えられます。',
      });
    });

    nextSteps.push({ id: 'review', kind: 'review', title: '入力内容を確認してください。' });
    return nextSteps;
  }, [activeTemplate, attendance, fiveDomains]);

  useEffect(() => {
    if (currentStepIndex > steps.length - 1) setCurrentStepIndex(Math.max(0, steps.length - 1));
  }, [currentStepIndex, steps.length]);

  const currentStep = steps[currentStepIndex];
  const progress = steps.length > 0 ? ((currentStepIndex + 1) / steps.length) * 100 : 0;

  const updateField = (sectionId: string, fieldId: string, value: string, note?: string) => {
    setSectionAnswers((previous) => {
      const section = previous[sectionId] || { sectionId, sectionTitle: '', answers: {} };
      const answer = section.answers[fieldId] || { value: '', note: '' };
      return {
        ...previous,
        [sectionId]: {
          ...section,
          answers: {
            ...section.answers,
            [fieldId]: {
              value,
              note: note === undefined ? answer.note : note,
            },
          },
        },
      };
    });
  };

  const updateSection = (sectionId: string, updates: Partial<SectionAnswer>) => {
    setSectionAnswers((previous) => ({
      ...previous,
      [sectionId]: { ...previous[sectionId], ...updates },
    }));
  };

  const toggleDomain = (domain: FiveDomain) => {
    setFiveDomains((previous) => previous.includes(domain)
      ? previous.filter((item) => item !== domain)
      : [...previous, domain]);
    setGoalProgress((previous) => previous.some((item) => item.domain === domain)
      ? previous.filter((item) => item.domain !== domain)
      : [...previous, { domain, status: '未評価' }]);
  };

  const updateGoalProgress = (domain: FiveDomain, status: GoalProgressStatus, note?: string) => {
    setGoalProgress((previous) => {
      const current = previous.find((item) => item.domain === domain) || { domain, status: '未評価' as const };
      const next = { ...current, status, note: note === undefined ? current.note : note };
      return previous.some((item) => item.domain === domain)
        ? previous.map((item) => item.domain === domain ? next : item)
        : [...previous, next];
    });
  };

  const polishSection = async (sectionId: string, sectionTitle: string) => {
    setPolishingSectionId(sectionId);
    const section = sectionAnswers[sectionId];
    const checkSummary = (Object.values(section?.answers ?? {}) as Array<{ value: string; note?: string }>)
      .map((item) => `${item.value}${item.note ? `(${item.note})` : ''}`)
      .filter(Boolean)
      .join(', ');
    const polishedText = await polishRecordTextWithAI(
      selectedChild?.name || '児童',
      sectionTitle,
      checkSummary,
      section?.detailText || '',
      initialRecord?.id
    );
    updateSection(sectionId, { detailText: polishedText });
    setPolishingSectionId(null);
  };

  const validateCurrentStep = () => {
    if (!currentStep) return null;
    if (currentStep.kind === 'template' && !activeTemplate) return '記録フォーマットを選択してください。';
    if (currentStep.kind === 'child' && !selectedChildId) return '対象児童を選択してください。';
    if (currentStep.kind === 'date' && !date) return '記録日付を入力してください。';
    if (currentStep.kind === 'recorder' && !recorderName.trim()) return '記録者名を入力してください。';
    if (currentStep.kind === 'service-time') {
      if (!serviceStartTime || !serviceEndTime) return '開始時刻と終了時刻を入力してください。';
      if (serviceStartTime >= serviceEndTime) return '終了時刻は開始時刻より後にしてください。';
    }
    if (currentStep.kind === 'field' && currentStep.sectionId && currentStep.fieldId) {
      const field = activeTemplate?.sections
        .find((section) => section.id === currentStep.sectionId)?.fields
        .find((item) => item.id === currentStep.fieldId);
      const value = sectionAnswers[currentStep.sectionId]?.answers[currentStep.fieldId]?.value;
      if (field?.required && !value) return 'この項目を入力してください。';
    }
    return null;
  };

  const moveToStep = (index: number) => {
    setStepError(null);
    setSaveError(null);
    setCurrentStepIndex(Math.max(0, Math.min(index, steps.length - 1)));
    document.getElementById('record-wizard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const goNext = () => {
    const error = validateCurrentStep();
    if (error) {
      setStepError(error);
      return;
    }
    moveToStep(currentStepIndex + 1);
  };

  const handleSaveQuickChild = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newChildName.trim()) return;
    const child: ChildProfile = {
      id: `child-${Date.now()}`,
      name: newChildName.trim(),
      grade: newChildGrade,
      careType: '放課後等デイサービス',
    };
    await onAddChild(child);
    setSelectedChildId(child.id);
    setNewChildName('');
    setShowQuickChildModal(false);
  };

  const jumpToKind = (kind: StepKind) => {
    const index = steps.findIndex((step) => step.kind === kind);
    if (index >= 0) moveToStep(index);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaveError(null);
    if (!activeTemplate) {
      setSaveError('記録テンプレートがありません。管理者に設定を依頼してください。');
      return;
    }
    if (!selectedChildId) {
      setSaveError('対象児童を選択してください。');
      jumpToKind('child');
      return;
    }
    if (attendance !== '欠席' && (!serviceStartTime || !serviceEndTime || serviceStartTime >= serviceEndTime)) {
      setSaveError('支援時間を確認してください。');
      jumpToKind('service-time');
      return;
    }

    const record: SupportRecord = {
      id: initialRecord?.id || `rec-${Date.now()}`,
      templateId: activeTemplate.id,
      templateName: activeTemplate.name,
      templateType: activeTemplate.type,
      templateSectionsSnapshot: activeTemplate.sections,
      childId: selectedChildId,
      childName: selectedChild?.name || '名称未記入',
      date,
      attendance,
      expression,
      snack,
      recorderName: recorderName.trim() || '指導員',
      serviceStartTime: attendance === '欠席' ? undefined : serviceStartTime,
      serviceEndTime: attendance === '欠席' ? undefined : serviceEndTime,
      transportation,
      supportPlanId: supportPlanId || undefined,
      fiveDomains,
      goalProgress,
      sectionAnswers,
      approvalStatus: initialRecord?.approvalStatus || '未確認',
      jihatsukanComment: initialRecord?.jihatsukanComment,
      reviewedBy: initialRecord?.reviewedBy,
      reviewedAt: initialRecord?.reviewedAt,
      createdAt: initialRecord?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setIsSaving(true);
    try {
      await onSaveRecord(record);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存できませんでした。');
    } finally {
      setIsSaving(false);
    }
  };

  const renderField = (field: TemplateField, sectionId: string) => {
    const answer = sectionAnswers[sectionId]?.answers[field.id] || { value: field.defaultValue || '', note: '' };
    const selectedValues = answer.value ? answer.value.split('、') : [];
    return (
      <div className="space-y-4">
        {field.type === 'radio' && field.options && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {field.options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => updateField(sectionId, field.id, option)}
                className={`${choiceClass} ${answer.value === option ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-700 active:bg-slate-100'}`}
              >
                {answer.value === option && <Check className="inline w-4 h-4 mr-1" />}{option}
              </button>
            ))}
          </div>
        )}
        {field.type === 'checkbox' && field.options && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {field.options.map((option) => {
              const selected = selectedValues.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    const next = selected ? selectedValues.filter((item) => item !== option) : [...selectedValues, option];
                    updateField(sectionId, field.id, next.join('、'));
                  }}
                  className={`${choiceClass} text-left ${selected ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}
                >
                  {selected && <Check className="inline w-4 h-4 mr-1" />}{option}
                </button>
              );
            })}
          </div>
        )}
        {field.type === 'number' && (
          <div className="flex items-center gap-3">
            <input type="number" value={answer.value} onChange={(event) => updateField(sectionId, field.id, event.target.value)} className={inputClass} />
            {field.unit && <span className="shrink-0 text-sm font-bold text-slate-600">{field.unit}</span>}
          </div>
        )}
        {field.type === 'text' && (
          <input type="text" value={answer.value} onChange={(event) => updateField(sectionId, field.id, event.target.value)} className={inputClass} />
        )}
        {field.type === 'textarea' && (
          <textarea rows={5} value={answer.value} onChange={(event) => updateField(sectionId, field.id, event.target.value)} className={inputClass} />
        )}
        {field.type === 'time_select' && (
          <input type="time" value={answer.value} onChange={(event) => updateField(sectionId, field.id, event.target.value)} className={inputClass} />
        )}
        {field.hasNote && (
          <label className="block text-sm font-bold text-slate-700">
            補足（任意）
            <input
              type="text"
              value={answer.note || ''}
              onChange={(event) => updateField(sectionId, field.id, answer.value, event.target.value)}
              placeholder={field.notePlaceholder || '補足事項を入力'}
              className={`${inputClass} mt-2`}
            />
          </label>
        )}
      </div>
    );
  };

  const renderStep = () => {
    if (!currentStep) return null;
    switch (currentStep.kind) {
      case 'template':
        return (
          <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} className={inputClass}>
            {templates.map((template) => <option key={template.id} value={template.id}>{template.name}（{template.type}）</option>)}
          </select>
        );
      case 'child':
        return (
          <div className="space-y-3">
            <select value={selectedChildId} onChange={(event) => setSelectedChildId(event.target.value)} className={inputClass}>
              <option value="">児童を選択してください</option>
              {childrenList.map((child) => <option key={child.id} value={child.id}>{child.name}（{child.grade || '学年未設定'}）</option>)}
            </select>
            <button type="button" onClick={() => setShowQuickChildModal(true)} className="min-h-11 w-full rounded-xl border border-teal-300 bg-teal-50 text-teal-800 text-sm font-bold flex items-center justify-center gap-2">
              <UserPlus className="w-4 h-4" />名簿にいない児童を追加
            </button>
          </div>
        );
      case 'date':
        return <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} />;
      case 'attendance':
        return (
          <div className="grid grid-cols-2 gap-2">
            {(['出席', '欠席', '遅刻', '早退', 'その他'] as AttendanceType[]).map((item) => (
              <button key={item} type="button" onClick={() => setAttendance(item)} className={`${choiceClass} ${attendance === item ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}>
                {attendance === item && <Check className="inline w-4 h-4 mr-1" />}{item}
              </button>
            ))}
          </div>
        );
      case 'expression':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(['笑顔', '真顔', '暗め', '泣き顔', '不機嫌', 'その他'] as ExpressionType[]).map((item) => (
              <button key={item} type="button" onClick={() => setExpression(item)} className={`${choiceClass} ${expression === item ? 'bg-amber-500 border-amber-500 text-slate-950' : 'bg-white border-slate-300 text-slate-700'}`}>
                {expression === item && <Check className="inline w-4 h-4 mr-1" />}{item}
              </button>
            ))}
          </div>
        );
      case 'snack':
        return (
          <div className="grid grid-cols-2 gap-2">
            {(['完食', '半量食べた', '残した', '不食', 'なし'] as SnackType[]).map((item) => (
              <button key={item} type="button" onClick={() => setSnack(item)} className={`${choiceClass} ${snack === item ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}>
                {snack === item && <Check className="inline w-4 h-4 mr-1" />}{item}
              </button>
            ))}
          </div>
        );
      case 'recorder':
        return <input type="text" value={recorderName} onChange={(event) => setRecorderName(event.target.value)} placeholder="例：山田 指導員" className={inputClass} />;
      case 'service-time':
        return (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-bold text-slate-700">開始時刻<input type="time" value={serviceStartTime} onChange={(event) => setServiceStartTime(event.target.value)} className={`${inputClass} mt-2`} /></label>
            <label className="text-sm font-bold text-slate-700">終了時刻<input type="time" value={serviceEndTime} onChange={(event) => setServiceEndTime(event.target.value)} className={`${inputClass} mt-2`} /></label>
          </div>
        );
      case 'transportation':
        return (
          <div className="grid grid-cols-2 gap-2">
            {(['送迎なし', '迎えのみ', '送りのみ', '往復'] as const).map((item) => (
              <button key={item} type="button" onClick={() => setTransportation(item)} className={`${choiceClass} ${transportation === item ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}>
                {transportation === item && <Check className="inline w-4 h-4 mr-1" />}{item}
              </button>
            ))}
          </div>
        );
      case 'plan':
        return (
          <div className="space-y-4">
            <select value={supportPlanId} onChange={(event) => setSupportPlanId(event.target.value)} className={inputClass}>
              <option value="">関連付けなし</option>
              {availablePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.title}</option>)}
            </select>
            {availablePlans.length === 0 && <p className="text-sm text-slate-500">この児童には有効な個別支援計画が登録されていません。</p>}
            {selectedPlan && <div className="rounded-xl bg-teal-50 border border-teal-200 p-3 text-sm text-teal-900"><strong>短期目標：</strong>{selectedPlan.shortTermGoal}</div>}
          </div>
        );
      case 'domains':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {FIVE_DOMAINS.map((domain) => (
              <button key={domain} type="button" onClick={() => toggleDomain(domain)} className={`${choiceClass} text-left ${fiveDomains.includes(domain) ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}>
                {fiveDomains.includes(domain) && <Check className="inline w-4 h-4 mr-1" />}{domain}
              </button>
            ))}
          </div>
        );
      case 'domain-progress': {
        const domain = currentStep.domain!;
        const goal = goalProgress.find((item) => item.domain === domain);
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {(['未評価', '達成', '一部達成', '継続支援'] as GoalProgressStatus[]).map((status) => (
                <button key={status} type="button" onClick={() => updateGoalProgress(domain, status)} className={`${choiceClass} ${goal?.status === status ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}>{status}</button>
              ))}
            </div>
            <label className="block text-sm font-bold text-slate-700">児童の反応・次回への申し送り（任意）<textarea rows={4} value={goal?.note || ''} onChange={(event) => updateGoalProgress(domain, goal?.status || '未評価', event.target.value)} className={`${inputClass} mt-2`} /></label>
          </div>
        );
      }
      case 'section-subtitle': {
        const section = activeTemplate?.sections.find((item) => item.id === currentStep.sectionId);
        const answer = sectionAnswers[currentStep.sectionId!];
        return <input type="text" value={answer?.subTitleValue || ''} onChange={(event) => updateSection(currentStep.sectionId!, { subTitleValue: event.target.value })} placeholder={`例：${section?.title === '学習' ? '学校の宿題・漢字練習' : '活動名・取組内容'}`} className={inputClass} />;
      }
      case 'field': {
        const section = activeTemplate?.sections.find((item) => item.id === currentStep.sectionId);
        const field = section?.fields.find((item) => item.id === currentStep.fieldId);
        return field && currentStep.sectionId ? renderField(field, currentStep.sectionId) : null;
      }
      case 'section-detail': {
        const section = activeTemplate?.sections.find((item) => item.id === currentStep.sectionId);
        const answer = sectionAnswers[currentStep.sectionId!];
        return (
          <div className="space-y-3">
            <textarea
              rows={7}
              value={answer?.detailText || ''}
              onChange={(event) => updateSection(currentStep.sectionId!, { detailText: event.target.value })}
              placeholder="職員の声掛け、本人の反応、次回につなげたい点などを具体的に入力してください。"
              className={inputClass}
            />
            <button type="button" onClick={() => void polishSection(currentStep.sectionId!, section?.title || '')} disabled={polishingSectionId === currentStep.sectionId} className="min-h-12 w-full rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-800 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              <Sparkles className="w-4 h-4" />{polishingSectionId === currentStep.sectionId ? '文章を生成中...' : '入力内容をAIで記録文に整える'}
            </button>
            <p className="text-xs text-indigo-700 flex gap-1.5"><AlertCircle className="w-4 h-4 shrink-0" />AI生成文は下書きです。入力にない事実が含まれていないか確認してください。</p>
          </div>
        );
      }
      case 'review':
        return (
          <div className="space-y-4 text-sm">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <h4 className="font-bold text-slate-900 flex items-center gap-2"><User className="w-4 h-4 text-teal-600" />基本情報</h4>
              <p><span className="text-slate-500">児童：</span>{selectedChild?.name || '未選択'}</p>
              <p><span className="text-slate-500">日付：</span>{date}　<span className="text-slate-500">出欠：</span>{attendance}</p>
              <p><span className="text-slate-500">支援時間：</span>{attendance === '欠席' ? '―' : `${serviceStartTime}〜${serviceEndTime}`}　<span className="text-slate-500">記録者：</span>{recorderName}</p>
              <p><span className="text-slate-500">表情：</span>{expression}　<span className="text-slate-500">おやつ：</span>{snack}　<span className="text-slate-500">送迎：</span>{transportation}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <h4 className="font-bold text-slate-900 flex items-center gap-2"><Target className="w-4 h-4 text-teal-600" />計画・5領域</h4>
              <p><span className="text-slate-500">計画：</span>{selectedPlan?.title || '関連付けなし'}</p>
              <p><span className="text-slate-500">領域：</span>{fiveDomains.join('、') || '選択なし'}</p>
            </div>
            {activeTemplate?.sections.map((section) => {
              const answer = sectionAnswers[section.id];
              const summary = section.fields.map((field) => {
                const value = answer?.answers[field.id];
                return `${field.label}: ${value?.value || '―'}${value?.note ? `（${value.note}）` : ''}`;
              });
              return (
                <div key={section.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                  <h4 className="font-bold text-slate-900">{section.title}{answer?.subTitleValue ? `：${answer.subTitleValue}` : ''}</h4>
                  <p className="text-xs leading-relaxed text-slate-600">{summary.join('／')}</p>
                  {answer?.detailText && <p className="whitespace-pre-wrap leading-relaxed border-t border-slate-100 pt-2">{answer.detailText}</p>}
                </div>
              );
            })}
          </div>
        );
    }
  };

  return (
    <div id="record-wizard" className="max-w-3xl mx-auto space-y-4 scroll-mt-20">
      <div className="rounded-2xl bg-gradient-to-br from-teal-900 via-slate-900 to-indigo-950 text-white p-4 sm:p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/30 bg-teal-400/10 px-2.5 py-1 text-[11px] font-bold text-teal-200">
              <FileText className="w-3.5 h-3.5" />1問ずつ入力
            </span>
            <h2 className="mt-2 text-lg font-bold">{initialRecord ? '支援経過記録を編集' : '支援経過記録を作成'}</h2>
            <p className="mt-1 text-xs text-slate-300">迷わず順番に進めます。入力内容は画面を戻って修正できます。</p>
          </div>
          <div className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-center">
            <div className="text-lg font-bold">{currentStepIndex + 1}</div>
            <div className="text-[10px] text-slate-300">全{steps.length}問</div>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-700">
          <div className="h-full rounded-full bg-teal-400 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <section className="min-h-[360px] rounded-2xl border border-slate-200 bg-white p-4 sm:p-7 shadow-sm">
          <div className="mb-6 border-b border-slate-100 pb-4">
            <p className="text-xs font-bold text-teal-700">質問 {currentStepIndex + 1}</p>
            <h3 className="mt-1 text-lg sm:text-xl font-bold leading-snug text-slate-900">{currentStep?.title}</h3>
            {currentStep?.help && <p className="mt-2 text-sm leading-relaxed text-slate-500">{currentStep.help}</p>}
          </div>
          {renderStep()}
          {stepError && <div className="mt-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="w-5 h-5 shrink-0" />{stepError}</div>}
          {saveError && <div className="mt-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="w-5 h-5 shrink-0" />{saveError}</div>}
        </section>

        <div className="sticky bottom-20 md:bottom-4 z-20 flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-950 p-3 shadow-2xl">
          <button
            type="button"
            onClick={() => moveToStep(currentStepIndex - 1)}
            disabled={currentStepIndex === 0}
            className="min-h-12 min-w-24 rounded-xl border border-slate-600 px-4 text-sm font-bold text-slate-200 disabled:opacity-30 flex items-center justify-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />戻る
          </button>
          <div className="hidden sm:block flex-1 text-center text-xs text-slate-400">{Math.round(progress)}% 完了</div>
          {currentStep?.kind === 'review' ? (
            <button type="submit" disabled={isSaving} className="min-h-12 flex-1 sm:flex-none rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white disabled:bg-slate-600 flex items-center justify-center gap-2">
              <Save className="w-4 h-4" />{isSaving ? '保存中...' : 'この内容で保存'}
            </button>
          ) : (
            <button type="button" onClick={goNext} className="min-h-12 flex-1 sm:flex-none rounded-xl bg-teal-600 px-6 text-sm font-bold text-white flex items-center justify-center gap-1">
              次へ<ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>

      {showQuickChildModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 p-0 sm:p-4">
          <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white p-5 shadow-2xl pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <h3 className="text-base font-bold text-slate-900">児童を名簿へ追加</h3>
            <form onSubmit={handleSaveQuickChild} className="mt-4 space-y-4">
              <label className="block text-sm font-bold text-slate-700">児童氏名<input value={newChildName} onChange={(event) => setNewChildName(event.target.value)} required className={`${inputClass} mt-2`} /></label>
              <label className="block text-sm font-bold text-slate-700">学年
                <select value={newChildGrade} onChange={(event) => setNewChildGrade(event.target.value)} className={`${inputClass} mt-2`}>
                  {['未就学', '小学1年生', '小学2年生', '小学3年生', '小学4年生', '小学5年生', '小学6年生', '中学生', '高校生'].map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button type="button" onClick={() => setShowQuickChildModal(false)} className="min-h-12 rounded-xl border border-slate-300 text-sm font-bold text-slate-700">キャンセル</button>
                <button type="submit" className="min-h-12 rounded-xl bg-teal-600 text-sm font-bold text-white flex items-center justify-center gap-2"><ClipboardCheck className="w-4 h-4" />登録して選択</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
