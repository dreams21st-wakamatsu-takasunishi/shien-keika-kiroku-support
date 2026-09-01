import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, BellRing, ChevronRight, HardDrive, House, LoaderCircle, RefreshCw, ShieldCheck, WifiOff, X } from 'lucide-react';
import {
  AiWritingSettings,
  Announcement,
  AnnouncementConfirmation,
  AttendanceCorrectionRequest,
  AttendanceRecord,
  CalendarEvent,
  ChildProfile,
  DailyChildPlan,
  DailyTransportRequirement,
  DEFAULT_AI_WRITING_SETTINGS,
  DEFAULT_TRANSPORT_ROUTE_SETTINGS,
  HandoverConfirmation,
  HandoverItem,
  HandoverStatus,
  HomeAssistantExecutionResult,
  HomeAssistantProposal,
  MorningMeetingConfirmation,
  MorningMeetingRecord,
  MorningMeetingTemplate,
  MonthlyScheduleDeleteResult,
  OrganizationRolePermission,
  RecordDraftSummary,
  RecorderMenuPreferences,
  RecorderProfile,
  ReviewIssue,
  SchoolProfile,
  StaffScheduleItem,
  StaffShiftRequest,
  StaffShiftTemplate,
  SupportPlan,
  SupportRecord,
  Template,
  TransportRun,
  TransportAssignmentChangeInput,
  TransportAreaZone,
  TransportMapLocation,
  TransportPlanDay,
  TransportRouteSettings,
  TransportRunStatus,
  Vehicle,
} from './types';
import { defaultTemplates, requiredRecordTemplates } from './data/defaultTemplates';
import { UNIFIED_TEMPLATE_ID } from './data/unifiedTemplate';
import { sampleRecords, sampleChildren, sampleRecorderProfiles } from './data/sampleData';
import { Header, ActiveTab } from './components/Header';
import { RecordForm } from './components/RecordForm';
import { RecordPreview } from './components/RecordPreview';
import { RecordList } from './components/RecordList';
import { ChildrenManager } from './components/ChildrenManager';
import { SupportPlanManager } from './components/SupportPlanManager';
import { TeamManager } from './components/TeamManager';
import { SettingsHub } from './components/SettingsHub';
import { HomeScreen, type HomeWorkspace } from './components/HomeScreen';
import type { DraftTakeoverSelection } from './components/DailyOperationsPanel';
import { AuthScreen } from './components/AuthScreen';
import { SetPasswordScreen } from './components/SetPasswordScreen';
import { PrivacyReauthGate } from './components/PrivacyReauthGate';
import { PersonalTransportMode } from './components/PersonalTransportMode';
import { useAuth } from './hooks/useAuth';
import { supabase } from './lib/supabase';
import { FEATURE_FLAGS } from './config/features';
import { normalizeTemplateFatigueScale } from './utils/templateNormalizer';
import { upgradeStandardWeekdayTemplate } from './data/weekdayTemplate';
import { upgradeStandardHolidayTemplate } from './data/holidayTemplate';
import {
  MorningMeetingConflictError,
  archiveMorningMeetingTemplate,
  archiveAnnouncement,
  archiveTemplate,
  changeTransportAssignment,
  closeSupportPlan,
  deleteCalendarEvent,
  deleteAttendanceRecord,
  deleteDailyChildPlan,
  deleteDailyTransportRequirement,
  deleteMonthlyDailySchedules,
  deleteHandoverConfirmation,
  deleteMorningMeetingConfirmation,
  deleteRecordDraft,
  deleteSchool,
  deleteReviewedPartTimeShiftRequest,
  deleteStaffScheduleItem,
  deleteStaffShiftTemplate,
  deleteTransportRun,
  deleteTransportAreaZone,
  deleteVehicle,
  listRecordDrafts,
  loadWorkspaceData,
  punchAttendance,
  requestAttendanceCorrection,
  replaceChildMonthlyTransportRequirements,
  replaceMonthlyTransportRequirements,
  reviewAttendanceCorrection,
  saveChild,
  saveHandoverConfirmation,
  saveHandoverItem,
  saveMorningMeetingConfirmation,
  saveMorningMeetingRecord,
  saveMorningMeetingTemplate,
  saveRecord,
  saveRecords,
  saveSchool,
  saveRecorderMenuPreferences,
  saveStaffScheduleItem,
  saveRolePermission,
  saveStaffShiftRequest,
  saveShiftRequestDefaults,
  saveStaffShiftTemplate,
  saveAiWritingSettings,
  saveAnnouncement,
  saveAnnouncementConfirmation,
  saveAttendanceRecord,
  saveAttendanceRecords,
  saveCalendarEvent,
  saveDailyChildPlan,
  saveDailyTransportRequirement,
  saveDailyTransportRequirements,
  saveSupportPlan,
  sendAnnouncementNotification,
  saveTemplate,
  saveTransportRun,
  saveTransportAreaZone,
  saveTransportMapLocation,
  saveTransportPlanDay,
  saveTransportRouteSettings,
  saveVehicle,
  seedDefaultTemplates,
  softDeleteChild,
  softDeleteRecord,
  takeOverRecordDraftChildren,
  takeOverRecordDraftChildrenIntoExisting,
  updateHandoverStatus,
  updateTransportRunStatus,
} from './services/dataService';
import { createRecordDraftKey, getDeviceId } from './utils/deviceId';
import {
  enqueueRecordSync,
  loadPendingRecordSyncs,
  markPendingRecordSyncError,
  mergePendingRecords,
  PendingRecordSync,
  removePendingRecordSync,
} from './utils/offlineQueue';
import { showAnnouncementNotification } from './utils/deviceNotifications';
import { getLocalDateString } from './utils/weekdays';
import { applySiblingSelection } from './utils/childSiblings';

const FIELD_MODE_REAUTH_AFTER_MS = 30_000;
const RECENT_PASSWORD_AUTH_WINDOW_MS = 120_000;

function mutationErrorMessage(error: unknown, fallback = '保存処理に失敗しました。') {
  const raw = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : String(error || '');
  if (raw.includes('PERSONAL_TRANSPORT_ONLY')) {
    return 'この端末は個人端末として判定されているため、支援記録の入力・変更・引き継ぎはできません。事業所共有端末を使用するか、管理者が「端末・アクセス管理」で現在の端末種別を確認してください。';
  }
  return raw || fallback;
}

export default function App() {
  const auth = useAuth();
  const remoteMode = auth.configured;
  const organizationId = auth.profile?.organizationId;
  const [activeTab, setActiveTab] = useState<ActiveTab | 'preview'>('home');
  const [homeWorkspace, setHomeWorkspace] = useState<HomeWorkspace>('menu');
  const [announcementFocusToken, setAnnouncementFocusToken] = useState(0);
  const [recordStatusDate, setRecordStatusDate] = useState(getLocalDateString());
  const [dataLoading, setDataLoading] = useState(remoteMode);
  const [dataError, setDataError] = useState<string | null>(null);
  const [transportUpdateToast, setTransportUpdateToast] = useState('');

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
  const [staffScheduleItems, setStaffScheduleItems] = useState<StaffScheduleItem[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_staff_schedule_items_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_calendar_events_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [dailyChildPlans, setDailyChildPlans] = useState<DailyChildPlan[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_daily_child_plans_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_attendance_records_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [staffShiftTemplates, setStaffShiftTemplates] = useState<StaffShiftTemplate[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_staff_shift_templates_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [staffShiftRequests, setStaffShiftRequests] = useState<StaffShiftRequest[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_staff_shift_requests_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [rolePermissions, setRolePermissions] = useState<OrganizationRolePermission[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_role_permissions_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [attendanceCorrections, setAttendanceCorrections] = useState<AttendanceCorrectionRequest[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_attendance_corrections_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [vehicles, setVehicles] = useState<Vehicle[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_vehicles_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [transportRuns, setTransportRuns] = useState<TransportRun[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_transport_runs_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [transportPlanDays, setTransportPlanDays] = useState<TransportPlanDay[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_transport_plan_days_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [dailyTransportRequirements, setDailyTransportRequirements] = useState<DailyTransportRequirement[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_daily_transport_requirements_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [transportRouteSettings, setTransportRouteSettings] = useState<TransportRouteSettings>(() => {
    if (remoteMode) return DEFAULT_TRANSPORT_ROUTE_SETTINGS;
    const saved = localStorage.getItem('support_transport_route_settings_data');
    return saved ? { ...DEFAULT_TRANSPORT_ROUTE_SETTINGS, ...JSON.parse(saved) } : DEFAULT_TRANSPORT_ROUTE_SETTINGS;
  });
  const [transportMapLocations, setTransportMapLocations] = useState<TransportMapLocation[]>([]);
  const [transportAreaZones, setTransportAreaZones] = useState<TransportAreaZone[]>([]);
  const [schools, setSchools] = useState<SchoolProfile[]>(() => {
    if (remoteMode) return [];
    const saved = localStorage.getItem('support_schools_data');
    return saved ? JSON.parse(saved) : [];
  });
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
  const [inAppAnnouncementQueue, setInAppAnnouncementQueue] = useState<Announcement[]>([]);
  const [appVisible, setAppVisible] = useState(() => document.visibilityState === 'visible');
  const activeInAppAnnouncement = inAppAnnouncementQueue[0];
  const enqueueInAppAnnouncement = useCallback((announcement: Announcement) => {
    setInAppAnnouncementQueue((current) => current.some((item) => item.id === announcement.id)
      ? current
      : [...current, announcement]);
  }, []);
  const dismissInAppAnnouncement = useCallback((announcementId: string) => {
    setInAppAnnouncementQueue((current) => current.filter((item) => item.id !== announcementId));
  }, []);
  const [activeRecorder, setActiveRecorder] = useState<RecorderProfile | null>(null);
  const [fieldOperationsOpen, setFieldOperationsOpen] = useState(false);
  const [privacyShielded, setPrivacyShielded] = useState(false);
  const [privacyLocked, setPrivacyLocked] = useState(false);
  const privacyHiddenAt = useRef<number | null>(null);
  const privacySessionProfileId = useRef<string | null>(null);
  const remoteRefreshInFlightRef = useRef(false);
  const remoteRefreshQueuedRef = useRef(false);
  const remoteRefreshTimerRef = useRef<number | null>(null);
  const loadedOrganizationIdRef = useRef<string | null>(remoteMode ? null : 'local');
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
  const [readOnlyDraft, setReadOnlyDraft] = useState<{ draftKey: string; ownerName?: string; childId?: string } | null>(null);
  const [formSessionId, setFormSessionId] = useState(0);
  const [assistantRecordPrefill, setAssistantRecordPrefill] = useState<{ childId: string; date: string; requestId: string } | null>(null);
  const [recordFilterChildId, setRecordFilterChildId] = useState<string | null>(null);
  const [aiWritingSettings, setAiWritingSettings] = useState<AiWritingSettings>(() => {
    if (remoteMode) return DEFAULT_AI_WRITING_SETTINGS;
    const saved = localStorage.getItem('support_ai_writing_settings');
    return saved ? JSON.parse(saved) : DEFAULT_AI_WRITING_SETTINGS;
  });

  useEffect(() => {
    const fieldModeOnly = Boolean(auth.profile?.fieldModeOnly);
    const hideSensitiveScreen = () => {
      if (!fieldModeOnly) return;
      if (privacyHiddenAt.current === null) privacyHiddenAt.current = Date.now();
      setPrivacyShielded(true);
    };
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setAppVisible(visible);
      if (!fieldModeOnly) return;
      if (!visible) {
        hideSensitiveScreen();
        return;
      }
      const hiddenFor = privacyHiddenAt.current === null ? 0 : Date.now() - privacyHiddenAt.current;
      privacyHiddenAt.current = null;
      setPrivacyShielded(false);
      if (hiddenFor >= FIELD_MODE_REAUTH_AFTER_MS) setPrivacyLocked(true);
    };
    const handlePageHide = () => hideSensitiveScreen();
    handleVisibilityChange();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [auth.profile?.fieldModeOnly]);

  useEffect(() => {
    const profileId = auth.profile?.id || null;
    if (auth.profile?.fieldModeOnly && profileId) {
      if (privacySessionProfileId.current !== profileId) {
        privacySessionProfileId.current = profileId;
        const passwordJustVerified = auth.lastInteractiveAuthAt > 0
          && Date.now() - auth.lastInteractiveAuthAt <= RECENT_PASSWORD_AUTH_WINDOW_MS;
        setPrivacyLocked(!passwordJustVerified);
      }
      return;
    }
    privacySessionProfileId.current = null;
    privacyHiddenAt.current = null;
    setPrivacyLocked(false);
    setPrivacyShielded(false);
  }, [auth.profile?.fieldModeOnly, auth.profile?.id, auth.lastInteractiveAuthAt]);

  useEffect(() => {
    if (!activeInAppAnnouncement || !appVisible) return;
    const timer = window.setTimeout(
      () => dismissInAppAnnouncement(activeInAppAnnouncement.id),
      activeInAppAnnouncement.priority === 'urgent' ? 12000 : 8500,
    );
    return () => window.clearTimeout(timer);
  }, [activeInAppAnnouncement, appVisible, dismissInAppAnnouncement]);

  useEffect(() => {
    if (!transportUpdateToast) return;
    const timer = window.setTimeout(() => setTransportUpdateToast(''), 6000);
    return () => window.clearTimeout(timer);
  }, [transportUpdateToast]);

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
  useEffect(() => {
    if (!remoteMode) {
      localStorage.setItem('support_staff_schedule_items_data', JSON.stringify(staffScheduleItems));
    }
  }, [staffScheduleItems, remoteMode]);
  useEffect(() => {
    if (!remoteMode) localStorage.setItem('support_calendar_events_data', JSON.stringify(calendarEvents));
  }, [calendarEvents, remoteMode]);
  useEffect(() => {
    if (!remoteMode) localStorage.setItem('support_daily_child_plans_data', JSON.stringify(dailyChildPlans));
  }, [dailyChildPlans, remoteMode]);
  useEffect(() => {
    if (!remoteMode) localStorage.setItem('support_attendance_records_data', JSON.stringify(attendanceRecords));
  }, [attendanceRecords, remoteMode]);
  useEffect(() => {
    if (!remoteMode) localStorage.setItem('support_staff_shift_templates_data', JSON.stringify(staffShiftTemplates));
  }, [staffShiftTemplates, remoteMode]);
  useEffect(() => {
    if (!remoteMode) localStorage.setItem('support_staff_shift_requests_data', JSON.stringify(staffShiftRequests));
  }, [staffShiftRequests, remoteMode]);
  useEffect(() => {
    if (!remoteMode) localStorage.setItem('support_role_permissions_data', JSON.stringify(rolePermissions));
  }, [rolePermissions, remoteMode]);
  useEffect(() => {
    if (!remoteMode) localStorage.setItem('support_attendance_corrections_data', JSON.stringify(attendanceCorrections));
  }, [attendanceCorrections, remoteMode]);
  useEffect(() => {
    if (!remoteMode) localStorage.setItem('support_vehicles_data', JSON.stringify(vehicles));
  }, [vehicles, remoteMode]);
  useEffect(() => {
    if (!remoteMode) localStorage.setItem('support_transport_runs_data', JSON.stringify(transportRuns));
  }, [transportRuns, remoteMode]);
  useEffect(() => {
    if (!remoteMode) localStorage.setItem('support_transport_plan_days_data', JSON.stringify(transportPlanDays));
  }, [transportPlanDays, remoteMode]);
  useEffect(() => {
    if (!remoteMode) localStorage.setItem('support_daily_transport_requirements_data', JSON.stringify(dailyTransportRequirements));
  }, [dailyTransportRequirements, remoteMode]);
  useEffect(() => {
    if (!remoteMode) localStorage.setItem('support_transport_route_settings_data', JSON.stringify(transportRouteSettings));
  }, [transportRouteSettings, remoteMode]);
  useEffect(() => {
    if (!remoteMode) localStorage.setItem('support_schools_data', JSON.stringify(schools));
  }, [remoteMode, schools]);

  const refreshRemoteData = useCallback(async (showLoading = true) => {
    if (!auth.profile) return;
    if (remoteRefreshInFlightRef.current) {
      remoteRefreshQueuedRef.current = true;
      return;
    }
    remoteRefreshInFlightRef.current = true;
    // Only the first load for an organization may replace the whole screen.
    // Realtime and visibility refreshes keep the current component mounted so
    // focused inputs and in-screen UI state are not discarded.
    const blockingInitialLoad = showLoading && loadedOrganizationIdRef.current !== auth.profile.organizationId;
    if (blockingInitialLoad) setDataLoading(true);
    let loadedSuccessfully = false;
    try {
      do {
        remoteRefreshQueuedRef.current = false;
        if (auth.profile.fieldModeOnly) {
          // Personal devices use the narrowly scoped transport RPC inside
          // PersonalTransportMode. Do not download records, drafts or rosters.
          setRecords([]);
          setTemplates([]);
          setChildrenList([]);
          setRecorderProfiles([]);
          setHandoverItems([]);
          setHandoverConfirmations([]);
          setMorningMeetingRecords([]);
          setMorningMeetingTemplates([]);
          setMorningMeetingConfirmations([]);
          setSupportPlans([]);
          setAnnouncements([]);
          setAnnouncementConfirmations([]);
          setStaffScheduleItems([]);
          setCalendarEvents([]);
          setDailyChildPlans([]);
          setAttendanceRecords([]);
          setStaffShiftTemplates([]);
          setStaffShiftRequests([]);
          setRolePermissions([]);
          setAttendanceCorrections([]);
          setVehicles([]);
          setTransportRuns([]);
          setTransportPlanDays([]);
          setDailyTransportRequirements([]);
          setTransportMapLocations([]);
          setTransportAreaZones([]);
          setSchools([]);
          setPendingSyncs([]);
          setDataError(null);
          loadedSuccessfully = true;
          return;
        }
        let workspace = await loadWorkspaceData(auth.profile.organizationId);
        const missingRequiredTemplates = requiredRecordTemplates.filter(
          (requiredTemplate) => !workspace.templates.some((template) => template.id === requiredTemplate.id),
        );
        if (missingRequiredTemplates.length > 0 && auth.profile.role !== 'staff') {
          await seedDefaultTemplates(auth.profile.organizationId, missingRequiredTemplates);
          workspace = await loadWorkspaceData(auth.profile.organizationId);
        }
        const queued = loadPendingRecordSyncs(auth.profile.organizationId, auth.profile.id);
        setPendingSyncs(queued);
        setRecords(mergePendingRecords(workspace.records, queued));
        setTemplates(workspace.templates.filter((template) => template.id !== UNIFIED_TEMPLATE_ID));
        setChildrenList(workspace.children);
        setSchools(workspace.schools);
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
        setStaffScheduleItems(workspace.staffScheduleItems);
        setCalendarEvents(workspace.calendarEvents);
        setDailyChildPlans(workspace.dailyChildPlans);
        setAttendanceRecords(workspace.attendanceRecords);
        setStaffShiftTemplates(workspace.staffShiftTemplates);
        setStaffShiftRequests(workspace.staffShiftRequests);
        setRolePermissions(workspace.rolePermissions);
        setAttendanceCorrections(workspace.attendanceCorrectionRequests);
        setVehicles(workspace.vehicles);
        setTransportRuns(workspace.transportRuns);
        setTransportPlanDays(workspace.transportPlanDays);
        setDailyTransportRequirements(workspace.dailyTransportRequirements);
        setTransportRouteSettings(workspace.transportRouteSettings);
        setTransportMapLocations(workspace.transportMapLocations);
        setTransportAreaZones(workspace.transportAreaZones);
        setDataError(null);
        loadedSuccessfully = true;
      } while (remoteRefreshQueuedRef.current);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : '共有データを取得できませんでした。');
    } finally {
      remoteRefreshInFlightRef.current = false;
      if (loadedSuccessfully) loadedOrganizationIdRef.current = auth.profile.organizationId;
      if (blockingInitialLoad) setDataLoading(false);
    }
  }, [auth.profile]);

  const scheduleRemoteRefresh = useCallback(() => {
    if (remoteRefreshTimerRef.current !== null) {
      window.clearTimeout(remoteRefreshTimerRef.current);
    }
    remoteRefreshTimerRef.current = window.setTimeout(() => {
      remoteRefreshTimerRef.current = null;
      void refreshRemoteData(false);
    }, 350);
  }, [refreshRemoteData]);

  const refreshRecordDrafts = useCallback(async () => {
    if (auth.profile?.fieldModeOnly) {
      setRecordDrafts([]);
      return;
    }
    if (!organizationId) {
      const prefix = 'support-record-draft-v2:local:local:record-';
      const localDrafts = Object.keys(localStorage).flatMap((key): RecordDraftSummary[] => {
        if (!key.startsWith(prefix)) return [];
        try {
          const payload = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, unknown>;
          const updatedAt = typeof payload.updatedAt === 'string' ? payload.updatedAt : '';
          const selectedChildIds = Array.isArray(payload.selectedChildIds)
            ? payload.selectedChildIds.filter((value): value is string => typeof value === 'string')
            : [];
          if (selectedChildIds.length === 0) return [];
          return [{
            draftKey: key.split(':').at(-1) || key.slice(prefix.length - 'record-'.length),
            revision: 0,
            recorderId: typeof payload.recorderId === 'string' ? payload.recorderId : undefined,
            recorderName: typeof payload.recorderName === 'string' ? payload.recorderName : undefined,
            selectedChildIds,
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
      setRecordDrafts(drafts.filter((draft) => draft.selectedChildIds.length > 0));
    } catch {
      // Draft list failure does not block the main workspace.
    }
  }, [auth.profile?.fieldModeOnly, organizationId]);

  useEffect(() => {
    if (activeTab === 'home') void refreshRecordDrafts();
  }, [activeTab, refreshRecordDrafts]);

  useEffect(() => {
    if (activeTab !== 'form' || !remoteMode || !auth.profile) return;
    // Realtime handles normal updates. This slower poll is only a fallback for
    // temporarily disconnected clients and avoids constant duplicate reads.
    const timer = window.setInterval(() => void refreshRecordDrafts(), 10000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshRecordDrafts();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeTab, auth.profile, refreshRecordDrafts, remoteMode]);

  useEffect(() => {
    if (remoteMode && auth.profile) {
      void refreshRemoteData();
      void refreshRecordDrafts();
    }
  }, [remoteMode, auth.profile, refreshRemoteData, refreshRecordDrafts]);

  useEffect(() => {
    if (!supabase || !auth.profile || auth.profile.fieldModeOnly) return;
    const organizationId = auth.profile.organizationId;
    const channel = supabase
      .channel(`workspace-${organizationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_records', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'children', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'child_regular_day_schedules', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_child_plans', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recorder_profiles', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'record_templates', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_plans', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'handover_items', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'handover_confirmations', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'morning_meeting_records', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'morning_meeting_templates', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'morning_meeting_confirmations', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'record_drafts', filter: `organization_id=eq.${organizationId}` }, () => void refreshRecordDrafts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements', filter: `organization_id=eq.${organizationId}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const row = payload.new as {
            id?: string;
            title?: string;
            content?: string;
            priority?: Announcement['priority'];
            published_at?: string;
            expires_at?: string | null;
            created_by_recorder_profile_id?: string | null;
            created_by_name?: string | null;
            created_at?: string;
            updated_at?: string;
          };
          if (row.id) {
            const now = new Date().toISOString();
            enqueueInAppAnnouncement({
              id: row.id,
              title: row.title || '新しいお知らせ',
              content: row.content || 'お知らせを確認してください。',
              priority: ['normal', 'important', 'urgent'].includes(row.priority || '')
                ? row.priority!
                : 'normal',
              sourceType: 'manual',
              publishedAt: row.published_at || now,
              expiresAt: row.expires_at || undefined,
              createdByRecorderId: row.created_by_recorder_profile_id || undefined,
              createdByName: row.created_by_name || undefined,
              createdAt: row.created_at || now,
              updatedAt: row.updated_at || now,
            });
          }
          if (!import.meta.env.VITE_VAPID_PUBLIC_KEY) {
            void showAnnouncementNotification(row.title || '新しいお知らせ', row.content || '', row.id);
          }
        }
        scheduleRemoteRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcement_confirmations', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_schedule_items', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_shift_templates', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_shift_requests', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organization_role_permissions', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recorder_profiles', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_correction_requests', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_runs', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_plan_days', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_transport_requirements', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transport_stop_events', filter: `organization_id=eq.${organizationId}` }, (payload) => {
        const row = payload.new as { event_type?: string };
        const labels: Record<string, string> = {
          departed: '送迎便が出発しました',
          arrived: '乗降場所への到着が登録されました',
          boarded: '児童の乗車が登録されました',
          dropped_off: '児童の降車が登録されました',
          facility_arrived: '迎え便が事業所へ到着しました',
          returned: '送り便が事業所へ帰着しました',
          delay: '送迎の遅延連絡があります',
          help_requested: '送迎の応援要請があります',
        };
        setTransportUpdateToast(labels[row.event_type || ''] || '送迎状況が更新されました');
        scheduleRemoteRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_run_covers', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_route_settings', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_map_locations', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_area_zones', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schools', filter: `organization_id=eq.${organizationId}` }, scheduleRemoteRefresh)
      .subscribe();
    return () => {
      if (remoteRefreshTimerRef.current !== null) {
        window.clearTimeout(remoteRefreshTimerRef.current);
        remoteRefreshTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [auth.profile, enqueueInAppAnnouncement, refreshRecordDrafts, scheduleRemoteRefresh]);

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
    if (!activeRecorder) return;
    const refreshedRecorder = recorderProfiles.find((profile) => profile.id === activeRecorder.id);
    if (!refreshedRecorder) setActiveRecorder(null);
    else if (refreshedRecorder !== activeRecorder) setActiveRecorder(refreshedRecorder);
  }, [activeRecorder, recorderProfiles]);

  useEffect(() => {
    if (!auth.profile?.recorderProfileId) return;
    const boundRecorder = recorderProfiles.find((profile) => profile.id === auth.profile?.recorderProfileId);
    if (boundRecorder && activeRecorder?.id !== boundRecorder.id) setActiveRecorder(boundRecorder);
  }, [activeRecorder?.id, auth.profile, recorderProfiles]);

  useEffect(() => {
    if (!auth.profile?.fieldModeOnly) return;
    if (activeTab !== 'home') {
      setActiveTab('home');
      setHomeWorkspace('menu');
    }
  }, [activeTab, auth.profile?.fieldModeOnly]);

  if (auth.loading) {
    return <LoadingScreen text="認証状態を確認しています..." />;
  }
  if (remoteMode && !auth.session) {
    return <AuthScreen onSignIn={auth.signIn} onStaffIdSignIn={auth.signInWithStaffId} initialMessage={auth.error} />;
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
  const privacyRecorder = recorderProfiles.find((recorder) =>
    recorder.id === auth.profile?.recorderProfileId
  ) || activeRecorder || (auth.profile?.recorderProfileId ? {
    id: auth.profile.recorderProfileId,
    displayName: auth.profile.displayName,
    active: true,
    pinConfigured: true,
  } : undefined);
  if (remoteMode && auth.profile?.fieldModeOnly && privacyLocked) {
    return (
      <PrivacyReauthGate
        organizationId={auth.profile.organizationId}
        organizationName={auth.profile.organizationName}
        recorder={privacyRecorder}
        onUnlock={(recorder) => {
          setActiveRecorder(recorder);
          setPrivacyLocked(false);
        }}
        onSignOut={auth.signOut}
      />
    );
  }
  if (remoteMode && auth.profile?.fieldModeOnly) {
    return <PersonalTransportMode currentUser={auth.profile} onSignOut={auth.signOut} />;
  }
  if (remoteMode && fieldOperationsOpen && auth.profile?.recorderProfileId) {
    return <PersonalTransportMode currentUser={auth.profile} onSignOut={auth.signOut} onExit={() => setFieldOperationsOpen(false)} />;
  }
  if (remoteMode && auth.profile?.role === 'staff' && !activeRecorder) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
          <AlertTriangle className="mb-3 h-7 w-7 text-amber-600" />
          <h1 className="text-lg font-black text-slate-950">職員名簿との紐づけが必要です</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">共通指導員アカウントは使用しません。このログイン職員を、管理者メニューの「職員管理」で本人の職員名簿へ紐づけてください。</p>
          <button type="button" onClick={() => auth.signOut()} className="mt-5 min-h-11 w-full rounded-xl bg-slate-950 font-black text-white">ログアウト</button>
        </div>
      </div>
    );
  }

  const hasRolePermission = (permission: OrganizationRolePermission['permissions'][number]) => {
    if (!remoteMode || auth.profile?.role === 'admin') return true;
    if (auth.profile?.role !== 'manager' && auth.profile?.role !== 'classroom_manager') return false;
    const configured = rolePermissions.find((setting) => setting.role === auth.profile?.role)?.permissions;
    if (!configured) return permission === 'manage_shifts' || (auth.profile.role === 'manager' && ['review_records', 'manage_children', 'manage_record_settings', 'manage_calendar', 'manage_transport', 'manage_communications'].includes(permission));
    return configured.includes(permission);
  };
  const canReview = hasRolePermission('review_records');
  const canManageChildren = hasRolePermission('manage_children');
  const canManageRecordSettings = hasRolePermission('manage_record_settings');
  const canManageShifts = hasRolePermission('manage_shifts');
  const canManageCalendar = hasRolePermission('manage_calendar');
  const canManageTransport = hasRolePermission('manage_transport');
  const canManageCommunications = hasRolePermission('manage_communications');
  const calendarEventsForCurrentUser = canManageCalendar
    ? calendarEvents
    : calendarEvents.filter((event) =>
        event.visibility === '全体'
        || (event.visibility === '関係者のみ' && Boolean(activeRecorder && event.recorderProfileIds.includes(activeRecorder.id)))
      );
  const unapprovedCount = records.filter((record) => record.approvalStatus === '未確認').length;

  const persistError = (error: unknown) => {
    const message = mutationErrorMessage(error);
    setDataError(message);
    alert(message);
    throw error;
  };

  const saveRecordsOrQueue = async (items: SupportRecord[]) => {
    if (!organizationId || !auth.profile) return [];
    try {
      return await saveRecords(organizationId, items);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const networkFailure = !navigator.onLine || /network|fetch|connection|offline/i.test(message);
      if (!networkFailure) throw error;
      if (auth.profile.fieldModeOnly) {
        throw new Error('個人端末用の現場モードでは、個人情報を端末内へ保存しません。通信が復旧してから、クラウド保存済みの下書きを開いて保存してください。');
      }
      const queued = enqueueRecordSync(organizationId, auth.profile.id, items);
      setPendingSyncs(queued);
      setDataError('通信できないため端末に保存しました。通信復旧後に自動送信します。');
      return [];
    }
  };

  const handleSaveRecord = async (savedRecord: SupportRecord) => {
    try {
      const result = organizationId ? await saveRecord(organizationId, savedRecord) : undefined;
      if (result?.outcome === 'already_saved') {
        await refreshRemoteData(false);
        setCurrentRecord(null);
        setActiveTab('records');
        alert('この記録は別端末ですでに保存済みです。上書きせず、最新の記録を表示しました。');
        return;
      }
      const savedWithVersion = result ? { ...savedRecord, version: result.version } : savedRecord;
      setRecords((previous) => {
        const exists = previous.some((record) => record.id === savedWithVersion.id);
        return exists
          ? previous.map((record) => record.id === savedWithVersion.id ? savedWithVersion : record)
          : [savedWithVersion, ...previous];
      });
      setCurrentRecord(savedWithVersion);
      setActiveTab('preview');
    } catch (error) { persistError(error); }
  };

  const handleSaveRecords = async (
    savedRecords: SupportRecord[],
    options?: { keepFormOpen?: boolean },
  ) => {
    try {
      const results = await saveRecordsOrQueue(savedRecords);
      const resultById = new Map(results.map((result) => [result.id, result]));
      const savedLocally = savedRecords
        .filter((record) => resultById.get(record.id)?.outcome !== 'already_saved')
        .map((record) => {
          const result = resultById.get(record.id);
          return result ? { ...record, version: result.version } : record;
        });
      setRecords((previous) => {
        const savedIds = new Set(savedLocally.map((record) => record.id));
        return [...savedLocally, ...previous.filter((record) => !savedIds.has(record.id))];
      });
      if (results.some((result) => result.outcome === 'already_saved')) {
        await refreshRemoteData(false);
        setCurrentRecord(null);
        setActiveTab('records');
        alert('一部の記録は別端末ですでに保存済みです。上書きせず、最新の記録を表示しました。');
        void refreshRecordDrafts();
        return;
      }
      if (options?.keepFormOpen) {
        setCurrentRecord(null);
      } else if (savedLocally.length === 1 && currentRecord?.id === savedLocally[0].id) {
        setCurrentRecord(savedLocally[0]);
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
      const result = organizationId ? await saveRecord(organizationId, updated) : undefined;
      const savedWithVersion = result ? { ...updated, version: result.version } : updated;
      setRecords((previous) => previous.map((record) => record.id === recordId ? savedWithVersion : record));
      setCurrentRecord((previous) => previous?.id === recordId ? savedWithVersion : previous);
    } catch (error) { persistError(error); }
  };

  const handleSaveTemplate = async (template: Template) => {
    if (!canManageRecordSettings) return void alert('テンプレートを変更する権限がありません。');
    try {
      const normalizedTemplate = normalizeTemplateFatigueScale(template);
      if (organizationId) await saveTemplate(organizationId, normalizedTemplate);
      setTemplates((previous) => previous.some((item) => item.id === normalizedTemplate.id)
        ? previous.map((item) => item.id === normalizedTemplate.id ? normalizedTemplate : item)
        : [...previous, normalizedTemplate]);
    } catch (error) { persistError(error); }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!canManageRecordSettings) return void alert('テンプレートを変更する権限がありません。');
    try {
      if (organizationId) await archiveTemplate(organizationId, templateId);
      setTemplates((previous) => previous.filter((item) => item.id !== templateId));
    } catch (error) { persistError(error); }
  };

  const handleSaveAiWritingSettings = async (settings: AiWritingSettings) => {
    if (!canManageRecordSettings) throw new Error('AI文章設定を変更する権限がありません。');
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
    enqueueInAppAnnouncement(savedAnnouncement);
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
    if (!canManageCommunications) return;
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

  const handleSaveStaffSchedule = async (item: StaffScheduleItem) => {
    if (!canManageShifts) {
      throw new Error('職員配置を変更する権限がありません。');
    }
    try {
      if (organizationId) await saveStaffScheduleItem(organizationId, item);
      setStaffScheduleItems((previous) => [
        ...previous.filter((candidate) => candidate.id !== item.id),
        item,
      ].sort((left, right) =>
        `${left.date}${left.startTime}`.localeCompare(`${right.date}${right.startTime}`)
      ));
      setDataError(null);
    } catch (error) {
      persistError(error);
    }
  };

  const handleDeleteStaffSchedule = async (itemId: string) => {
    if (!canManageShifts) {
      throw new Error('職員配置を変更する権限がありません。');
    }
    try {
      if (organizationId) await deleteStaffScheduleItem(organizationId, itemId);
      setStaffScheduleItems((previous) => previous.filter((item) => item.id !== itemId));
      setDataError(null);
    } catch (error) {
      persistError(error);
    }
  };

  const handleSaveCalendarEvent = async (event: CalendarEvent) => {
    if (!canManageCalendar) throw new Error('業務カレンダーを変更する権限がありません。');
    try {
      if (organizationId) await saveCalendarEvent(organizationId, event);
      setCalendarEvents((previous) => [event, ...previous.filter((candidate) => candidate.id !== event.id)]);
      setDataError(null);
    } catch (error) { persistError(error); }
  };

  const handleDeleteCalendarEvent = async (eventId: string) => {
    if (!canManageCalendar) throw new Error('業務カレンダーを変更する権限がありません。');
    try {
      if (organizationId) await deleteCalendarEvent(organizationId, eventId);
      setCalendarEvents((previous) => previous.filter((event) => event.id !== eventId));
    } catch (error) { persistError(error); }
  };

  const handleSaveDailyChildPlan = async (plan: DailyChildPlan) => {
    if (!canManageTransport) throw new Error('利用予定を変更する権限がありません。');
    try {
      if (organizationId) await saveDailyChildPlan(organizationId, plan);
      setDailyChildPlans((previous) => [
        plan,
        ...previous.filter((candidate) => !(candidate.childId === plan.childId && candidate.date === plan.date)),
      ]);
      setDataError(null);
    } catch (error) {
      persistError(error);
      throw error;
    }
  };

  const handleDeleteDailyChildPlan = async (childId: string, date: string) => {
    if (!canManageTransport) throw new Error('利用予定を変更する権限がありません。');
    try {
      if (organizationId) await deleteDailyChildPlan(organizationId, childId, date);
      setDailyChildPlans((previous) => previous.filter((plan) => !(plan.childId === childId && plan.date === date)));
      setDataError(null);
    } catch (error) {
      persistError(error);
      throw error;
    }
  };

  const handleDeleteDailyTransportRequirement = async (childId: string, date: string) => {
    if (!canManageTransport) throw new Error('利用予定・送迎を変更する権限がありません。');
    try {
      if (organizationId) await deleteDailyTransportRequirement(organizationId, childId, date);
      setDailyTransportRequirements((previous) => previous.filter(
        (item) => !(item.childId === childId && item.date === date),
      ));
      setDataError(null);
    } catch (error) {
      persistError(error);
      throw error;
    }
  };

  const handleDeleteMonthlyDailySchedules = async (
    month: string,
    childId?: string,
  ): Promise<MonthlyScheduleDeleteResult> => {
    if (!canManageTransport) throw new Error('利用予定・送迎を変更する権限がありません。');
    const matchesScope = (item: { childId: string; date: string }) =>
      item.date.startsWith(month) && (!childId || item.childId === childId);
    const affectedDates = new Set([
      ...dailyChildPlans.filter(matchesScope).map((item) => item.date),
      ...dailyTransportRequirements.filter(matchesScope).map((item) => item.date),
    ]);
    const localResult: MonthlyScheduleDeleteResult = {
      dailyPlanCount: dailyChildPlans.filter(matchesScope).length,
      requirementCount: dailyTransportRequirements.filter(matchesScope).length,
      affectedDateCount: affectedDates.size,
    };
    try {
      const result = organizationId
        ? await deleteMonthlyDailySchedules(organizationId, month, childId)
        : localResult;
      setDailyChildPlans((previous) => previous.filter((item) => !matchesScope(item)));
      setDailyTransportRequirements((previous) => previous.filter((item) => !matchesScope(item)));
      setTransportPlanDays((previous) => previous.map((day) => affectedDates.has(day.date)
        ? {
            ...day,
            status: 'draft',
            confirmedAt: undefined,
            revision: day.revision + 1,
            updatedAt: new Date().toISOString(),
          }
        : day));
      setDataError(null);
      return result;
    } catch (error) {
      persistError(error);
      throw error;
    }
  };

  const handleSaveAttendance = async (record: AttendanceRecord) => {
    if (!canManageShifts) throw new Error('勤務予定を変更する権限がありません。');
    try {
      if (organizationId) await saveAttendanceRecord(organizationId, record);
      setAttendanceRecords((previous) => [record, ...previous.filter((candidate) => candidate.id !== record.id)]);
    } catch (error) { persistError(error); }
  };

  const handleSaveAttendanceRecords = async (recordsToSave: AttendanceRecord[]) => {
    if (!canManageShifts) throw new Error('月間シフトを変更する権限がありません。');
    try {
      const saved = organizationId
        ? await saveAttendanceRecords(organizationId, recordsToSave)
        : recordsToSave;
      const savedKeys = new Set(saved.map((record) => `${record.recorderProfileId}:${record.date}`));
      setAttendanceRecords((previous) => [
        ...saved,
        ...previous.filter((record) => !savedKeys.has(`${record.recorderProfileId}:${record.date}`)),
      ]);
    } catch (error) {
      persistError(error);
      throw error;
    }
  };

  const handleDeleteAttendance = async (record: AttendanceRecord) => {
    if (!canManageShifts) throw new Error('勤務予定を削除する権限がありません。');
    if (record.clockInAt || record.clockOutAt) throw new Error('打刻済みの勤務情報は削除できません。打刻修正申請を使用してください。');
    try {
      if (organizationId) await deleteAttendanceRecord(organizationId, record.id);
      setAttendanceRecords((previous) => previous.filter((candidate) => candidate.id !== record.id));
    } catch (error) {
      persistError(error);
      throw error;
    }
  };

  const handleSaveStaffShiftTemplate = async (template: StaffShiftTemplate) => {
    if (remoteMode && auth.profile?.role !== 'admin') throw new Error('勤務テンプレートを変更できるのは管理者のみです。');
    try {
      const saved = organizationId
        ? await saveStaffShiftTemplate(organizationId, template)
        : template;
      setStaffShiftTemplates((previous) => [saved, ...previous.filter((candidate) => candidate.id !== saved.id)]);
    } catch (error) {
      persistError(error);
      throw error;
    }
  };

  const handleDeleteStaffShiftTemplate = async (templateId: string) => {
    if (remoteMode && auth.profile?.role !== 'admin') throw new Error('勤務テンプレートを削除できるのは管理者のみです。');
    try {
      if (organizationId) await deleteStaffShiftTemplate(organizationId, templateId);
      setStaffShiftTemplates((previous) => previous.filter((template) => template.id !== templateId));
    } catch (error) {
      persistError(error);
      throw error;
    }
  };

  const handleSaveRolePermission = async (setting: OrganizationRolePermission) => {
    if (remoteMode && auth.profile?.role !== 'admin') throw new Error('権限を変更できるのは管理者のみです。');
    try {
      const saved = organizationId ? await saveRolePermission(organizationId, setting) : setting;
      setRolePermissions((previous) => [saved, ...previous.filter((candidate) => candidate.role !== saved.role)]);
    } catch (error) { persistError(error); }
  };

  const handleSaveStaffShiftRequest = async (request: StaffShiftRequest) => {
    if (activeRecorder && request.recorderProfileId !== activeRecorder.id && !canManageShifts) throw new Error('自分のシフト希望のみ提出できます。');
    try {
      const saved = organizationId ? await saveStaffShiftRequest(organizationId, request) : request;
      setStaffShiftRequests((previous) => [saved, ...previous.filter((candidate) => candidate.id !== saved.id && !(candidate.recorderProfileId === saved.recorderProfileId && candidate.requestedDate === saved.requestedDate))]);
    } catch (error) { persistError(error); throw error; }
  };

  const handleSaveShiftRequestDefaults = async (recorderProfileId: string, startTime: string, endTime: string) => {
    if (activeRecorder?.id !== recorderProfileId && !canManageShifts) throw new Error('自分の希望時間のみ変更できます。');
    try {
      if (organizationId) await saveShiftRequestDefaults(recorderProfileId, startTime, endTime);
      setRecorderProfiles((previous) => previous.map((profile) => profile.id === recorderProfileId
        ? { ...profile, shiftRequestDefaultStartTime: startTime, shiftRequestDefaultEndTime: endTime }
        : profile));
    } catch (error) {
      persistError(error);
      throw error;
    }
  };

  const handleReviewStaffShiftRequest = async (request: StaffShiftRequest, approved: boolean, note?: string) => {
    if (!canManageShifts) throw new Error('シフト希望を確認する権限がありません。');
    const now = new Date().toISOString();
    const reviewed: StaffShiftRequest = { ...request, status: approved ? '承認' : '却下', reviewNote: note, reviewedByName: auth.profile?.displayName || activeRecorder?.displayName || '管理者', reviewedAt: now, updatedAt: now };
    try {
      const savedRequest = organizationId ? await saveStaffShiftRequest(organizationId, reviewed) : reviewed;
      setStaffShiftRequests((previous) => [savedRequest, ...previous.filter((candidate) => candidate.id !== savedRequest.id)]);
      if (approved) {
        const existing = attendanceRecords.find((record) => record.recorderProfileId === request.recorderProfileId && record.date === request.requestedDate);
        const attendance: AttendanceRecord = { id: existing?.id || crypto.randomUUID(), recorderProfileId: request.recorderProfileId, recorderName: request.recorderName, date: request.requestedDate, scheduledStartTime: request.requestedStartTime, scheduledEndTime: request.requestedEndTime, scheduledBreakMinutes: existing?.scheduledBreakMinutes || 0, status: '勤務予定', clockInAt: existing?.clockInAt, clockOutAt: existing?.clockOutAt, breakPeriods: existing?.breakPeriods || [], note: request.note || existing?.note, deviceId: existing?.deviceId, lastActionByRecorderId: existing?.lastActionByRecorderId, createdAt: existing?.createdAt || now, updatedAt: now };
        if (organizationId) await saveAttendanceRecord(organizationId, attendance);
        setAttendanceRecords((previous) => [attendance, ...previous.filter((candidate) => candidate.id !== attendance.id)]);
      }
    } catch (error) { persistError(error); throw error; }
  };

  const handleDeleteReviewedStaffShiftRequest = async (request: StaffShiftRequest) => {
    if (!canManageShifts) throw new Error('確認済みのシフト希望を削除する権限がありません。');
    if (request.status === '申請中') throw new Error('申請中の希望は、承認または却下してから削除してください。');
    const recorder = recorderProfiles.find((profile) => profile.id === request.recorderProfileId);
    if (recorder?.employmentType !== 'part_time') throw new Error('この削除操作はパート職員のシフト希望のみ対象です。');
    const linkedAttendance = request.status === '承認'
      ? attendanceRecords.find((record) => record.recorderProfileId === request.recorderProfileId && record.date === request.requestedDate)
      : undefined;
    if (linkedAttendance?.clockInAt || linkedAttendance?.clockOutAt) throw new Error('打刻済みの勤務情報は削除できません。打刻修正申請を使用してください。');
    try {
      let deletedAttendanceId: string | undefined;
      if (organizationId) {
        const result = await deleteReviewedPartTimeShiftRequest(request.id);
        deletedAttendanceId = result.deletedAttendanceId;
      } else {
        deletedAttendanceId = linkedAttendance?.id;
      }
      setStaffShiftRequests((previous) => previous.filter((candidate) => candidate.id !== request.id));
      if (deletedAttendanceId) setAttendanceRecords((previous) => previous.filter((record) => record.id !== deletedAttendanceId));
    } catch (error) {
      persistError(error);
      throw error;
    }
  };

  const handlePunchAttendance = async (
    recorder: RecorderProfile,
    pin: string,
    action: '出勤' | '退勤' | '休憩開始' | '休憩終了',
  ) => {
    try {
      if (organizationId) {
        const updated = await punchAttendance(organizationId, recorder.id, recorder.displayName, pin, action, getDeviceId());
        setAttendanceRecords((previous) => [updated, ...previous.filter((record) => record.id !== updated.id)]);
        return;
      }
      const now = new Date();
      const date = now.toLocaleDateString('sv-SE');
      const timestamp = now.toISOString();
      const existing = attendanceRecords.find((record) => record.date === date && record.recorderProfileId === recorder.id);
      const base: AttendanceRecord = existing || {
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `attendance-${Date.now()}`,
        recorderProfileId: recorder.id,
        recorderName: recorder.displayName,
        date,
        status: '勤務予定',
        breakPeriods: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      let updated = { ...base, breakPeriods: [...base.breakPeriods], deviceId: getDeviceId(), lastActionByRecorderId: recorder.id, updatedAt: timestamp };
      if (action === '出勤') updated = { ...updated, status: '出勤中', clockInAt: timestamp };
      if (action === '退勤') updated = { ...updated, status: '退勤済み', clockOutAt: timestamp };
      if (action === '休憩開始') updated = { ...updated, status: '休憩中', breakPeriods: [...updated.breakPeriods, { startedAt: timestamp }] };
      if (action === '休憩終了') updated = { ...updated, status: '出勤中', breakPeriods: updated.breakPeriods.map((period, index) => index === updated.breakPeriods.length - 1 ? { ...period, endedAt: timestamp } : period) };
      setAttendanceRecords((previous) => [updated, ...previous.filter((record) => record.id !== updated.id)]);
    } catch (error) { persistError(error); }
  };

  const handleRequestAttendanceCorrection = async (
    record: AttendanceRecord,
    pin: string,
    clockIn: string | undefined,
    clockOut: string | undefined,
    reason: string,
  ) => {
    try {
      const id = organizationId
        ? await requestAttendanceCorrection(organizationId, record.id, record.recorderProfileId, pin, clockIn, clockOut, reason)
        : (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `correction-${Date.now()}`);
      const now = new Date().toISOString();
      setAttendanceCorrections((previous) => [{ id, attendanceRecordId: record.id, recorderProfileId: record.recorderProfileId, recorderName: record.recorderName, requestedClockInAt: clockIn, requestedClockOutAt: clockOut, reason, status: '申請中', createdAt: now, updatedAt: now }, ...previous]);
    } catch (error) { persistError(error); }
  };

  const handleReviewAttendanceCorrection = async (request: AttendanceCorrectionRequest, approved: boolean, note?: string) => {
    if (remoteMode && auth.profile?.role !== 'admin') throw new Error('打刻修正を承認できるのは管理者のみです。');
    try {
      if (organizationId) {
        await reviewAttendanceCorrection(organizationId, request.id, approved, note);
        await refreshRemoteData(false);
        return;
      }
      const now = new Date().toISOString();
      setAttendanceCorrections((previous) => previous.map((candidate) => candidate.id === request.id ? { ...candidate, status: approved ? '承認' : '却下', reviewedAt: now, reviewedByName: auth.profile?.displayName || '管理者', reviewNote: note, updatedAt: now } : candidate));
      if (approved) setAttendanceRecords((previous) => previous.map((record) => record.id === request.attendanceRecordId ? { ...record, clockInAt: request.requestedClockInAt, clockOutAt: request.requestedClockOutAt, updatedAt: now } : record));
    } catch (error) { persistError(error); }
  };

  const handleSaveVehicle = async (vehicle: Vehicle) => {
    if (remoteMode && auth.profile?.role !== 'admin') throw new Error('車両台帳を変更できるのは管理者のみです。');
    try {
      if (organizationId) await saveVehicle(organizationId, vehicle);
      setVehicles((previous) => [vehicle, ...previous.filter((candidate) => candidate.id !== vehicle.id)]);
    } catch (error) { persistError(error); }
  };

  const handleDeleteVehicle = async (vehicleId: string) => {
    if (remoteMode && auth.profile?.role !== 'admin') throw new Error('車両台帳を変更できるのは管理者のみです。');
    try {
      if (organizationId) await deleteVehicle(organizationId, vehicleId);
      setVehicles((previous) => previous.filter((vehicle) => vehicle.id !== vehicleId));
    } catch (error) { persistError(error); }
  };

  const handleSaveTransportPlanDay = async (day: TransportPlanDay) => {
    if (!canManageTransport) throw new Error('利用予定・送迎を変更する権限がありません。');
    try {
      if (organizationId) await saveTransportPlanDay(organizationId, day);
      setTransportPlanDays((previous) => [
        day,
        ...previous.filter((candidate) => candidate.date !== day.date),
      ]);
    } catch (error) {
      persistError(error);
      throw error;
    }
  };

  const handleSaveDailyTransportRequirements = async (requirements: DailyTransportRequirement[]) => {
    if (!canManageTransport) throw new Error('利用予定・送迎を変更する権限がありません。');
    try {
      if (organizationId) {
        if (requirements.length === 1) await saveDailyTransportRequirement(organizationId, requirements[0]);
        else await saveDailyTransportRequirements(organizationId, requirements);
      }
      const keys = new Set(requirements.map((item) => `${item.childId}:${item.date}`));
      setDailyTransportRequirements((previous) => [
        ...requirements,
        ...previous.filter((candidate) => !keys.has(`${candidate.childId}:${candidate.date}`)),
      ]);
    } catch (error) {
      persistError(error);
      throw error;
    }
  };

  const handleReplaceMonthlyTransportRequirements = async (month: string, requirements: DailyTransportRequirement[]) => {
    if (!canManageTransport) throw new Error('利用予定・送迎を変更する権限がありません。');
    try {
      const appliedRequirements = organizationId
        ? await replaceMonthlyTransportRequirements(organizationId, month, requirements)
        : requirements;
      setDailyTransportRequirements((previous) => [
        ...appliedRequirements,
        ...previous.filter((candidate) => !candidate.date.startsWith(month)),
      ]);
      setTransportPlanDays((previous) => previous.map((day) => day.date.startsWith(month)
        ? { ...day, status: 'draft', confirmedAt: undefined, revision: day.revision + 1, updatedAt: new Date().toISOString() }
        : day));
      return appliedRequirements;
    } catch (error) {
      persistError(error);
      throw error;
    }
  };

  const handleReplaceChildMonthlyTransportRequirements = async (
    month: string,
    childId: string,
    requirements: DailyTransportRequirement[],
  ) => {
    if (!canManageTransport) throw new Error('利用予定・送迎を変更する権限がありません。');
    try {
      const affectedDates = new Set([
        ...dailyTransportRequirements
          .filter((item) => item.date.startsWith(month) && item.childId === childId)
          .map((item) => item.date),
        ...requirements.map((item) => item.date),
      ]);
      const appliedRequirements = organizationId
        ? await replaceChildMonthlyTransportRequirements(organizationId, month, childId, requirements)
        : [
            ...dailyTransportRequirements.filter((item) => item.date.startsWith(month) && item.childId !== childId),
            ...requirements,
          ];
      setDailyTransportRequirements((previous) => [
        ...appliedRequirements,
        ...previous.filter((candidate) => !candidate.date.startsWith(month)),
      ]);
      setTransportPlanDays((previous) => previous.map((day) => affectedDates.has(day.date)
        ? { ...day, status: 'draft', confirmedAt: undefined, revision: day.revision + 1, updatedAt: new Date().toISOString() }
        : day));
      return appliedRequirements;
    } catch (error) {
      persistError(error);
      throw error;
    }
  };

  const handleSaveTransportRun = async (run: TransportRun) => {
    if (!canManageTransport) throw new Error('送迎便を変更する権限がありません。');
    try {
      if (organizationId) await saveTransportRun(organizationId, run);
      setTransportRuns((previous) => [run, ...previous.filter((candidate) => candidate.id !== run.id)]);
    } catch (error) {
      persistError(error);
      throw error;
    }
  };

  const handleChangeTransportAssignment = async (change: TransportAssignmentChangeInput) => {
    const run = transportRuns.find((candidate) => candidate.id === change.runId);
    if (!run) throw new Error('変更対象の送迎便が見つかりません。');
    try {
      if (organizationId) await changeTransportAssignment(organizationId, change);
      const now = new Date().toISOString();
      const driver = recorderProfiles.find((profile) => profile.id === change.driverRecorderProfileId);
      setTransportRuns((previous) => previous.map((candidate) => candidate.id === change.runId ? {
        ...candidate,
        driverRecorderProfileId: change.driverRecorderProfileId,
        driverName: driver?.displayName,
        assistantRecorderProfileIds: [...change.assistantRecorderProfileIds],
        updatedAt: now,
      } : candidate));
    } catch (error) {
      persistError(error);
      throw error;
    }
  };

  const handleDeleteTransportRun = async (runId: string) => {
    if (!canManageTransport) throw new Error('送迎便を変更する権限がありません。');
    try {
      if (organizationId) await deleteTransportRun(organizationId, runId);
      setTransportRuns((previous) => previous.filter((run) => run.id !== runId));
    } catch (error) {
      persistError(error);
      throw error;
    }
  };

  const handleSaveTransportRouteSettings = async (settings: TransportRouteSettings) => {
    if (!canManageTransport) throw new Error('送迎経路を変更する権限がありません。');
    try {
      if (organizationId) await saveTransportRouteSettings(organizationId, settings);
      setTransportRouteSettings({ ...settings, updatedAt: new Date().toISOString() });
    } catch (error) {
      persistError(error);
      throw error;
    }
  };

  const handleSaveTransportMapLocation = async (location: TransportMapLocation) => {
    if (!canManageTransport) throw new Error('送迎地点を変更する権限がありません。');
    try {
      if (organizationId) await saveTransportMapLocation(organizationId, location);
      setTransportMapLocations((previous) => [location, ...previous.filter((candidate) => candidate.id !== location.id)]);
    } catch (error) {
      persistError(error);
      throw error;
    }
  };

  const handleSaveTransportAreaZone = async (zone: TransportAreaZone) => {
    if (!canManageTransport) throw new Error('送迎エリアを変更する権限がありません。');
    try {
      if (organizationId) await saveTransportAreaZone(organizationId, zone);
      setTransportAreaZones((previous) => [zone, ...previous.filter((candidate) => candidate.id !== zone.id)]
        .sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name, 'ja')));
    } catch (error) {
      persistError(error);
      throw error;
    }
  };

  const handleDeleteTransportAreaZone = async (zoneId: string) => {
    if (!canManageTransport) throw new Error('送迎エリアを変更する権限がありません。');
    try {
      if (organizationId) await deleteTransportAreaZone(organizationId, zoneId);
      setTransportAreaZones((previous) => previous.filter((zone) => zone.id !== zoneId));
    } catch (error) {
      persistError(error);
      throw error;
    }
  };

  const handleSaveSchool = async (school: SchoolProfile) => {
    if (!canManageChildren && !canManageTransport) throw new Error('学校台帳を変更する権限がありません。');
    try {
      if (organizationId) await saveSchool(organizationId, school);
      setSchools((previous) => [school, ...previous.filter((candidate) => candidate.id !== school.id)]
        .sort((left, right) => left.name.localeCompare(right.name, 'ja')));
      setChildrenList((previous) => previous.map((child) => {
        if (child.schoolId !== school.id) return child;
        return {
          ...child,
          schoolName: school.name,
          transportLocations: (child.transportLocations || []).map((location) => location.schoolId === school.id
            ? { ...location, schoolId: school.id, name: school.name, address: school.address, area: school.area }
            : location),
        };
      }));
    } catch (error) {
      persistError(error);
      throw error;
    }
  };

  const handleDeleteSchool = async (schoolId: string) => {
    if (!canManageChildren && !canManageTransport) throw new Error('学校台帳を変更する権限がありません。');
    try {
      if (organizationId) await deleteSchool(organizationId, schoolId);
      setSchools((previous) => previous.filter((school) => school.id !== schoolId));
    } catch (error) {
      persistError(error);
      throw error;
    }
  };

  const handleUpdateTransportStatus = async (run: TransportRun, recorder: RecorderProfile, pin: string, status: TransportRunStatus) => {
    try {
      if (organizationId) await updateTransportRunStatus(organizationId, run.id, recorder.id, pin, status);
      const now = new Date().toISOString();
      setTransportRuns((previous) => previous.map((candidate) => candidate.id === run.id ? { ...candidate, status, statusUpdatedAt: now, statusUpdatedByRecorderId: recorder.id, updatedAt: now } : candidate));
    } catch (error) { persistError(error); }
  };

  const handleAddChild = async (child: ChildProfile) => {
    if (!canManageChildren) throw new Error('児童情報を変更する権限がありません。');
    try {
      if (organizationId) await saveChild(organizationId, child);
      setChildrenList((previous) => applySiblingSelection(previous, child));
    } catch (error) { persistError(error); }
  };

  const handleUpdateChild = async (child: ChildProfile) => {
    if (!canManageChildren) throw new Error('児童情報を変更する権限がありません。');
    try {
      if (organizationId) await saveChild(organizationId, child);
      setChildrenList((previous) => applySiblingSelection(previous, child));
    } catch (error) { persistError(error); }
  };

  const handleDeleteChild = async (childId: string) => {
    if (!canManageChildren) throw new Error('児童情報を変更する権限がありません。');
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

  const handleSaveRecorderMenuPreferences = async (preferences: RecorderMenuPreferences) => {
    if (!activeRecorder) throw new Error('記録者を選択してからメニューを設定してください。');
    const saved = organizationId
      ? await saveRecorderMenuPreferences(organizationId, activeRecorder.id, preferences)
      : preferences;
    setRecorderProfiles((previous) => previous.map((profile) =>
      profile.id === activeRecorder.id ? { ...profile, menuPreferences: saved } : profile
    ));
    setActiveRecorder((previous) => previous ? { ...previous, menuPreferences: saved } : previous);
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

  const handleViewDraft = (draftKey: string, ownerName?: string, childId?: string) => {
    setCurrentRecord(null);
    setCorrectionTarget(null);
    setAssistantRecordPrefill(null);
    setReadOnlyDraft({ draftKey, ownerName, childId });
    setHomeWorkspace('operations');
    setRecordStatusDate(recordDrafts.find((draft) => draft.draftKey === draftKey)?.date || getLocalDateString());
    setActiveDraftKey(draftKey);
    setFormSessionId((previous) => previous + 1);
    setActiveTab('form');
  };

  const handleTakeOverDrafts = async (items: DraftTakeoverSelection[]): Promise<boolean> => {
    if (items.length === 0) return false;
    const nextRecorderName = activeRecorder?.displayName || auth.profile?.displayName || '現在の職員';
    const childNames = items.map((item) => item.childName).join('、');
    const ownerNames = [...new Set(items.map((item) => item.ownerName || '別の職員'))].join('、');
    const sourceDraftKeys = new Set(items.map((item) => item.draftKey));
    const sourceDraft = recordDrafts.find((draft) => sourceDraftKeys.has(draft.draftKey));
    const existingTargetDraft = recordDrafts
      .filter((draft) =>
        !sourceDraftKeys.has(draft.draftKey)
        && draft.userId === auth.profile?.id
        && draft.date === sourceDraft?.date
        && (!sourceDraft?.selectedTemplateId || !draft.selectedTemplateId || draft.selectedTemplateId === sourceDraft.selectedTemplateId)
        && (activeRecorder
          ? draft.recorderId === activeRecorder.id
          : !draft.recorderId)
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    const confirmed = window.confirm(
      `${ownerNames}が入力中の記録から、次の${items.length}名を${nextRecorderName}へ引き継ぎます。\n\n`
      + `${childNames}\n\n`
      + (existingTargetDraft
        ? `自身が入力中の${existingTargetDraft.selectedChildIds.length}名の記録へ追加します。\n\n`
        : '新しい入力中記録としてまとめます。\n\n')
      + '選択していない児童の記録は元の入力者に残ります。よろしいですか？'
    );
    if (!confirmed) return false;

    try {
      if (!organizationId) throw new Error('共有データベースへ接続されていないため、記録を引き継げません。');
      const targetDraftKey = existingTargetDraft?.draftKey || createRecordDraftKey();
      const takeoverItems = items.map((item) => ({ sourceDraftKey: item.draftKey, childId: item.childId }));
      if (existingTargetDraft) {
        await takeOverRecordDraftChildrenIntoExisting(
          organizationId,
          takeoverItems,
          targetDraftKey,
          activeRecorder?.id,
        );
      } else {
        await takeOverRecordDraftChildren(
          organizationId,
          takeoverItems,
          targetDraftKey,
          activeRecorder?.id,
        );
      }
      await refreshRecordDrafts();
      handleResumeDraft(targetDraftKey);
      return true;
    } catch (error) {
      await refreshRecordDrafts();
      const message = mutationErrorMessage(error, '記録を引き継げませんでした。');
      setDataError(message);
      alert(message);
      if (message.includes('個人端末として判定')) auth.reloadProfile();
      return false;
    }
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
      const savedRecord = organizationId
        ? await saveMorningMeetingRecord(organizationId, record)
        : { ...record, revision: Math.max(1, record.revision || 1) };
      setMorningMeetingRecords((previous) => [
        savedRecord,
        ...previous.filter((candidate) => candidate.date !== savedRecord.date),
      ].sort((left, right) => right.date.localeCompare(left.date)));
      setDataError(null);
      return savedRecord;
    } catch (error) {
      if (error instanceof MorningMeetingConflictError) throw error;
      const message = error instanceof Error ? error.message : '朝礼記録を保存できませんでした。';
      setDataError(message);
      throw error;
    }
  };

  const handleSaveMorningMeetingTemplate = async (template: MorningMeetingTemplate) => {
    if (!canManageCommunications) throw new Error('朝礼テンプレートを変更する権限がありません。');
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
    if (!canManageCommunications) throw new Error('朝礼テンプレートを変更する権限がありません。');
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

  const handleQuickMemoHandover = async (content: string, childId?: string) => {
    const now = new Date().toISOString();
    await handleSaveHandover({
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `handover-${Date.now()}`,
      category: '申し送り',
      childId,
      content,
      priority: '通常',
      status: '未対応',
      createdByRecorderId: activeRecorder?.id,
      createdByRecorderName: activeRecorder?.displayName,
      createdAt: now,
      updatedAt: now,
    });
  };

  const returnToHomeMenu = () => {
    setReadOnlyDraft(null);
    setCurrentRecord(null);
    setCorrectionTarget(null);
    setAssistantRecordPrefill(null);
    setHomeWorkspace('menu');
    setActiveTab('home');
  };

  return (
    <div className="app-background min-h-screen pb-8 font-sans text-slate-900 antialiased sm:pb-12">
      {auth.profile?.fieldModeOnly && privacyShielded && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950 p-6 text-center text-white" role="presentation">
          <div>
            <ShieldCheck className="mx-auto h-12 w-12 text-teal-300" />
            <p className="mt-4 text-lg font-black">個人情報を保護しています</p>
            <p className="mt-1 text-xs text-slate-400">30秒以上離れた場合は、復帰時に本人確認を行います。</p>
          </div>
        </div>
      )}
      <Header
        activeTab={activeTab === 'preview' ? 'records' : activeTab}
        setActiveTab={(tab) => {
          if (tab === 'home') {
            returnToHomeMenu();
            return;
          }
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
        activeRecorder={activeRecorder}
        onSaveMenuPreferences={handleSaveRecorderMenuPreferences}
        onOpenHomeWorkspace={(workspace) => {
          setHomeWorkspace(workspace);
          setActiveTab('home');
        }}
        onOpenFieldOperations={auth.profile?.recorderProfileId ? () => setFieldOperationsOpen(true) : undefined}
        onSignOut={remoteMode ? async () => {
          sessionStorage.removeItem('support-record-list-view-v1');
          await auth.signOut();
        } : undefined}
        canOpenSettings={canManageRecordSettings || canManageChildren || canManageTransport || auth.profile?.role === 'admin'}
        canOpenTeam={!remoteMode || auth.profile?.role === 'admin'}
      />

      {activeInAppAnnouncement && appVisible && (
        <InAppAnnouncementToast
          announcement={activeInAppAnnouncement}
          queuedCount={inAppAnnouncementQueue.length}
          onOpen={() => {
            setActiveTab('home');
            setHomeWorkspace('communication');
            setAnnouncementFocusToken((current) => current + 1);
            dismissInAppAnnouncement(activeInAppAnnouncement.id);
          }}
          onDismiss={() => dismissInAppAnnouncement(activeInAppAnnouncement.id)}
        />
      )}

      {transportUpdateToast && appVisible && (
        <div className="fixed left-1/2 top-[max(5rem,calc(env(safe-area-inset-top)+4rem))] z-[95] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl bg-sky-950 px-4 py-3 text-sm font-bold text-white shadow-2xl" role="status">
          <BellRing className="h-5 w-5 shrink-0 text-sky-300" />
          <span className="min-w-0 flex-1">{transportUpdateToast}</span>
          <button type="button" onClick={() => setTransportUpdateToast('')} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10" aria-label="閉じる"><X className="h-4 w-4" /></button>
        </div>
      )}

      <main className="mx-auto max-w-[1800px] px-3 pt-3 sm:px-6 sm:pt-6 lg:px-8">
        {(!online || !remoteMode || pendingSyncs.length > 0) && (
        <div className={`mb-3 rounded-xl border px-3 py-2 text-[11px] sm:mb-4 sm:px-4 sm:text-xs ${
          !online
            ? 'border-amber-300 bg-amber-50 text-amber-900'
            : !remoteMode
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-slate-200 bg-white text-slate-700'
        }`}>
          <div className="flex flex-wrap items-center gap-2">
            {!online && <><WifiOff className="h-4 w-4" /><span className="min-w-0 flex-1">{auth.profile?.fieldModeOnly ? 'オフラインです。個人端末用の現場モードでは入力を端末内に保存しません。通信復旧後に入力してください。' : 'オフラインです。入力は端末に保持され、通信復旧後に送信されます。'}</span></>}
            {online && !remoteMode && <><HardDrive className="h-4 w-4" /><span className="min-w-0 flex-1">ローカル試用モード：データはこのブラウザだけに保存されます。</span></>}
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
          </div>
        </div>
        )}
        {dataError && <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg p-3">{dataError}</div>}
        {activeTab !== 'home' && (
          <ScreenContextBar
            activeTab={activeTab}
            onHome={returnToHomeMenu}
            title={readOnlyDraft ? '入力状況' : undefined}
            description={readOnlyDraft ? '同日の児童の過ごし方を一覧で確認' : undefined}
            badge={readOnlyDraft ? '閲覧専用' : undefined}
          />
        )}

        <div key={activeTab} className="ui-screen-enter">
        {activeTab === 'home' && (
          <HomeScreen
            activeWorkspace={homeWorkspace}
            onWorkspaceChange={setHomeWorkspace}
            announcementFocusToken={announcementFocusToken}
            recordStatusDate={recordStatusDate}
            onRecordStatusDateChange={setRecordStatusDate}
            records={records}
            announcements={announcements}
            announcementConfirmations={announcementConfirmations}
            childrenList={childrenList}
            schools={schools}
            drafts={recordDrafts}
            recorderProfiles={recorderProfiles}
            staffScheduleItems={staffScheduleItems}
            calendarEvents={calendarEventsForCurrentUser}
            dailyChildPlans={dailyChildPlans}
            attendanceRecords={attendanceRecords}
            staffShiftTemplates={staffShiftTemplates}
            staffShiftRequests={staffShiftRequests}
            attendanceCorrections={attendanceCorrections}
            vehicles={vehicles}
            transportRuns={transportRuns}
            transportPlanDays={transportPlanDays}
            dailyTransportRequirements={dailyTransportRequirements}
            transportRouteSettings={transportRouteSettings}
            transportMapLocations={transportMapLocations}
            transportAreaZones={transportAreaZones}
            handoverItems={handoverItems}
            handoverConfirmations={handoverConfirmations}
            morningMeetingRecords={morningMeetingRecords}
            morningMeetingTemplates={morningMeetingTemplates}
            morningMeetingConfirmations={morningMeetingConfirmations}
            organizationId={organizationId}
            activeRecorder={activeRecorder || undefined}
            currentUser={auth.profile}
            canReviewRecords={canReview}
            canManageCommunications={canManageCommunications}
            canManageShifts={canManageShifts}
            canManageCalendar={canManageCalendar}
            canManageTransport={canManageTransport}
            onNavigate={(tab) => {
              if (tab === 'records') setRecordFilterChildId(null);
              setActiveTab(tab);
            }}
            onNewRecord={handleNewRecordClick}
            onStartRecord={handleStartRecord}
            onResumeDraft={handleResumeDraft}
            onViewDraft={handleViewDraft}
            onTakeOverDrafts={handleTakeOverDrafts}
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
            onSaveStaffSchedule={handleSaveStaffSchedule}
            onDeleteStaffSchedule={handleDeleteStaffSchedule}
            onSaveCalendarEvent={handleSaveCalendarEvent}
            onDeleteCalendarEvent={handleDeleteCalendarEvent}
            onSaveDailyChildPlan={handleSaveDailyChildPlan}
            onDeleteDailyChildPlan={handleDeleteDailyChildPlan}
            onDeleteDailyTransportRequirement={handleDeleteDailyTransportRequirement}
            onDeleteMonthlyDailySchedules={handleDeleteMonthlyDailySchedules}
            onSaveAttendance={handleSaveAttendance}
            onSaveAttendanceRecords={handleSaveAttendanceRecords}
            onDeleteAttendance={handleDeleteAttendance}
            onSaveStaffShiftRequest={handleSaveStaffShiftRequest}
            onSaveShiftRequestDefaults={handleSaveShiftRequestDefaults}
            onReviewStaffShiftRequest={handleReviewStaffShiftRequest}
            onDeleteReviewedStaffShiftRequest={handleDeleteReviewedStaffShiftRequest}
            onPunchAttendance={handlePunchAttendance}
            onRequestAttendanceCorrection={handleRequestAttendanceCorrection}
            onReviewAttendanceCorrection={handleReviewAttendanceCorrection}
            onSaveVehicle={handleSaveVehicle}
            onDeleteVehicle={handleDeleteVehicle}
            onSaveTransportPlanDay={handleSaveTransportPlanDay}
            onSaveDailyTransportRequirements={handleSaveDailyTransportRequirements}
            onReplaceMonthlyTransportRequirements={handleReplaceMonthlyTransportRequirements}
            onReplaceChildMonthlyTransportRequirements={handleReplaceChildMonthlyTransportRequirements}
            onSaveTransportRun={handleSaveTransportRun}
            onChangeTransportAssignment={handleChangeTransportAssignment}
            onDeleteTransportRun={handleDeleteTransportRun}
            onSaveTransportRouteSettings={handleSaveTransportRouteSettings}
            onSaveTransportMapLocation={handleSaveTransportMapLocation}
            onSaveTransportAreaZone={handleSaveTransportAreaZone}
            onDeleteTransportAreaZone={handleDeleteTransportAreaZone}
            onSaveSchool={handleSaveSchool}
            onUpdateTransportStatus={handleUpdateTransportStatus}
          />
        )}
        {activeTab === 'form' && (
          <RecordForm
            key={`${currentRecord?.id || activeDraftKey}-${formSessionId}`}
            templates={templates}
            childrenList={childrenList}
            dailyChildPlans={dailyChildPlans}
            recorderProfiles={recorderProfiles}
            initialRecord={currentRecord}
            organizationId={organizationId}
            userId={auth.profile?.id}
            userDisplayName={auth.profile?.displayName}
            allowLocalSensitiveStorage={!auth.profile?.fieldModeOnly}
            draftKey={activeDraftKey}
            activeRecorder={activeRecorder || undefined}
            assistantPrefill={assistantRecordPrefill}
            initialStepId={correctionTarget?.stepId}
            resolvedIssueId={correctionTarget?.issueId}
            readOnly={Boolean(readOnlyDraft)}
            readOnlyOwnerName={readOnlyDraft?.ownerName}
            readOnlyInitialChildId={readOnlyDraft?.childId}
            readOnlyDrafts={recordDrafts}
            onReadOnlyDraftChange={handleViewDraft}
            onBackToRecordStatus={() => {
              setReadOnlyDraft(null);
              setCurrentRecord(null);
              setHomeWorkspace('operations');
              setActiveTab('home');
            }}
            lockedChildren={Object.fromEntries(recordDrafts
              .filter((draft) => draft.draftKey !== activeDraftKey)
              .flatMap((draft) => draft.selectedChildIds.map((childId) => [
                `${draft.date || ''}:${childId}`,
                draft.recorderName || '別職員',
              ])))}
            onSaveRecords={handleSaveRecords}
            onCreateHandover={handleQuickMemoHandover}
            handoverItems={handoverItems}
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
          <ChildrenManager childrenList={childrenList} schools={schools} transportRouteSettings={transportRouteSettings} canEdit={canManageChildren} onAddChild={handleAddChild} onUpdateChild={handleUpdateChild} onDeleteChild={handleDeleteChild} />
        )}
        {FEATURE_FLAGS.supportPlansAndFiveDomains && activeTab === 'plans' && (
          <SupportPlanManager childrenList={childrenList} supportPlans={supportPlans} canEdit={canManageRecordSettings} onSavePlan={handleSavePlan} onClosePlan={handleClosePlan} />
        )}
        {activeTab === 'templates' && (canManageRecordSettings || canManageChildren || canManageTransport || auth.profile?.role === 'admin') && (
          <SettingsHub
            aiWritingSettings={aiWritingSettings}
            templates={templates}
            childrenList={childrenList}
            schools={schools}
            facilityAddress={transportRouteSettings.facilityAddress}
            routeSettings={transportRouteSettings}
            mapLocations={transportMapLocations}
            areaZones={transportAreaZones}
            currentUser={auth.profile}
            recorderProfiles={recorderProfiles}
            staffShiftTemplates={staffShiftTemplates}
            rolePermissions={rolePermissions}
            vehicles={vehicles}
            canManageChildren={canManageChildren}
            canManageRecordSettings={canManageRecordSettings}
            canManageTransport={canManageTransport}
            onSaveAiWritingSettings={handleSaveAiWritingSettings}
            onSaveTemplate={handleSaveTemplate}
            onDeleteTemplate={handleDeleteTemplate}
            onSaveSchool={handleSaveSchool}
            onDeleteSchool={handleDeleteSchool}
            onSaveMapLocation={handleSaveTransportMapLocation}
            onSaveAreaZone={handleSaveTransportAreaZone}
            onDeleteAreaZone={handleDeleteTransportAreaZone}
            onSaveRouteSettings={handleSaveTransportRouteSettings}
            onSaveStaffShiftTemplate={handleSaveStaffShiftTemplate}
            onDeleteStaffShiftTemplate={handleDeleteStaffShiftTemplate}
            onSaveRolePermission={handleSaveRolePermission}
            onSaveVehicle={handleSaveVehicle}
            onDeleteVehicle={handleDeleteVehicle}
          />
        )}
        {activeTab === 'team' && auth.profile && (!remoteMode || auth.profile.role === 'admin') && <TeamManager currentUser={auth.profile} onProfileUpdated={auth.reloadProfile} />}
        </div>
      </main>
    </div>
  );
}

function InAppAnnouncementToast({
  announcement,
  queuedCount,
  onOpen,
  onDismiss,
}: {
  announcement: Announcement;
  queuedCount: number;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const urgent = announcement.priority === 'urgent';
  const important = announcement.priority === 'important';
  return (
    <aside
      key={announcement.id}
      role={urgent ? 'alert' : 'status'}
      aria-live={urgent ? 'assertive' : 'polite'}
      className={`in-app-announcement-toast ui-panel-enter fixed z-[110] overflow-hidden rounded-2xl border-2 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.3)] ${
        urgent
          ? 'border-rose-400'
          : important
            ? 'border-amber-400'
            : 'border-teal-400'
      }`}
    >
      <div className={`h-1 ${urgent ? 'bg-rose-500' : important ? 'bg-amber-500' : 'bg-teal-500'}`} />
      <div className="flex items-start gap-3 p-3 sm:p-4">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
          urgent
            ? 'bg-rose-100 text-rose-700'
            : important
              ? 'bg-amber-100 text-amber-800'
              : 'bg-teal-100 text-teal-700'
        }`}>
          <BellRing className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              {urgent ? '緊急のお知らせ' : important ? '重要なお知らせ' : '新しいお知らせ'}
            </span>
            {queuedCount > 1 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">
                ほか{queuedCount - 1}件
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm font-black text-slate-950">{announcement.title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">{announcement.content}</p>
          <button
            type="button"
            onClick={onOpen}
            className={`mt-3 min-h-10 rounded-xl px-4 text-xs font-black text-white ${
              urgent ? 'bg-rose-600' : important ? 'bg-amber-600' : 'bg-teal-600'
            }`}
          >
            お知らせを確認
          </button>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="アプリ内通知を閉じる"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
}

function ScreenContextBar({
  activeTab,
  onHome,
  title,
  description,
  badge,
}: {
  activeTab: ActiveTab | 'preview';
  onHome: () => void;
  title?: string;
  description?: string;
  badge?: string;
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
          <p className="truncate text-sm font-black text-slate-900">{title || current.title}</p>
          <p className="hidden truncate text-[10px] text-slate-500 sm:block">{description ?? current.description}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500 md:inline">
          {badge || (activeTab === 'form' ? '入力内容は自動保存' : 'ホームへすぐ戻れます')}
        </span>
      </div>
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
