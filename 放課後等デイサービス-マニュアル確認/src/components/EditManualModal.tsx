import React, { useState, useEffect } from 'react';
import { 
  X, 
  Save, 
  Trash2, 
  Plus, 
  ArrowUp, 
  ArrowDown, 
  AlertTriangle, 
  Phone, 
  CheckSquare, 
  FileText, 
  Sparkles,
  ShieldCheck,
  Paperclip,
  Upload,
  Eye,
  CheckCircle2
} from 'lucide-react';
import { Manual, ManualCategory, ManualSeverity, StaffRole, MasterOptions } from '../types';

interface EditManualModalProps {
  isOpen: boolean;
  manual: Manual | null; // null means create mode
  masterOptions?: MasterOptions;
  onClose: () => void;
  onSave: (manual: Manual) => void;
  onDelete?: (manualId: string) => void;
}

export const EditManualModal: React.FC<EditManualModalProps> = ({
  isOpen,
  manual,
  masterOptions,
  onClose,
  onSave,
  onDelete,
}) => {
  if (!isOpen) return null;

  const isEditMode = !!manual;

  // Form states
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ManualCategory>('emergency');
  const [categoryLabel, setCategoryLabel] = useState('緊急・危機管理');
  const [severity, setSeverity] = useState<ManualSeverity>('critical');
  const [isStatutoryMandatory, setIsStatutoryMandatory] = useState(false);
  const [summary, setSummary] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState(5);
  const [version, setVersion] = useState('1.0');
  const [targetRoles, setTargetRoles] = useState<string[]>(['全員']);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfFileName, setPdfFileName] = useState('');

  const categories = masterOptions?.categories || [
    { id: 'emergency', label: '緊急・危機管理' },
    { id: 'medical', label: 'アレルギー・医療ケア' },
    { id: 'vehicle', label: '送迎・車内安全' },
    { id: 'daily', label: '日常業務・療育' },
    { id: 'abuse_prevention', label: '権利擁護・虐待防止' },
    { id: 'compliance', label: '法令順守・運営指導' },
    { id: 'visiting_support', label: '保育所等訪問・学校連携' },
    { id: 'bcp_infection', label: '感染症・BCP' },
  ];

  const availableRoles = ['全員', ...(masterOptions?.roles || [
    '管理者',
    '児童発達支援管理責任者',
    '教室長',
    '教室長補佐',
    '児童指導員',
    '訪問支援員',
    '保育士',
    '送迎ドライバー',
    '看護師・医療スタッフ',
  ])];

  // Dynamic Lists with Stable IDs for React Reconciliation
  const [keyPoints, setKeyPoints] = useState<{ id: string; text: string }[]>([]);
  const [steps, setSteps] = useState<{ id: string; text: string }[]>([]);
  const [checklist, setChecklist] = useState<{ id: string; text: string }[]>([]);
  const [emergencyContacts, setEmergencyContacts] = useState<
    { id: string; name: string; phone: string; note: string }[]
  >([]);

  // Initialize form
  useEffect(() => {
    if (manual) {
      setTitle(manual.title);
      setCategory(manual.category);
      setCategoryLabel(manual.categoryLabel);
      setSeverity(manual.severity);
      setIsStatutoryMandatory(!!manual.isStatutoryMandatory);
      setSummary(manual.summary);
      setEstimatedMinutes(manual.estimatedMinutes || 5);
      setVersion(manual.version || '1.0');
      setTargetRoles(manual.targetRoles || ['全員']);
      setPdfUrl(manual.pdfUrl || '');
      setPdfFileName(manual.pdfFileName || '');
      setKeyPoints(
        (manual.keyPoints || []).map((kp, idx) => ({ id: `kp-${idx}-${Date.now()}`, text: kp }))
      );
      setSteps(
        (manual.steps || []).map((st, idx) => ({ id: `step-${idx}-${Date.now()}`, text: st }))
      );
      setChecklist(
        (manual.checklist || []).map((c, idx) => ({
          id: c.id || `chk-${idx}-${Date.now()}`,
          text: c.text,
        }))
      );
      setEmergencyContacts(
        (manual.emergencyContacts || []).map((ec, idx) => ({
          id: `ec-${idx}-${Date.now()}`,
          name: ec.name,
          phone: ec.phone,
          note: ec.note,
        }))
      );
    } else {
      // New Manual Defaults
      setTitle('');
      setCategory('emergency');
      setCategoryLabel('緊急・危機管理');
      setSeverity('critical');
      setIsStatutoryMandatory(true);
      setSummary('');
      setEstimatedMinutes(5);
      setVersion('1.0');
      setTargetRoles(['全員']);
      setPdfUrl('');
      setPdfFileName('');
      setKeyPoints([
        { id: `kp-1-${Date.now()}`, text: '「迷ったら速やかに周りのスタッフに声掛け・共有する」' },
      ]);
      setSteps([
        {
          id: `step-1-${Date.now()}`,
          text: '1. 【初期状況確認】 現場の安全を確保し、対象児童の状態と変化を確認する。',
        },
        {
          id: `step-2-${Date.now()}`,
          text: '2. 【管理者・スタッフ共有】 「〇〇（状況）発生！」と大きな声で即時周知し体制を組む。',
        },
        {
          id: `step-3-${Date.now()}`,
          text: '3. 【標準対応の実行】 手順に沿って応急処置または誘導・保護を実施する。',
        },
      ]);
      setChecklist([
        { id: `c-${Date.now()}-1`, text: '対応手順および緊急連絡先を確認しているか' },
      ]);
      setEmergencyContacts([]);
    }
  }, [manual, isOpen]);

  // Handle category selection update
  const handleCategoryChange = (catKey: ManualCategory) => {
    setCategory(catKey);
    const matched = categories.find((c) => c.id === catKey);
    if (matched) {
      setCategoryLabel(matched.label);
    } else {
      setCategoryLabel(catKey);
    }
  };

  // Target Roles toggle
  const toggleRole = (role: string) => {
    if (targetRoles.includes(role)) {
      if (targetRoles.length === 1) return; // keep at least 1
      setTargetRoles(targetRoles.filter((r) => r !== role));
    } else {
      setTargetRoles([...targetRoles, role]);
    }
  };

  // Key Points handlers
  const addKeyPoint = () => {
    setKeyPoints([...keyPoints, { id: `kp-${Date.now()}-${Math.random()}`, text: '' }]);
  };
  const updateKeyPoint = (id: string, val: string) => {
    setKeyPoints(keyPoints.map((kp) => (kp.id === id ? { ...kp, text: val } : kp)));
  };
  const removeKeyPoint = (id: string) => {
    setKeyPoints(keyPoints.filter((kp) => kp.id !== id));
  };

  // Steps handlers
  const addStep = () => {
    setSteps([
      ...steps,
      {
        id: `step-${Date.now()}-${Math.random()}`,
        text: `${steps.length + 1}. 【項目名】 内容を記入してください`,
      },
    ]);
  };
  const updateStep = (id: string, val: string) => {
    setSteps(steps.map((st) => (st.id === id ? { ...st, text: val } : st)));
  };
  const removeStep = (id: string) => {
    setSteps(steps.filter((st) => st.id !== id));
  };
  const moveStep = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === steps.length - 1)
    ) {
      return;
    }
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const updated = [...steps];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    setSteps(updated);
  };

  // Checklist handlers
  const addChecklistItem = () => {
    setChecklist([...checklist, { id: `c-${Date.now()}-${Math.random()}`, text: '' }]);
  };
  const updateChecklistItem = (id: string, text: string) => {
    setChecklist(
      checklist.map((item) => (item.id === id ? { ...item, text } : item))
    );
  };
  const removeChecklistItem = (id: string) => {
    setChecklist(checklist.filter((item) => item.id !== id));
  };

  // Emergency Contacts handlers
  const addEmergencyContact = () => {
    setEmergencyContacts([
      ...emergencyContacts,
      { id: `ec-${Date.now()}-${Math.random()}`, name: '', phone: '', note: '' },
    ]);
  };
  const updateEmergencyContact = (
    id: string,
    field: 'name' | 'phone' | 'note',
    val: string
  ) => {
    setEmergencyContacts(
      emergencyContacts.map((ec) =>
        ec.id === id ? { ...ec, [field]: val } : ec
      )
    );
  };
  const removeEmergencyContact = (id: string) => {
    setEmergencyContacts(emergencyContacts.filter((ec) => ec.id !== id));
  };

  // PDF File upload handler
  const handlePdfFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      alert('PDF形式のファイル (.pdf) を選択してください。');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setPdfUrl(result);
        setPdfFileName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('マニュアルタイトルを入力してください');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    const savedManual: Manual = {
      id: manual ? manual.id : `m-${Date.now()}`,
      title: title.trim(),
      category,
      categoryLabel,
      severity,
      summary: summary.trim() || '概要未入力',
      updatedAt: todayStr,
      estimatedMinutes: Number(estimatedMinutes) || 5,
      targetRoles,
      steps: steps.map((st) => st.text).filter((s) => s.trim() !== ''),
      checklist: checklist.filter((c) => c.text.trim() !== ''),
      emergencyContacts: emergencyContacts
        .map(({ name, phone, note }) => ({ name, phone, note }))
        .filter((ec) => ec.name.trim() !== '' || ec.phone.trim() !== ''),
      keyPoints: keyPoints.map((kp) => kp.text).filter((kp) => kp.trim() !== ''),
      version: version.trim() || '1.0',
      isStatutoryMandatory,
      pdfUrl: pdfUrl.trim() || undefined,
      pdfFileName: pdfFileName.trim() || undefined,
    };

    onSave(savedManual);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white border border-gray-200 rounded-xl w-full max-w-4xl shadow-2xl text-gray-900 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-blue-900 px-6 py-4 border-b border-blue-800 flex items-center justify-between text-white">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-800 border border-blue-700 flex items-center justify-center text-blue-200">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {isEditMode ? 'マニュアル編集（管理者機能）' : '新規マニュアル作成（管理者機能）'}
              </h2>
              <p className="text-xs text-blue-100">
                事業所の運用や高須中学校等の連携校、関係機関の最新情報に合わせて自由に改訂・登録できます。
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-blue-800 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 text-xs sm:text-sm">
          {/* 基本情報設定 */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="font-bold text-blue-900 flex items-center gap-2 text-sm border-b border-gray-200 pb-2">
              <ShieldCheck className="w-4 h-4 text-blue-800" /> 1. マニュアル基本構成情報
            </h3>

            <div>
              <label className="block text-gray-800 font-semibold mb-1">
                マニュアルタイトル <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例: 高須中学校・近隣校訪問支援時の安全・パニック対応マニュアル"
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 font-semibold focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-gray-700 font-semibold mb-1">カテゴリ分類</label>
                <select
                  value={category}
                  onChange={(e) => handleCategoryChange(e.target.value as ManualCategory)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-600 cursor-pointer font-medium"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">重要度区分</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as ManualSeverity)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-600 cursor-pointer font-medium"
                >
                  <option value="critical">🚨 最優先・緊急（事故直結）</option>
                  <option value="warning">⚠️ 重要（注意確認）</option>
                  <option value="normal">📘 日常基本（定型対応）</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">バージョン</label>
                <input
                  type="text"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-600 font-medium"
                />
              </div>
            </div>

            <div className="flex items-center space-x-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <input
                type="checkbox"
                id="statutory_mandatory"
                checked={isStatutoryMandatory}
                onChange={(e) => setIsStatutoryMandatory(e.target.checked)}
                className="w-4 h-4 text-blue-800 rounded border-gray-300 focus:ring-blue-600 cursor-pointer"
              />
              <label htmlFor="statutory_mandatory" className="text-xs text-amber-950 font-bold cursor-pointer">
                【令和6年度診療報酬・指定基準改訂等の法令義務化対象マニュアル】としてハイライト表示する
              </label>
            </div>

            {/* 対象職種 */}
            <div>
              <label className="block text-gray-700 font-semibold mb-1">確認対象の職種・ロール</label>
              <div className="flex flex-wrap gap-2 pt-1">
                {availableRoles.map((role) => {
                  const selected = targetRoles.includes(role);
                  return (
                    <button
                      type="button"
                      key={role}
                      onClick={() => toggleRole(role)}
                      className={`px-3 py-1 rounded-lg border text-xs font-medium transition-colors ${
                        selected
                          ? 'bg-blue-100 border-blue-300 text-blue-900 font-bold'
                          : 'bg-white border-gray-300 text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {selected ? '✓ ' : ''}{role}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 概要 */}
            <div>
              <label className="block text-gray-700 font-semibold mb-1">
                概要・対象範囲および目的の説明
              </label>
              <textarea
                rows={3}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="マニュアルの概要や本手順を行う目的を分かりやすく記入してください..."
                className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900 focus:outline-none focus:border-blue-600 leading-relaxed font-medium"
              />
            </div>
          </div>

          {/* PDFファイル添付（資料・原本） */}
          <div className="bg-red-50/60 border border-red-200 rounded-xl p-5 space-y-3">
            <h3 className="font-bold text-red-900 flex items-center gap-2 text-sm border-b border-red-200 pb-2">
              <Paperclip className="w-4 h-4 text-red-700" /> PDF資料・原本ファイルの添付
            </h3>
            <p className="text-xs text-red-950 font-medium leading-relaxed">
              マニュアルの原本PDFファイルや図解文書を添付できます。スタッフはアプリ上でそのままプレビュー閲覧やダウンロードが行えます。
            </p>

            {pdfUrl ? (
              <div className="bg-white border border-red-300 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-lg bg-red-100 border border-red-200 flex items-center justify-center text-red-700 shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-gray-900 text-xs sm:text-sm block">
                      {pdfFileName || '添付マニュアル資料.pdf'}
                    </span>
                    <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> PDFファイル添付完了
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-red-700 hover:bg-red-800 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center space-x-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>プレビュー</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setPdfUrl('');
                      setPdfFileName('');
                    }}
                    className="bg-red-100 hover:bg-red-200 text-red-800 font-semibold px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center space-x-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>添付削除</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white border-2 border-dashed border-red-300 hover:border-red-400 rounded-lg p-4 text-center transition-colors">
                <label className="cursor-pointer flex flex-col items-center justify-center space-y-2">
                  <Upload className="w-7 h-7 text-red-600" />
                  <div className="text-xs">
                    <span className="font-bold text-red-900 hover:underline">PDFファイルを選択してアップロード</span>
                    <span className="text-gray-500 block text-[11px] mt-0.5">またはドラッグ＆ドロップ (.pdf 形式)</span>
                  </div>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handlePdfFileChange}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </div>

          {/* 最重要ポイント */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-gray-200 pb-2">
              <h3 className="font-bold text-amber-900 flex items-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-600" /> 2. 最重要・事故防止要点（ハイライト表示）
              </h3>
              <button
                type="button"
                onClick={addKeyPoint}
                className="text-xs text-blue-800 hover:text-blue-900 font-bold flex items-center space-x-1 bg-white px-2.5 py-1 rounded border border-gray-300"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>要点を追加</span>
              </button>
            </div>

            {keyPoints.map((kp, idx) => (
              <div key={kp.id} className="flex items-center space-x-2">
                <span className="text-xs font-bold text-amber-900 w-5 text-right">{idx + 1}.</span>
                <input
                  type="text"
                  value={kp.text}
                  onChange={(e) => updateKeyPoint(kp.id, e.target.value)}
                  placeholder="例: 「迷ったら10分以内に警察110番へ躊躇なく連絡する」"
                  className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-blue-600 font-medium"
                />
                <button
                  type="button"
                  onClick={() => removeKeyPoint(kp.id)}
                  className="p-1 text-red-500 hover:text-red-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* 標準手順ステップ */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-gray-200 pb-2">
              <h3 className="font-bold text-blue-900 flex items-center gap-2 text-sm">
                <Sparkles className="w-4 h-4 text-blue-800" /> 3. 標準対応ステップ・行動順序
              </h3>
              <button
                type="button"
                onClick={addStep}
                className="text-xs text-blue-800 hover:text-blue-900 font-bold flex items-center space-x-1 bg-white px-2.5 py-1 rounded border border-gray-300"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>ステップ追加</span>
              </button>
            </div>

            {steps.map((st, idx) => (
              <div key={st.id} className="flex items-start space-x-2 bg-white p-2.5 rounded-lg border border-gray-200">
                <span className="w-6 h-6 rounded-full bg-blue-900 text-white font-bold flex items-center justify-center shrink-0 text-xs mt-1">
                  {idx + 1}
                </span>
                <textarea
                  rows={2}
                  value={st.text}
                  onChange={(e) => updateStep(st.id, e.target.value)}
                  placeholder="対応手順を具体的に記入してください..."
                  className="flex-1 bg-white border border-gray-300 rounded-lg p-2 text-xs text-gray-900 focus:outline-none focus:border-blue-600 font-medium leading-relaxed"
                />
                <div className="flex flex-col space-y-1">
                  <button
                    type="button"
                    onClick={() => moveStep(idx, 'up')}
                    disabled={idx === 0}
                    className="p-1 text-gray-500 hover:text-gray-800 disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStep(idx, 'down')}
                    disabled={idx === steps.length - 1}
                    className="p-1 text-gray-500 hover:text-gray-800 disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeStep(st.id)}
                    className="p-1 text-red-500 hover:text-red-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* セルフ点検チェックリスト */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-gray-200 pb-2">
              <h3 className="font-bold text-blue-900 flex items-center gap-2 text-sm">
                <CheckSquare className="w-4 h-4 text-blue-800" /> 4. セルフ確認チェックリスト項目
              </h3>
              <button
                type="button"
                onClick={addChecklistItem}
                className="text-xs text-blue-800 hover:text-blue-900 font-bold flex items-center space-x-1 bg-white px-2.5 py-1 rounded border border-gray-300"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>チェック項目追加</span>
              </button>
            </div>

            {checklist.map((item) => (
              <div key={item.id} className="flex items-center space-x-2">
                <input
                  type="text"
                  value={item.text}
                  onChange={(e) => updateChecklistItem(item.id, e.target.value)}
                  placeholder="例: 「緊急連絡先の高知東警察署および事業所番号を即時暗記/提示できるか」"
                  className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-blue-600 font-medium"
                />
                <button
                  type="button"
                  onClick={() => removeChecklistItem(item.id)}
                  className="p-1 text-red-500 hover:text-red-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* 緊急連絡先設定 */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-gray-200 pb-2">
              <h3 className="font-bold text-red-900 flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-red-600" /> 5. マニュアル紐づけ緊急時ダイヤル
              </h3>
              <button
                type="button"
                onClick={addEmergencyContact}
                className="text-xs text-blue-800 hover:text-blue-900 font-bold flex items-center space-x-1 bg-white px-2.5 py-1 rounded border border-gray-300"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>連絡先追加</span>
              </button>
            </div>

            {emergencyContacts.map((contact) => (
              <div key={contact.id} className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-white p-3 rounded-lg border border-gray-200 items-center">
                <input
                  type="text"
                  value={contact.name}
                  onChange={(e) => updateEmergencyContact(contact.id, 'name', e.target.value)}
                  placeholder="機関名 (例: 高須中学校 職員室)"
                  className="bg-white border border-gray-300 rounded px-2.5 py-1 text-xs font-semibold text-gray-900"
                />
                <input
                  type="text"
                  value={contact.phone}
                  onChange={(e) => updateEmergencyContact(contact.id, 'phone', e.target.value)}
                  placeholder="電話番号 (例: 088-888-0000)"
                  className="bg-white border border-gray-300 rounded px-2.5 py-1 text-xs font-mono text-gray-900"
                />
                <div className="flex items-center space-x-1">
                  <input
                    type="text"
                    value={contact.note}
                    onChange={(e) => updateEmergencyContact(contact.id, 'note', e.target.value)}
                    placeholder="備考 (例: 特別支援担当教諭)"
                    className="flex-1 bg-white border border-gray-300 rounded px-2.5 py-1 text-xs text-gray-700"
                  />
                  <button
                    type="button"
                    onClick={() => removeEmergencyContact(contact.id)}
                    className="p-1 text-red-500 hover:text-red-700 shrink-0 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Footer Submit Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            {isEditMode && onDelete ? (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`マニュアル「${title}」を本当に削除しますか？`)) {
                    onDelete(manual!.id);
                  }
                }}
                className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center space-x-1.5"
              >
                <Trash2 className="w-4 h-4 text-red-600" />
                <span>マニュアルを削除</span>
              </button>
            ) : (
              <div></div>
            )}

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="bg-blue-900 hover:bg-blue-800 text-white px-6 py-2 rounded-lg text-xs font-bold shadow-md transition-all flex items-center space-x-1.5 active:scale-95 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isEditMode ? '改訂更新を保存' : 'マニュアルを新規登録'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
