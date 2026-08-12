import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  AlertTriangle,
  Bell,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardPenLine,
  ClipboardList,
  LoaderCircle,
  MessageSquareText,
  PlusCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
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
  RecordDraftSummary,
  RecorderProfile,
  StaffScheduleItem,
  SupportRecord,
  TransportRun,
  TransportAssignmentChangeInput,
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
import { getLocalDateString } from '../utils/weekdays';

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
  drafts: RecordDraftSummary[];
  recorderProfiles: RecorderProfile[];
  staffScheduleItems: StaffScheduleItem[];
  calendarEvents: CalendarEvent[];
  dailyChildPlans: DailyChildPlan[];
  attendanceRecords: AttendanceRecord[];
  attendanceCorrections: AttendanceCorrectionRequest[];
  vehicles: Vehicle[];
  transportRuns: TransportRun[];
  transportPlanDays: TransportPlanDay[];
  dailyTransportRequirements: DailyTransportRequirement[];
  transportRouteSettings: TransportRouteSettings;
  handoverItems: HandoverItem[];
  handoverConfirmations: HandoverConfirmation[];
  morningMeetingRecords: MorningMeetingRecord[];
  morningMeetingTemplates: MorningMeetingTemplate[];
  morningMeetingConfirmations: MorningMeetingConfirmation[];
  organizationId?: string;
  activeRecorder?: RecorderProfile;
  currentUser?: UserProfile | null;
  canManageSettings: boolean;
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
  onSaveAttendance: (record: AttendanceRecord) => Promise<void> | void;
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
  onUpdateTransportStatus: (run: TransportRun, recorder: RecorderProfile, pin: string, status: TransportRunStatus) => Promise<void> | void;
}

export type HomeWorkspace = 'menu' | 'todayWork' | 'operations' | 'communication' | 'assistant';
type CommunicationView = 'announcements' | 'morning' | 'handover';

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
  drafts,
  recorderProfiles,
  staffScheduleItems,
  calendarEvents,
  dailyChildPlans,
  attendanceRecords,
  attendanceCorrections,
  vehicles,
  transportRuns,
  transportPlanDays,
  dailyTransportRequirements,
  transportRouteSettings,
  handoverItems,
  handoverConfirmations,
  morningMeetingRecords,
  morningMeetingTemplates,
  morningMeetingConfirmations,
  organizationId,
  activeRecorder,
  currentUser,
  canManageSettings,
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
  onSaveAttendance,
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
  onUpdateTransportStatus,
}) => {
  const [communicationView, setCommunicationView] = useState<CommunicationView>('announcements');

  useEffect(() => {
    if (announcementFocusToken > 0) setCommunicationView('announcements');
  }, [announcementFocusToken]);

  const today = getLocalDateString();
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
    const absentStaff = work.filter((record) => ['欠勤', '有給', '公休'].includes(record.status)).map((record) => record.recorderName);
    const absentChildren = events.filter((event) => event.eventType === '欠席').flatMap((event) => event.childIds).map((id) => childrenList.find((child) => child.id === id)?.name).filter(Boolean);
    return [
      `出勤予定 ${work.filter((record) => !['欠勤', '有給', '公休'].includes(record.status)).length}名${absentStaff.length ? `／欠勤・休暇 ${absentStaff.join('、')}` : ''}`,
      `送迎 ${runs.length}便（${runs.map((run) => run.name).join('、') || 'なし'}）`,
      `追加利用 ${events.filter((event) => event.eventType === '追加利用').flatMap((event) => event.childIds).length}名／欠席 ${absentChildren.length}名${absentChildren.length ? `（${absentChildren.join('、')}）` : ''}`,
      `会議・研修・面談・行事 ${events.filter((event) => ['会議', '研修', '保護者面談', '学校行事', '事業所行事'].includes(event.eventType)).length}件`,
    ];
  }, [attendanceRecords, calendarEvents, childrenList, today, transportRuns]);
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
    <div className="max-w-6xl mx-auto space-y-4">
      {activePanel === 'menu' ? (
        <>
          <section className="rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-4 text-white shadow-lg sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-300">{today.replaceAll('-', '/')}・ホーム</p>
                <h2 className="mt-1 text-lg font-black sm:text-xl">今日の業務を選択</h2>
                <p className="mt-1 text-[10px] font-bold text-slate-300">操作担当は画面右上でいつでも確認・切替できます。</p>
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                <button type="button" onClick={() => resumableDraft ? onResumeDraft(resumableDraft.draftKey) : onNewRecord()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-400 px-4 text-sm font-black text-slate-950 shadow-md hover:bg-teal-300">
                  {resumableDraft ? <RotateCcw className="h-5 w-5" /> : <PlusCircle className="h-5 w-5" />}
                  {resumableDraft ? '記録を再開' : '記録を始める'}
                </button>
                <button type="button" onClick={() => onNavigate('records')} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/15">
                  <ClipboardList className="h-5 w-5" />記録一覧
                </button>
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

          <section>
            <div className="mb-3 px-1">
              <h3 className="text-base font-black text-slate-950">確認したい内容を選ぶ</h3>
              <p className="mt-0.5 text-xs text-slate-500">選んだ内容だけを次の画面に表示します。</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <WorkspaceCard icon={CalendarDays} title="本日の業務" description="職員配置・予定・出勤・送迎" meta={todayWorkCount > 0 ? `${todayWorkCount}件の予定` : '予定を確認'} tone="teal" onClick={() => setActivePanel('todayWork')} />
              <WorkspaceCard icon={ClipboardList} title="記録状況" description="利用児童・入力中・保存済み" meta={`本日 ${todayRecords.length}件／入力中 ${drafts.length}件${carriedOverDrafts.length > 0 ? `／持越し ${carriedOverDrafts.length}件` : ''}`} tone="sky" onClick={() => setActivePanel('operations')} />
              <WorkspaceCard icon={MessageSquareText} title="共有・連絡" description="お知らせ・朝礼・申し送り" meta={`${visibleAnnouncements.length + openHandovers}件を確認`} tone="amber" onClick={() => setActivePanel('communication')} />
              <WorkspaceCard icon={Bot} title="AIアシスタント" description="児童情報の変更や記録の整理" meta="実行前に内容を確認" tone="indigo" onClick={() => setActivePanel('assistant')} />
            </div>
          </section>
        </>
      ) : (
        <>
          <WorkspaceBackBar
            title={activePanel === 'todayWork' ? '本日の業務' : activePanel === 'operations' ? '記録状況' : activePanel === 'communication' ? '共有・連絡' : 'AIアシスタント'}
            onBack={() => setActivePanel('menu')}
          />
          <div key={activePanel} className="ui-panel-enter" role="region" aria-label={activePanel === 'todayWork' ? '本日の業務' : activePanel === 'operations' ? '記録状況' : activePanel === 'communication' ? '共有・連絡' : 'AIアシスタント'}>
        {activePanel === 'todayWork' && (
          <TodayWorkPanel
            staffScheduleItems={staffScheduleItems}
            calendarEvents={calendarEvents}
            dailyChildPlans={dailyChildPlans}
            attendanceRecords={attendanceRecords}
            attendanceCorrections={attendanceCorrections}
            vehicles={vehicles}
            transportRuns={transportRuns}
            transportPlanDays={transportPlanDays}
            dailyTransportRequirements={dailyTransportRequirements}
            transportRouteSettings={transportRouteSettings}
            recorderProfiles={recorderProfiles}
            childrenList={childrenList}
            activeRecorder={activeRecorder}
            canManage={canManageSettings}
            onSaveStaffSchedule={onSaveStaffSchedule}
            onDeleteStaffSchedule={onDeleteStaffSchedule}
            onSaveCalendarEvent={onSaveCalendarEvent}
            onDeleteCalendarEvent={onDeleteCalendarEvent}
            onSaveAttendance={onSaveAttendance}
            onPunchAttendance={onPunchAttendance}
            onRequestAttendanceCorrection={onRequestAttendanceCorrection}
            onReviewAttendanceCorrection={onReviewAttendanceCorrection}
            onSaveVehicle={onSaveVehicle}
            onDeleteVehicle={onDeleteVehicle}
            onSaveTransportPlanDay={onSaveTransportPlanDay}
            onSaveDailyTransportRequirements={onSaveDailyTransportRequirements}
            onReplaceMonthlyTransportRequirements={onReplaceMonthlyTransportRequirements}
            onReplaceChildMonthlyTransportRequirements={onReplaceChildMonthlyTransportRequirements}
            onSaveDailyChildPlan={onSaveDailyChildPlan}
            onDeleteDailyChildPlan={onDeleteDailyChildPlan}
            onDeleteDailyTransportRequirement={onDeleteDailyTransportRequirement}
            onSaveTransportRun={onSaveTransportRun}
            onChangeTransportAssignment={onChangeTransportAssignment}
            onDeleteTransportRun={onDeleteTransportRun}
            onSaveTransportRouteSettings={onSaveTransportRouteSettings}
            onUpdateTransportStatus={onUpdateTransportStatus}
          />
        )}

        {activePanel === 'operations' && (
          <DailyOperationsPanel
            childrenList={childrenList}
            records={records}
            drafts={drafts}
            dailyChildPlans={dailyChildPlans}
            transportRouteSettings={transportRouteSettings}
            targetDate={recordStatusDate}
            onTargetDateChange={onRecordStatusDateChange}
            currentUserId={currentUser?.id}
            currentRecorderId={activeRecorder?.id}
            canManageDrafts={canManageSettings}
            onStartRecord={onStartRecord}
            onResumeDraft={onResumeDraft}
            onViewDraft={onViewDraft}
            onTakeOverDrafts={onTakeOverDrafts}
            onDeleteDraft={onDeleteDraft}
            onOpenRecord={onOpenRecord}
            onSaveDailyChildPlan={onSaveDailyChildPlan}
            onDeleteDailyChildPlan={onDeleteDailyChildPlan}
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
                  canArchive={canManageSettings}
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
                  canManageTemplates={canManageSettings}
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

function WorkspaceBackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex min-h-14 items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      <button type="button" onClick={onBack} className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-black text-teal-800 hover:bg-teal-50">
        <ArrowLeft className="h-4 w-4" />機能を選び直す
      </button>
      <span className="h-6 w-px bg-slate-200" />
      <strong className="min-w-0 truncate text-sm text-slate-900">{title}</strong>
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
  tone: 'teal' | 'sky' | 'amber' | 'indigo';
  onClick: () => void;
}) {
  const tones = {
    teal: 'bg-teal-50 text-teal-700 group-hover:bg-teal-100',
    sky: 'bg-sky-50 text-sky-700 group-hover:bg-sky-100',
    amber: 'bg-amber-50 text-amber-700 group-hover:bg-amber-100',
    indigo: 'bg-indigo-50 text-indigo-700 group-hover:bg-indigo-100',
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
