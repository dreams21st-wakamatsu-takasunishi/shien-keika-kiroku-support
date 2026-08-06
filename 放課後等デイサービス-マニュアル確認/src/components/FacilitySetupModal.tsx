import React, { useState } from 'react';
import { 
  X, 
  Settings, 
  HelpCircle, 
  CheckCircle2, 
  Building, 
  Users, 
  ShieldCheck, 
  Database,
  Save,
  Sparkles,
  ListFilter,
  Plus,
  Trash2,
  Edit3
} from 'lucide-react';
import { FacilityConfig, MasterOptions } from '../types';

interface FacilitySetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  facilityConfig: FacilityConfig;
  onUpdateConfig: (newConfig: FacilityConfig) => void;
  masterOptions: MasterOptions;
  onUpdateMasterOptions: (newMasterOptions: MasterOptions) => void;
}

export const FacilitySetupModal: React.FC<FacilitySetupModalProps> = ({
  isOpen,
  onClose,
  facilityConfig,
  onUpdateConfig,
  masterOptions,
  onUpdateMasterOptions,
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'dropdowns' | 'survey'>('info');
  const [formData, setFormData] = useState<FacilityConfig>(facilityConfig);
  const [masterData, setMasterData] = useState<MasterOptions>(masterOptions);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Input states for adding new dropdown options
  const [newRole, setNewRole] = useState('');
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('📁');
  const [newLocation, setNewLocation] = useState('');
  const [newIncidentType, setNewIncidentType] = useState('');
  const [newSupportCategory, setNewSupportCategory] = useState('');
  const [newChildTrait, setNewChildTrait] = useState('');

  // Question state answers
  const [staffCount, setStaffCount] = useState('5〜10名');
  const [priorityCategories, setPriorityCategories] = useState<string[]>([
    '緊急・飛び出し防止',
    'アレルギー・エピペン',
    '送迎車内確認'
  ]);
  const [dbPreference, setDbPreference] = useState('Local Storage (即時ブラウザ保持)');

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateConfig(formData);
    onUpdateMasterOptions(masterData);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1500);
  };

  // Option manipulators
  const addRole = () => {
    if (!newRole.trim() || masterData.roles.includes(newRole.trim())) return;
    setMasterData({ ...masterData, roles: [...masterData.roles, newRole.trim()] });
    setNewRole('');
  };

  const removeRole = (role: string) => {
    if (masterData.roles.length <= 1) return;
    setMasterData({ ...masterData, roles: masterData.roles.filter((r) => r !== role) });
  };

  const addCategory = () => {
    if (!newCategoryLabel.trim()) return;
    const newCat = {
      id: `custom-cat-${Date.now()}`,
      label: `${newCategoryIcon} ${newCategoryLabel.trim()}`,
      icon: newCategoryIcon,
    };
    setMasterData({ ...masterData, categories: [...masterData.categories, newCat] });
    setNewCategoryLabel('');
  };

  const removeCategory = (id: string) => {
    if (masterData.categories.length <= 1) return;
    setMasterData({ ...masterData, categories: masterData.categories.filter((c) => c.id !== id) });
  };

  const addLocation = () => {
    if (!newLocation.trim() || masterData.quickLocations.includes(newLocation.trim())) return;
    setMasterData({ ...masterData, quickLocations: [...masterData.quickLocations, newLocation.trim()] });
    setNewLocation('');
  };

  const removeLocation = (loc: string) => {
    setMasterData({ ...masterData, quickLocations: masterData.quickLocations.filter((l) => l !== loc) });
  };

  const addIncidentType = () => {
    if (!newIncidentType.trim() || masterData.incidentTypes.includes(newIncidentType.trim())) return;
    setMasterData({ ...masterData, incidentTypes: [...masterData.incidentTypes, newIncidentType.trim()] });
    setNewIncidentType('');
  };

  const removeIncidentType = (t: string) => {
    setMasterData({ ...masterData, incidentTypes: masterData.incidentTypes.filter((x) => x !== t) });
  };

  const addSupportCategory = () => {
    if (!newSupportCategory.trim() || masterData.supportCategories.includes(newSupportCategory.trim())) return;
    setMasterData({ ...masterData, supportCategories: [...masterData.supportCategories, newSupportCategory.trim()] });
    setNewSupportCategory('');
  };

  const removeSupportCategory = (sc: string) => {
    setMasterData({ ...masterData, supportCategories: masterData.supportCategories.filter((x) => x !== sc) });
  };

  const addChildTrait = () => {
    if (!newChildTrait.trim() || masterData.childDevTraits.includes(newChildTrait.trim())) return;
    setMasterData({ ...masterData, childDevTraits: [...masterData.childDevTraits, newChildTrait.trim()] });
    setNewChildTrait('');
  };

  const removeChildTrait = (ct: string) => {
    setMasterData({ ...masterData, childDevTraits: masterData.childDevTraits.filter((x) => x !== ct) });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white border border-gray-200 rounded-xl w-full max-w-4xl shadow-2xl text-gray-900 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-blue-900 px-6 py-4 border-b border-blue-800 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-800 border border-blue-700 flex items-center justify-center text-blue-200">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                事業所基本設定 ＆ 全プルダウン項目マスター編集
              </h2>
              <p className="text-xs text-blue-100">
                施設情報、職種・カテゴリー・SOS発砲場所などの各種選択肢プルダウン項目を自由に変更できます。
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

        {/* Tab Navigation */}
        <div className="bg-gray-100 border-b border-gray-200 px-6 flex space-x-2 shrink-0 pt-2 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('info')}
            className={`px-4 py-2.5 rounded-t-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'info'
                ? 'bg-white text-blue-900 border-t-2 border-blue-800 font-extrabold shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Building className="w-4 h-4 text-blue-800" /> 1. 施設基本情報
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('dropdowns')}
            className={`px-4 py-2.5 rounded-t-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'dropdowns'
                ? 'bg-white text-blue-900 border-t-2 border-blue-800 font-extrabold shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <ListFilter className="w-4 h-4 text-amber-600" /> 2. プルダウン・選択肢編集（全項目対応）
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('survey')}
            className={`px-4 py-2.5 rounded-t-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'survey'
                ? 'bg-white text-blue-900 border-t-2 border-blue-800 font-extrabold shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Sparkles className="w-4 h-4 text-emerald-600" /> 3. システム運用要件ガイド
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-6 text-xs sm:text-sm flex-1">
          {/* TAB 1: Facility Info */}
          {activeTab === 'info' && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
              <h3 className="font-bold text-blue-900 flex items-center gap-2 text-sm">
                <Building className="w-4 h-4 text-blue-800" /> 施設基本情報設定
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">事業所名・施設名</label>
                  <input
                    type="text"
                    value={formData.facilityName}
                    onChange={(e) => setFormData({ ...formData, facilityName: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-600 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-1">管理者・児発管 氏名</label>
                  <input
                    type="text"
                    value={formData.managerName}
                    onChange={(e) => setFormData({ ...formData, managerName: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-600 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">事業所電話番号</label>
                  <input
                    type="text"
                    value={formData.mainPhone}
                    onChange={(e) => setFormData({ ...formData, mainPhone: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-600 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-1">指定一時避難場所</label>
                  <input
                    type="text"
                    value={formData.emergencyEvacuationSite}
                    onChange={(e) => setFormData({ ...formData, emergencyEvacuationSite: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-600 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">エピペン保管場所</label>
                  <input
                    type="text"
                    value={formData.epipenStorageLocation}
                    onChange={(e) => setFormData({ ...formData, epipenStorageLocation: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-600 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-1">AED設置場所</label>
                  <input
                    type="text"
                    value={formData.aedLocation}
                    onChange={(e) => setFormData({ ...formData, aedLocation: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-600 font-medium"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: All Master Dropdown Options */}
          {activeTab === 'dropdowns' && (
            <div className="space-y-6">
              {/* 1. Staff Roles */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                <span className="font-bold text-blue-900 text-sm block">① 職員の職種・役職プルダウン項目</span>
                <p className="text-xs text-gray-500">マニュアル確認やスタッフ登録時の職種選択肢に反映されます。</p>

                <div className="flex flex-wrap gap-2 pt-1">
                  {masterData.roles.map((role) => (
                    <span key={role} className="bg-blue-50 border border-blue-200 text-blue-900 text-xs px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5">
                      <span>{role}</span>
                      <button
                        type="button"
                        onClick={() => removeRole(role)}
                        className="text-blue-400 hover:text-red-600 transition-colors cursor-pointer"
                        title="削除"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex gap-2 pt-2">
                  <input
                    type="text"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    placeholder="新しい職種を入力 (例: 作業療法士)"
                    className="bg-gray-50 border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-blue-600 flex-1"
                  />
                  <button
                    type="button"
                    onClick={addRole}
                    className="bg-blue-900 hover:bg-blue-800 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> 追加
                  </button>
                </div>
              </div>

              {/* 2. Manual Categories */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                <span className="font-bold text-blue-900 text-sm block">② マニュアルカテゴリー項目</span>
                <div className="flex flex-wrap gap-2 pt-1">
                  {masterData.categories.map((cat) => (
                    <span key={cat.id} className="bg-amber-50 border border-amber-200 text-amber-900 text-xs px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5">
                      <span>{cat.label}</span>
                      <button
                        type="button"
                        onClick={() => removeCategory(cat.id)}
                        className="text-amber-500 hover:text-red-600 transition-colors cursor-pointer"
                        title="削除"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex gap-2 pt-2">
                  <input
                    type="text"
                    value={newCategoryLabel}
                    onChange={(e) => setNewCategoryLabel(e.target.value)}
                    placeholder="新カテゴリー名 (例: 個別療育・プログラミング)"
                    className="bg-gray-50 border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-blue-600 flex-1"
                  />
                  <button
                    type="button"
                    onClick={addCategory}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> カテゴリー追加
                  </button>
                </div>
              </div>

              {/* 3. Quick Locations for Emergency SOS */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                <span className="font-bold text-red-900 text-sm block">③ 緊急SOS発砲時の場所クイック選択プルダウン</span>
                <div className="flex flex-wrap gap-2 pt-1">
                  {masterData.quickLocations.map((loc) => (
                    <span key={loc} className="bg-red-50 border border-red-200 text-red-900 text-xs px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5">
                      <span>📍 {loc}</span>
                      <button
                        type="button"
                        onClick={() => removeLocation(loc)}
                        className="text-red-400 hover:text-red-700 transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex gap-2 pt-2">
                  <input
                    type="text"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    placeholder="新しい緊急発生場所 (例: 近隣スイミングスクール)"
                    className="bg-gray-50 border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-blue-600 flex-1"
                  />
                  <button
                    type="button"
                    onClick={addLocation}
                    className="bg-red-700 hover:bg-red-800 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> 場所追加
                  </button>
                </div>
              </div>

              {/* 4. Incident Types & Child Dev Traits */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Incident Types */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                  <span className="font-bold text-gray-900 text-sm block">④ ヒヤリハット報告区分プルダウン</span>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {masterData.incidentTypes.map((it) => (
                      <span key={it} className="bg-gray-100 border border-gray-300 text-gray-800 text-xs px-2.5 py-1 rounded-lg font-medium flex items-center gap-1">
                        <span>{it}</span>
                        <button
                          type="button"
                          onClick={() => removeIncidentType(it)}
                          className="text-gray-400 hover:text-red-600 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <input
                      type="text"
                      value={newIncidentType}
                      onChange={(e) => setNewIncidentType(e.target.value)}
                      placeholder="区分追加 (例: 施設破損)"
                      className="bg-gray-50 border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-blue-600 flex-1"
                    />
                    <button
                      type="button"
                      onClick={addIncidentType}
                      className="bg-gray-800 hover:bg-gray-900 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> 追加
                    </button>
                  </div>
                </div>

                {/* Support Categories */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                  <span className="font-bold text-gray-900 text-sm block">⑤ 声掛け支援・行動場面プルダウン</span>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {masterData.supportCategories.map((sc) => (
                      <span key={sc} className="bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs px-2 py-1 rounded-lg font-medium flex items-center gap-1">
                        <span>{sc}</span>
                        <button
                          type="button"
                          onClick={() => removeSupportCategory(sc)}
                          className="text-emerald-400 hover:text-red-600 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <input
                      type="text"
                      value={newSupportCategory}
                      onChange={(e) => setNewSupportCategory(e.target.value)}
                      placeholder="場面追加 (例: 学習開始前)"
                      className="bg-gray-50 border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-blue-600 flex-1"
                    />
                    <button
                      type="button"
                      onClick={addSupportCategory}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> 追加
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Survey */}
          {activeTab === 'survey' && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
              <h3 className="font-bold text-amber-900 flex items-center gap-2 text-sm">
                <Sparkles className="w-4 h-4 text-amber-600" /> 追加機能開発・要件アンケート
              </h3>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">Q1. スタッフの規模・構成人数はどのくらいですか？</label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {['1〜4名 (小規模)', '5〜10名 (標準)', '11〜20名 (多機能型)', '20名以上 (複数事業所)'].map((opt) => (
                    <button
                      type="button"
                      key={opt}
                      onClick={() => setStaffCount(opt)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        staffCount === opt
                          ? 'bg-amber-100 border-amber-300 text-amber-900 font-bold'
                          : 'bg-white border-gray-300 text-gray-700 hover:text-gray-900'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">Q2. 特に重点的に管理・導入したいマニュアル項目は？ (複数選択可)</label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {[
                    '緊急・飛び出し防止',
                    'アレルギー・エピペン',
                    '送迎車内確認',
                    'パニック・感情昂揚対応',
                    '身体拘束ゼロ・虐待防止',
                    '運営指導・事故報告'
                  ].map((cat) => {
                    const selected = priorityCategories.includes(cat);
                    return (
                      <button
                        type="button"
                        key={cat}
                        onClick={() =>
                          setPriorityCategories((prev) =>
                            prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
                          )
                        }
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                          selected
                            ? 'bg-blue-100 border-blue-300 text-blue-900 font-bold'
                            : 'bg-white border-gray-300 text-gray-700 hover:text-gray-900'
                        }`}
                      >
                        {selected ? '✓ ' : ''}{cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">Q3. データ保存・認証機能の希望構成は？</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  {[
                    'Local Storage (即時ブラウザ保持)',
                    'Firebase Firestore (クラウドリアルタイム)',
                    'Cloud SQL (PostgreSQL)'
                  ].map((db) => (
                    <button
                      type="button"
                      key={db}
                      onClick={() => setDbPreference(db)}
                      className={`p-2.5 rounded-lg border text-xs text-left transition-colors ${
                        dbPreference === db
                          ? 'bg-blue-100 border-blue-300 text-blue-900 font-bold'
                          : 'bg-white border-gray-300 text-gray-700 hover:text-gray-900'
                      }`}
                    >
                      <Database className="w-3.5 h-3.5 mb-1 text-blue-800" />
                      {db}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Submit Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-200">
            {savedSuccess ? (
              <span className="text-emerald-700 font-bold flex items-center space-x-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>設定・プルダウンマスターを保存しました！</span>
              </span>
            ) : (
              <span className="text-gray-500 text-xs">
                追加・変更されたプルダウン選択肢はアプリ全体に即時反映されます
              </span>
            )}

            <div className="flex space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
              >
                閉じる
              </button>
              <button
                type="submit"
                className="bg-blue-900 hover:bg-blue-800 text-white px-5 py-2 rounded-lg text-xs font-bold shadow transition-all flex items-center space-x-1.5 cursor-pointer active:scale-95"
              >
                <Save className="w-4 h-4" />
                <span>設定＆プルダウンを更新保存</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

