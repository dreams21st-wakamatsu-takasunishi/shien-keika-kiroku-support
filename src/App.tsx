import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Cloud, HardDrive, LoaderCircle } from 'lucide-react';
import { AiWritingSettings, ChildProfile, DEFAULT_AI_WRITING_SETTINGS, SupportPlan, SupportRecord, Template } from './types';
import { defaultTemplates } from './data/defaultTemplates';
import { sampleRecords, sampleChildren } from './data/sampleData';
import { Header, ActiveTab } from './components/Header';
import { RecordForm } from './components/RecordForm';
import { RecordPreview } from './components/RecordPreview';
import { RecordList } from './components/RecordList';
import { TemplateEditor } from './components/TemplateEditor';
import { ChildrenManager } from './components/ChildrenManager';
import { SupportPlanManager } from './components/SupportPlanManager';
import { TeamManager } from './components/TeamManager';
import { AISettingsEditor } from './components/AISettingsEditor';
import { AuthScreen } from './components/AuthScreen';
import { SetPasswordScreen } from './components/SetPasswordScreen';
import { useAuth } from './hooks/useAuth';
import { supabase } from './lib/supabase';
import { FEATURE_FLAGS } from './config/features';
import {
  archiveTemplate,
  closeSupportPlan,
  loadWorkspaceData,
  saveChild,
  saveRecord,
  saveRecords,
  saveAiWritingSettings,
  saveSupportPlan,
  saveTemplate,
  seedDefaultTemplates,
  softDeleteChild,
  softDeleteRecord,
} from './services/dataService';

export default function App() {
  const auth = useAuth();
  const remoteMode = auth.configured;
  const [activeTab, setActiveTab] = useState<ActiveTab | 'preview'>('form');
  const [dataLoading, setDataLoading] = useState(remoteMode);
  const [dataError, setDataError] = useState<string | null>(null);

  const [records, setRecords] = useState<SupportRecord[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_records_data');
    return saved ? JSON.parse(saved) : sampleRecords;
  });
  const [templates, setTemplates] = useState<Template[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_templates_data');
    return saved ? JSON.parse(saved) : defaultTemplates;
  });
  const [childrenList, setChildrenList] = useState<ChildProfile[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_children_data');
    return saved ? JSON.parse(saved) : sampleChildren;
  });
  const [supportPlans, setSupportPlans] = useState<SupportPlan[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_plans_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentRecord, setCurrentRecord] = useState<SupportRecord | null>(null);
  const [formSessionId, setFormSessionId] = useState(0);
  const [aiWritingSettings, setAiWritingSettings] = useState<AiWritingSettings>(() => {
    if (remoteMode) return DEFAULT_AI_WRITING_SETTINGS;
    const saved = localStorage.getItem('support_ai_writing_settings');
    return saved ? JSON.parse(saved) : DEFAULT_AI_WRITING_SETTINGS;
  });

  useEffect(() => {
    if (!remoteMode) localStorage.setItem('support_records_data', JSON.stringify(records));
  }, [records, remoteMode]);
  useEffect(() => {
    if (!remoteMode) localStorage.setItem('support_templates_data', JSON.stringify(templates));
  }, [templates, remoteMode]);
  useEffect(() => {
    if (!remoteMode) localStorage.setItem('support_children_data', JSON.stringify(childrenList));
  }, [childrenList, remoteMode]);
  useEffect(() => {
    if (!remoteMode) localStorage.setItem('support_plans_data', JSON.stringify(supportPlans));
  }, [supportPlans, remoteMode]);
  useEffect(() => {
    if (!remoteMode) localStorage.setItem('support_ai_writing_settings', JSON.stringify(aiWritingSettings));
  }, [aiWritingSettings, remoteMode]);

  const refreshRemoteData = useCallback(async (showLoading = true) => {
    if (!auth.profile) return;
    if (showLoading) setDataLoading(true);
    try {
      let workspace = await loadWorkspaceData(auth.profile.organizationId);
      if (workspace.templates.length === 0 && auth.profile.role !== 'staff') {
        await seedDefaultTemplates(auth.profile.organizationId, defaultTemplates);
        workspace = { ...workspace, templates: defaultTemplates };
      }
      setRecords(workspace.records);
      setTemplates(workspace.templates);
      setChildrenList(workspace.children);
      setSupportPlans(workspace.supportPlans);
      setAiWritingSettings(workspace.aiWritingSettings);
      setDataError(null);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : '共有データを取得できませんでした。');
    } finally {
      setDataLoading(false);
    }
  }, [auth.profile]);

  useEffect(() => {
    if (remoteMode && auth.profile) void refreshRemoteData();
  }, [remoteMode, auth.profile, refreshRemoteData]);

  useEffect(() => {
    if (!supabase || !auth.profile) return;
    const organizationId = auth.profile.organizationId;
    const channel = supabase
      .channel(`workspace-${organizationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_records', filter: `organization_id=eq.${organizationId}` }, () => void refreshRemoteData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'children', filter: `organization_id=eq.${organizationId}` }, () => void refreshRemoteData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'record_templates', filter: `organization_id=eq.${organizationId}` }, () => void refreshRemoteData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_plans', filter: `organization_id=eq.${organizationId}` }, () => void refreshRemoteData(false))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [auth.profile, refreshRemoteData]);

  if (auth.loading) {
    return <LoadingScreen text="認証状態を確認しています..." />;
  }
  if (remoteMode && !auth.session) {
    return <AuthScreen onSignIn={auth.signIn} />;
  }
  if (remoteMode && auth.session && auth.needsPasswordSetup) {
    return (
      <SetPasswordScreen
        email={auth.session.user.email}
        onComplete={auth.completePasswordSetup}
        onSignOut={auth.signOut}
      />
    );
  }
  if (remoteMode && auth.session && !auth.profile) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="max-w-lg bg-white border border-rose-200 rounded-xl p-6 text-sm text-rose-800">
          <AlertTriangle className="w-6 h-6 mb-2" />
          {auth.error || '利用者プロフィールが見つかりません。Supabaseの初期マイグレーションを確認してください。'}
          <button onClick={() => auth.signOut()} className="block mt-4 text-xs font-bold underline">ログアウト</button>
        </div>
      </div>
    );
  }
  if (dataLoading) return <LoadingScreen text="事業所データを読み込んでいます..." />;

  const organizationId = auth.profile?.organizationId;
  const canReview = !remoteMode || auth.profile?.role === 'manager' || auth.profile?.role === 'admin';
  const canManageSettings = !remoteMode || auth.profile?.role === 'manager' || auth.profile?.role === 'admin';
  const unapprovedCount = records.filter((record) => record.approvalStatus === '未確認').length;

  const persistError = (error: unknown) => {
    const message = error instanceof Error ? error.message : '保存処理に失敗しました。';
    setDataError(message);
    alert(message);
    throw error;
  };

  const handleSaveRecord = async (savedRecord: SupportRecord) => {
    try {
      if (organizationId) await saveRecord(organizationId, savedRecord);
      setRecords((previous) => {
        const exists = previous.some((record) => record.id === savedRecord.id);
        return exists
          ? previous.map((record) => record.id === savedRecord.id ? savedRecord : record)
          : [savedRecord, ...previous];
      });
      setCurrentRecord(savedRecord);
      setActiveTab('preview');
    } catch (error) { persistError(error); }
  };

  const handleSaveRecords = async (savedRecords: SupportRecord[]) => {
    try {
      if (organizationId) await saveRecords(organizationId, savedRecords);
      setRecords((previous) => {
        const savedIds = new Set(savedRecords.map((record) => record.id));
        return [...savedRecords, ...previous.filter((record) => !savedIds.has(record.id))];
      });
      if (savedRecords.length === 1 && currentRecord?.id === savedRecords[0].id) {
        setCurrentRecord(savedRecords[0]);
        setActiveTab('preview');
      } else {
        setCurrentRecord(null);
        setActiveTab('records');
      }
    } catch (error) { persistError(error); }
  };

  const handleEditRecord = (record: SupportRecord) => {
    if (record.approvalStatus === '確認済み') {
      alert('承認済み記録は保護されています。児発管が「要修正」に変更してから再編集してください。');
      return;
    }
    setCurrentRecord(record);
    setActiveTab('form');
  };

  const handleDuplicateRecord = (record: SupportRecord) => {
    const now = new Date();
    const duplicated: SupportRecord = {
      ...JSON.parse(JSON.stringify(record)),
      id: `rec-${Date.now()}`,
      date: now.toISOString().split('T')[0],
      approvalStatus: '未確認',
      jihatsukanComment: undefined,
      reviewedBy: undefined,
      reviewedAt: undefined,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    setCurrentRecord(duplicated);
    setActiveTab('form');
  };

  const handleDeleteRecord = async (recordId: string) => {
    const record = records.find((item) => item.id === recordId);
    if (record?.approvalStatus === '確認済み') {
      alert('承認済み記録は削除できません。');
      return;
    }
    try {
      if (organizationId) await softDeleteRecord(organizationId, recordId);
      setRecords((previous) => previous.filter((item) => item.id !== recordId));
    } catch (error) { persistError(error); }
  };

  const handleUpdateApproval = async (
    recordId: string,
    comment: string,
    status: '確認済み' | '要修正',
    reviewerName: string
  ) => {
    if (!canReview) {
      alert('確認・承認は児発管または管理者のみ実行できます。');
      return;
    }
    const target = records.find((record) => record.id === recordId);
    if (!target) return;
    const now = new Date().toISOString();
    const updated: SupportRecord = {
      ...target,
      approvalStatus: status,
      jihatsukanComment: comment,
      reviewedBy: auth.profile?.displayName || reviewerName || '児童発達支援管理責任者',
      reviewedAt: now,
      updatedAt: now,
    };
    try {
      if (organizationId) await saveRecord(organizationId, updated);
      setRecords((previous) => previous.map((record) => record.id === recordId ? updated : record));
      setCurrentRecord((previous) => previous?.id === recordId ? updated : previous);
    } catch (error) { persistError(error); }
  };

  const handleSaveTemplate = async (template: Template) => {
    if (!canManageSettings) return void alert('テンプレートを変更する権限がありません。');
    try {
      if (organizationId) await saveTemplate(organizationId, template);
      setTemplates((previous) => previous.some((item) => item.id === template.id)
        ? previous.map((item) => item.id === template.id ? template : item)
        : [...previous, template]);
    } catch (error) { persistError(error); }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!canManageSettings) return void alert('テンプレートを変更する権限がありません。');
    try {
      if (organizationId) await archiveTemplate(organizationId, templateId);
      setTemplates((previous) => previous.filter((item) => item.id !== templateId));
    } catch (error) { persistError(error); }
  };

  const handleSaveAiWritingSettings = async (settings: AiWritingSettings) => {
    try {
      if (organizationId) await saveAiWritingSettings(organizationId, settings);
      setAiWritingSettings(settings);
    } catch (error) { persistError(error); }
  };

  const handleAddChild = async (child: ChildProfile) => {
    try {
      if (organizationId) await saveChild(organizationId, child);
      setChildrenList((previous) => [...previous, child]);
    } catch (error) { persistError(error); }
  };

  const handleUpdateChild = async (child: ChildProfile) => {
    try {
      if (organizationId) await saveChild(organizationId, child);
      setChildrenList((previous) => previous.map((item) => item.id === child.id ? child : item));
    } catch (error) { persistError(error); }
  };

  const handleDeleteChild = async (childId: string) => {
    try {
      if (organizationId) await softDeleteChild(organizationId, childId);
      setChildrenList((previous) => previous.filter((item) => item.id !== childId));
    } catch (error) { persistError(error); }
  };

  const handleSavePlan = async (plan: SupportPlan) => {
    try {
      if (organizationId) await saveSupportPlan(organizationId, plan);
      setSupportPlans((previous) => previous.some((item) => item.id === plan.id)
        ? previous.map((item) => item.id === plan.id ? plan : item)
        : [plan, ...previous]);
    } catch (error) { persistError(error); }
  };

  const handleClosePlan = async (planId: string) => {
    try {
      if (organizationId) await closeSupportPlan(organizationId, planId);
      setSupportPlans((previous) => previous.map((item) => item.id === planId ? { ...item, status: '終了' } : item));
    } catch (error) { persistError(error); }
  };

  const handleNewRecordClick = () => {
    setCurrentRecord(null);
    setFormSessionId((previous) => previous + 1);
    setActiveTab('form');
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 font-sans antialiased pb-24 md:pb-12">
      <Header
        activeTab={activeTab === 'preview' ? 'records' : activeTab}
        setActiveTab={(tab) => {
          if (tab === 'form') setCurrentRecord(null);
          setActiveTab(tab);
        }}
        unapprovedCount={unapprovedCount}
        onNewRecord={handleNewRecordClick}
        currentUser={auth.profile}
        onSignOut={remoteMode ? auth.signOut : undefined}
      />

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-3 sm:pt-6">
        <div className={`mb-3 sm:mb-4 rounded-xl border px-3 sm:px-4 py-2 text-[11px] sm:text-xs flex items-center gap-2 ${remoteMode ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
          {remoteMode ? <Cloud className="w-4 h-4" /> : <HardDrive className="w-4 h-4" />}
          {remoteMode
            ? `${auth.profile?.organizationName || '事業所'}の共有データベースに接続中`
            : 'ローカル試用モード：データはこのブラウザだけに保存されます。実運用にはSupabase設定が必要です。'}
        </div>
        {dataError && <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg p-3">{dataError}</div>}

        {activeTab === 'form' && (
          <RecordForm
            key={currentRecord?.id || `new-record-${formSessionId}`}
            templates={templates}
            childrenList={childrenList}
            initialRecord={currentRecord}
            defaultRecorderName={auth.profile?.displayName}
            organizationId={organizationId}
            userId={auth.profile?.id}
            onSaveRecords={handleSaveRecords}
            onAddChild={handleAddChild}
          />
        )}
        {activeTab === 'preview' && currentRecord && (
          <RecordPreview record={currentRecord} canReview={canReview} defaultReviewerName={auth.profile?.displayName} lockReviewerName={remoteMode} onEditRecord={handleEditRecord} onBackToList={() => setActiveTab('records')} onUpdateApproval={handleUpdateApproval} />
        )}
        {activeTab === 'records' && (
          <RecordList records={records} onSelectRecord={(record) => { setCurrentRecord(record); setActiveTab('preview'); }} onEditRecord={handleEditRecord} onDuplicateRecord={handleDuplicateRecord} onDeleteRecord={handleDeleteRecord} onNewRecord={handleNewRecordClick} />
        )}
        {activeTab === 'children' && (
          <ChildrenManager childrenList={childrenList} onAddChild={handleAddChild} onUpdateChild={handleUpdateChild} onDeleteChild={handleDeleteChild} />
        )}
        {FEATURE_FLAGS.supportPlansAndFiveDomains && activeTab === 'plans' && (
          <SupportPlanManager childrenList={childrenList} supportPlans={supportPlans} canEdit={canManageSettings} onSavePlan={handleSavePlan} onClosePlan={handleClosePlan} />
        )}
        {activeTab === 'templates' && canManageSettings && (
          <>
            <AISettingsEditor settings={aiWritingSettings} onSave={handleSaveAiWritingSettings} />
            <TemplateEditor templates={templates} onSaveTemplate={handleSaveTemplate} onDeleteTemplate={handleDeleteTemplate} />
          </>
        )}
        {activeTab === 'team' && auth.profile && canReview && <TeamManager currentUser={auth.profile} />}
      </main>
    </div>
  );
}

function LoadingScreen({ text }: { text: string }) {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-3">
      <LoaderCircle className="w-8 h-8 text-teal-400 animate-spin" />
      <p className="text-sm text-slate-300">{text}</p>
    </div>
  );
}
