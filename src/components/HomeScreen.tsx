import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  ClipboardPenLine,
  ClipboardList,
  History,
  LoaderCircle,
  PlusCircle,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import type {
  ChildProfile,
  Announcement,
  AnnouncementConfirmation,
  AttendanceCorrectionRequest,
  AttendanceRecord,
  CalendarEvent,
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
  TransportRouteSettings,
  TransportRunStatus,
  UserProfile,
  Vehicle,
} from '../types';
import type { ActiveTab } from './Header';
import { executeHomeAssistantProposal, requestHomeAssistantProposal } from '../services/homeAssistantService';
import { DailyOperationsPanel } from './DailyOperationsPanel';
import { HandoverPanel } from './HandoverPanel';
import { MorningMeetingPanel } from './MorningMeetingPanel';
import { AnnouncementPanel } from './AnnouncementPanel';
import { TodayWorkPanel } from './TodayWorkPanel';
import { getLocalDateString } from '../utils/weekdays';

interface HomeScreenProps {
  records: SupportRecord[];
  announcements: Announcement[];
  announcementConfirmations: AnnouncementConfirmation[];
  childrenList: ChildProfile[];
  drafts: RecordDraftSummary[];
  recorderProfiles: RecorderProfile[];
  staffScheduleItems: StaffScheduleItem[];
  calendarEvents: CalendarEvent[];
  attendanceRecords: AttendanceRecord[];
  attendanceCorrections: AttendanceCorrectionRequest[];
  vehicles: Vehicle[];
  transportRuns: TransportRun[];
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
  onViewDraft: (draftKey: string, ownerName?: string) => void;
  onTakeOverDraft: (draftKey: string, ownerName: string | undefined, childId: string) => void;
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
  onSaveAttendance: (record: AttendanceRecord) => Promise<void> | void;
  onPunchAttendance: (recorder: RecorderProfile, pin: string, action: '出勤' | '退勤' | '休憩開始' | '休憩終了') => Promise<void> | void;
  onRequestAttendanceCorrection: (record: AttendanceRecord, pin: string, clockIn: string | undefined, clockOut: string | undefined, reason: string) => Promise<void> | void;
  onReviewAttendanceCorrection: (request: AttendanceCorrectionRequest, approved: boolean, note?: string) => Promise<void> | void;
  onSaveVehicle: (vehicle: Vehicle) => Promise<void> | void;
  onDeleteVehicle: (vehicleId: string) => Promise<void> | void;
  onSaveTransportRun: (run: TransportRun) => Promise<void> | void;
  onDeleteTransportRun: (runId: string) => Promise<void> | void;
  onSaveTransportRouteSettings: (settings: TransportRouteSettings) => Promise<void> | void;
  onUpdateTransportStatus: (run: TransportRun, recorder: RecorderProfile, pin: string, status: TransportRunStatus) => Promise<void> | void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  records,
  announcements,
  announcementConfirmations,
  childrenList,
  drafts,
  recorderProfiles,
  staffScheduleItems,
  calendarEvents,
  attendanceRecords,
  attendanceCorrections,
  vehicles,
  transportRuns,
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
  onTakeOverDraft,
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
  onSaveAttendance,
  onPunchAttendance,
  onRequestAttendanceCorrection,
  onReviewAttendanceCorrection,
  onSaveVehicle,
  onDeleteVehicle,
  onSaveTransportRun,
  onDeleteTransportRun,
  onSaveTransportRouteSettings,
  onUpdateTransportStatus,
}) => {
  const [activePanel, setActivePanel] = useState<'todayWork' | 'operations' | 'morning' | 'handover' | 'assistant'>('todayWork');
  const today = getLocalDateString();
  const todayRecords = records.filter((record) => record.date === today);
  const unapproved = records.filter((record) => record.approvalStatus === '未確認');
  const recentRecords = [...records]
    .sort((a, b) => `${b.date}${b.updatedAt}`.localeCompare(`${a.date}${a.updatedAt}`))
    .slice(0, 3);
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

  return (
    <div className="max-w-6xl mx-auto space-y-4">
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
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 text-white shadow-sm">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-300">今日のホーム</p>
            <h2 className="mt-1 text-lg font-black sm:text-xl">{activeRecorder?.displayName || currentUser?.displayName || '職員'}さん、お疲れさまです。</h2>
            <p className="mt-1 text-xs text-slate-300">記録と本日の業務をここから確認できます。</p>
          </div>
          <button type="button" onClick={onNewRecord} className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-400 px-5 text-sm font-black text-slate-950 shadow-lg shadow-slate-950/20 hover:bg-teal-300">
            <PlusCircle className="w-5 h-5" />新しい記録を作成
          </button>
        </div>
        <div className="grid grid-cols-4 border-t border-white/10 bg-white/[0.04]">
          <StatusCard icon={CalendarDays} label="本日記録" value={`${todayRecords.length}件`} tone="teal" />
          <StatusCard icon={Users} label="登録児童" value={`${childrenList.length}名`} tone="blue" />
          <StatusCard icon={ClipboardList} label="未確認" value={`${unapproved.length}件`} tone="amber" />
          <StatusCard icon={CheckCircle2} label="確認済" value={`${records.filter((record) => record.approvalStatus === '確認済み').length}件`} tone="emerald" />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex items-center justify-between px-2 pb-2 pt-1">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-700">業務メニュー</p>
            <p className="mt-0.5 text-[10px] text-slate-500">目的を選ぶと内容が切り替わります</p>
          </div>
          <span className="hidden text-[10px] font-bold text-slate-400 sm:block">機能はここに集約されています</span>
        </div>
        <div className="grid grid-cols-3 gap-1 sm:grid-cols-5" role="tablist" aria-label="ホーム機能">
          <HomePanelButton
            active={activePanel === 'todayWork'}
            icon={CalendarDays}
            label="本日の業務"
            badge={staffScheduleItems.some((item) => item.date === today) || transportRuns.some((run) => run.date === today) ? '予定あり' : undefined}
            onClick={() => setActivePanel('todayWork')}
          />
          <HomePanelButton
            active={activePanel === 'operations'}
            icon={ClipboardList}
            label="記録状況"
            badge={drafts.length > 0 ? `${drafts.length}件入力中` : undefined}
            onClick={() => setActivePanel('operations')}
          />
          <HomePanelButton
            active={activePanel === 'morning'}
            icon={ClipboardPenLine}
            label="朝礼記録"
            badge={hasMorningMeetingRecord ? '入力あり' : undefined}
            onClick={() => setActivePanel('morning')}
          />
          <HomePanelButton
            active={activePanel === 'handover'}
            icon={ClipboardList}
            label="申し送り"
            badge={openHandovers > 0 ? `${openHandovers}件` : undefined}
            onClick={() => setActivePanel('handover')}
          />
          <HomePanelButton
            active={activePanel === 'assistant'}
            icon={Bot}
            label="AIアシスタント"
            onClick={() => setActivePanel('assistant')}
          />
        </div>
      </section>

      <div role="tabpanel">
        {activePanel === 'todayWork' && (
          <TodayWorkPanel
            staffScheduleItems={staffScheduleItems}
            calendarEvents={calendarEvents}
            attendanceRecords={attendanceRecords}
            attendanceCorrections={attendanceCorrections}
            vehicles={vehicles}
            transportRuns={transportRuns}
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
            onSaveTransportRun={onSaveTransportRun}
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
            currentUserId={currentUser?.id}
            currentRecorderId={activeRecorder?.id}
            canManageDrafts={canManageSettings}
            onStartRecord={onStartRecord}
            onResumeDraft={onResumeDraft}
            onViewDraft={onViewDraft}
            onTakeOverDraft={onTakeOverDraft}
            onDeleteDraft={onDeleteDraft}
            onOpenRecord={onOpenRecord}
          />
        )}

        {activePanel === 'handover' && (
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

        {activePanel === 'morning' && (
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

        {activePanel === 'assistant' && (
          <HomeAssistantPanel childrenList={childrenList} onExecuted={onAssistantExecuted} />
        )}
      </div>

      <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
          <span className="flex items-center gap-2 font-bold text-slate-900"><History className="w-5 h-5 text-teal-600" />最近の記録</span>
          <span className="flex items-center gap-2 text-xs font-bold text-teal-700">{recentRecords.length}件を表示<ArrowRight className="h-4 w-4 transition-transform group-open:rotate-90" /></span>
        </summary>
        <div className="border-t border-slate-100 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">直近に更新された支援記録です。</p>
            <button type="button" onClick={() => onNavigate('records')} className="text-xs font-bold text-teal-700 flex items-center gap-1">一覧を見る<ArrowRight className="w-4 h-4" /></button>
          </div>
          <div className="mt-2 divide-y divide-slate-100">
            {recentRecords.length === 0 && <p className="py-5 text-center text-sm text-slate-400">まだ記録がありません。</p>}
            {recentRecords.map((record) => (
              <button key={record.id} type="button" onClick={() => onNavigate('records')} className="flex w-full items-center justify-between gap-3 py-2.5 text-left">
                <span><strong className="block text-sm text-slate-900">{record.childName}</strong><span className="text-xs text-slate-500">{record.date}・{record.templateName}</span></span>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${record.approvalStatus === '確認済み' ? 'bg-emerald-100 text-emerald-800' : record.approvalStatus === '要修正' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{record.approvalStatus}</span>
              </button>
            ))}
          </div>
        </div>
      </details>
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
    start_support_record: '記録作成',
    open_child_records: '記録一覧',
    summarize_recent_records: '最近の記録要約',
  };
  return labels[actionType];
}

function StatusCard({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone: 'teal' | 'blue' | 'amber' | 'emerald' }) {
  const tones = { teal: 'text-teal-300', blue: 'text-sky-300', amber: 'text-amber-300', emerald: 'text-emerald-300' };
  return <div className="flex min-w-0 items-center justify-center gap-2 border-r border-white/10 px-1 py-2.5 last:border-r-0 sm:px-3"><Icon className={`hidden h-4 w-4 shrink-0 sm:block ${tones[tone]}`} /><div className="min-w-0 text-center sm:text-left"><p className="truncate text-[9px] font-bold text-slate-400 sm:text-[10px]">{label}</p><p className="text-sm font-black leading-tight text-white sm:text-base">{value}</p></div></div>;
}

function HomePanelButton({
  active,
  icon: Icon,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  icon: React.ElementType;
  label: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-xl px-1 text-[10px] font-black transition-colors sm:gap-2 sm:px-2 sm:text-xs ${
        active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <Icon className={`h-4 w-4 ${active ? 'text-teal-300' : 'text-teal-600'}`} />
      <span className="whitespace-nowrap">{label}</span>
      {badge && (
        <span className={`hidden rounded-full px-1.5 py-0.5 text-[9px] sm:inline-flex ${active ? 'bg-white/15 text-white' : 'bg-amber-100 text-amber-800'}`}>
          {badge}
        </span>
      )}
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
