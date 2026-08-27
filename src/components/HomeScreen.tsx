import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  AlertTriangle,
  Bell,
  Bot,
  BusFront,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  ClipboardPenLine,
  ClipboardList,
  Clock3,
  History,
  LoaderCircle,
  MessageSquareText,
  PlusCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UsersRound,
  UserX,
} from 'lucide-react';
import type {
  ChildProfile,
  Announcement,
  AnnouncementConfirmation,
  AttendanceCorrectionRequest,
  AttendanceRecord,
  CalendarEvent,
  DailyChildPlan,
  DailyTransportRequirement,
  HandoverConfirmation,
  HandoverItem,
  HandoverStatus,
  HomeAssistantExecutionResult,
  HomeAssistantProposal,
  MorningMeetingConfirmation,
  MorningMeetingRecord,
  MorningMeetingTemplate,
  MonthlyScheduleDeleteResult,
  RecordDraftSummary,
  RecorderProfile,
  SchoolProfile,
  StaffScheduleItem,
  StaffShiftRequest,
  StaffShiftTemplate,
  SupportRecord,
  TransportRun,
  TransportAssignmentChangeInput,
  TransportAreaZone,
  TransportMapLocation,
  TransportPlanDay,
  TransportRouteSettings,
  TransportRunStatus,
  UserProfile,
  Vehicle,
} from '../types';
import type { ActiveTab } from './Header';
import { executeHomeAssistantProposal, requestHomeAssistantProposal } from '../services/homeAssistantService';
import { DailyOperationsPanel, type DraftTakeoverSelection } from './DailyOperationsPanel';
import { HandoverPanel } from './HandoverPanel';
import { MorningMeetingPanel } from './MorningMeetingPanel';
import { AnnouncementPanel } from './AnnouncementPanel';
import { TodayWorkPanel } from './TodayWorkPanel';
import { MonthlyTransportPlanner } from './MonthlyTransportPlanner';
import { getLocalDateString, getWeekdayFromDate } from '../utils/weekdays';
import { getDefaultDepartureTime } from '../utils/transportDeparture';
import { QuickGuide, type QuickGuideContent } from './QuickGuide';
import { AttendanceHomePanel } from './AttendanceHomePanel';
import { CalendarPanel } from './CalendarPanel';
import { TransportPanel } from './TransportPanel';

interface HomeScreenProps {
  activeWorkspace: HomeWorkspace;
  onWorkspaceChange: (workspace: HomeWorkspace) => void;
  announcementFocusToken?: number;
  recordStatusDate: string;
  onRecordStatusDateChange: (date: string) => void;
  records: SupportRecord[];
  announcements: Announcement[];
  announcementConfirmations: AnnouncementConfirmation[];
  childrenList: ChildProfile[];
  schools: SchoolProfile[];
  drafts: RecordDraftSummary[];
  recorderProfiles: RecorderProfile[];
  staffScheduleItems: StaffScheduleItem[];
  calendarEvents: CalendarEvent[];
  dailyChildPlans: DailyChildPlan[];
  attendanceRecords: AttendanceRecord[];
  staffShiftTemplates: StaffShiftTemplate[];
  staffShiftRequests: StaffShiftRequest[];
  attendanceCorrections: AttendanceCorrectionRequest[];
  vehicles: Vehicle[];
  transportRuns: TransportRun[];
  transportPlanDays: TransportPlanDay[];
  dailyTransportRequirements: DailyTransportRequirement[];
  transportRouteSettings: TransportRouteSettings;
  transportMapLocations: TransportMapLocation[];
  transportAreaZones: TransportAreaZone[];
  handoverItems: HandoverItem[];
  handoverConfirmations: HandoverConfirmation[];
  morningMeetingRecords: MorningMeetingRecord[];
  morningMeetingTemplates: MorningMeetingTemplate[];
  morningMeetingConfirmations: MorningMeetingConfirmation[];
  organizationId?: string;
  activeRecorder?: RecorderProfile;
  currentUser?: UserProfile | null;
  canReviewRecords: boolean;
  canManageCommunications: boolean;
  canManageShifts: boolean;
  canManageCalendar: boolean;
  canManageTransport: boolean;
  onNavigate: (tab: ActiveTab) => void;
  onNewRecord: () => void;
  onStartRecord: (childId: string, date: string) => void;
  onResumeDraft: (draftKey: string) => void;
  onViewDraft: (draftKey: string, ownerName?: string, childId?: string) => void;
  onTakeOverDrafts: (items: DraftTakeoverSelection[]) => Promise<boolean>;
  onDeleteDraft: (draftKey: string) => void;
  onOpenRecord: (record: SupportRecord) => void;
  onSaveAnnouncement: (announcement: Announcement) => Promise<void> | void;
  onArchiveAnnouncement: (announcementId: string) => Promise<void> | void;
  onSaveAnnouncementConfirmation: (confirmation: AnnouncementConfirmation) => Promise<void> | void;
  onSaveHandover: (item: HandoverItem) => Promise<void> | void;
  onHandoverStatusChange: (itemId: string, status: HandoverStatus) => Promise<void> | void;
  onSetHandoverConfirmation: (confirmation: HandoverConfirmation, confirmed: boolean) => Promise<void> | void;
  onSaveMorningMeeting: (record: MorningMeetingRecord) => Promise<void> | void;
  onSaveMorningMeetingTemplate: (template: MorningMeetingTemplate) => Promise<void> | void;
  onArchiveMorningMeetingTemplate: (templateId: string) => Promise<void> | void;
  onSetMorningMeetingConfirmation: (confirmation: MorningMeetingConfirmation, confirmed: boolean) => Promise<void> | void;
  onAssistantExecuted: (proposal: HomeAssistantProposal, result: HomeAssistantExecutionResult) => Promise<void> | void;
  onSaveStaffSchedule: (item: StaffScheduleItem) => Promise<void> | void;
  onDeleteStaffSchedule: (itemId: string) => Promise<void> | void;
  onSaveCalendarEvent: (event: CalendarEvent) => Promise<void> | void;
  onDeleteCalendarEvent: (eventId: string) => Promise<void> | void;
  onSaveDailyChildPlan: (plan: DailyChildPlan) => Promise<void> | void;
  onDeleteDailyChildPlan: (childId: string, date: string) => Promise<void> | void;
  onDeleteDailyTransportRequirement: (childId: string, date: string) => Promise<void> | void;
  onDeleteMonthlyDailySchedules: (month: string, childId?: string) => Promise<MonthlyScheduleDeleteResult>;
  onSaveAttendance: (record: AttendanceRecord) => Promise<void> | void;
  onSaveAttendanceRecords: (records: AttendanceRecord[]) => Promise<void> | void;
  onSaveStaffShiftRequest: (request: StaffShiftRequest) => Promise<void> | void;
  onSaveShiftRequestDefaults: (recorderProfileId: string, startTime: string, endTime: string) => Promise<void> | void;
  onReviewStaffShiftRequest: (request: StaffShiftRequest, approved: boolean, note?: string) => Promise<void> | void;
  onPunchAttendance: (recorder: RecorderProfile, pin: string, action: '出勤' | '退勤' | '休憩開始' | '休憩終了') => Promise<void> | void;
  onRequestAttendanceCorrection: (record: AttendanceRecord, pin: string, clockIn: string | undefined, clockOut: string | undefined, reason: string) => Promise<void> | void;
  onReviewAttendanceCorrection: (request: AttendanceCorrectionRequest, approved: boolean, note?: string) => Promise<void> | void;
  onSaveVehicle: (vehicle: Vehicle) => Promise<void> | void;
  onDeleteVehicle: (vehicleId: string) => Promise<void> | void;
  onSaveTransportPlanDay: (day: TransportPlanDay) => Promise<void> | void;
  onSaveDailyTransportRequirements: (requirements: DailyTransportRequirement[]) => Promise<void> | void;
  onReplaceMonthlyTransportRequirements: (month: string, requirements: DailyTransportRequirement[]) => Promise<DailyTransportRequirement[]>;
  onReplaceChildMonthlyTransportRequirements: (month: string, childId: string, requirements: DailyTransportRequirement[]) => Promise<DailyTransportRequirement[]>;
  onSaveTransportRun: (run: TransportRun) => Promise<void> | void;
  onChangeTransportAssignment: (change: TransportAssignmentChangeInput) => Promise<void> | void;
  onDeleteTransportRun: (runId: string) => Promise<void> | void;
  onSaveTransportRouteSettings: (settings: TransportRouteSettings) => Promise<void> | void;
  onSaveTransportMapLocation: (location: TransportMapLocation) => Promise<void> | void;
  onSaveTransportAreaZone: (zone: TransportAreaZone) => Promise<void> | void;
  onDeleteTransportAreaZone: (zoneId: string) => Promise<void> | void;
  onSaveSchool: (school: SchoolProfile) => Promise<void> | void;
  onUpdateTransportStatus: (run: TransportRun, recorder: RecorderProfile, pin: string, status: TransportRunStatus) => Promise<void> | void;
}

export type HomeWorkspace = 'menu' | 'dailyChanges' | 'todayWork' | 'attendance' | 'calendar' | 'monthlySchedule' | 'dispatch' | 'operations' | 'communication' | 'assistant';
type CommunicationView = 'announcements' | 'morning' | 'handover';

const HOME_GUIDE: QuickGuideContent = {
  title: 'ホーム',
  summary: '最初に行いたい業務を1つ選びます。必要な情報だけが次の画面に表示されます。',
  steps: ['急な欠席や送迎交代は「当日変更」を選びます。', '勤務は「出勤予定」、会議等は「業務カレンダー」、利用・送迎は「利用予定／送迎管理」を選びます。', '入力や確認が終わったら「機能を選び直す」でこの画面へ戻ります。'],
};

function workspaceGuide(workspace: HomeWorkspace): QuickGuideContent {
  const guides: Partial<Record<HomeWorkspace, QuickGuideContent>> = {
    dailyChanges: { title: '当日変更', summary: '急な欠席と送迎担当交代を、通常の設定画面を探さず処理します。', steps: ['変更種類を選びます。', '対象児童または送迎便を選びます。', '影響内容を確認して確定します。'], tips: ['出発済みの便は自動変更せず、運行中の職員へ連絡してください。'] },
    todayWork: { title: '本日の業務', summary: '今日の職員配置と送迎一覧を確認します。', steps: ['確認したい日付を選びます。', '職員配置または当日の送迎を選びます。', '配車変更は「利用予定／送迎管理」から行います。'] },
    attendance: { title: '出勤予定', summary: '自分の出勤予定、打刻、パート職員のシフト希望を確認します。', steps: ['自分の直近予定を確認します。', 'パート職員は希望日と時間を提出します。', '管理権限がある職員は月間シフトを確定します。'] },
    calendar: { title: '業務カレンダー', summary: '会議・外出・研修・面談・行事などを確認します。', steps: ['表示期間を選びます。', '予定を選んで詳細を確認します。', '権限がある場合は追加・編集できます。'] },
    monthlySchedule: { title: '利用予定／送迎管理', summary: '定期利用を基準に、追加利用・欠席・送迎条件を日別に調整します。', steps: ['対象月と表示単位を選びます。', '日付または児童・家庭・学校を選びます。', '条件確定後に配車画面を開きます。'] },
    dispatch: { title: '配車編集', summary: '利用予定／送迎管理で確定した条件から、車両・職員・乗降順を編集します。', steps: ['迎えまたは送りを選びます。', '児童を車両へ配置します。', '時間計算後に内容を保存します。'] },
    operations: { title: '記録状況', summary: '児童ごとの未入力・入力中・保存済みを確認します。', steps: ['対象日を選びます。', '児童の状態を確認します。', '入力開始・再開・閲覧・引き継ぎを選びます。'] },
    communication: { title: '共有・連絡', summary: 'お知らせ、朝礼、申し送りを1か所で確認します。', steps: ['上部タブから種類を選びます。', '未確認の内容を開きます。', '確認または対応状況を登録します。'] },
    assistant: { title: 'AIアシスタント', summary: 'AIが提案した変更案を確認してから実行します。', steps: ['児童を選び、依頼内容を入力します。', '提案内容と変更日を確認します。', '問題がなければ承認して実行します。'] },
  };
  return guides[workspace] || HOME_GUIDE;
}

function workspaceTitle(workspace: HomeWorkspace) {
  const titles: Record<HomeWorkspace, string> = {
    menu: 'ホーム', dailyChanges: '当日変更', todayWork: '本日の業務', attendance: '出勤予定', calendar: '業務カレンダー', monthlySchedule: '利用予定／送迎管理', dispatch: '配車編集', operations: '記録状況', communication: '共有・連絡', assistant: 'AIアシスタント',
  };
  return titles[workspace];
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  activeWorkspace: activePanel,
  onWorkspaceChange: setActivePanel,
  announcementFocusToken = 0,
  recordStatusDate,
  onRecordStatusDateChange,
  records,
  announcements,
  announcementConfirmations,
  childrenList,
  schools,
  drafts,
  recorderProfiles,
  staffScheduleItems,
  calendarEvents,
  dailyChildPlans,
  attendanceRecords,
  staffShiftTemplates,
  staffShiftRequests,
  attendanceCorrections,
  vehicles,
  transportRuns,
  transportPlanDays,
  dailyTransportRequirements,
  transportRouteSettings,
  transportMapLocations,
  transportAreaZones,
  handoverItems,
  handoverConfirmations,
  morningMeetingRecords,
  morningMeetingTemplates,
  morningMeetingConfirmations,
  organizationId,
  activeRecorder,
  currentUser,
  canReviewRecords,
  canManageCommunications,
  canManageShifts,
  canManageCalendar,
  canManageTransport,
  onNavigate,
  onNewRecord,
  onStartRecord,
  onResumeDraft,
  onViewDraft,
  onTakeOverDrafts,
  onDeleteDraft,
  onOpenRecord,
  onSaveAnnouncement,
  onArchiveAnnouncement,
  onSaveAnnouncementConfirmation,
  onSaveHandover,
  onHandoverStatusChange,
  onSetHandoverConfirmation,
  onSaveMorningMeeting,
  onSaveMorningMeetingTemplate,
  onArchiveMorningMeetingTemplate,
  onSetMorningMeetingConfirmation,
  onAssistantExecuted,
  onSaveStaffSchedule,
  onDeleteStaffSchedule,
  onSaveCalendarEvent,
  onDeleteCalendarEvent,
  onSaveDailyChildPlan,
  onDeleteDailyChildPlan,
  onDeleteDailyTransportRequirement,
  onDeleteMonthlyDailySchedules,
  onSaveAttendance,
  onSaveAttendanceRecords,
  onSaveStaffShiftRequest,
  onSaveShiftRequestDefaults,
  onReviewStaffShiftRequest,
  onPunchAttendance,
  onRequestAttendanceCorrection,
  onReviewAttendanceCorrection,
  onSaveVehicle,
  onDeleteVehicle,
  onSaveTransportPlanDay,
  onSaveDailyTransportRequirements,
  onReplaceMonthlyTransportRequirements,
  onReplaceChildMonthlyTransportRequirements,
  onSaveTransportRun,
  onChangeTransportAssignment,
  onDeleteTransportRun,
  onSaveTransportRouteSettings,
  onSaveTransportMapLocation,
  onSaveTransportAreaZone,
  onDeleteTransportAreaZone,
  onSaveSchool,
  onUpdateTransportStatus,
}) => {
  const [communicationView, setCommunicationView] = useState<CommunicationView>('announcements');
  const [todayWorkLaunch, setTodayWorkLaunch] = useState<{
    date: string;
    view: 'placement' | 'transport';
  }>({ date: getLocalDateString(), view: 'placement' });
  const [dispatchDate, setDispatchDate] = useState(getLocalDateString());
  const [monthlyScheduleDate, setMonthlyScheduleDate] = useState(getLocalDateString());
  const [monthlyScheduleReturn, setMonthlyScheduleReturn] = useState<HomeWorkspace>('menu');

  useEffect(() => {
    if (announcementFocusToken > 0) setCommunicationView('announcements');
  }, [announcementFocusToken]);

  const today = getLocalDateString();
  const nextSchoolScheduleMonth = useMemo(() => {
    const base = new Date(`${today}T12:00:00`);
    base.setMonth(base.getMonth() + 1, 1);
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;
  }, [today]);
  const schoolScheduleAlertActive = useMemo(() => {
    const current = new Date(`${today}T12:00:00`);
    const lastDay = new Date(current.getFullYear(), current.getMonth() + 1, 0);
    const alertStart = new Date(lastDay);
    alertStart.setDate(lastDay.getDate() - 6);
    return current >= alertStart;
  }, [today]);
  const missingSchoolScheduleConfirmations = useMemo(() => {
    if (!schoolScheduleAlertActive) return [];
    const usedSchoolIds = new Set(childrenList.filter((child) => !child.serviceSuspended && child.schoolId).map((child) => child.schoolId));
    return schools.filter((school) => school.active && usedSchoolIds.has(school.id)
      && !(school.dismissalScheduleConfirmations || []).some((confirmation) => confirmation.targetMonth === nextSchoolScheduleMonth));
  }, [childrenList, nextSchoolScheduleMonth, schoolScheduleAlertActive, schools]);
  const todayRecords = records.filter((record) => record.date === today);
  const unapproved = records.filter((record) => record.approvalStatus === '未確認');
  const openHandovers = handoverItems.filter((item) => item.status !== '完了').length;
  const hasMorningMeetingRecord = morningMeetingRecords.some(
    (record) => record.date === today && Boolean(record.content.trim())
  );
  const morningDailySummary = useMemo(() => {
    const work = attendanceRecords.filter((record) => record.date === today);
    const runs = transportRuns.filter((run) => run.date === today);
    const events = calendarEvents.filter((event) => homeEventOccursOn(event, today));
    const servicePlans = dailyChildPlans.filter((plan) => plan.date === today);
    const absentStaff = work.filter((record) => ['欠勤', '有給', '公休', '特別休暇'].includes(record.status)).map((record) => record.recorderName);
    const absentChildren = servicePlans.filter((plan) => plan.attendancePlan === '欠席').map((plan) => childrenList.find((child) => child.id === plan.childId)?.name).filter(Boolean);
    const additionalChildren = servicePlans.filter((plan) => plan.attendancePlan === '追加利用');
    return [
      `出勤予定 ${work.filter((record) => !['欠勤', '有給', '公休', '特別休暇'].includes(record.status)).length}名${absentStaff.length ? `／欠勤・休暇 ${absentStaff.join('、')}` : ''}`,
      `送迎 ${runs.length}便（${runs.map((run) => run.name).join('、') || 'なし'}）`,
      `追加利用 ${additionalChildren.length}名／欠席 ${absentChildren.length}名${absentChildren.length ? `（${absentChildren.join('、')}）` : ''}`,
      `会議・研修・面談・行事 ${events.filter((event) => ['会議', '研修', '保護者面談', '学校行事', '事業所行事'].includes(event.eventType)).length}件`,
    ];
  }, [attendanceRecords, calendarEvents, childrenList, dailyChildPlans, today, transportRuns]);
  const correctionAnnouncements = useMemo<Announcement[]>(() => records
    .filter((record) => record.approvalStatus === '要修正')
    .map((record) => {
      const unresolved = (record.reviewIssues || []).filter((issue) => !issue.resolved);
      const correctionDetails = unresolved.length > 0
        ? unresolved.map((issue) => `・${issue.label}：${issue.comment}`).join('\n')
        : record.jihatsukanComment?.trim() || '修正箇所の指定を児発管または管理者へ確認してください。';
      const publishedAt = record.reviewedAt || record.updatedAt;
      return {
        id: `record-correction:${record.id}:${publishedAt}`,
        title: `【要修正】${record.childName}さん・${record.date}`,
        content: correctionDetails,
        priority: 'important',
        sourceType: 'record_correction',
        relatedRecordId: record.id,
        publishedAt,
        createdByName: record.reviewedBy || '児発管・管理者',
        createdAt: publishedAt,
        updatedAt: publishedAt,
      };
    }), [records]);
  const visibleAnnouncements = useMemo(
    () => [...correctionAnnouncements, ...announcements]
      .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt)),
    [announcements, correctionAnnouncements]
  );
  const todayWorkCount = staffScheduleItems.filter((item) => item.date === today).length
    + transportRuns.filter((run) => run.date === today).length
    + calendarEvents.filter((event) => homeEventOccursOn(event, today)).length;
  const carriedOverDrafts = useMemo(
    () => drafts
      .filter((draft) => Boolean(draft.date && draft.date < today))
      .sort((left, right) => (right.date || '').localeCompare(left.date || '') || right.updatedAt.localeCompare(left.updatedAt)),
    [drafts, today]
  );
  const carriedOverChildCount = useMemo(
    () => new Set(carriedOverDrafts.flatMap((draft) => draft.selectedChildIds)).size,
    [carriedOverDrafts]
  );
  const carriedOverTargetDate = carriedOverDrafts[0]?.date;
  const attentionCount = drafts.length + unapproved.length + openHandovers;
  const resumableDraft = useMemo(() => drafts
    .filter((draft) => {
      if (draft.selectedChildIds.length === 0) return false;
      if (currentUser?.id && draft.userId !== currentUser.id) return false;
      if (activeRecorder) return draft.recorderId === activeRecorder.id;
      if (currentUser) return !draft.recorderId;
      return true;
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0], [activeRecorder, currentUser, drafts]);

  return (
    <div className="mx-auto max-w-[1800px] space-y-4">
      {activePanel === 'menu' ? (
        <>
          <section className="rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-4 text-white shadow-lg sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-300">{today.replaceAll('-', '/')}・ホーム</p>
                <h2 className="mt-1 text-lg font-black sm:text-xl">今日の業務を選択</h2>
                <p className="mt-1 text-[10px] font-bold text-slate-300">ログイン中の職員は画面右上でいつでも確認できます。</p>
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                <button type="button" onClick={() => resumableDraft ? onResumeDraft(resumableDraft.draftKey) : onNewRecord()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-400 px-4 text-sm font-black text-slate-950 shadow-md hover:bg-teal-300">
                  {resumableDraft ? <RotateCcw className="h-5 w-5" /> : <PlusCircle className="h-5 w-5" />}
                  {resumableDraft ? '記録を再開' : '記録を始める'}
                </button>
                <button type="button" onClick={() => { setTodayWorkLaunch({ date: today, view: 'transport' }); setActivePanel('todayWork'); }} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/15">
                  <BusFront className="h-5 w-5" />当日送迎を確認
                </button>
                <QuickGuide content={HOME_GUIDE} compact />
              </div>
            </div>
          </section>

          {carriedOverDrafts.length > 0 && carriedOverTargetDate && (
            <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm" aria-label="前日以前の未保存記録">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-200 text-amber-900">
                    <AlertTriangle className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-amber-950">前日以前の未保存記録があります</h3>
                    <p className="mt-1 text-xs leading-relaxed text-amber-900">
                      {carriedOverDrafts.length}件（{carriedOverChildCount}名分）を入力中のまま保持しています。内容を確認し、保存または不要な下書きの削除を行ってください。
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onRecordStatusDateChange(carriedOverTargetDate);
                    setActivePanel('operations');
                  }}
                  className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-900 px-4 text-sm font-black text-white hover:bg-amber-800"
                >
                  {carriedOverTargetDate.replaceAll('-', '/')}を確認
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </section>
          )}

          {attentionCount > 0 && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-3" aria-label="確認が必要な項目">
              <div className="flex items-center gap-2 px-1 text-xs font-black text-amber-950"><Bell className="h-4 w-4" />確認が必要です</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {drafts.length > 0 && <AttentionButton label={`入力中 ${drafts.length}件`} onClick={() => setActivePanel('operations')} />}
                {unapproved.length > 0 && <AttentionButton label={`未確認記録 ${unapproved.length}件`} onClick={() => onNavigate('records')} />}
                {openHandovers > 0 && <AttentionButton label={`未完了の申し送り ${openHandovers}件`} onClick={() => { setCommunicationView('handover'); setActivePanel('communication'); }} />}
              </div>
            </section>
          )}

          {missingSchoolScheduleConfirmations.length > 0 && (
            <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm" aria-label="下校時刻表の確認アラート">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-200 text-amber-900"><AlertTriangle className="h-5 w-5" /></span>
                  <div><h3 className="text-sm font-black text-amber-950">{nextSchoolScheduleMonth.replace('-', '年')}月の下校時刻表が未確認です</h3><p className="mt-1 text-xs leading-relaxed text-amber-900">未確認：{missingSchoolScheduleConfirmations.map((school) => school.name).join('、')}。学校から配布された下校時刻・行事を確認後、利用予定／送迎管理で確認済みにしてください。</p></div>
                </div>
                <button type="button" onClick={() => { setMonthlyScheduleDate(`${nextSchoolScheduleMonth}-01`); setMonthlyScheduleReturn('menu'); setActivePanel('monthlySchedule'); }} className="min-h-11 shrink-0 rounded-xl bg-amber-900 px-4 text-sm font-black text-white">確認画面を開く</button>
              </div>
            </section>
          )}

          <section>
            <div className="mb-3 px-1">
              <h3 className="text-base font-black text-slate-950">確認したい内容を選ぶ</h3>
              <p className="mt-0.5 text-xs text-slate-500">選んだ内容だけを次の画面に表示します。</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <WorkspaceCard icon={UserX} title="当日変更" description="急な欠席・送迎担当の交代" meta="影響を確認してすぐ反映" tone="amber" onClick={() => setActivePanel('dailyChanges')} />
              <WorkspaceCard icon={CalendarDays} title="本日の業務" description="職員配置・当日の送迎一覧" meta={todayWorkCount > 0 ? `${todayWorkCount}件の予定` : '予定を確認'} tone="teal" onClick={() => { setTodayWorkLaunch({ date: getLocalDateString(), view: 'placement' }); setActivePanel('todayWork'); }} />
              <WorkspaceCard icon={Clock3} title="出勤予定" description="自分の予定・打刻・シフト希望" meta={activeRecorder ? `${activeRecorder.displayName}さんの勤務` : '勤務を確認'} tone="sky" onClick={() => setActivePanel('attendance')} />
              <WorkspaceCard icon={CalendarRange} title="業務カレンダー" description="会議・外出・研修・面談・行事" meta="勤務予定は表示しません" tone="indigo" onClick={() => setActivePanel('calendar')} />
              <WorkspaceCard icon={BusFront} title="利用予定／送迎管理" description="利用予定・欠席・送迎条件・配車" meta="日ごとの予定を確認・編集" tone="violet" onClick={() => { setMonthlyScheduleDate(today); setMonthlyScheduleReturn('menu'); setActivePanel('monthlySchedule'); }} />
              <WorkspaceCard icon={UsersRound} title="児童名簿" description="児童情報・学校・利用曜日・送迎先" meta={`${childrenList.filter((child) => !child.serviceSuspended).length}名を確認`} tone="teal" onClick={() => onNavigate('children')} />
              <WorkspaceCard icon={ClipboardList} title="記録状況" description="利用児童・入力中・保存済み" meta={`本日 ${todayRecords.length}件／入力中 ${drafts.length}件${carriedOverDrafts.length > 0 ? `／持越し ${carriedOverDrafts.length}件` : ''}`} tone="sky" onClick={() => setActivePanel('operations')} />
              <WorkspaceCard icon={History} title="記録一覧・確認" description="保存済み記録の確認・修正・出力" meta={unapproved.length > 0 ? `未確認 ${unapproved.length}件` : '記録を確認'} tone="teal" onClick={() => onNavigate('records')} />
              <WorkspaceCard icon={MessageSquareText} title="共有・連絡" description="お知らせ・朝礼・申し送り" meta={`${visibleAnnouncements.length + openHandovers}件を確認`} tone="amber" onClick={() => setActivePanel('communication')} />
              <WorkspaceCard icon={Bot} title="AIアシスタント" description="児童情報の変更や記録の整理" meta="実行前に内容を確認" tone="indigo" onClick={() => setActivePanel('assistant')} />
            </div>
          </section>
        </>
      ) : (
        <>
          <WorkspaceBackBar
            title={workspaceTitle(activePanel)}
            guide={workspaceGuide(activePanel)}
            onBack={() => setActivePanel(activePanel === 'monthlySchedule' ? monthlyScheduleReturn : 'menu')}
          />
          <div key={activePanel} className="ui-panel-enter" role="region" aria-label={workspaceTitle(activePanel)}>
        {activePanel === 'dailyChanges' && (
          <DailyChangePanel
            date={today}
            childrenList={childrenList}
            dailyChildPlans={dailyChildPlans}
            transportRuns={transportRuns}
            recorderProfiles={recorderProfiles}
            routeSettings={transportRouteSettings}
            activeRecorder={activeRecorder}
            onSaveDailyChildPlan={onSaveDailyChildPlan}
            onSaveTransportRun={onSaveTransportRun}
            onDeleteTransportRun={onDeleteTransportRun}
            onChangeTransportAssignment={onChangeTransportAssignment}
          />
        )}
        {activePanel === 'todayWork' && (
          <TodayWorkPanel
            initialDate={todayWorkLaunch.date}
            initialView={todayWorkLaunch.view}
            staffScheduleItems={staffScheduleItems}
            calendarEvents={calendarEvents}
            dailyChildPlans={dailyChildPlans}
            attendanceRecords={attendanceRecords}
            vehicles={vehicles}
            transportRuns={transportRuns}
            transportRouteSettings={transportRouteSettings}
            transportMapLocations={transportMapLocations}
            transportAreaZones={transportAreaZones}
            recorderProfiles={recorderProfiles}
            childrenList={childrenList}
            canManage={canManageShifts}
            onSaveStaffSchedule={onSaveStaffSchedule}
            onDeleteStaffSchedule={onDeleteStaffSchedule}
            onSaveCalendarEvent={onSaveCalendarEvent}
            onSaveAttendance={onSaveAttendance}
            onSaveTransportRun={onSaveTransportRun}
          />
        )}

        {activePanel === 'attendance' && <AttendanceHomePanel records={attendanceRecords} shiftTemplates={staffShiftTemplates} shiftRequests={staffShiftRequests} corrections={attendanceCorrections} recorderProfiles={recorderProfiles} activeRecorder={activeRecorder} canManageShifts={canManageShifts} canApproveCorrections={!organizationId || currentUser?.role === 'admin'} qrKioskEnabled={Boolean(organizationId)} calendarEvents={calendarEvents} childrenList={childrenList} dailyChildPlans={dailyChildPlans} dailyTransportRequirements={dailyTransportRequirements} transportRuns={transportRuns} onSaveRecord={onSaveAttendance} onSaveRecords={onSaveAttendanceRecords} onSaveShiftRequest={onSaveStaffShiftRequest} onSaveShiftRequestDefaults={onSaveShiftRequestDefaults} onReviewShiftRequest={onReviewStaffShiftRequest} onPunch={onPunchAttendance} onRequestCorrection={onRequestAttendanceCorrection} onReviewCorrection={onReviewAttendanceCorrection} />}

        {activePanel === 'calendar' && <CalendarPanel events={calendarEvents} recorderProfiles={recorderProfiles} childrenList={childrenList} selectedDate={todayWorkLaunch.date} onDateChange={(date) => setTodayWorkLaunch((current) => ({ ...current, date }))} canEdit={canManageCalendar} onSave={onSaveCalendarEvent} onDelete={onDeleteCalendarEvent} />}

        {activePanel === 'monthlySchedule' && (
          <MonthlyTransportPlanner
            organizationId={organizationId}
            initialDate={monthlyScheduleDate}
            childrenList={childrenList}
            schools={schools}
            dailyChildPlans={dailyChildPlans}
            requirements={dailyTransportRequirements}
            planDays={transportPlanDays}
            transportRuns={transportRuns}
            routeSettings={transportRouteSettings}
            canManage={canManageTransport}
            onSavePlanDay={onSaveTransportPlanDay}
            onSaveDailyChildPlan={onSaveDailyChildPlan}
            onDeleteDailyChildPlan={onDeleteDailyChildPlan}
            onDeleteRequirement={onDeleteDailyTransportRequirement}
            onDeleteMonthSchedules={onDeleteMonthlyDailySchedules}
            onSaveRequirements={onSaveDailyTransportRequirements}
            onReplaceMonthRequirements={onReplaceMonthlyTransportRequirements}
            onReplaceChildMonthRequirements={onReplaceChildMonthlyTransportRequirements}
            activeRecorder={activeRecorder}
            onSaveSchool={onSaveSchool}
            onOpenDispatch={(date) => {
              setDispatchDate(date);
              setActivePanel('dispatch');
            }}
          />
        )}

        {activePanel === 'dispatch' && <TransportPanel runs={transportRuns} vehicles={vehicles} routeSettings={transportRouteSettings} mapLocations={transportMapLocations} areaZones={transportAreaZones} recorderProfiles={recorderProfiles} childrenList={childrenList} schools={schools} dailyChildPlans={dailyChildPlans} transportPlanDays={transportPlanDays} dailyTransportRequirements={dailyTransportRequirements} staffScheduleItems={staffScheduleItems} attendanceRecords={attendanceRecords} calendarEvents={calendarEvents} selectedDate={dispatchDate} canManage={canManageTransport} activeRecorder={activeRecorder} warningsByRunId={new Map()} initialDayPlannerOpen onSaveRun={onSaveTransportRun} onSaveRequirements={onSaveDailyTransportRequirements} onChangeAssignment={onChangeTransportAssignment} onDeleteRun={onDeleteTransportRun} onSaveVehicle={onSaveVehicle} onDeleteVehicle={onDeleteVehicle} onSaveRouteSettings={onSaveTransportRouteSettings} onSaveMapLocation={onSaveTransportMapLocation} onSaveAreaZone={onSaveTransportAreaZone} onDeleteAreaZone={onDeleteTransportAreaZone} onUpdateStatus={onUpdateTransportStatus} />}

        {activePanel === 'operations' && (
          <DailyOperationsPanel
            childrenList={childrenList}
            records={records}
            drafts={drafts}
            dailyChildPlans={dailyChildPlans}
            dailyTransportRequirements={dailyTransportRequirements}
            targetDate={recordStatusDate}
            onTargetDateChange={onRecordStatusDateChange}
            currentUserId={currentUser?.id}
            currentRecorderId={activeRecorder?.id}
            canManageDrafts={canReviewRecords}
            onStartRecord={onStartRecord}
            onResumeDraft={onResumeDraft}
            onViewDraft={onViewDraft}
            onTakeOverDrafts={onTakeOverDrafts}
            onDeleteDraft={onDeleteDraft}
            onOpenRecord={onOpenRecord}
          />
        )}

        {activePanel === 'communication' && (
          <div className="space-y-3">
            <nav className="grid grid-cols-3 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="共有・連絡メニュー">
              <CommunicationTab active={communicationView === 'announcements'} icon={Bell} label="お知らせ" badge={visibleAnnouncements.length} onClick={() => setCommunicationView('announcements')} />
              <CommunicationTab active={communicationView === 'morning'} icon={ClipboardPenLine} label="朝礼" badge={hasMorningMeetingRecord ? 1 : 0} onClick={() => setCommunicationView('morning')} />
              <CommunicationTab active={communicationView === 'handover'} icon={MessageSquareText} label="申し送り" badge={openHandovers} onClick={() => setCommunicationView('handover')} />
            </nav>
            <div role="tabpanel">
              {communicationView === 'announcements' && (
                <AnnouncementPanel
                  announcements={visibleAnnouncements}
                  confirmations={announcementConfirmations}
                  recorderProfiles={recorderProfiles}
                  organizationId={organizationId}
                  activeRecorder={activeRecorder}
                  currentUser={currentUser}
                  canCreate={!organizationId || Boolean(currentUser)}
                  canArchive={canManageCommunications}
                  onOpenRecord={(recordId) => {
                    const record = records.find((candidate) => candidate.id === recordId);
                    if (record) onOpenRecord(record);
                  }}
                  onSave={onSaveAnnouncement}
                  onArchive={onArchiveAnnouncement}
                  onSaveConfirmation={onSaveAnnouncementConfirmation}
                />
              )}
              {communicationView === 'morning' && (
                <MorningMeetingPanel
                  records={morningMeetingRecords}
                  templates={morningMeetingTemplates}
                  confirmations={morningMeetingConfirmations}
                  recorderProfiles={recorderProfiles}
                  organizationId={organizationId}
                  activeRecorder={activeRecorder}
                  currentUser={currentUser}
                  canManageTemplates={canManageCommunications}
                  dailySummary={morningDailySummary}
                  onSave={onSaveMorningMeeting}
                  onSaveTemplate={onSaveMorningMeetingTemplate}
                  onArchiveTemplate={onArchiveMorningMeetingTemplate}
                  onSetConfirmation={onSetMorningMeetingConfirmation}
                />
              )}
              {communicationView === 'handover' && (
                <HandoverPanel
                  items={handoverItems}
                  confirmations={handoverConfirmations}
                  childrenList={childrenList}
                  recorderProfiles={recorderProfiles}
                  transportRuns={transportRuns}
                  activeRecorder={activeRecorder}
                  currentUser={currentUser}
                  onSave={onSaveHandover}
                  onStatusChange={onHandoverStatusChange}
                  onSetConfirmation={onSetHandoverConfirmation}
                />
              )}
            </div>
          </div>
        )}

        {activePanel === 'assistant' && (
          <HomeAssistantPanel childrenList={childrenList} onExecuted={onAssistantExecuted} />
        )}
          </div>
        </>
      )}
    </div>
  );
};

function HomeAssistantPanel({
  childrenList,
  onExecuted,
}: {
  childrenList: ChildProfile[];
  onExecuted: (proposal: HomeAssistantProposal, result: HomeAssistantExecutionResult) => Promise<void> | void;
}) {
  const [selectedChildId, setSelectedChildId] = useState('');
  const [instruction, setInstruction] = useState('');
  const [proposal, setProposal] = useState<HomeAssistantProposal | null>(null);
  const [resultMessage, setResultMessage] = useState('');
  const [resultOutput, setResultOutput] = useState('');
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'idle' | 'proposing' | 'executing'>('idle');
  const selectedChild = childrenList.find((child) => child.id === selectedChildId);
  const busy = phase !== 'idle';

  const resetResult = () => {
    setProposal(null);
    setResultMessage('');
    setResultOutput('');
    setError('');
  };

  const handleCreateProposal = async () => {
    if (!selectedChild) return setError('児童名を選択してください。');
    if (!instruction.trim()) return setError('AIへの指示文を入力してください。');
    setPhase('proposing');
    setError('');
    setResultMessage('');
    setResultOutput('');
    try {
      setProposal(await requestHomeAssistantProposal(selectedChild, instruction.trim()));
    } catch (requestError) {
      setProposal(null);
      setError(requestError instanceof Error ? requestError.message : '実行案を作成できませんでした。');
    } finally {
      setPhase('idle');
    }
  };

  const handleExecute = async () => {
    if (!proposal) return;
    setPhase('executing');
    setError('');
    try {
      const result = await executeHomeAssistantProposal(proposal, selectedChild);
      await onExecuted(proposal, result);
      setResultMessage(result.message);
      setResultOutput(result.output || '');
      setProposal(null);
      setInstruction('');
    } catch (executeError) {
      setError(executeError instanceof Error ? executeError.message : 'アシスタントを実行できませんでした。');
    } finally {
      setPhase('idle');
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm">
      <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-950 via-slate-900 to-teal-950 px-5 py-4 text-white sm:px-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-white/10 p-2"><Bot className="h-6 w-6 text-teal-300" /></div>
          <div>
            <p className="text-[11px] font-bold text-teal-300">承認後にだけ実行する安全設計</p>
            <h3 className="mt-0.5 text-lg font-black">AI業務アシスタント</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">指示をAIが実行案に整理します。内容を確認し、承認するまで児童情報は変更されません。</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700">児童名</span>
            <select
              value={selectedChildId}
              disabled={busy}
              onChange={(event) => {
                setSelectedChildId(event.target.value);
                resetResult();
              }}
              className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:opacity-60"
            >
              <option value="">児童を選択してください</option>
              {childrenList.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700">アシスタント内容</span>
            <textarea
              rows={4}
              value={instruction}
              disabled={busy}
              onChange={(event) => {
                setInstruction(event.target.value);
                resetResult();
              }}
              placeholder="例：8月26日からの定期利用日を水曜日と金曜日になるようにしてほしい"
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm leading-relaxed focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:opacity-60"
            />
          </label>
          <div>
            <p className="text-[10px] font-bold text-slate-500">入力例</p>
            <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
              {[
                '8月26日から水曜日と金曜日の利用に変更',
                '留意点に「水分補給の声掛けを行う」を追記',
                '明日の記録作成を開始',
                '過去の記録を一覧表示',
                '最近30日間の記録を要約',
              ].map((example) => (
                <button
                  key={example}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setInstruction(example);
                    resetResult();
                  }}
                  className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[10px] font-bold text-indigo-700 disabled:opacity-50"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
            <p className="flex items-center gap-1.5 font-bold text-slate-700"><ShieldCheck className="h-4 w-4 text-teal-600" />現在実行できる内容</p>
            <p className="mt-1">曜日変更、児童情報・留意点の更新、記録開始、記録一覧、最近の記録要約に対応しています。削除・権限・承認・テンプレート操作は管理画面から行います。</p>
          </div>

          <button
            type="button"
            disabled={busy || !selectedChildId || !instruction.trim()}
            onClick={handleCreateProposal}
            className="min-h-12 w-full rounded-xl bg-indigo-600 px-4 text-sm font-black text-white shadow-sm flex items-center justify-center gap-2 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {phase === 'proposing' ? <><LoaderCircle className="h-5 w-5 animate-spin" />AIが実行案を作成中...</> : <><Sparkles className="h-5 w-5" />実行案を作成</>}
          </button>
        </div>

        <div className="min-h-64 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-4 sm:p-5">
          {!proposal && !resultMessage && !error && (
            <div className="h-full min-h-52 flex flex-col items-center justify-center text-center text-slate-400">
              <Sparkles className="h-9 w-9 text-indigo-300" />
              <p className="mt-3 text-sm font-bold text-slate-500">ここにAIの実行案が表示されます</p>
              <p className="mt-1 max-w-xs text-xs">対象児童と指示を入力し、「実行案を作成」を押してください。</p>
            </div>
          )}

          {proposal && (
            <div className="space-y-4">
              <div>
                <p className="text-[11px] font-bold text-indigo-600">AIアシスタント案・{getAssistantActionLabel(proposal.actionType)}</p>
                <h4 className="mt-1 text-base font-black text-slate-900">{proposal.summary}</h4>
              </div>
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                {proposal.details.map((detail, index) => (
                  <div key={`${detail.label}-${index}`} className={`rounded-xl border border-slate-200 bg-white p-3 ${proposal.details.length % 2 === 1 && index === proposal.details.length - 1 ? 'sm:col-span-2' : ''}`}>
                    <dt className="text-slate-500">{detail.label}</dt>
                    <dd className="mt-1 whitespace-pre-wrap font-bold leading-relaxed text-slate-900">{detail.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="rounded-xl bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">承認後にだけ実行されます。{proposal.confirmationNote}</p>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <button type="button" disabled={busy} onClick={handleExecute} className="min-h-12 rounded-xl bg-teal-600 px-4 text-sm font-black text-white flex items-center justify-center gap-2 hover:bg-teal-500 disabled:opacity-60">
                  {phase === 'executing' ? <><LoaderCircle className="h-5 w-5 animate-spin" />アシスタント実行中...</> : <><CheckCircle2 className="h-5 w-5" />この内容を承認して実行</>}
                </button>
                <button type="button" disabled={busy} onClick={() => setProposal(null)} className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-600 disabled:opacity-60">指示を修正</button>
              </div>
            </div>
          )}

          {resultMessage && (
            <div role="status" className="h-full min-h-52 flex flex-col items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              <p className="mt-3 text-[11px] font-bold text-emerald-700">アシスタントの実行が完了しました</p>
              <p className="mt-1 text-sm font-black leading-relaxed text-emerald-950">{resultMessage}</p>
              {resultOutput && <div className="mt-4 w-full whitespace-pre-wrap rounded-xl border border-emerald-200 bg-white p-4 text-left text-xs leading-relaxed text-slate-700">{resultOutput}</div>}
              <button type="button" onClick={resetResult} className="mt-4 min-h-10 rounded-lg border border-emerald-300 bg-white px-4 text-xs font-bold text-emerald-800 flex items-center gap-2"><RotateCcw className="h-4 w-4" />別の指示を入力</button>
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <p className="font-bold">実行案を作成できませんでした</p>
              <p className="mt-1 text-xs leading-relaxed">{error}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function getAssistantActionLabel(actionType: HomeAssistantProposal['actionType']) {
  const labels: Record<HomeAssistantProposal['actionType'], string> = {
    schedule_regular_days: '定期利用曜日',
    update_child_profile: '児童基本情報',
    update_child_notes: '指導上の留意点',
    update_daily_transport: '日別送迎予定',
    start_support_record: '記録作成',
    open_child_records: '記録一覧',
    summarize_recent_records: '最近の記録要約',
  };
  return labels[actionType];
}

function DailyChangePanel({
  date,
  childrenList,
  dailyChildPlans,
  transportRuns,
  recorderProfiles,
  routeSettings,
  activeRecorder,
  onSaveDailyChildPlan,
  onSaveTransportRun,
  onDeleteTransportRun,
  onChangeTransportAssignment,
}: {
  date: string;
  childrenList: ChildProfile[];
  dailyChildPlans: DailyChildPlan[];
  transportRuns: TransportRun[];
  recorderProfiles: RecorderProfile[];
  routeSettings: TransportRouteSettings;
  activeRecorder?: RecorderProfile;
  onSaveDailyChildPlan: (plan: DailyChildPlan) => Promise<void> | void;
  onSaveTransportRun: (run: TransportRun) => Promise<void> | void;
  onDeleteTransportRun: (runId: string) => Promise<void> | void;
  onChangeTransportAssignment: (change: TransportAssignmentChangeInput) => Promise<void> | void;
}) {
  const [mode, setMode] = useState<'absence' | 'transport'>('absence');
  const [childId, setChildId] = useState('');
  const [runId, setRunId] = useState('');
  const [actorId, setActorId] = useState(activeRecorder?.id || '');
  const [driverId, setDriverId] = useState('');
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('体調不良・支援対応');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const activeChildren = childrenList.filter((child) => !child.serviceSuspended).sort((left, right) => left.name.localeCompare(right.name, 'ja'));
  const activeRecorders = recorderProfiles.filter((recorder) => recorder.active);
  const dayRuns = transportRuns.filter((run) => run.date === date).sort((left, right) => left.startTime.localeCompare(right.startTime));
  const selectedRun = dayRuns.find((run) => run.id === runId);
  const selectedChild = activeChildren.find((child) => child.id === childId);

  const saveAbsence = async (attendancePlan: '欠席' | '利用予定') => {
    if (!selectedChild) return setError('対象児童を選択してください。');
    const affectedRuns = dayRuns.filter((run) => run.stops.some((stop) => stop.childId === selectedChild.id));
    const runningRuns = affectedRuns.filter((run) => run.status !== '未出発');
    const actionLabel = attendancePlan === '欠席' ? '欠席として登録' : '利用予定へ戻す';
    if (!window.confirm(`${selectedChild.name}さんを${actionLabel}しますか？${attendancePlan === '欠席' && affectedRuns.length ? `\n未出発の送迎 ${affectedRuns.filter((run) => run.status === '未出発').length}便からも除外します。` : ''}`)) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const existing = dailyChildPlans.find((plan) => plan.childId === selectedChild.id && plan.date === date);
      const weekday = getWeekdayFromDate(date);
      const holidayLike = weekday === '土' || weekday === '日';
      const now = new Date().toISOString();
      const plan: DailyChildPlan = existing ? {
        ...existing,
        attendancePlan,
        updatedAt: now,
      } : {
        id:
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `daily-plan-${Date.now()}`,
        childId: selectedChild.id,
        date,
        attendancePlan,
        serviceCategory: holidayLike ? '休日' : '平日',
        recordFormat: holidayLike ? '休日' : '平日',
        dayPattern: '通常',
        hasMorningProgram: holidayLike,
        hasLunch: holidayLike,
        hasAfternoonProgram: true,
        hasSnack: true,
        schoolEndTime: selectedChild.transportSchedule?.find((schedule) => schedule.weekday === weekday)?.schoolEndTime,
        departureTime: getDefaultDepartureTime(selectedChild, holidayLike ? '休日' : '平日', routeSettings),
        createdAt: now,
        updatedAt: now,
      };
      await onSaveDailyChildPlan(plan);

      if (attendancePlan === '欠席') {
        for (const run of affectedRuns.filter((candidate) => candidate.status === '未出発')) {
          const stops = run.stops.filter((stop) => stop.childId !== selectedChild.id).map((stop, index) => ({ ...stop, order: index + 1 }));
          if (stops.length === 0) await onDeleteTransportRun(run.id);
          else await onSaveTransportRun({ ...run, stops, updatedAt: now });
        }
      }
      setMessage(attendancePlan === '欠席'
        ? `${selectedChild.name}さんを欠席登録しました。記録候補と未出発の送迎便へ反映しました。${runningRuns.length ? ` 運行中の${runningRuns.length}便は安全のため変更していません。` : ''}`
        : `${selectedChild.name}さんを利用予定へ戻しました。必要な送迎便は「利用予定／送迎管理」から追加してください。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '当日予定を変更できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  const changeAssignment = async () => {
    if (!selectedRun) return setError('変更する送迎便を選択してください。');
    if (!actorId || !pin.trim()) return setError('操作する指導員と個人PINを入力してください。');
    if (!driverId) return setError('変更後の運転担当を選択してください。');
    const driver = activeRecorders.find((recorder) => recorder.id === driverId);
    if (!driver) return setError('変更後の運転担当を確認できません。');
    if (!window.confirm(`${selectedRun.name}の運転担当を「${driver.displayName}」へ変更しますか？`)) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await onChangeTransportAssignment({
        runId: selectedRun.id,
        actorRecorderProfileId: actorId,
        actorPin: pin,
        driverRecorderProfileId: driver.id,
        assistantRecorderProfileIds: selectedRun.assistantRecorderProfileIds,
        reason: reason.trim() || '当日変更',
      });
      setPin('');
      setMessage(`${selectedRun.name}の運転担当を${driver.displayName}へ変更しました。他端末にも共有されます。`);
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : '送迎担当を変更できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-700">{date.replaceAll('-', '/')}・例外対応</p>
        <h2 className="mt-1 text-lg font-black text-slate-950">何を変更しますか？</h2>
        <p className="mt-1 text-xs text-slate-500">通常設定を書き換えず、今日だけの変更として記録します。</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1.5">
        <button type="button" onClick={() => { setMode('absence'); setMessage(''); setError(''); }} className={`min-h-11 rounded-lg text-sm font-black ${mode === 'absence' ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-500'}`}>急な欠席</button>
        <button type="button" onClick={() => { setMode('transport'); setMessage(''); setError(''); }} className={`min-h-11 rounded-lg text-sm font-black ${mode === 'transport' ? 'bg-white text-sky-800 shadow-sm' : 'text-slate-500'}`}>送迎担当の交代</button>
      </div>

      {mode === 'absence' ? (
        <div className="mt-4 space-y-4">
          <label className="block text-xs font-black text-slate-700">対象児童
            <select value={childId} onChange={(event) => setChildId(event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base">
              <option value="">児童を選択してください</option>
              {activeChildren.map((child) => <option key={child.id} value={child.id}>{child.name}{dailyChildPlans.some((plan) => plan.childId === child.id && plan.date === date && plan.attendancePlan === '欠席') ? '（欠席登録済み）' : ''}</option>)}
            </select>
          </label>
          {selectedChild && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
              欠席登録すると、記録作成の候補から除外し、未出発の送迎便からも自動で外します。出発済みの便は安全のため変更せず警告します。
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy || !selectedChild} onClick={() => void saveAbsence('欠席')} className="min-h-12 rounded-xl bg-rose-600 px-4 text-sm font-black text-white disabled:bg-slate-300">欠席として登録</button>
            <button type="button" disabled={busy || !selectedChild} onClick={() => void saveAbsence('利用予定')} className="min-h-12 rounded-xl border border-teal-300 bg-white px-4 text-sm font-black text-teal-800 disabled:text-slate-300">利用予定へ戻す</button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="block text-xs font-black text-slate-700 lg:col-span-2">変更する送迎便
            <select value={runId} onChange={(event) => { const nextRun = dayRuns.find((run) => run.id === event.target.value); setRunId(event.target.value); setDriverId(nextRun?.driverRecorderProfileId || ''); }} className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base">
              <option value="">送迎便を選択してください</option>
              {dayRuns.map((run) => <option key={run.id} value={run.id}>{run.startTime} {run.name}・現在 {run.driverName || '担当未設定'}・{run.status}</option>)}
            </select>
          </label>
          <label className="block text-xs font-black text-slate-700">変更後の運転担当
            <select value={driverId} onChange={(event) => setDriverId(event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base"><option value="">選択してください</option>{activeRecorders.map((recorder) => <option key={recorder.id} value={recorder.id}>{recorder.displayName}</option>)}</select>
          </label>
          <label className="block text-xs font-black text-slate-700">変更理由
            <input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base" />
          </label>
          <label className="block text-xs font-black text-slate-700">操作する指導員
            <select value={actorId} onChange={(event) => setActorId(event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base"><option value="">選択してください</option>{activeRecorders.map((recorder) => <option key={recorder.id} value={recorder.id}>{recorder.displayName}</option>)}</select>
          </label>
          <label className="block text-xs font-black text-slate-700">個人PIN
            <input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(event) => setPin(event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base" />
          </label>
          <button type="button" disabled={busy || !selectedRun || !driverId || !actorId || !pin} onClick={() => void changeAssignment()} className="min-h-12 rounded-xl bg-sky-800 px-4 text-sm font-black text-white disabled:bg-slate-300 lg:col-span-2">確認して担当を変更</button>
        </div>
      )}
      {message && <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold leading-relaxed text-emerald-900" role="status">{message}</p>}
      {error && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold leading-relaxed text-rose-900" role="alert">{error}</p>}
    </section>
  );
}

function WorkspaceBackBar({ title, guide, onBack }: { title: string; guide: QuickGuideContent; onBack: () => void }) {
  return (
    <div className="flex min-h-14 items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      <button type="button" onClick={onBack} className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-black text-teal-800 hover:bg-teal-50">
        <ArrowLeft className="h-4 w-4" />機能を選び直す
      </button>
      <span className="h-6 w-px bg-slate-200" />
      <strong className="min-w-0 truncate text-sm text-slate-900">{title}</strong>
      <span className="ml-auto"><QuickGuide content={guide} compact /></span>
    </div>
  );
}

function WorkspaceCard({
  icon: Icon,
  title,
  description,
  meta,
  tone,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  meta: string;
  tone: 'teal' | 'sky' | 'amber' | 'indigo' | 'violet';
  onClick: () => void;
}) {
  const tones = {
    teal: 'bg-teal-50 text-teal-700 group-hover:bg-teal-100',
    sky: 'bg-sky-50 text-sky-700 group-hover:bg-sky-100',
    amber: 'bg-amber-50 text-amber-700 group-hover:bg-amber-100',
    indigo: 'bg-indigo-50 text-indigo-700 group-hover:bg-indigo-100',
    violet: 'bg-violet-50 text-violet-700 group-hover:bg-violet-100',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-28 w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"
    >
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition-colors ${tones[tone]}`}><Icon className="h-6 w-6" /></span>
      <span className="min-w-0 flex-1">
        <strong className="block text-base text-slate-950">{title}</strong>
        <span className="mt-1 block text-xs text-slate-500">{description}</span>
        <span className="mt-2 block text-[10px] font-black text-teal-700">{meta}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function AttentionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex min-h-9 items-center gap-1 rounded-xl border border-amber-300 bg-white px-3 text-xs font-black text-amber-900 hover:bg-amber-100">{label}<ChevronRight className="h-3.5 w-3.5" /></button>;
}

function CommunicationTab({ active, icon: Icon, label, badge, onClick }: { active: boolean; icon: React.ElementType; label: string; badge: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`relative flex min-h-12 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-black ${active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>
      <Icon className={`h-4 w-4 ${active ? 'text-teal-300' : 'text-teal-600'}`} />{label}
      {badge > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${active ? 'bg-white/15 text-white' : 'bg-amber-100 text-amber-800'}`}>{badge}</span>}
    </button>
  );
}

function homeEventOccursOn(event: CalendarEvent, date: string) {
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
