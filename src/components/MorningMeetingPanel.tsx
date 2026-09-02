import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardPenLine,
  Clock3,
  Copy,
  FilePlus2,
  GitMerge,
  ListPlus,
  LoaderCircle,
  MousePointer2,
  PencilLine,
  Radio,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { MorningMeetingConflictError } from '../services/dataService';
import type {
  MorningMeetingConfirmation,
  MorningMeetingRecord,
  MorningMeetingTemplate,
  RecorderProfile,
  UserProfile,
} from '../types';
import { getLocalDateString } from '../utils/weekdays';

interface MorningMeetingPanelProps {
  records: MorningMeetingRecord[];
  templates: MorningMeetingTemplate[];
  confirmations: MorningMeetingConfirmation[];
  recorderProfiles: RecorderProfile[];
  organizationId?: string;
  activeRecorder?: RecorderProfile;
  currentUser?: UserProfile | null;
  canManageTemplates: boolean;
  dailySummary?: string[];
  onSave: (record: MorningMeetingRecord) => Promise<MorningMeetingRecord>;
  onSaveTemplate: (template: MorningMeetingTemplate) => Promise<void> | void;
  onArchiveTemplate: (templateId: string) => Promise<void> | void;
  onSetConfirmation: (
    confirmation: MorningMeetingConfirmation,
    confirmed: boolean
  ) => Promise<void> | void;
}

const QUICK_SECTIONS = ['本日の予定', '欠席・追加利用', '送迎確認', '児童対応', '職員連絡', '安全確認'];
const CURSOR_COLORS = ['#0f766e', '#2563eb', '#7c3aed', '#c2410c', '#be123c', '#047857', '#a21caf'];

interface CollaboratorActivity {
  sessionId: string;
  userKey: string;
  editorName: string;
  color: string;
  cursorStart: number;
  cursorEnd: number;
  typing: boolean;
  focused: boolean;
  lastActiveAt: string;
}

interface MorningMeetingConflict {
  latestRecord?: MorningMeetingRecord;
  localContent: string;
  baseContent: string;
}

interface RemoteLiveDraft {
  sessionId: string;
  editorName: string;
  content: string;
  baseRevision: number;
  activity: CollaboratorActivity;
  lastActiveAt: string;
}

interface PendingContentBroadcast {
  content: string;
  baseRevision: number;
  activity: CollaboratorActivity;
}

type RealtimeConnectionStatus = 'local' | 'connecting' | 'connected' | 'disconnected';

function createSessionId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getCursorColor(identity: string) {
  const hash = Array.from(identity).reduce((total, character) => total + character.charCodeAt(0), 0);
  return CURSOR_COLORS[hash % CURSOR_COLORS.length];
}

function parseCollaboratorActivity(value: unknown): CollaboratorActivity | null {
  if (!value || typeof value !== 'object') return null;
  const activity = value as Record<string, unknown>;
  if (typeof activity.sessionId !== 'string' || typeof activity.editorName !== 'string') return null;
  return {
    sessionId: activity.sessionId,
    userKey: typeof activity.userKey === 'string' ? activity.userKey : activity.sessionId,
    editorName: activity.editorName.slice(0, 100),
    color: typeof activity.color === 'string' ? activity.color : getCursorColor(activity.sessionId),
    cursorStart: typeof activity.cursorStart === 'number' ? Math.max(0, activity.cursorStart) : 0,
    cursorEnd: typeof activity.cursorEnd === 'number' ? Math.max(0, activity.cursorEnd) : 0,
    typing: activity.typing === true,
    focused: activity.focused === true,
    lastActiveAt: typeof activity.lastActiveAt === 'string'
      ? activity.lastActiveAt
      : new Date().toISOString(),
  };
}

function upsertCollaborator(
  collaborators: CollaboratorActivity[],
  incoming: CollaboratorActivity
) {
  return [
    ...collaborators.filter((collaborator) => collaborator.sessionId !== incoming.sessionId),
    incoming,
  ];
}

function upsertRemoteLiveDraft(drafts: RemoteLiveDraft[], incoming: RemoteLiveDraft) {
  return [
    ...drafts.filter((draft) => draft.sessionId !== incoming.sessionId),
    incoming,
  ].sort((left, right) => right.lastActiveAt.localeCompare(left.lastActiveAt));
}

function getCursorPositionLabel(content: string, activity: CollaboratorActivity) {
  const cursorStart = Math.min(content.length, activity.cursorStart);
  const cursorEnd = Math.min(content.length, activity.cursorEnd);
  const beforeCursor = content.slice(0, cursorStart);
  const lines = beforeCursor.split('\n');
  const line = lines.length;
  const column = Array.from(lines.at(-1) || '').length + 1;
  const selectionLength = Math.abs(cursorEnd - cursorStart);
  return selectionLength > 0
    ? `${line}行${column}列から${selectionLength}文字を選択`
    : `${line}行${column}列`;
}

function isConfirmationCurrent(confirmedAt: string, updatedAt?: string) {
  if (!updatedAt) return false;
  const confirmedTime = Date.parse(confirmedAt);
  const updatedTime = Date.parse(updatedAt);
  if (Number.isNaN(confirmedTime) || Number.isNaN(updatedTime)) {
    return confirmedAt >= updatedAt;
  }
  return confirmedTime >= updatedTime;
}

function combineConflictingContent(localContent: string, remoteContent: string, remoteEditor: string) {
  if (!remoteContent.trim() || localContent === remoteContent || localContent.includes(remoteContent)) {
    return localContent;
  }
  if (!localContent.trim() || remoteContent.includes(localContent)) return remoteContent;
  return `${localContent.trimEnd()}\n\n【${remoteEditor}さんの更新内容・要確認】\n${remoteContent.trimStart()}`;
}

function RemoteCursorOverlay({
  content,
  collaborators,
  scrollTop,
  scrollLeft,
}: {
  content: string;
  collaborators: CollaboratorActivity[];
  scrollTop: number;
  scrollLeft: number;
}) {
  const cursorGroups = new Map<number, CollaboratorActivity[]>();
  collaborators
    .filter((collaborator) => collaborator.focused)
    .forEach((collaborator) => {
      const position = Math.min(content.length, collaborator.cursorStart);
      cursorGroups.set(position, [...(cursorGroups.get(position) || []), collaborator]);
    });
  if (cursorGroups.size === 0) return null;

  const nodes: React.ReactNode[] = [];
  let contentIndex = 0;
  [...cursorGroups.entries()]
    .sort(([left], [right]) => left - right)
    .forEach(([position, activities]) => {
      if (position > contentIndex) {
        nodes.push(
          <React.Fragment key={`text-${contentIndex}`}>
            {content.slice(contentIndex, position)}
          </React.Fragment>
        );
      }
      activities.forEach((activity, index) => {
        nodes.push(
          <span
            key={`${activity.sessionId}-${position}`}
            className="relative inline-block h-6 w-0 align-bottom border-l-[3px]"
            style={{ borderColor: activity.color, zIndex: activities.length - index }}
          >
            <span
              className="absolute -top-4 left-0 max-w-28 truncate rounded px-1 py-0.5 text-[8px] font-black leading-none text-white shadow-sm"
              style={{ backgroundColor: activity.color }}
            >
              {activity.editorName}
            </span>
          </span>
        );
      });
      contentIndex = position;
    });
  nodes.push(
    <React.Fragment key={`text-${contentIndex}-end`}>
      {content.slice(contentIndex) || '\u200b'}
    </React.Fragment>
  );

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-[2px] z-20 overflow-hidden rounded-[14px]">
      <div
        className="min-h-full w-full whitespace-pre-wrap break-words p-4 text-sm leading-7 text-transparent"
        style={{ transform: `translate(${-scrollLeft}px, ${-scrollTop}px)` }}
      >
        {nodes}
      </div>
    </div>
  );
}

export const MorningMeetingPanel: React.FC<MorningMeetingPanelProps> = ({
  records,
  templates,
  confirmations,
  recorderProfiles,
  organizationId,
  activeRecorder,
  currentUser,
  canManageTemplates,
  dailySummary = [],
  onSave,
  onSaveTemplate,
  onArchiveTemplate,
  onSetConfirmation,
}) => {
  const [targetDate, setTargetDate] = useState(getLocalDateString());
  const selectedRecord = useMemo(
    () => records.find((record) => record.date === targetDate),
    [records, targetDate]
  );
  const [content, setContent] = useState(selectedRecord?.content || '');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'remote' | 'live' | 'conflict'>('idle');
  const [viewerCount, setViewerCount] = useState(1);
  const [collaborators, setCollaborators] = useState<CollaboratorActivity[]>([]);
  const [editorScroll, setEditorScroll] = useState({ top: 0, left: 0 });
  const [remoteEditor, setRemoteEditor] = useState('');
  const [conflict, setConflict] = useState<MorningMeetingConflict | null>(null);
  const [remoteLiveDrafts, setRemoteLiveDrafts] = useState<RemoteLiveDraft[]>([]);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeConnectionStatus>(
    organizationId ? 'connecting' : 'local'
  );
  const [copied, setCopied] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showPreparation, setShowPreparation] = useState(false);
  const [showConfirmationDetails, setShowConfirmationDetails] = useState(false);
  const [showCollaborationDetails, setShowCollaborationDetails] = useState(false);
  const [showQuickSections, setShowQuickSections] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateContent, setTemplateContent] = useState('');
  const [templateBusy, setTemplateBusy] = useState(false);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const channelReadyRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const lastPresenceTrackAtRef = useRef(0);
  const lastCursorBroadcastAtRef = useRef(0);
  const lastContentBroadcastAtRef = useRef(0);
  const contentBroadcastTimerRef = useRef<number | null>(null);
  const pendingContentBroadcastRef = useRef<PendingContentBroadcast | null>(null);
  const localPendingRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const editVersionRef = useRef(0);
  const persistedRecordRef = useRef<MorningMeetingRecord | undefined>(selectedRecord);
  const loadedDateRef = useRef(targetDate);
  const conflictRef = useRef<MorningMeetingConflict | null>(null);
  const sessionId = useRef(createSessionId()).current;
  const editorName = activeRecorder?.displayName || currentUser?.displayName || '職員';
  const editorUserKey = activeRecorder?.id || currentUser?.id || editorName;
  const cursorColor = useMemo(() => getCursorColor(editorUserKey), [editorUserKey]);
  const [localActivity, setLocalActivity] = useState<CollaboratorActivity>(() => ({
    sessionId,
    userKey: editorUserKey,
    editorName,
    color: cursorColor,
    cursorStart: 0,
    cursorEnd: 0,
    typing: false,
    focused: false,
    lastActiveAt: new Date().toISOString(),
  }));
  const contentRef = useRef(content);
  const targetDateRef = useRef(targetDate);
  const recordsRef = useRef(records);
  const onSaveRef = useRef(onSave);
  const editorNameRef = useRef(editorName);
  const recorderIdRef = useRef(activeRecorder?.id);
  const localActivityRef = useRef(localActivity);
  contentRef.current = content;
  targetDateRef.current = targetDate;
  recordsRef.current = records;
  onSaveRef.current = onSave;
  editorNameRef.current = editorName;
  recorderIdRef.current = activeRecorder?.id;
  localActivityRef.current = localActivity;
  conflictRef.current = conflict;
  const remoteCollaborators = useMemo(
    () => collaborators.filter((collaborator) => collaborator.sessionId !== sessionId),
    [collaborators, sessionId]
  );
  const visibleCollaborators = useMemo(
    () => [
      localActivity,
      ...remoteCollaborators,
    ].sort((left, right) => Number(right.typing) - Number(left.typing)),
    [localActivity, remoteCollaborators]
  );
  const typingCollaborators = visibleCollaborators.filter((collaborator) => collaborator.typing);
  const effectiveViewerCount = Math.max(viewerCount, remoteCollaborators.length + 1);
  const remoteDraftBySession = useMemo(
    () => new Map(remoteLiveDrafts.map((draft) => [draft.sessionId, draft])),
    [remoteLiveDrafts]
  );
  const cursorOverlayCollaborators = useMemo(
    () => remoteCollaborators.filter((collaborator) => {
      const draft = remoteDraftBySession.get(collaborator.sessionId);
      return !draft || draft.content === content;
    }),
    [content, remoteCollaborators, remoteDraftBySession]
  );
  const confirmationActor = activeRecorder
    ? {
        confirmerKey: `recorder:${activeRecorder.id}`,
        recorderProfileId: activeRecorder.id,
        userId: undefined,
        confirmerName: activeRecorder.displayName,
      }
    : currentUser
      ? {
          confirmerKey: `user:${currentUser.id}`,
          recorderProfileId: undefined,
          userId: currentUser.id,
          confirmerName: currentUser.displayName,
        }
      : null;
  const targetConfirmations = confirmations.filter((confirmation) => confirmation.date === targetDate);
  const validConfirmations = targetConfirmations.filter((confirmation) =>
    isConfirmationCurrent(confirmation.confirmedAt, selectedRecord?.updatedAt)
  );
  const currentReceipt = confirmationActor
    ? targetConfirmations.find((confirmation) =>
        confirmation.confirmerKey === confirmationActor.confirmerKey
      )
    : undefined;
  const currentActorConfirmed = Boolean(
    currentReceipt && isConfirmationCurrent(currentReceipt.confirmedAt, selectedRecord?.updatedAt)
  );
  const confirmedRecorderIds = new Set(
    validConfirmations.flatMap((confirmation) =>
      confirmation.recorderProfileId ? [confirmation.recorderProfileId] : []
    )
  );
  const recordReadyForConfirmation = Boolean(
    selectedRecord
    && content.trim()
    && selectedRecord.content === content
    && saveStatus !== 'saving'
    && !conflict
  );

  useEffect(() => {
    const nextActivity = {
      ...localActivityRef.current,
      userKey: editorUserKey,
      editorName,
      color: cursorColor,
      lastActiveAt: new Date().toISOString(),
    };
    localActivityRef.current = nextActivity;
    setLocalActivity(nextActivity);
  }, [cursorColor, editorName, editorUserKey]);

  useEffect(() => {
    if (loadedDateRef.current !== targetDate) {
      loadedDateRef.current = targetDate;
      persistedRecordRef.current = selectedRecord;
      localPendingRef.current = false;
      saveQueuedRef.current = false;
      editVersionRef.current = 0;
      conflictRef.current = null;
      setConflict(null);
      setRemoteLiveDrafts([]);
      const storedContent = selectedRecord?.content || '';
      contentRef.current = storedContent;
      setContent(storedContent);
      setSaveStatus('idle');
      return;
    }

    const currentBase = persistedRecordRef.current;
    const currentRevision = currentBase?.revision || 0;
    const incomingRevision = selectedRecord?.revision || 0;
    if (!selectedRecord || incomingRevision <= currentRevision || saveInFlightRef.current) return;

    if (localPendingRef.current) {
      if (selectedRecord.content === contentRef.current) {
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        persistedRecordRef.current = selectedRecord;
        localPendingRef.current = false;
        setRemoteLiveDrafts((current) =>
          current.filter((draft) => draft.content !== selectedRecord.content)
        );
        setConflict(null);
        setSaveStatus('saved');
        return;
      }
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      const nextConflict: MorningMeetingConflict = {
        latestRecord: selectedRecord,
        localContent: contentRef.current,
        baseContent: currentBase?.content || '',
      };
      conflictRef.current = nextConflict;
      setConflict(nextConflict);
      setRemoteEditor(selectedRecord.updatedByName || '別の職員');
      setSaveStatus('conflict');
      return;
    }

    persistedRecordRef.current = selectedRecord;
    setRemoteLiveDrafts((current) =>
      current.filter((draft) => draft.content !== selectedRecord.content)
    );
    contentRef.current = selectedRecord.content;
    setContent(selectedRecord.content);
    setRemoteEditor(selectedRecord.updatedByName || '別の職員');
    setSaveStatus('remote');
  }, [selectedRecord, targetDate]);

  useEffect(() => {
    if (!supabase || !organizationId) {
      setViewerCount(1);
      setCollaborators([]);
      setRealtimeStatus('local');
      return;
    }

    const channel = supabase.channel(`organization:${organizationId}:morning-meeting:${targetDate}`, {
      config: {
        private: true,
        broadcast: { self: false },
        presence: { key: sessionId },
      },
    });
    channelRef.current = channel;
    channelReadyRef.current = false;
    setRealtimeStatus('connecting');
    setCollaborators([]);
    setRemoteLiveDrafts([]);

    const acceptRemoteActivity = (value: unknown) => {
      const activity = parseCollaboratorActivity(value);
      if (!activity || activity.sessionId === sessionId) return;
      setCollaborators((current) => upsertCollaborator(current, activity));
      setRemoteLiveDrafts((current) => current.map((draft) =>
        draft.sessionId === activity.sessionId
          ? { ...draft, activity, lastActiveAt: activity.lastActiveAt }
          : draft
      ));
    };

    channel
      .on('broadcast', { event: 'content' }, ({ payload }) => {
        const incoming = payload as {
          content?: unknown;
          senderId?: unknown;
          editorName?: unknown;
          baseRevision?: unknown;
          activity?: unknown;
        };
        if (incoming.senderId === sessionId || typeof incoming.content !== 'string') return;
        const activity = parseCollaboratorActivity(incoming.activity);
        if (!activity) return;
        acceptRemoteActivity(activity);
        const remoteContent = incoming.content.slice(0, 20000);
        const nextDraft: RemoteLiveDraft = {
          sessionId: activity.sessionId,
          editorName: typeof incoming.editorName === 'string'
            ? incoming.editorName.slice(0, 100)
            : activity.editorName,
          content: remoteContent,
          baseRevision: typeof incoming.baseRevision === 'number'
            ? Math.max(0, incoming.baseRevision)
            : 0,
          activity,
          lastActiveAt: activity.lastActiveAt,
        };
        setRemoteLiveDrafts((current) => upsertRemoteLiveDraft(current, nextDraft));
        setRemoteEditor(nextDraft.editorName);
        if (!localPendingRef.current && !saveInFlightRef.current && !conflictRef.current) {
          contentRef.current = remoteContent;
          setContent(remoteContent);
          setSaveStatus('live');
        }
      })
      .on('broadcast', { event: 'saved' }, ({ payload }) => {
        const incoming = payload as {
          senderId?: unknown;
          editorName?: unknown;
          content?: unknown;
          revision?: unknown;
          updatedAt?: unknown;
        };
        if (
          incoming.senderId === sessionId
          || typeof incoming.senderId !== 'string'
          || typeof incoming.content !== 'string'
          || typeof incoming.revision !== 'number'
        ) return;
        setRemoteLiveDrafts((current) =>
          current.filter((draft) => draft.sessionId !== incoming.senderId)
        );
        const currentBase = persistedRecordRef.current;
        if (incoming.revision <= (currentBase?.revision || 0)) return;
        const updatedAt = typeof incoming.updatedAt === 'string'
          ? incoming.updatedAt
          : new Date().toISOString();
        const remoteRecord: MorningMeetingRecord = {
          date: targetDateRef.current,
          content: incoming.content.slice(0, 20000),
          revision: incoming.revision,
          updatedByName: typeof incoming.editorName === 'string'
            ? incoming.editorName.slice(0, 100)
            : '別の職員',
          createdAt: currentBase?.createdAt || updatedAt,
          updatedAt,
        };
        if (localPendingRef.current || saveInFlightRef.current || conflictRef.current) {
          if (remoteRecord.content !== contentRef.current) {
            if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
            const nextConflict: MorningMeetingConflict = {
              latestRecord: remoteRecord,
              localContent: contentRef.current,
              baseContent: currentBase?.content || '',
            };
            conflictRef.current = nextConflict;
            setConflict(nextConflict);
            setRemoteEditor(remoteRecord.updatedByName || '別の職員');
            setSaveStatus('conflict');
          }
          return;
        }
        persistedRecordRef.current = remoteRecord;
        contentRef.current = remoteRecord.content;
        setContent(remoteRecord.content);
        setRemoteEditor(remoteRecord.updatedByName || '別の職員');
        setSaveStatus('remote');
      })
      .on('broadcast', { event: 'cursor' }, ({ payload }) => {
        const incoming = payload as { activity?: unknown };
        acceptRemoteActivity(incoming.activity);
      })
      .on('broadcast', { event: 'leave' }, ({ payload }) => {
        const incoming = payload as { sessionId?: unknown };
        if (typeof incoming.sessionId !== 'string') return;
        setCollaborators((current) =>
          current.filter((collaborator) => collaborator.sessionId !== incoming.sessionId)
        );
        setRemoteLiveDrafts((current) =>
          current.filter((draft) => draft.sessionId !== incoming.sessionId)
        );
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const presenceEntries = Object.values(state).flat();
        const presenceActivities = presenceEntries
          .map((entry) => parseCollaboratorActivity(entry))
          .filter((activity): activity is CollaboratorActivity => Boolean(activity));
        const activitiesBySession = new Map<string, CollaboratorActivity>();
        presenceActivities.forEach((activity) => {
          const existing = activitiesBySession.get(activity.sessionId);
          if (!existing || existing.lastActiveAt <= activity.lastActiveAt) {
            activitiesBySession.set(activity.sessionId, activity);
          }
        });
        setViewerCount(Math.max(1, activitiesBySession.size));
        const remotePresenceActivities = [...activitiesBySession.values()].filter(
          (activity) => activity.sessionId !== sessionId
        );
        setCollaborators((current) => remotePresenceActivities.map((activity) => {
          const broadcastActivity = current.find(
            (candidate) => candidate.sessionId === activity.sessionId
          );
          return broadcastActivity && broadcastActivity.lastActiveAt > activity.lastActiveAt
            ? broadcastActivity
            : activity;
        }));
      })
      .subscribe((status) => {
        channelReadyRef.current = status === 'SUBSCRIBED';
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('connected');
          const initialActivity = {
            ...localActivityRef.current,
            userKey: editorUserKey,
            editorName,
            color: cursorColor,
            lastActiveAt: new Date().toISOString(),
          };
          localActivityRef.current = initialActivity;
          setLocalActivity(initialActivity);
          lastPresenceTrackAtRef.current = Date.now();
          void channel.track(initialActivity);
        } else {
          setViewerCount(1);
          setRealtimeStatus('disconnected');
        }
      });

    const heartbeatTimer = window.setInterval(() => {
      if (!channelReadyRef.current || channel.state !== 'joined' || !channel.socket.isConnected()) return;
      const heartbeatActivity = {
        ...localActivityRef.current,
        lastActiveAt: new Date().toISOString(),
      };
      localActivityRef.current = heartbeatActivity;
      lastPresenceTrackAtRef.current = Date.now();
      void channel.track(heartbeatActivity);
      void channel.send({
        type: 'broadcast',
        event: 'cursor',
        payload: { activity: heartbeatActivity },
      });
    }, 15000);

    return () => {
      window.clearInterval(heartbeatTimer);
      if (channelReadyRef.current && channel.state === 'joined' && channel.socket.isConnected()) {
        void channel.send({
          type: 'broadcast',
          event: 'leave',
          payload: { sessionId },
        });
      }
      if (channelRef.current === channel) {
        channelReadyRef.current = false;
        channelRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [cursorColor, editorName, editorUserKey, organizationId, sessionId, targetDate]);

  useEffect(() => {
    const staleCollaboratorTimer = window.setInterval(() => {
      const staleThreshold = Date.now() - 45000;
      setCollaborators((current) => current.filter((collaborator) => {
        const lastActive = Date.parse(collaborator.lastActiveAt);
        return Number.isNaN(lastActive) || lastActive >= staleThreshold;
      }));
      setRemoteLiveDrafts((current) => current.filter((draft) => {
        const lastActive = Date.parse(draft.lastActiveAt);
        return Number.isNaN(lastActive) || lastActive >= staleThreshold;
      }));
    }, 5000);
    return () => window.clearInterval(staleCollaboratorTimer);
  }, []);

  const persistPendingContent = async (showStatus: boolean): Promise<boolean> => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    if (!localPendingRef.current) return true;
    if (conflictRef.current) return false;
    if (saveInFlightRef.current) {
      saveQueuedRef.current = true;
      return false;
    }

    saveInFlightRef.current = true;
    saveQueuedRef.current = false;
    const date = targetDateRef.current;
    const snapshot = contentRef.current;
    const editVersion = editVersionRef.current;
    const now = new Date().toISOString();
    const storedRecord = persistedRecordRef.current?.date === date
      ? persistedRecordRef.current
      : recordsRef.current.find((record) => record.date === date);
    const nextRecord: MorningMeetingRecord = {
      date,
      content: snapshot,
      revision: storedRecord?.revision || 0,
      updatedByName: editorNameRef.current,
      updatedByRecorderId: recorderIdRef.current,
      createdAt: storedRecord?.createdAt || now,
      updatedAt: now,
    };

    try {
      const savedRecord = await onSaveRef.current(nextRecord);
      persistedRecordRef.current = savedRecord;
      const channel = channelRef.current;
      if (
        channel
        && channelReadyRef.current
        && channel.state === 'joined'
        && channel.socket.isConnected()
      ) {
        void channel.send({
          type: 'broadcast',
          event: 'saved',
          payload: {
            senderId: sessionId,
            editorName: editorNameRef.current,
            content: savedRecord.content,
            revision: savedRecord.revision,
            updatedAt: savedRecord.updatedAt,
          },
        });
      }
      if (
        targetDateRef.current === date
        && editVersionRef.current === editVersion
        && contentRef.current === snapshot
      ) {
        localPendingRef.current = false;
        if (showStatus) setSaveStatus('saved');
      } else {
        localPendingRef.current = true;
        saveQueuedRef.current = true;
      }
      return true;
    } catch (error) {
      if (error instanceof MorningMeetingConflictError) {
        const nextConflict: MorningMeetingConflict = {
          latestRecord: error.latestRecord,
          localContent: contentRef.current,
          baseContent: storedRecord?.content || '',
        };
        conflictRef.current = nextConflict;
        setConflict(nextConflict);
        setRemoteEditor(error.latestRecord?.updatedByName || '別の職員');
        setSaveStatus('conflict');
      } else if (targetDateRef.current === date) {
        setSaveStatus('error');
      }
      return false;
    } finally {
      saveInFlightRef.current = false;
      if (
        targetDateRef.current === date
        && localPendingRef.current
        && !conflictRef.current
        && saveQueuedRef.current
      ) {
        saveQueuedRef.current = false;
        saveTimerRef.current = window.setTimeout(() => {
          void persistPendingContent(true);
        }, 150);
      }
    }
  };

  const publishLocalActivity = (
    changes: Partial<Pick<CollaboratorActivity, 'cursorStart' | 'cursorEnd' | 'typing' | 'focused'>>,
    forcePresenceTrack = false
  ) => {
    const nextActivity: CollaboratorActivity = {
      ...localActivityRef.current,
      ...changes,
      userKey: editorUserKey,
      editorName,
      color: cursorColor,
      lastActiveAt: new Date().toISOString(),
    };
    localActivityRef.current = nextActivity;
    setLocalActivity(nextActivity);

    const channel = channelRef.current;
    if (
      channel
      && channelReadyRef.current
      && channel.state === 'joined'
      && channel.socket.isConnected()
    ) {
      const now = Date.now();
      if (forcePresenceTrack || now - lastPresenceTrackAtRef.current >= 400) {
        lastPresenceTrackAtRef.current = now;
        void channel.track(nextActivity);
      }
      if (forcePresenceTrack || now - lastCursorBroadcastAtRef.current >= 250) {
        lastCursorBroadcastAtRef.current = now;
        void channel.send({
          type: 'broadcast',
          event: 'cursor',
          payload: { activity: nextActivity },
        });
      }
    }
    return nextActivity;
  };

  const flushContentBroadcast = () => {
    if (contentBroadcastTimerRef.current) window.clearTimeout(contentBroadcastTimerRef.current);
    contentBroadcastTimerRef.current = null;
    const pending = pendingContentBroadcastRef.current;
    pendingContentBroadcastRef.current = null;
    if (!pending) return;
    const channel = channelRef.current;
    if (
      !channel
      || !channelReadyRef.current
      || channel.state !== 'joined'
      || !channel.socket.isConnected()
    ) return;
    lastContentBroadcastAtRef.current = Date.now();
    void channel.send({
      type: 'broadcast',
      event: 'content',
      payload: {
        content: pending.content,
        senderId: sessionId,
        editorName,
        baseRevision: pending.baseRevision,
        activity: pending.activity,
      },
    });
  };

  const publishContentDraft = (nextContent: string, activity: CollaboratorActivity) => {
    pendingContentBroadcastRef.current = {
      content: nextContent,
      baseRevision: persistedRecordRef.current?.revision || 0,
      activity,
    };
    const elapsed = Date.now() - lastContentBroadcastAtRef.current;
    const wait = Math.max(0, 120 - elapsed);
    if (wait === 0 && contentBroadcastTimerRef.current === null) {
      flushContentBroadcast();
      return;
    }
    if (contentBroadcastTimerRef.current !== null) return;
    contentBroadcastTimerRef.current = window.setTimeout(flushContentBroadcast, wait);
  };

  useEffect(() => () => {
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    if (contentBroadcastTimerRef.current) window.clearTimeout(contentBroadcastTimerRef.current);
    void persistPendingContent(false);
  }, []);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!localPendingRef.current && !saveInFlightRef.current && !conflictRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, []);

  const scheduleSave = (nextContent: string) => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    localPendingRef.current = true;
    saveQueuedRef.current = saveInFlightRef.current;
    editVersionRef.current += 1;
    setSaveStatus('saving');
    setRemoteEditor('');
    contentRef.current = nextContent;
    saveTimerRef.current = window.setTimeout(() => {
      void persistPendingContent(true);
    }, 600);
  };

  const updateContent = (
    nextContent: string,
    requestedCursorStart = nextContent.length,
    requestedCursorEnd = requestedCursorStart
  ) => {
    const limited = nextContent.slice(0, 20000);
    const cursorStart = Math.min(limited.length, Math.max(0, requestedCursorStart));
    const cursorEnd = Math.min(limited.length, Math.max(0, requestedCursorEnd));
    contentRef.current = limited;
    setContent(limited);
    scheduleSave(limited);
    const activity = publishLocalActivity({
      cursorStart,
      cursorEnd,
      typing: true,
      focused: true,
    });
    publishContentDraft(limited, activity);
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      publishLocalActivity({ typing: false }, true);
    }, 4000);
  };

  const insertSection = (section: string) => {
    const separator = content.trim() ? '\n\n' : '';
    const nextContent = `${content}${separator}【${section}】\n・`;
    updateContent(nextContent, nextContent.length, nextContent.length);
    setShowQuickSections(false);
  };

  const clearContent = () => {
    if (!content || !window.confirm(`${targetDate}の朝礼記録をすべて消去しますか？`)) return;
    updateContent('', 0, 0);
  };

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const acceptLatestRecord = () => {
    const latestRecord = conflictRef.current?.latestRecord;
    if (!latestRecord) {
      window.location.reload();
      return;
    }
    if (!window.confirm('この端末の未保存内容を破棄し、別の職員が保存した最新内容を読み込みますか？')) return;
    persistedRecordRef.current = latestRecord;
    contentRef.current = latestRecord.content;
    localPendingRef.current = false;
    saveQueuedRef.current = false;
    editVersionRef.current += 1;
    conflictRef.current = null;
    setConflict(null);
    setContent(latestRecord.content);
    setSaveStatus('remote');
  };

  const keepLocalAfterConflict = (combine: boolean) => {
    const currentConflict = conflictRef.current;
    const latestRecord = currentConflict?.latestRecord;
    if (!currentConflict || !latestRecord) {
      setSaveStatus('error');
      return;
    }
    const nextContent = combine
      ? combineConflictingContent(
          contentRef.current,
          latestRecord.content,
          latestRecord.updatedByName || '別の職員'
        )
      : contentRef.current;
    if (
      !combine
      && !window.confirm('別の職員の更新内容を上書きし、この端末の内容を保存しますか？')
    ) return;
    persistedRecordRef.current = latestRecord;
    conflictRef.current = null;
    setConflict(null);
    contentRef.current = nextContent;
    setContent(nextContent);
    scheduleSave(nextContent);
  };

  const handleEditorSelection = (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const editor = event.currentTarget;
    publishLocalActivity({
      cursorStart: editor.selectionStart,
      cursorEnd: editor.selectionEnd,
      focused: true,
    });
  };

  const handleEditorFocus = (event: React.FocusEvent<HTMLTextAreaElement>) => {
    publishLocalActivity({
      cursorStart: event.currentTarget.selectionStart,
      cursorEnd: event.currentTarget.selectionEnd,
      focused: true,
    }, true);
  };

  const handleEditorBlur = (event: React.FocusEvent<HTMLTextAreaElement>) => {
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
    publishLocalActivity({
      cursorStart: event.currentTarget.selectionStart,
      cursorEnd: event.currentTarget.selectionEnd,
      typing: false,
      focused: false,
    }, true);
  };

  const changeDate = async (nextDate: string) => {
    if (nextDate === targetDateRef.current) return;
    if (conflictRef.current) {
      window.alert('同時更新の確認を完了してから朝礼日を変更してください。');
      return;
    }
    const saved = await persistPendingContent(false);
    if (!saved && localPendingRef.current) {
      window.alert('未保存の内容があります。保存完了後に朝礼日を変更してください。');
      return;
    }
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
    publishLocalActivity({
      cursorStart: 0,
      cursorEnd: 0,
      typing: false,
      focused: false,
    }, true);
    targetDateRef.current = nextDate;
    setTargetDate(nextDate);
    setRemoteEditor('');
    setEditorScroll({ top: 0, left: 0 });
  };

  const applySelectedTemplate = () => {
    const template = templates.find((candidate) => candidate.id === selectedTemplateId);
    if (!template) return;
    if (
      content.trim()
      && content !== template.content
      && !window.confirm('現在の朝礼内容をテンプレートの内容に置き換えますか？')
    ) return;
    updateContent(template.content, template.content.length, template.content.length);
  };

  const resetTemplateForm = (useCurrentContent = false) => {
    setEditingTemplateId(null);
    setTemplateName('');
    setTemplateContent(useCurrentContent ? content : '');
  };

  const editTemplate = (template: MorningMeetingTemplate) => {
    setEditingTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateContent(template.content);
    setShowTemplateManager(true);
  };

  const submitTemplate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!templateName.trim() || !templateContent.trim()) return;
    setTemplateBusy(true);
    try {
      const now = new Date().toISOString();
      const existing = templates.find((template) => template.id === editingTemplateId);
      const template: MorningMeetingTemplate = {
        id: existing?.id || (
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `morning-template-${Date.now()}`
        ),
        name: templateName.trim(),
        content: templateContent.slice(0, 20000),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      await Promise.resolve(onSaveTemplate(template));
      setSelectedTemplateId(template.id);
      resetTemplateForm();
    } finally {
      setTemplateBusy(false);
    }
  };

  const archiveTemplate = async (template: MorningMeetingTemplate) => {
    if (!window.confirm(`朝礼テンプレート「${template.name}」を削除しますか？`)) return;
    setTemplateBusy(true);
    try {
      await Promise.resolve(onArchiveTemplate(template.id));
      if (selectedTemplateId === template.id) setSelectedTemplateId('');
      if (editingTemplateId === template.id) resetTemplateForm();
    } finally {
      setTemplateBusy(false);
    }
  };

  const toggleConfirmation = async () => {
    if (!confirmationActor || !selectedRecord || !content.trim()) return;
    setConfirmationBusy(true);
    try {
      await Promise.resolve(onSetConfirmation({
        date: targetDate,
        ...confirmationActor,
        confirmedAt: new Date().toISOString(),
      }, !currentActorConfirmed));
    } finally {
      setConfirmationBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm">
      <div className="border-b border-sky-100 bg-sky-50/80 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-black text-slate-900">
              <ClipboardPenLine className="h-5 w-5 text-sky-700" />朝礼記録
            </h3>
            <p className="mt-0.5 text-[10px] text-slate-600">入力内容は同時更新を確認しながら自動保存されます。</p>
          </div>
          <span className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[10px] font-bold ${
            realtimeStatus === 'connected'
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-amber-100 text-amber-900'
          }`}>
            {realtimeStatus === 'connecting' || realtimeStatus === 'disconnected'
              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              : <Radio className="h-3.5 w-3.5" />}
            {realtimeStatus === 'connected' && `共有中・${effectiveViewerCount}人`}
            {realtimeStatus === 'connecting' && '共同編集へ接続中'}
            {realtimeStatus === 'disconnected' && '共同編集を再接続中'}
            {realtimeStatus === 'local' && 'ローカル試用'}
            {realtimeStatus === 'connected'
              && typingCollaborators.length > 0
              && `・${typingCollaborators.length}人入力中`}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="order-1 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-slate-600">朝礼日</span>
            <span className="relative block">
              <CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-sky-600" />
              <input
                type="date"
                value={targetDate}
                onChange={(event) => void changeDate(event.target.value)}
                className="min-h-11 rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm font-bold text-slate-800"
              />
            </span>
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
            <div className="text-[10px] text-slate-500 sm:text-right">
              {saveStatus === 'saving' && <span className="flex items-center gap-1 font-bold text-sky-700"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />自動保存中...</span>}
              {saveStatus === 'saved' && <span className="flex items-center gap-1 font-bold text-emerald-700"><Check className="h-3.5 w-3.5" />保存しました</span>}
              {saveStatus === 'remote' && <span className="font-bold text-indigo-700">{remoteEditor}さんの入力を反映しました</span>}
              {saveStatus === 'live' && <span className="flex items-center gap-1 font-bold text-indigo-700"><Radio className="h-3.5 w-3.5 animate-pulse" />{remoteEditor}さんの入力をリアルタイム反映中</span>}
              {saveStatus === 'conflict' && <span className="font-bold text-amber-800">別の職員の更新を確認してください</span>}
              {saveStatus === 'error' && <span className="font-bold text-rose-700">保存できませんでした。通信状態を確認してください。</span>}
              {saveStatus === 'idle' && selectedRecord && (
                <span>最終更新：{new Date(selectedRecord.updatedAt).toLocaleString('ja-JP')}・{selectedRecord.updatedByName || '職員'}</span>
              )}
            </div>
            <button
              type="button"
              aria-expanded={showPreparation}
              onClick={() => setShowPreparation((current) => !current)}
              className="flex min-h-10 items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 text-[10px] font-black text-sky-800"
            >
              <Settings2 className="h-4 w-4" />入力準備
              <ChevronDown className={`h-4 w-4 transition-transform ${showPreparation ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {conflict && (
          <section className="order-2 rounded-xl border-2 border-amber-400 bg-amber-50 p-3" role="alert">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-black text-amber-950">同じ朝礼記録が別の職員によって更新されました</h4>
                <p className="mt-1 text-[11px] leading-5 text-amber-900">
                  この端末の入力は保持されています。内容を比較し、どの内容を保存するか選んでください。
                </p>
                {conflict.latestRecord && (
                  <details className="mt-2 rounded-lg border border-amber-300 bg-white p-2">
                    <summary className="cursor-pointer text-[11px] font-black text-amber-900">
                      {conflict.latestRecord.updatedByName || '別の職員'}さんの最新内容を確認
                    </summary>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <div>
                        <p className="mb-1 text-[9px] font-black text-slate-500">この端末の未保存内容</p>
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-sky-50 p-2 text-[10px] leading-5 text-slate-800">{content}</pre>
                      </div>
                      <div>
                        <p className="mb-1 text-[9px] font-black text-slate-500">保存済みの最新内容</p>
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-amber-100/70 p-2 text-[10px] leading-5 text-slate-800">{conflict.latestRecord.content}</pre>
                      </div>
                    </div>
                  </details>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!conflict.latestRecord}
                    onClick={() => keepLocalAfterConflict(true)}
                    className="flex min-h-10 items-center gap-1.5 rounded-lg bg-amber-700 px-3 text-[11px] font-black text-white disabled:opacity-40"
                  >
                    <GitMerge className="h-4 w-4" />両方を残して編集
                  </button>
                  <button
                    type="button"
                    disabled={!conflict.latestRecord}
                    onClick={() => keepLocalAfterConflict(false)}
                    className="flex min-h-10 items-center gap-1.5 rounded-lg border border-amber-500 bg-white px-3 text-[11px] font-black text-amber-900 disabled:opacity-40"
                  >
                    <Save className="h-4 w-4" />この端末の内容を保存
                  </button>
                  <button
                    type="button"
                    onClick={acceptLatestRecord}
                    className="flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[11px] font-black text-slate-700"
                  >
                    <RefreshCw className="h-4 w-4" />最新内容を読み込む
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {dailySummary.length > 0 && (
          <section className="order-2 rounded-xl border border-teal-200 bg-teal-50 p-3">
            <h4 className="text-xs font-black text-teal-900">本日の業務から自動表示</h4>
            <div className="mt-2 grid gap-1 text-xs text-teal-950 sm:grid-cols-2">
              {dailySummary.map((summary) => <p key={summary} className="rounded-lg bg-white/80 px-3 py-2">{summary}</p>)}
            </div>
          </section>
        )}

        {showPreparation && (
        <section className="order-3 rounded-xl border border-sky-100 bg-sky-50/60 p-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="min-w-0">
              <span className="mb-1 block text-[10px] font-bold text-sky-900">朝礼テンプレート</span>
              <select
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-sky-200 bg-white px-3 text-sm font-bold text-slate-800"
              >
                <option value="">テンプレートを選択</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!selectedTemplateId}
              onClick={applySelectedTemplate}
              className="min-h-11 self-end rounded-xl bg-sky-700 px-4 text-xs font-black text-white disabled:bg-slate-300"
            >
              内容へ適用
            </button>
            {canManageTemplates && (
              <button
                type="button"
                aria-expanded={showTemplateManager}
                onClick={() => setShowTemplateManager((current) => !current)}
                className="flex min-h-11 items-center justify-center gap-1.5 self-end rounded-xl border border-sky-300 bg-white px-3 text-xs font-bold text-sky-800"
              >
                <Settings2 className="h-4 w-4" />テンプレート管理
                <ChevronDown className={`h-4 w-4 transition-transform ${showTemplateManager ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>

          {templates.length === 0 && !showTemplateManager && (
            <p className="mt-2 text-[10px] text-sky-800">
              テンプレートはまだありません。管理者・児発管が「テンプレート管理」から作成できます。
            </p>
          )}

          {canManageTemplates && showTemplateManager && (
            <div className="mt-3 grid gap-3 border-t border-sky-100 pt-3 lg:grid-cols-[0.85fr_1.15fr]">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-black text-sky-950">登録済みテンプレート</p>
                  <button
                    type="button"
                    onClick={() => resetTemplateForm(true)}
                    className="flex min-h-9 items-center gap-1 rounded-lg border border-sky-200 bg-white px-2.5 text-[10px] font-bold text-sky-800"
                  >
                    <FilePlus2 className="h-3.5 w-3.5" />現在の内容から新規作成
                  </button>
                </div>
                <div className="mt-2 space-y-1.5">
                  {templates.length === 0 && (
                    <p className="rounded-lg bg-white p-3 text-center text-[10px] text-slate-500">登録済みテンプレートはありません。</p>
                  )}
                  {templates.map((template) => (
                    <div key={template.id} className="flex items-center gap-2 rounded-lg border border-white bg-white p-2">
                      <button
                        type="button"
                        onClick={() => editTemplate(template)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-xs font-black text-slate-800">{template.name}</span>
                        <span className="block truncate text-[9px] text-slate-500">{template.content.replace(/\n/g, ' ')}</span>
                      </button>
                      <button
                        type="button"
                        disabled={templateBusy}
                        onClick={() => void archiveTemplate(template)}
                        aria-label={`${template.name}を削除`}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <form onSubmit={submitTemplate} className="space-y-2 rounded-xl border border-sky-100 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <h5 className="text-xs font-black text-slate-900">
                    {editingTemplateId ? 'テンプレートを編集' : '新しいテンプレート'}
                  </h5>
                  {editingTemplateId && (
                    <button type="button" onClick={() => resetTemplateForm()} className="text-[10px] font-bold text-sky-700">
                      新規作成に戻る
                    </button>
                  )}
                </div>
                <label className="block text-[10px] font-bold text-slate-600">
                  テンプレート名
                  <input
                    value={templateName}
                    onChange={(event) => setTemplateName(event.target.value)}
                    maxLength={100}
                    placeholder="例：平日の朝礼"
                    className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                  />
                </label>
                <label className="block text-[10px] font-bold text-slate-600">
                  初期表示する内容
                  <textarea
                    value={templateContent}
                    onChange={(event) => setTemplateContent(event.target.value.slice(0, 20000))}
                    rows={7}
                    placeholder={'【本日の予定】\n・\n\n【児童対応】\n・'}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm leading-6"
                  />
                </label>
                <button
                  type="submit"
                  disabled={templateBusy || !templateName.trim() || !templateContent.trim()}
                  className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-sky-700 px-4 text-xs font-black text-white disabled:bg-slate-300"
                >
                  {templateBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {editingTemplateId ? '変更を保存' : 'テンプレートを作成'}
                </button>
              </form>
            </div>
          )}
        </section>
        )}

        <section className="order-6 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3" aria-live="polite">
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-black text-emerald-950">
              <UserCheck className="h-4 w-4 text-emerald-700" />確認
            </h4>
            <button
              type="button"
              aria-expanded={showConfirmationDetails}
              onClick={() => setShowConfirmationDetails((current) => !current)}
              className="flex min-h-9 items-center gap-1 rounded-lg bg-white px-2.5 text-[10px] font-black text-emerald-800"
            >
              全員の状況 {confirmedRecorderIds.size}/{recorderProfiles.length}名
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showConfirmationDetails ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {showConfirmationDetails && (
          <div className="mt-2 border-t border-emerald-100 pt-2">
            <p className="mb-2 text-[9px] text-emerald-800">
              内容が更新されると、以前の確認は「再確認が必要」に変わります。
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
            {recorderProfiles.map((profile) => {
              const receipt = targetConfirmations.find((confirmation) =>
                confirmation.recorderProfileId === profile.id
              );
              const isCurrent = Boolean(
                receipt && isConfirmationCurrent(receipt.confirmedAt, selectedRecord?.updatedAt)
              );
              return (
                <div
                  key={profile.id}
                  className={`min-w-36 shrink-0 rounded-lg border px-2.5 py-2 ${
                    isCurrent
                      ? 'border-emerald-300 bg-white'
                      : receipt
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-slate-200 bg-white/70'
                  }`}
                >
                  <p className="truncate text-[10px] font-black text-slate-800">{profile.displayName}</p>
                  <p className={`mt-0.5 flex items-center gap-1 text-[9px] font-bold ${
                    isCurrent ? 'text-emerald-700' : receipt ? 'text-amber-700' : 'text-slate-500'
                  }`}>
                    {isCurrent
                      ? <><CheckCircle2 className="h-3 w-3" />確認済み {new Date(receipt.confirmedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</>
                      : receipt
                        ? <><Clock3 className="h-3 w-3" />再確認が必要</>
                        : '未確認'}
                  </p>
                </div>
              );
            })}
            </div>
          </div>
          )}

          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[10px] text-emerald-800">
              {confirmationActor
                ? `${confirmationActor.confirmerName}：${currentActorConfirmed ? '確認済み' : currentReceipt ? '再確認が必要' : '未確認'}`
                : '確認者を特定できません。'}
            </p>
            <button
              type="button"
              disabled={
                confirmationBusy
                || !confirmationActor
                || (!currentActorConfirmed && !recordReadyForConfirmation)
              }
              onClick={() => void toggleConfirmation()}
              className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-black disabled:bg-slate-300 disabled:text-white ${
                currentActorConfirmed
                  ? 'border border-emerald-300 bg-white text-emerald-800'
                  : 'bg-emerald-700 text-white'
              }`}
            >
              {confirmationBusy
                ? <LoaderCircle className="h-4 w-4 animate-spin" />
                : <UserCheck className="h-4 w-4" />}
              {currentActorConfirmed ? '確認を取り消す' : 'この内容を確認済みにする'}
            </button>
          </div>
          {!currentActorConfirmed && content.trim() && !recordReadyForConfirmation && (
            <p className="mt-1 text-right text-[9px] font-bold text-amber-700">自動保存が完了すると確認できます。</p>
          )}
        </section>

        <section
          id="morning-collaboration-status"
          aria-live="polite"
          className="order-7 rounded-xl border border-indigo-100 bg-indigo-50/60 p-2.5"
        >
          <button
            type="button"
            aria-expanded={showCollaborationDetails}
            onClick={() => setShowCollaborationDetails((current) => !current)}
            className="flex min-h-9 w-full items-center justify-between gap-2 text-left"
          >
            <span className="flex items-center gap-1.5 text-xs font-black text-indigo-950">
              <Users className="h-4 w-4 text-indigo-600" />共同編集
              <span className="font-bold text-indigo-700">{effectiveViewerCount}人</span>
            </span>
            <span className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[9px] font-bold text-indigo-700">
              {typingCollaborators.length > 0
                ? `${typingCollaborators.length}人が入力中`
                : '詳細'}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showCollaborationDetails ? 'rotate-180' : ''}`} />
            </span>
          </button>
          {showCollaborationDetails && (
          <div className="mt-2 border-t border-indigo-100 pt-2">
            <p className="mb-2 text-[9px] text-indigo-700">色付きカーソルと行・列で、各職員の位置を確認できます。</p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {visibleCollaborators.map((collaborator) => {
              const isCurrentUser = collaborator.sessionId === sessionId;
              return (
                <div
                  key={collaborator.sessionId}
                  className="flex min-w-44 shrink-0 items-center gap-2 rounded-lg border border-white bg-white/90 px-2.5 py-2 shadow-xs"
                >
                  <span
                    className={`h-3 w-3 shrink-0 rounded-full ${collaborator.typing ? 'animate-pulse' : ''}`}
                    style={{ backgroundColor: collaborator.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] font-black text-slate-800">
                      {collaborator.editorName}
                      {isCurrentUser ? '（自分）' : collaborator.userKey === editorUserKey ? '（別端末）' : ''}
                    </p>
                    <p className={`mt-0.5 flex items-center gap-1 text-[9px] font-bold ${
                      collaborator.typing ? 'text-indigo-700' : 'text-slate-500'
                    }`}>
                      {collaborator.typing
                        ? <PencilLine className="h-3 w-3" />
                        : <MousePointer2 className="h-3 w-3" />}
                      {collaborator.typing
                        ? '入力中'
                        : collaborator.focused
                          ? 'カーソル'
                          : '閲覧中'}
                      {collaborator.focused && (
                        <span>・{getCursorPositionLabel(content, collaborator)}</span>
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          </div>
          )}
        </section>

        <div className="order-3">
          <button
            type="button"
            aria-expanded={showQuickSections}
            onClick={() => setShowQuickSections((current) => !current)}
            className="flex min-h-9 items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 text-[10px] font-bold text-sky-800"
          >
            <ListPlus className="h-4 w-4" />見出しを追加
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showQuickSections ? 'rotate-180' : ''}`} />
          </button>
          {showQuickSections && (
          <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
            {QUICK_SECTIONS.map((section) => (
              <button
                key={section}
                type="button"
                onClick={() => insertSection(section)}
                className="min-h-9 shrink-0 rounded-full border border-sky-200 bg-sky-50 px-3 text-[10px] font-bold text-sky-800 hover:bg-sky-100"
              >
                ＋ {section}
              </button>
            ))}
          </div>
          )}
        </div>

        {remoteLiveDrafts.length > 0 && (
          <section className="order-4 rounded-xl border border-indigo-200 bg-indigo-50/80 p-3" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="flex items-center gap-1.5 text-xs font-black text-indigo-950">
                <Radio className="h-4 w-4 animate-pulse text-indigo-600" />他端末の入力内容
              </h4>
              <span className="text-[9px] font-bold text-indigo-700">
                {saveStatus === 'saving' || saveStatus === 'conflict'
                  ? 'この端末の入力を保護しながら表示しています'
                  : '編集欄へリアルタイム反映中'}
              </span>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {remoteLiveDrafts.map((draft) => {
                const latestLine = draft.content
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .at(-1) || '入力内容は空です';
                const reflected = draft.content === content
                  && saveStatus !== 'saving'
                  && saveStatus !== 'conflict';
                return (
                  <details key={draft.sessionId} className="rounded-lg border border-white bg-white p-2.5 shadow-xs">
                    <summary className="cursor-pointer list-none">
                      <span className="flex items-start gap-2">
                        <span
                          className={`mt-0.5 h-3 w-3 shrink-0 rounded-full ${draft.activity.typing ? 'animate-pulse' : ''}`}
                          style={{ backgroundColor: draft.activity.color }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1 text-[10px] font-black text-slate-800">
                            {draft.editorName}
                            {draft.activity.userKey === editorUserKey && <span className="text-indigo-600">（別端末）</span>}
                            <span className={`rounded-full px-1.5 py-0.5 text-[8px] ${
                              draft.activity.typing
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}>
                              {draft.activity.typing ? '入力中' : '入力停止'}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-[9px] text-slate-600">{latestLine}</span>
                          <span className="mt-0.5 block text-[8px] font-bold text-indigo-600">
                            {reflected ? '編集欄に反映済み' : '開いて入力内容を確認'}
                          </span>
                        </span>
                      </span>
                    </summary>
                    <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-lg bg-indigo-50 p-2 text-[10px] leading-5 text-slate-800">{draft.content || '（空欄）'}</pre>
                  </details>
                );
              })}
            </div>
          </section>
        )}

        <div className="relative order-4">
          <textarea
            value={content}
            onChange={(event) => {
              const editor = event.currentTarget;
              updateContent(editor.value, editor.selectionStart, editor.selectionEnd);
            }}
            onSelect={handleEditorSelection}
            onFocus={handleEditorFocus}
            onBlur={handleEditorBlur}
            onScroll={(event) => setEditorScroll({
              top: event.currentTarget.scrollTop,
              left: event.currentTarget.scrollLeft,
            })}
            rows={12}
            aria-describedby="morning-collaboration-status"
            placeholder={'例：\n【本日の予定】\n・15:00から避難訓練\n\n【児童対応】\n・〇〇さんは来所時の体調を確認'}
            className="relative z-10 block min-h-72 w-full resize-y rounded-2xl border-2 border-slate-300 bg-slate-50/95 p-4 text-sm leading-7 text-slate-900 focus:border-sky-500 focus:bg-white/95 focus:ring-4 focus:ring-sky-100"
          />
          <RemoteCursorOverlay
            content={content}
            collaborators={cursorOverlayCollaborators}
            scrollTop={editorScroll.top}
            scrollLeft={editorScroll.left}
          />
        </div>

        <div className="order-5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] text-slate-500">{content.length.toLocaleString()} / 20,000文字・自動保存</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!content}
              onClick={() => void copyContent()}
              className="flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 disabled:opacity-40"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              {copied ? 'コピー済み' : '内容をコピー'}
            </button>
            <button
              type="button"
              disabled={!content}
              onClick={clearContent}
              className="flex min-h-10 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />消去
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
