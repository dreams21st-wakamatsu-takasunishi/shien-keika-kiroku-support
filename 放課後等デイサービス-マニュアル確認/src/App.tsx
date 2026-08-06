import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  BookOpen, 
  ShieldAlert, 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle,
  Sparkles,
  Users,
  Building2,
  Plus,
  Edit3
} from 'lucide-react';
import { Navbar } from './components/Navbar';
import { ManualCard } from './components/ManualCard';
import { ManualDetailModal } from './components/ManualDetailModal';
import { EmergencyModal } from './components/EmergencyModal';
import { EmergencySOSModal } from './components/EmergencySOSModal';
import { EmergencyPopupAlert } from './components/EmergencyPopupAlert';
import { EmergencyHistoryModal } from './components/EmergencyHistoryModal';
import { DashboardView } from './components/DashboardView';
import { IncidentLogView } from './components/IncidentLogView';
import { AIConsultView } from './components/AIConsultView';
import { FacilitySetupModal } from './components/FacilitySetupModal';
import { EditManualModal } from './components/EditManualModal';
import { SupportGuideView } from './components/SupportGuideView';

import { INITIAL_MANUALS } from './data/initialManuals';
import { INITIAL_STAFF, INITIAL_INCIDENTS, DEFAULT_FACILITY_CONFIG, INITIAL_MASTER_OPTIONS, INITIAL_CHILDREN } from './data/initialData';
import { 
  Manual, 
  Staff, 
  ReadSignature, 
  IncidentReport, 
  FacilityConfig, 
  ManualCategory,
  EmergencyAlert,
  EmergencySOSPattern,
  MasterOptions,
  ChildSupportDetail
} from './types';
import { triggerDeviceNotification, SOS_PATTERNS } from './utils/notification';

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<'manuals' | 'support-guide' | 'dashboard' | 'incidents' | 'ai-consult'>('manuals');
  const [aiInitialQuery, setAiInitialQuery] = useState<string>('');

  // Modals
  const [selectedManual, setSelectedManual] = useState<Manual | null>(null);
  const [isEmergencyOpen, setIsEmergencyOpen] = useState(false);
  const [isBroadcastSOSOpen, setIsBroadcastSOSOpen] = useState(false);
  const [isSOSHistoryOpen, setIsSOSHistoryOpen] = useState(false);
  const [isSetupOpen, setIsSetupOpen] = useState(false);

  // Admin Manual Editing States
  const [editingManual, setEditingManual] = useState<Manual | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Core Data loaded with LocalStorage persistence fallback
  const [manuals, setManuals] = useState<Manual[]>(() => {
    const saved = localStorage.getItem('houkago_manuals');
    return saved ? JSON.parse(saved) : INITIAL_MANUALS;
  });

  const [staffList, setStaffList] = useState<Staff[]>(() => {
    const saved = localStorage.getItem('houkago_staff');
    return saved ? JSON.parse(saved) : INITIAL_STAFF;
  });

  const [masterOptions, setMasterOptions] = useState<MasterOptions>(() => {
    const saved = localStorage.getItem('houkago_master_options');
    return saved ? JSON.parse(saved) : INITIAL_MASTER_OPTIONS;
  });

  const [childrenList, setChildrenList] = useState<ChildSupportDetail[]>(() => {
    const saved = localStorage.getItem('houkago_children_list');
    return saved ? JSON.parse(saved) : INITIAL_CHILDREN;
  });

  const [currentStaff, setCurrentStaff] = useState<Staff>(() => {
    return staffList[0] || INITIAL_STAFF[0];
  });

  const [signatures, setSignatures] = useState<ReadSignature[]>(() => {
    const saved = localStorage.getItem('houkago_signatures');
    return saved ? JSON.parse(saved) : [
      {
        id: 'sig-1',
        manualId: 'm-001',
        staffId: 's-1',
        staffName: '佐藤 恵子',
        signedAt: '2026-07-22 10:15',
        understandingConfirmed: true,
        notes: 'スタッフ会議にて実地確認済み'
      }
    ];
  });

  const [incidents, setIncidents] = useState<IncidentReport[]>(() => {
    const saved = localStorage.getItem('houkago_incidents');
    return saved ? JSON.parse(saved) : INITIAL_INCIDENTS;
  });

  const [facilityConfig, setFacilityConfig] = useState<FacilityConfig>(() => {
    const saved = localStorage.getItem('houkago_config');
    return saved ? JSON.parse(saved) : DEFAULT_FACILITY_CONFIG;
  });

  // Emergency SOS Alerts State
  const [alerts, setAlerts] = useState<EmergencyAlert[]>(() => {
    const saved = localStorage.getItem('houkago_alerts');
    return saved ? JSON.parse(saved) : [];
  });

  // Search & Category Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');

  // Toast notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Sync to LocalStorage
  useEffect(() => {
    localStorage.setItem('houkago_manuals', JSON.stringify(manuals));
  }, [manuals]);

  useEffect(() => {
    localStorage.setItem('houkago_staff', JSON.stringify(staffList));
  }, [staffList]);

  useEffect(() => {
    localStorage.setItem('houkago_signatures', JSON.stringify(signatures));
  }, [signatures]);

  useEffect(() => {
    localStorage.setItem('houkago_incidents', JSON.stringify(incidents));
  }, [incidents]);

  useEffect(() => {
    localStorage.setItem('houkago_config', JSON.stringify(facilityConfig));
  }, [facilityConfig]);

  useEffect(() => {
    localStorage.setItem('houkago_alerts', JSON.stringify(alerts));
  }, [alerts]);

  useEffect(() => {
    localStorage.setItem('houkago_master_options', JSON.stringify(masterOptions));
  }, [masterOptions]);

  useEffect(() => {
    localStorage.setItem('houkago_children_list', JSON.stringify(childrenList));
  }, [childrenList]);

  // Handlers for Incident Report CRUD
  const handleAddIncident = (newIncident: IncidentReport) => {
    setIncidents((prev) => [newIncident, ...prev]);
    showToast('ヒヤリハット報告を登録しました。');
  };

  const handleUpdateIncident = (updatedIncident: IncidentReport) => {
    setIncidents((prev) =>
      prev.map((inc) => (inc.id === updatedIncident.id ? updatedIncident : inc))
    );
    showToast('ヒヤリハット報告を更新しました。');
  };

  const handleDeleteIncident = (id: string) => {
    setIncidents((prev) => prev.filter((inc) => inc.id !== id));
    showToast('ヒヤリハット報告を削除しました。');
  };

  // Handlers for Children Support Details CRUD
  const handleAddChild = (newChild: ChildSupportDetail) => {
    setChildrenList((prev) => [...prev, newChild]);
    showToast(`児童「${newChild.name}」さんの支援計画を作成しました。`);
  };

  const handleUpdateChild = (updatedChild: ChildSupportDetail) => {
    setChildrenList((prev) =>
      prev.map((c) => (c.id === updatedChild.id ? updatedChild : c))
    );
    showToast(`児童「${updatedChild.name}」さんの支援計画を更新しました。`);
  };

  const handleDeleteChild = (id: string) => {
    const child = childrenList.find((c) => c.id === id);
    setChildrenList((prev) => prev.filter((c) => c.id !== id));
    showToast(`児童${child ? `「${child.name}」` : ''}の支援計画を削除しました。`);
  };

  // Active SOS calculation
  const activeAlert = alerts.find((a) => a.status === 'active') || null;
  const activeAlertCount = alerts.filter((a) => a.status === 'active').length;

  // Handle SOS Broadcast (Send to all staff + device popup)
  const handleBroadcastSOS = (
    pattern: EmergencySOSPattern,
    location: string,
    description: string
  ) => {
    const patternDetail = SOS_PATTERNS[pattern];
    const nowStr = new Date().toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const newAlert: EmergencyAlert = {
      id: `sos-${Date.now()}`,
      senderStaffId: currentStaff.id,
      senderStaffName: currentStaff.name,
      senderRole: currentStaff.role,
      pattern,
      patternLabel: patternDetail.label,
      patternIcon: patternDetail.icon,
      location,
      description,
      createdAt: nowStr,
      targetStaffIds: staffList.map((s) => s.id),
      readByStaffIds: [currentStaff.id], // Sender is auto-acknowledged
      status: 'active',
      actionGuideSummary: patternDetail.summaryAction
    };

    setAlerts((prev) => [newAlert, ...prev]);

    // Device notification (Desktop/Mobile Web Notification + Sound + Vibration)
    triggerDeviceNotification(
      `【緊急SOS】${patternDetail.label}`,
      `${currentStaff.name}より ${location} で緊急要請！\n${description || patternDetail.summaryAction}`,
      patternDetail.icon
    );

    showToast(`🚨 登録職員全員 (${staffList.length}名) に緊急SOSを一斉配信しました！`);
  };

  const handleAcknowledgeSOS = (alertId: string, staffId: string) => {
    setAlerts((prev) =>
      prev.map((a) => {
        if (a.id === alertId) {
          if (!a.readByStaffIds.includes(staffId)) {
            return {
              ...a,
              readByStaffIds: [...a.readByStaffIds, staffId]
            };
          }
        }
        return a;
      })
    );
    showToast('✓ 緊急SOSの確認・了解を送信しました。現場へ急行してください！');
  };

  const handleResolveSOS = (alertId: string, resolvedByStaffName: string) => {
    const nowStr = new Date().toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    setAlerts((prev) =>
      prev.map((a) => {
        if (a.id === alertId) {
          return {
            ...a,
            status: 'resolved',
            resolvedAt: nowStr,
            resolvedByStaffName
          };
        }
        return a;
      })
    );
    showToast('✅ 緊急SOSが安全に解除・対応完了されました。');
  };

  // Handle Staff Sign-off / Understanding Confirmation
  const handleToggleRead = (manualId: string, staffId: string, notes?: string) => {
    const nowStr = new Date().toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Update staff's readManualIds
    setStaffList((prev) =>
      prev.map((s) => {
        if (s.id === staffId) {
          const alreadyRead = s.readManualIds.includes(manualId);
          const updatedIds = alreadyRead
            ? s.readManualIds
            : [...s.readManualIds, manualId];
          return {
            ...s,
            readManualIds: updatedIds,
            lastReadAt: nowStr,
          };
        }
        return s;
      })
    );

    // Update current staff reference if matching
    if (currentStaff.id === staffId) {
      const alreadyRead = currentStaff.readManualIds.includes(manualId);
      if (!alreadyRead) {
        setCurrentStaff((prev) => ({
          ...prev,
          readManualIds: [...prev.readManualIds, manualId],
          lastReadAt: nowStr,
        }));
      }
    }

    // Add signature log
    const targetStaff = staffList.find((s) => s.id === staffId);
    const newSignature: ReadSignature = {
      id: `sig-${Date.now()}`,
      manualId,
      staffId,
      staffName: targetStaff ? targetStaff.name : '不明スタッフ',
      signedAt: nowStr,
      understandingConfirmed: true,
      notes,
    };

    setSignatures((prev) => [newSignature, ...prev]);
    showToast('マニュアル理解確認・署名を完了しました。');
  };

  // Remind Staff
  const handleRemindStaff = (staffName: string, unreadCount?: number) => {
    showToast(`${staffName} さんへ未確認マニュアルのリマインド通知を送信しました。`);
  };

  // Manual CRUD Handlers
  const handleOpenAddManual = () => {
    setEditingManual(null);
    setIsEditModalOpen(true);
  };

  const handleOpenEditManual = (manual: Manual) => {
    setEditingManual(manual);
    setIsEditModalOpen(true);
  };

  const handleSaveManual = (savedManual: Manual) => {
    setManuals((prev) => {
      const exists = prev.some((m) => m.id === savedManual.id);
      if (exists) {
        return prev.map((m) => (m.id === savedManual.id ? savedManual : m));
      } else {
        return [savedManual, ...prev];
      }
    });

    if (selectedManual?.id === savedManual.id) {
      setSelectedManual(savedManual);
    }

    setIsEditModalOpen(false);
    setEditingManual(null);
    showToast(`マニュアル「${savedManual.title}」を保存・更新しました。`);
  };

  const handleDeleteManual = (manualId: string) => {
    setManuals((prev) => prev.filter((m) => m.id !== manualId));
    if (selectedManual?.id === manualId) {
      setSelectedManual(null);
    }
    setIsEditModalOpen(false);
    setEditingManual(null);
    showToast('マニュアルを削除しました。');
  };

  // Filter Manuals Logic
  const filteredManuals = manuals.filter((manual) => {
    const matchesSearch = 
      manual.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      manual.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      manual.keyPoints.some((kp) => kp.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = selectedCategory === 'all' || manual.category === selectedCategory;
    const matchesSeverity = selectedSeverity === 'all' || manual.severity === selectedSeverity;

    return matchesSearch && matchesCategory && matchesSeverity;
  });

  const unreadCountForCurrentStaff = manuals.filter(
    (m) => !currentStaff.readManualIds.includes(m.id)
  ).length;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col text-gray-900 font-sans antialiased">
      {/* Active Full-Screen / Popup SOS Notification Alert Component */}
      <EmergencyPopupAlert
        activeAlert={activeAlert}
        currentStaff={currentStaff}
        staffList={staffList}
        facilityConfig={facilityConfig}
        onAcknowledgeSOS={handleAcknowledgeSOS}
        onResolveSOS={handleResolveSOS}
        onOpenFullEmergencyGuide={() => setIsEmergencyOpen(true)}
      />

      {/* Navigation Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        staffList={staffList}
        currentStaff={currentStaff}
        setCurrentStaff={setCurrentStaff}
        facilityConfig={facilityConfig}
        onOpenEmergency={() => setIsEmergencyOpen(true)}
        onOpenBroadcastSOS={() => setIsBroadcastSOSOpen(true)}
        onOpenSOSHistory={() => setIsSOSHistoryOpen(true)}
        onOpenSetup={() => setIsSetupOpen(true)}
        unreadCountForCurrentStaff={unreadCountForCurrentStaff}
        activeAlertCount={activeAlertCount}
      />

      {/* Floating Toast Message */}
      {toastMessage && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white font-bold text-xs sm:text-sm px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center space-x-2 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Tab 1: Manual List */}
        {activeTab === 'manuals' && (
          <div className="space-y-6">
            {/* Unread Alert Card for Current Staff */}
            {unreadCountForCurrentStaff > 0 && (
              <div className="bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 text-white rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-red-400">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base text-white">
                      {currentStaff.name} 様：未確認のマニュアルが {unreadCountForCurrentStaff} 件あります
                    </h3>
                    <p className="text-xs text-red-100">
                      安全な支援を提供するため、必ず更新された重要マニュアルを確認し「理解・署名」を完了してください。
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const firstUnread = manuals.find((m) => !currentStaff.readManualIds.includes(m.id));
                    if (firstUnread) setSelectedManual(firstUnread);
                  }}
                  className="bg-white hover:bg-gray-100 text-red-700 font-extrabold text-xs px-4 py-2 rounded-xl shadow-md transition-all shrink-0 cursor-pointer"
                >
                  未確認マニュアルを開く
                </button>
              </div>
            )}

            {/* Filter and Search Bar */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 space-y-4">
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                {/* Search Input */}
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="マニュアルタイトル・キーワードで検索 (例: エピペン, 飛び出し, 送迎車)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-gray-900 focus:outline-none focus:border-blue-800 focus:bg-white transition-all font-medium"
                  />
                </div>

                {/* Add New Manual Button */}
                <button
                  onClick={handleOpenAddManual}
                  className="bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md flex items-center justify-center space-x-1.5 shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>新規マニュアルを作成</span>
                </button>
              </div>

              {/* Category Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs">
                <span className="text-gray-500 font-bold shrink-0 mr-1 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5" /> 分類:
                </span>
                {[
                  { id: 'all', label: 'すべて' },
                  { id: 'emergency', label: '🚨 緊急・危機管理' },
                  { id: 'daily', label: '🏫 日常業務・療育' },
                  { id: 'vehicle', label: '🚗 送迎・車内安全' },
                  { id: 'medical', label: '💉 アレルギー・医療' },
                  { id: 'abuse_prevention', label: '🛡️ 虐待防止・権利擁護' },
                  { id: 'compliance', label: '⚖️ 法令・運営指導' },
                  { id: 'visiting_support', label: '🏫 保育所等訪問・学校' },
                  { id: 'bcp_infection', label: '🦠 感染症・BCP' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all border cursor-pointer ${
                      selectedCategory === cat.id
                        ? 'bg-blue-900 text-white border-blue-900 shadow-xs'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Active Filter Clear Helper */}
            {(selectedCategory !== 'all' || selectedSeverity !== 'all' || searchQuery) && (
              <div className="flex items-center justify-between text-xs text-gray-600 bg-blue-50/60 p-2.5 rounded-xl border border-blue-100">
                <span>
                  検索・絞り込み結果: <strong>{filteredManuals.length}</strong> 件該当
                </span>
                <button
                  onClick={() => {
                    setSelectedCategory('all');
                    setSelectedSeverity('all');
                    setSearchQuery('');
                  }}
                  className="text-blue-800 font-bold hover:underline cursor-pointer"
                >
                  フィルターをクリア
                </button>
              </div>
            )}

            {/* Manual Cards Grid */}
            {filteredManuals.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredManuals.map((manual) => {
                  const readCount = staffList.filter((s) => s.readManualIds.includes(manual.id)).length;
                  return (
                    <ManualCard
                      key={manual.id}
                      manual={manual}
                      currentStaff={currentStaff}
                      onSelectManual={setSelectedManual}
                      onEditManual={handleOpenEditManual}
                      readCount={readCount}
                      totalStaffCount={staffList.length}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-500 space-y-2 shadow-sm">
                <BookOpen className="w-8 h-8 text-gray-400 mx-auto" />
                <p className="text-sm font-semibold text-gray-800">該当するマニュアルが見つかりません</p>
                <p className="text-xs text-gray-500">検索ワードやカテゴリーの選択を変更してください。</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Vocal Prompting & Support Methods Guide (Tabbed by Child) */}
        {activeTab === 'support-guide' && (
          <SupportGuideView
            childrenList={childrenList}
            masterOptions={masterOptions}
            onAddChild={handleAddChild}
            onUpdateChild={handleUpdateChild}
            onDeleteChild={handleDeleteChild}
            onConsultAI={(queryText) => {
              setAiInitialQuery(queryText);
              setActiveTab('ai-consult');
            }}
          />
        )}

        {/* Tab 3: Dashboard Tracker */}
        {activeTab === 'dashboard' && (
          <DashboardView
            manuals={manuals}
            staffList={staffList}
            signatures={signatures}
            masterOptions={masterOptions}
            onRemindStaff={handleRemindStaff}
          />
        )}

        {/* Tab 4: Incident & Near-Miss Logs */}
        {activeTab === 'incidents' && (
          <IncidentLogView
            incidents={incidents}
            manuals={manuals}
            currentStaff={currentStaff}
            masterOptions={masterOptions}
            onAddIncident={handleAddIncident}
            onUpdateIncident={handleUpdateIncident}
            onDeleteIncident={handleDeleteIncident}
          />
        )}

        {/* Tab 5: AI Manual Consultation */}
        {activeTab === 'ai-consult' && (
          <AIConsultView
            manuals={manuals}
            facilityConfig={facilityConfig}
            initialQuery={aiInitialQuery}
          />
        )}
      </main>

      {/* Modals */}
      <ManualDetailModal
        manual={selectedManual}
        onClose={() => setSelectedManual(null)}
        currentStaff={currentStaff}
        staffList={staffList}
        onToggleRead={handleToggleRead}
        signatures={signatures}
        onEditManual={handleOpenEditManual}
      />

      <EditManualModal
        isOpen={isEditModalOpen}
        manual={editingManual}
        masterOptions={masterOptions}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingManual(null);
        }}
        onSave={handleSaveManual}
        onDelete={handleDeleteManual}
      />

      {/* Emergency Guide Modal */}
      <EmergencyModal
        isOpen={isEmergencyOpen}
        onClose={() => setIsEmergencyOpen(false)}
        facilityConfig={facilityConfig}
      />

      {/* Emergency SOS Broadcast Modal (Send to ALL Staff) */}
      <EmergencySOSModal
        isOpen={isBroadcastSOSOpen}
        onClose={() => setIsBroadcastSOSOpen(false)}
        currentStaff={currentStaff}
        staffList={staffList}
        facilityConfig={facilityConfig}
        onBroadcastSOS={handleBroadcastSOS}
      />

      {/* Emergency SOS History Log Modal */}
      <EmergencyHistoryModal
        isOpen={isSOSHistoryOpen}
        onClose={() => setIsSOSHistoryOpen(false)}
        alerts={alerts}
        staffList={staffList}
        onResolveSOS={handleResolveSOS}
      />

      {/* Facility Settings Modal */}
      <FacilitySetupModal
        isOpen={isSetupOpen}
        onClose={() => setIsSetupOpen(false)}
        facilityConfig={facilityConfig}
        onUpdateConfig={setFacilityConfig}
        masterOptions={masterOptions}
        onUpdateMasterOptions={setMasterOptions}
        staffList={staffList}
        onUpdateStaffList={setStaffList}
      />

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 py-6 text-center text-xs text-gray-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            © 2026 放課後等デイサービス安全管理・マニュアル確認システム ({facilityConfig.facilityName})
          </span>
          <span className="text-gray-500">
            児童福祉法・障害児通所支援基準準拠 | AI Assisted by Gemini
          </span>
        </div>
      </footer>
    </div>
  );
}
