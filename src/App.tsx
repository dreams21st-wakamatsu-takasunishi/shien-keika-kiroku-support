import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ChevronRight, Cloud, HardDrive, House, LoaderCircle, RefreshCw, UserRoundCog, WifiOff } from 'lucide-react';
import {
  AiWritingSettings,
  Announcement,
  AnnouncementConfirmation,
  ChildProfile,
  DEFAULT_AI_WRITING_SETTINGS,
  HandoverConfirmation,
  HandoverItem,
  HandoverStatus,
  HomeAssistantExecutionResult,
  HomeAssistantProposal,
  MorningMeetingConfirmation,
  MorningMeetingRecord,
  MorningMeetingTemplate,
  RecordDraftSummary,
  RecorderProfile,
  ReviewIssue,
  SupportPlan,
  SupportRecord,
  Template,
} from './types';
import { defaultTemplates } from './data/defaultTemplates';
import { sampleRecords, sampleChildren, sampleRecorderProfiles } from './data/sampleData';
import { Header, ActiveTab } from './components/Header';
import { RecordForm } from './components/RecordForm';
import { RecordPreview } from './components/RecordPreview';
import { RecordList } from './components/RecordList';
import { ChildrenManager } from './components/ChildrenManager';
import { SupportPlanManager } from './components/SupportPlanManager';
import { TeamManager } from './components/TeamManager';
import { SettingsHub } from './components/SettingsHub';
import { HomeScreen } from './components/HomeScreen';
import { AuthScreen } from './components/AuthScreen';
import { SetPasswordScreen } from './components/SetPasswordScreen';
import { RecorderSessionGate } from './components/RecorderSessionGate';
import { useAuth } from './hooks/useAuth';
import { supabase } from './lib/supabase';
import { FEATURE_FLAGS } from './config/features';
import { normalizeTemplateFatigueScale } from './utils/templateNormalizer';
import { upgradeStandardWeekdayTemplate } from './data/weekdayTemplate';
import { upgradeStandardHolidayTemplate } from './data/holidayTemplate';
import {
  archiveMorningMeetingTemplate,
  archiveAnnouncement,
  archiveTemplate,
  closeSupportPlan,
  deleteHandoverConfirmation,
  deleteMorningMeetingConfirmation,
  deleteRecordDraft,
  listRecordDrafts,
  loadWorkspaceData,
  saveChild,
  saveHandoverConfirmation,
  saveHandoverItem,
  saveMorningMeetingConfirmation,
  saveMorningMeetingRecord,
  saveMorningMeetingTemplate,
  saveRecord,
  saveRecords,
  saveAiWritingSettings,
  saveAnnouncement,
  saveAnnouncementConfirmation,
  saveSupportPlan,
  sendAnnouncementNotification,
  saveTemplate,
  seedDefaultTemplates,
  softDeleteChild,
  softDeleteRecord,
  updateHandoverStatus,
} from './services/dataService';
import { createRecordDraftKey } from './utils/deviceId';
import { isDraftCurrent } from './utils/draftExpiry';
import {
  enqueueRecordSync,
  loadPendingRecordSyncs,
  markPendingRecordSyncError,
  mergePendingRecords,
  PendingRecordSync,
  removePendingRecordSync,
} from './utils/offlineQueue';
import { showAnnouncementNotification } from './utils/deviceNotifications';

export default function App() {
  const auth = useAuth();
  const remoteMode = auth.configured;
  const organizationId = auth.profile?.organizationId;
  const [activeTab, setActiveTab] = useState<ActiveTab | 'preview'>('home');
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
    const source = saved ? JSON.parse(saved) as Template[] : defaultTemplates;
    return source.map((template) => upgradeStandardHolidayTemplate(upgradeStandardWeekdayTemplate(normalizeTemplateFatigueScale(template))));
  });
  const [childrenList, setChildrenList] = useState<ChildProfile[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_children_data');
    return saved ? JSON.parse(saved) : sampleChildren;
  });
  const [recorderProfiles, setRecorderProfiles] = useState<RecorderProfile[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_recorder_profiles_data');
    return saved ? JSON.parse(saved) : sampleRecorderProfiles;
  });
  const [handoverItems, setHandoverItems] = useState<HandoverItem[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_handover_items_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [handoverConfirmations, setHandoverConfirmations] = useState<HandoverConfirmation[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_handover_confirmations_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [morningMeetingRecords, setMorningMeetingRecords] = useState<MorningMeetingRecord[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_morning_meeting_records_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [morningMeetingTemplates, setMorningMeetingTemplates] = useState<MorningMeetingTemplate[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_morning_meeting_templates_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [morningMeetingConfirmations, setMorningMeetingConfirmations] = useState<MorningMeetingConfirmation[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_morning_meeting_confirmations_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [recordDrafts, setRecordDrafts] = useState<RecordDraftSummary[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_announcements_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [announcementConfirmations, setAnnouncementConfirmations] = useState<AnnouncementConfirmation[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_announcement_confirmations_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeRecorder, setActiveRecorder] = useState<RecorderProfile | null>(null);
  const [activeDraftKey, setActiveDraftKey] = useState(createRecordDraftKey);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pendingSyncs, setPendingSyncs] = useState<PendingRecordSync[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [supportPlans, setSupportPlans] = useState<SupportPlan[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_plans_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentRecord, setCurrentRecord] = useState<SupportRecord | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<{ stepId?: string; issueId?: string } | null>(null);
  const [readOnlyDraft, setReadOnlyDraft] = useState<{ draftKey: string; ownerName?: string } | null>(null);
  const [formSessionId, setFormSessionId] = useState(0);
  const [assistantRecordPrefill, setAssistantRecordPrefill] = useState<{ childId: string; date: string; requestId: string } | null>(null);
  const [recordFilterChildId, setRecordFilterChildId] = useState<string | null>(null);
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
    if (!remoteMode) localStorage.setItem('support_recorder_profiles_data', JSON.stringify(recorderProfiles));
  }, [recorderProfiles, remoteMode]);
  useEffect(() => {
    if (!remoteMode) localStorage.setItem('support_handover_items_data', JSON.stringify(handoverItems));
  }, [handoverItems, remoteMode]);
  useEffect(() => {
    if (!remoteMode) {
      localStorage.setItem('support_handover_confirmations_data', JSON.stringify(handoverConfirmations));
    }
  }, [handoverConfirmations, remoteMode]);
  useEffect(() => {
    if (!remoteMode) {
      localStorage.setItem('support_morning_meeting_records_data', JSON.stringify(morningMeetingRecords));
    }
  }, [morningMeetingRecords, remoteMode]);
  useEffect(() => {
    if (!remoteMode) {
      localStorage.setItem('support_morning_meeting_templates_data', JSON.stringify(morningMeetingTemplates));
    }
  }, [morningMeetingTemplates, remoteMode]);
  useEffect(() => {
    if (!remoteMode) {
      localStorage.setItem('support_morning_meeting_confirmations_data', JSON.stringify(morningMeetingConfirmations));
    }
  }, [morningMeetingConfirmations, remoteMode]);
  useEffect(() => {
    if (!remoteMode) localStorage.setItem('support_plans_data', JSON.stringify(supportPlans));
  }, [supportPlans, remoteMode]);
  useEffect(() => {
    if (!remoteMode) localStorage.setItem('support_ai_writing_settings', JSON.stringify(aiWritingSettings));
  }, [aiWritingSettings, remoteMode]);
  useEffect(() => {
    if (!remoteMode) localStorage.setItem('support_announcements_data', JSON.stringify(announcements));
  }, [announcements, remoteMode]);
  useEffect(() => {
    if (!remoteMode) {
      localStorage.setItem('support_announcement_confirmations_data', JSON.stringify(announcementConfirmations));
    }
  }, [announcementConfirmations, remoteMode]);

  const refreshRemoteData = useCallback(async (showLoading = true) => {
    if (!auth.profile) return;
    if (showLoading) setDataLoading(true);
    try {
      let workspace = await loadWorkspaceData(auth.profile.organizationId);
      if (workspace.templates.length === 0 && auth.profile.role !== 'staff') {
        await seedDefaultTemplates(auth.profile.organizationId, defaultTemplates);
        workspace = { ...workspace, templates: defaultTemplates };
      }
      const queued = loadPendingRecordSyncs(auth.profile.organizationId, auth.profile.id);
      setPendingSyncs(queued);
      setRecords(mergePendingRecords(workspace.records, queued));
      setTemplates(workspace.templates);
      setChildrenList(workspace.children);
      setRecorderProfiles(workspace.recorderProfiles);
      setHandoverItems(workspace.handoverItems);
      setHandoverConfirmations(workspace.handoverConfirmations);
      setMorningMeetingRecords(workspace.morningMeetingRecords);
      setMorningMeetingTemplates(workspace.morningMeetingTemplates);
      setMorningMeetingConfirmations(workspace.morningMeetingConfirmations);
      setSupportPlans(workspace.supportPlans);
      setAiWritingSettings(workspace.aiWritingSettings);
      setAnnouncements(workspace.announcements);
      setAnnouncementConfirmations(workspace.announcementConfirmations);
      setDataError(null);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : '共有データを取得できませんでした。');
    } finally {
      setDataLoading(false);
    }
  }, [auth.profile]);

  const refreshRecordDrafts = useCallback(async () => {
    if (!organizationId) {
      const prefix = 'support-record-draft-v2:local:local:record-';
      const localDrafts = Object.keys(localStorage).flatMap((key): RecordDraftSummary[] => {
        if (!key.startsWith(prefix)) return [];
        try {
          const payload = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, unknown>;
          const updatedAt = typeof payload.updatedAt === 'string' ? payload.updatedAt : '';
          if (!isDraftCurrent(typeof payload.draftCycleKey === 'string' ? payload.draftCycleKey : undefined, updatedAt)) {
            localStorage.removeItem(key);
            return [];
          }
          return [{
            draftKey: key.split(':').at(-1) || key.slice(prefix.length - 'record-'.length),
            revision: 0,
            recorderId: typeof payload.recorderId === 'string' ? payload.recorderId : undefined,
            recorderName: typeof payload.recorderName === 'string' ? payload.recorderName : undefined,
            selectedChildIds: Array.isArray(payload.selectedChildIds)
              ? payload.selectedChildIds.filter((value): value is string => typeof value === 'string')
              : [],
            date: typeof payload.date === 'string' ? payload.date : undefined,
            currentStepIndex: typeof payload.currentStepIndex === 'number' ? payload.currentStepIndex : 0,
            updatedAt,
          }];
        } catch {
          return [];
        }
      }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      setRecordDrafts(localDrafts);
      return;
    }
    try {
      const drafts = await listRecordDrafts(organizationId);
      const current = drafts.filter((draft) => isDraftCurrent(undefined, draft.updatedAt));
      const expired = drafts.filter((draft) => !isDraftCurrent(undefined, draft.updatedAt));
      setRecordDrafts(current);
      if (expired.length > 0) {
        await Promise.allSettled(expired.map((draft) => deleteRecordDraft(organizationId, draft.draftKey)));
      }
    } catch {
      // Draft list failure does not block the main workspace.
    }
  }, [organizationId]);

  useEffect(() => {
    if (activeTab === 'home') void refreshRecordDrafts();
  }, [activeTab, refreshRecordDrafts]);

  useEffect(() => {
    if (remoteMode && auth.profile) {
      void refreshRemoteData();
      void refreshRecordDrafts();
    }
  }, [remoteMode, auth.profile, refreshRemoteData, refreshRecordDrafts]);

  useEffect(() => {
    if (!supabase || !auth.profile) return;
    const organizationId = auth.profile.organizationId;
    const channel = supabase
      .channel(`workspace-${organizationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_records', filter: `organization_id=eq.${organizationId}` }, () => void refreshRemoteData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'children', filter: `organization_id=eq.${organizationId}` }, () => void refreshRemoteData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'child_regular_day_schedules', filter: `organization_id=eq.${organizationId}` }, () => void refreshRemoteData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recorder_profiles', filter: `organization_id=eq.${organizationId}` }, () => void refreshRemoteData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'record_templates', filter: `organization_id=eq.${organizationId}` }, () => void refreshRemoteData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_plans', filter: `organization_id=eq.${organizationId}` }, () => void refreshRemoteData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'handover_items', filter: `organization_id=eq.${organizationId}` }, () => void refreshRemoteData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'handover_confirmations', filter: `organization_id=eq.${organizationId}` }, () => void refreshRemoteData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'morning_meeting_records', filter: `organization_id=eq.${organizationId}` }, () => void refreshRemoteData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'morning_meeting_templates', filter: `organization_id=eq.${organizationId}` }, () => void refreshRemoteData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'morning_meeting_confirmations', filter: `organization_id=eq.${organizationId}` }, () => void refreshRemoteData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'record_drafts', filter: `organization_id=eq.${organizationId}` }, () => void refreshRecordDrafts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements', filter: `organization_id=eq.${organizationId}` }, (payload) => {
        if (payload.eventType === 'INSERT' && !import.meta.env.VITE_VAPID_PUBLIC_KEY) {
          const row = payload.new as { id?: string; title?: string; content?: string };
          void showAnnouncementNotification(row.title || '新しいお知らせ', row.content || '', row.id);
        }
        void refreshRemoteData(false);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcement_confirmations', filter: `organization_id=eq.${organizationId}` }, () => void refreshRemoteData(false))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [auth.profile, refreshRemoteData, refreshRecordDrafts]);

  const syncPendingRecords = useCallback(async () => {
    if (!organizationId || !auth.profile || !navigator.onLine || syncing) return;
    const queued = loadPendingRecordSyncs(organizationId, auth.profile.id);
    if (queued.length === 0) {
      setPendingSyncs([]);
      return;
    }
    setSyncing(true);
    let remaining = queued;
    for (const item of queued) {
      try {
        await saveRecords(organizationId, item.records);
        remaining = removePendingRecordSync(organizationId, auth.profile.id, item.id);
        setPendingSyncs(remaining);
      } catch (error) {
        const message = error instanceof Error ? error.message : '再送に失敗しました。';
        remaining = markPendingRecordSyncError(organizationId, auth.profile.id, item.id, message);
        setPendingSyncs(remaining);
        break;
      }
    }
    setSyncing(false);
    if (remaining.length === 0) await refreshRemoteData(false);
  }, [auth.profile, organizationId, refreshRemoteData, syncing]);

  useEffect(() => {
    if (!auth.profile) return;
    setPendingSyncs(loadPendingRecordSyncs(auth.profile.organizationId, auth.profile.id));
  }, [auth.profile]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      void syncPendingRecords();
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (navigator.onLine) void syncPendingRecords();
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncPendingRecords]);

  useEffect(() => {
    if (activeRecorder && !recorderProfiles.some((profile) => profile.id === activeRecorder.id)) {
      setActiveRecorder(null);
    }
  }, [activeRecorder, recorderProfiles]);

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
          <div className="mt-4 flex flex-wrap gap-4">
            <button onClick={auth.reloadProfile} className="text-xs font-bold underline">もう一度読み込む</button>
            <button onClick={() => auth.signOut()} className="text-xs font-bold underline">ログアウト</button>
          </div>
        </div>
      </div>
    );
  }
  if (dataLoading) return <LoadingScreen text="事業所データを読み込んでいます..." />;
  if (remoteMode && auth.profile?.role === 'staff' && !activeRecorder) {
    return (
      <RecorderSessionGate
        organizationId={auth.profile.organizationId}
        organizationName={auth.profile.organizationName}
        recorderProfiles={recorderProfiles}
        onUnlock={setActiveRecorder}
      />
    );
  }

  const canReview = !remoteMode || auth.profile?.role === 'manager' || auth.profile?.role === 'admin';
  const canManageSettings = !remoteMode || auth.profile?.role === 'manager' || auth.profile?.role === 'admin';
  const unapprovedCount = records.filter((record) => record.approvalStatus === '未確認').length;

  const persistError = (error: unknown) => {
    const message = error instanceof Error ? error.message : '保存処理に失敗しました。';
    setDataError(message);
    alert(message);
    throw error;
  };

  const saveRecordsOrQueue = async (items: SupportRecord[]) => {
    if (!organizationId || !auth.profile) return;
    try {
      await saveRecords(organizationId, items);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const networkFailure = !navigator.onLine || /network|fetch|connection|offline/i.test(message);
      if (!networkFailure) throw error;
      const queued = enqueueRecordSync(organizationId, auth.profile.id, items);
      setPendingSyncs(queued);
      setDataError('通信できないため端末に保存しました。通信復旧後に自動送信します。');
    }
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
      await saveRecordsOrQueue(savedRecords);
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
      void refreshRecordDrafts();
    } catch (error) { persistError(error); }
  };

  const handleEditRecord = (record: SupportRecord) => {
    if (record.approvalStatus === '確認済み') {
      alert('承認済み記録は保護されています。児発管が「要修正」に変更してから再編集してください。');
      return;
    }
    setCorrectionTarget(null);
    setReadOnlyDraft(null);
    setCurrentRecord(record);
    setActiveDraftKey(`record-edit-${record.id}`);
    setFormSessionId((previous) => previous + 1);
    setActiveTab('form');
  };

  const handleCorrectRecord = (record: SupportRecord, issue?: ReviewIssue) => {
    if (record.approvalStatus !== '要修正') {
      handleEditRecord(record);
      return;
    }
    const targetIssue = issue?.stepId
      ? issue
      : record.reviewIssues?.find((item) => !item.resolved && item.stepId);
    if (!targetIssue?.stepId) {
      alert('修正する質問が指定されていません。記録確認画面で児発管または管理者に修正箇所を登録してもらってください。');
      setCurrentRecord(record);
      setActiveTab('preview');
      return;
    }
    setCorrectionTarget({ stepId: targetIssue.stepId, issueId: targetIssue.id });
    setReadOnlyDraft(null);
    setCurrentRecord(record);
    setActiveDraftKey(`record-correction-${record.id}-${targetIssue?.id || 'general'}`);
    setFormSessionId((previous) => previous + 1);
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
      reviewIssues: [],
      reviewedBy: undefined,
      reviewedAt: undefined,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    setCorrectionTarget(null);
    setReadOnlyDraft(null);
    setCurrentRecord(duplicated);
    setActiveDraftKey(createRecordDraftKey());
    setFormSessionId((previous) => previous + 1);
    setActiveTab('form');
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (remoteMode && auth.profile?.role === 'staff') {
      alert('指導員は記録を削除できません。児発管または管理者に依頼してください。');
      return;
    }
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
    reviewerName: string,
    reviewIssues: ReviewIssue[]
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
      reviewIssues,
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
      const normalizedTemplate = normalizeTemplateFatigueScale(template);
      if (organizationId) await saveTemplate(organizationId, normalizedTemplate);
      setTemplates((previous) => previous.some((item) => item.id === normalizedTemplate.id)
        ? previous.map((item) => item.id === normalizedTemplate.id ? normalizedTemplate : item)
        : [...previous, normalizedTemplate]);
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

  const handleSaveAnnouncement = async (announcement: Announcement) => {
    if (remoteMode && !auth.profile) throw new Error('お知らせを送信するにはログインが必要です。');
    if (auth.profile?.role === 'staff' && !activeRecorder) {
      throw new Error('記録者を選択してからお知らせを作成してください。');
    }
    const savedAnnouncement: Announcement = {
      ...announcement,
      sourceType: 'manual',
      createdByRecorderId: activeRecorder?.id,
      createdByName: activeRecorder?.displayName || auth.profile?.displayName || '職員',
    };
    if (organizationId) {
      await saveAnnouncement(organizationId, savedAnnouncement);
    }
    setAnnouncements((previous) => [
      savedAnnouncement,
      ...previous.filter((item) => item.id !== savedAnnouncement.id),
    ]);
    if (organizationId) {
      try {
        await sendAnnouncementNotification(savedAnnouncement.id);
      } catch (error) {
        setDataError(`お知らせは保存しましたが、端末通知の配信に失敗しました: ${error instanceof Error ? error.message : '配信設定を確認してください。'}`);
      }
    } else {
      await showAnnouncementNotification(savedAnnouncement.title, savedAnnouncement.content, savedAnnouncement.id);
    }
  };

  const handleArchiveAnnouncement = async (announcementId: string) => {
    if (!canManageSettings) return;
    if (!window.confirm('このお知らせの表示を終了しますか？')) return;
    if (organizationId) await archiveAnnouncement(organizationId, announcementId);
    setAnnouncements((previous) => previous.filter((item) => item.id !== announcementId));
  };

  const handleSaveAnnouncementConfirmation = async (confirmation: AnnouncementConfirmation) => {
    try {
      if (organizationId) await saveAnnouncementConfirmation(organizationId, confirmation);
      setAnnouncementConfirmations((previous) => [
        confirmation,
        ...previous.filter((candidate) =>
          candidate.announcementId !== confirmation.announcementId
          || candidate.confirmerKey !== confirmation.confirmerKey
        ),
      ]);
      setDataError(null);
    } catch (error) {
      persistError(error);
    }
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

  const handleAssistantExecuted = async (proposal: HomeAssistantProposal, result: HomeAssistantExecutionResult) => {
    setChildrenList((previous) => previous.map((child) => {
      if (child.id !== proposal.childId) return child;
      const schedules = child.regularDaySchedules || [];
      return {
        ...child,
        ...(result.updatedChild || {}),
        regularDaySchedules: result.schedule
          ? [
              ...schedules.filter((schedule) => schedule.effectiveFrom !== result.schedule?.effectiveFrom),
              result.schedule,
            ].sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))
          : schedules,
      };
    }));
    if (remoteMode && auth.profile) await refreshRemoteData(false);

    if (result.clientAction?.type === 'start_support_record') {
      setCurrentRecord(null);
      setCorrectionTarget(null);
      setReadOnlyDraft(null);
      setActiveDraftKey(createRecordDraftKey());
      setAssistantRecordPrefill({
        childId: result.clientAction.childId,
        date: result.clientAction.date || new Date().toISOString().slice(0, 10),
        requestId: proposal.actionId,
      });
      setFormSessionId((previous) => previous + 1);
      setActiveTab('form');
    } else if (result.clientAction?.type === 'open_child_records') {
      setRecordFilterChildId(result.clientAction.childId);
      setActiveTab('records');
    }
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
    setCorrectionTarget(null);
    setReadOnlyDraft(null);
    setAssistantRecordPrefill(null);
    setActiveDraftKey(createRecordDraftKey());
    setFormSessionId((previous) => previous + 1);
    setActiveTab('form');
  };

  const handleStartRecord = (childId: string, date: string) => {
    const requestId = createRecordDraftKey();
    setCurrentRecord(null);
    setCorrectionTarget(null);
    setReadOnlyDraft(null);
    setActiveDraftKey(requestId);
    setAssistantRecordPrefill({ childId, date, requestId });
    setFormSessionId((previous) => previous + 1);
    setActiveTab('form');
  };

  const handleResumeDraft = (draftKey: string) => {
    setCurrentRecord(null);
    setCorrectionTarget(null);
    setReadOnlyDraft(null);
    setAssistantRecordPrefill(null);
    setActiveDraftKey(draftKey);
    setFormSessionId((previous) => previous + 1);
    setActiveTab('form');
  };

  const handleViewDraft = (draftKey: string, ownerName?: string) => {
    setCurrentRecord(null);
    setCorrectionTarget(null);
    setAssistantRecordPrefill(null);
    setReadOnlyDraft({ draftKey, ownerName });
    setActiveDraftKey(draftKey);
    setFormSessionId((previous) => previous + 1);
    setActiveTab('form');
  };

  const handleDeleteDraft = async (draftKey: string) => {
    if (!window.confirm('この入力中の記録を削除しますか？保存済み記録は削除されません。')) return;
    try {
      if (organizationId) {
        await deleteRecordDraft(organizationId, draftKey);
      } else {
        Object.keys(localStorage)
          .filter((key) => key.startsWith('support-record-draft-v2:local:local:') && key.endsWith(`:${draftKey}`))
          .forEach((key) => localStorage.removeItem(key));
      }
      setRecordDrafts((previous) => previous.filter((draft) => draft.draftKey !== draftKey));
    } catch (error) {
      persistError(error);
    }
  };

  const handleSaveHandover = async (item: HandoverItem) => {
    try {
      if (organizationId) await saveHandoverItem(organizationId, item);
      setHandoverItems((previous) => [
        item,
        ...previous.filter((candidate) => candidate.id !== item.id),
      ]);
    } catch (error) {
      persistError(error);
    }
  };

  const handleHandoverStatusChange = async (itemId: string, status: HandoverStatus) => {
    try {
      if (organizationId) await updateHandoverStatus(organizationId, itemId, status);
      const now = new Date().toISOString();
      setHandoverItems((previous) => previous.map((item) =>
        item.id === itemId ? { ...item, status, updatedAt: now } : item
      ));
    } catch (error) {
      persistError(error);
    }
  };

  const handleSaveMorningMeeting = async (record: MorningMeetingRecord) => {
    try {
      if (organizationId) await saveMorningMeetingRecord(organizationId, record);
      setMorningMeetingRecords((previous) => [
        record,
        ...previous.filter((candidate) => candidate.date !== record.date),
      ].sort((left, right) => right.date.localeCompare(left.date)));
      setDataError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : '朝礼記録を保存できませんでした。';
      setDataError(message);
      throw error;
    }
  };

  const handleSaveMorningMeetingTemplate = async (template: MorningMeetingTemplate) => {
    try {
      if (organizationId) await saveMorningMeetingTemplate(organizationId, template);
      setMorningMeetingTemplates((previous) => [
        template,
        ...previous.filter((candidate) => candidate.id !== template.id),
      ]);
      setDataError(null);
    } catch (error) {
      persistError(error);
    }
  };

  const handleArchiveMorningMeetingTemplate = async (templateId: string) => {
    try {
      if (organizationId) await archiveMorningMeetingTemplate(organizationId, templateId);
      setMorningMeetingTemplates((previous) =>
        previous.filter((template) => template.id !== templateId)
      );
      setDataError(null);
    } catch (error) {
      persistError(error);
    }
  };

  const handleSetMorningMeetingConfirmation = async (
    confirmation: MorningMeetingConfirmation,
    confirmed: boolean
  ) => {
    try {
      if (organizationId) {
        if (confirmed) {
          await saveMorningMeetingConfirmation(organizationId, confirmation);
        } else {
          await deleteMorningMeetingConfirmation(
            organizationId,
            confirmation.date,
            confirmation.confirmerKey
          );
        }
      }
      setMorningMeetingConfirmations((previous) => confirmed
        ? [
            confirmation,
            ...previous.filter((candidate) =>
              candidate.date !== confirmation.date
              || candidate.confirmerKey !== confirmation.confirmerKey
            ),
          ]
        : previous.filter((candidate) =>
            candidate.date !== confirmation.date
            || candidate.confirmerKey !== confirmation.confirmerKey
          )
      );
      setDataError(null);
    } catch (error) {
      persistError(error);
    }
  };

  const handleSetHandoverConfirmation = async (
    confirmation: HandoverConfirmation,
    confirmed: boolean
  ) => {
    try {
      if (organizationId) {
        if (confirmed) {
          await saveHandoverConfirmation(organizationId, confirmation);
        } else {
          await deleteHandoverConfirmation(
            organizationId,
            confirmation.handoverItemId,
            confirmation.confirmerKey
          );
        }
      }
      setHandoverConfirmations((previous) => confirmed
        ? [
            confirmation,
            ...previous.filter((candidate) =>
              candidate.handoverItemId !== confirmation.handoverItemId
              || candidate.confirmerKey !== confirmation.confirmerKey
            ),
          ]
        : previous.filter((candidate) =>
            candidate.handoverItemId !== confirmation.handoverItemId
            || candidate.confirmerKey !== confirmation.confirmerKey
          )
      );
      setDataError(null);
    } catch (error) {
      persistError(error);
    }
  };

  const handleQuickMemoHandover = async (content: string) => {
    const now = new Date().toISOString();
    await handleSaveHandover({
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `handover-${Date.now()}`,
      category: '申し送り',
      content,
      priority: '通常',
      status: '未対応',
      createdByRecorderId: activeRecorder?.id,
      createdByRecorderName: activeRecorder?.displayName,
      createdAt: now,
      updatedAt: now,
    });
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 font-sans antialiased pb-24 lg:pb-12">
      <Header
        activeTab={activeTab === 'preview' ? 'records' : activeTab}
        setActiveTab={(tab) => {
          if (tab === 'form') {
            setCurrentRecord(null);
            setCorrectionTarget(null);
            setReadOnlyDraft(null);
            setAssistantRecordPrefill(null);
            setActiveDraftKey(createRecordDraftKey());
            setFormSessionId((previous) => previous + 1);
          }
          if (tab === 'records') setRecordFilterChildId(null);
          setActiveTab(tab);
        }}
        unapprovedCount={unapprovedCount}
        onNewRecord={handleNewRecordClick}
        currentUser={auth.profile}
        onSignOut={remoteMode ? auth.signOut : undefined}
      />

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-3 sm:pt-6">
        <div className={`mb-3 rounded-xl border px-3 py-2 text-[11px] sm:mb-4 sm:px-4 sm:text-xs ${
          !online
            ? 'border-amber-300 bg-amber-50 text-amber-900'
            : remoteMode
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-amber-200 bg-amber-50 text-amber-900'
        }`}>
          <div className="flex flex-wrap items-center gap-2">
            {!online ? <WifiOff className="h-4 w-4" /> : remoteMode ? <Cloud className="h-4 w-4" /> : <HardDrive className="h-4 w-4" />}
            <span className="min-w-0 flex-1">
              {!online
                ? 'オフラインです。入力は端末に保持され、通信復旧後に送信されます。'
                : remoteMode
                  ? `${auth.profile?.organizationName || '事業所'}の共有データベースに接続中`
                  : 'ローカル試用モード：データはこのブラウザだけに保存されます。実運用にはSupabase設定が必要です。'}
            </span>
            {pendingSyncs.length > 0 && (
              <button
                type="button"
                disabled={!online || syncing}
                onClick={() => void syncPendingRecords()}
                className="flex min-h-9 items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 font-bold text-amber-900 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                未送信 {pendingSyncs.reduce((sum, item) => sum + item.records.length, 0)}件
              </button>
            )}
            {activeRecorder && (
              <button
                type="button"
                onClick={() => setActiveRecorder(null)}
                className="flex min-h-9 items-center gap-1 rounded-lg border border-teal-300 bg-white px-2 font-bold text-teal-800"
              >
                <UserRoundCog className="h-3.5 w-3.5" />
                {activeRecorder.displayName}・切替
              </button>
            )}
          </div>
        </div>
        {dataError && <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg p-3">{dataError}</div>}
        {activeTab !== 'home' && (
          <ScreenContextBar
            activeTab={activeTab}
            onHome={() => setActiveTab('home')}
          />
        )}

        {activeTab === 'home' && (
          <HomeScreen
            records={records}
            announcements={announcements}
            announcementConfirmations={announcementConfirmations}
            childrenList={childrenList}
            drafts={recordDrafts}
            recorderProfiles={recorderProfiles}
            handoverItems={handoverItems}
            handoverConfirmations={handoverConfirmations}
            morningMeetingRecords={morningMeetingRecords}
            morningMeetingTemplates={morningMeetingTemplates}
            morningMeetingConfirmations={morningMeetingConfirmations}
            organizationId={organizationId}
            activeRecorder={activeRecorder || undefined}
            currentUser={auth.profile}
            canManageSettings={canManageSettings}
            onNavigate={(tab) => {
              if (tab === 'records') setRecordFilterChildId(null);
              setActiveTab(tab);
            }}
            onNewRecord={handleNewRecordClick}
            onStartRecord={handleStartRecord}
            onResumeDraft={handleResumeDraft}
            onViewDraft={handleViewDraft}
            onDeleteDraft={(draftKey) => void handleDeleteDraft(draftKey)}
            onOpenRecord={(record) => {
              setCurrentRecord(record);
              setActiveTab('preview');
            }}
            onSaveAnnouncement={handleSaveAnnouncement}
            onArchiveAnnouncement={handleArchiveAnnouncement}
            onSaveAnnouncementConfirmation={handleSaveAnnouncementConfirmation}
            onSaveHandover={handleSaveHandover}
            onHandoverStatusChange={handleHandoverStatusChange}
            onSetHandoverConfirmation={handleSetHandoverConfirmation}
            onSaveMorningMeeting={handleSaveMorningMeeting}
            onSaveMorningMeetingTemplate={handleSaveMorningMeetingTemplate}
            onArchiveMorningMeetingTemplate={handleArchiveMorningMeetingTemplate}
            onSetMorningMeetingConfirmation={handleSetMorningMeetingConfirmation}
            onAssistantExecuted={handleAssistantExecuted}
          />
        )}
        {activeTab === 'form' && (
          <RecordForm
            key={`${currentRecord?.id || activeDraftKey}-${formSessionId}`}
            templates={templates}
            childrenList={childrenList}
            recorderProfiles={recorderProfiles}
            initialRecord={currentRecord}
            organizationId={organizationId}
            userId={auth.profile?.id}
            userDisplayName={auth.profile?.displayName}
            draftKey={activeDraftKey}
            activeRecorder={activeRecorder || undefined}
            assistantPrefill={assistantRecordPrefill}
            initialStepId={correctionTarget?.stepId}
            resolvedIssueId={correctionTarget?.issueId}
            readOnly={Boolean(readOnlyDraft)}
            readOnlyOwnerName={readOnlyDraft?.ownerName}
            lockedChildren={auth.profile?.role === 'staff' && activeRecorder
              ? Object.fromEntries(recordDrafts
                  .filter((draft) => draft.recorderId && draft.recorderId !== activeRecorder.id)
                  .flatMap((draft) => draft.selectedChildIds.map((childId) => [
                    childId,
                    draft.recorderName || '別指導員',
                  ])))
              : {}}
            onSaveRecords={handleSaveRecords}
            onCreateHandover={handleQuickMemoHandover}
          />
        )}
        {activeTab === 'preview' && currentRecord && (
          <RecordPreview
            record={currentRecord}
            canReview={canReview}
            defaultReviewerName={auth.profile?.displayName}
            lockReviewerName={remoteMode}
            organizationId={organizationId}
            onEditRecord={handleEditRecord}
            onCorrectIssue={handleCorrectRecord}
            onBackToList={() => setActiveTab('records')}
            onUpdateApproval={handleUpdateApproval}
          />
        )}
        {activeTab === 'records' && (
          <RecordList
            key={recordFilterChildId || 'all-records'}
            records={records}
            initialSearchTerm={childrenList.find((child) => child.id === recordFilterChildId)?.name}
            onSelectRecord={(record) => { setCurrentRecord(record); setActiveTab('preview'); }}
            onEditRecord={handleEditRecord}
            onCorrectRecord={(record) => handleCorrectRecord(record)}
            onDuplicateRecord={handleDuplicateRecord}
            onDeleteRecord={handleDeleteRecord}
            canDeleteRecords={!remoteMode || auth.profile?.role !== 'staff'}
            onNewRecord={handleNewRecordClick}
          />
        )}
        {activeTab === 'children' && (
          <ChildrenManager childrenList={childrenList} onAddChild={handleAddChild} onUpdateChild={handleUpdateChild} onDeleteChild={handleDeleteChild} />
        )}
        {FEATURE_FLAGS.supportPlansAndFiveDomains && activeTab === 'plans' && (
          <SupportPlanManager childrenList={childrenList} supportPlans={supportPlans} canEdit={canManageSettings} onSavePlan={handleSavePlan} onClosePlan={handleClosePlan} />
        )}
        {activeTab === 'templates' && canManageSettings && (
          <SettingsHub
            aiWritingSettings={aiWritingSettings}
            templates={templates}
            onSaveAiWritingSettings={handleSaveAiWritingSettings}
            onSaveTemplate={handleSaveTemplate}
            onDeleteTemplate={handleDeleteTemplate}
          />
        )}
        {activeTab === 'team' && auth.profile && canReview && <TeamManager currentUser={auth.profile} />}
      </main>
    </div>
  );
}

function ScreenContextBar({
  activeTab,
  onHome,
}: {
  activeTab: ActiveTab | 'preview';
  onHome: () => void;
}) {
  const meta: Record<ActiveTab | 'preview', { title: string; description: string }> = {
    home: { title: 'ホーム', description: '' },
    form: { title: '記録作成', description: '質問に沿って支援経過を入力' },
    records: { title: '記録一覧', description: '確認・修正・出力' },
    preview: { title: '記録確認', description: '内容確認・修正指摘・承認' },
    children: { title: '児童名簿', description: '児童情報・利用曜日の管理' },
    plans: { title: '個別支援計画', description: '現在は機能凍結中' },
    templates: { title: '設定', description: 'AI・記録フォーマットの管理' },
    team: { title: '職員管理', description: '記録者・ログイン職員の管理' },
  };
  const current = meta[activeTab];
  return (
    <div className="mb-4 flex min-h-12 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="flex min-w-0 items-center gap-2">
        <button type="button" onClick={onHome} aria-label="ホームに戻る" className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-teal-700 hover:bg-teal-50">
          <House className="h-4 w-4" />
        </button>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-900">{current.title}</p>
          <p className="hidden truncate text-[10px] text-slate-500 sm:block">{current.description}</p>
        </div>
      </div>
      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">
        {activeTab === 'form' ? '入力内容は自動保存' : 'ホームへすぐ戻れます'}
      </span>
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
