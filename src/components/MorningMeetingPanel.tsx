import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  CalendarDays,
  Check,
  ClipboardPenLine,
  Copy,
  LoaderCircle,
  MousePointer2,
  PencilLine,
  Radio,
  Trash2,
  Users,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { MorningMeetingRecord, RecorderProfile, UserProfile } from '../types';
import { getLocalDateString } from '../utils/weekdays';

interface MorningMeetingPanelProps {
  records: MorningMeetingRecord[];
  organizationId?: string;
  activeRecorder?: RecorderProfile;
  currentUser?: UserProfile | null;
  onSave: (record: MorningMeetingRecord) => Promise<void> | void;
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
    ...collaborators.filter((collaborator) =>
      collaborator.sessionId !== incoming.sessionId && collaborator.userKey !== incoming.userKey
    ),
    incoming,
  ];
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
  organizationId,
  activeRecorder,
  currentUser,
  onSave,
}) => {
  const [targetDate, setTargetDate] = useState(getLocalDateString());
  const selectedRecord = useMemo(
    () => records.find((record) => record.date === targetDate),
    [records, targetDate]
  );
  const [content, setContent] = useState(selectedRecord?.content || '');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'remote'>('idle');
  const [viewerCount, setViewerCount] = useState(1);
  const [collaborators, setCollaborators] = useState<CollaboratorActivity[]>([]);
  const [editorScroll, setEditorScroll] = useState({ top: 0, left: 0 });
  const [remoteEditor, setRemoteEditor] = useState('');
  const [copied, setCopied] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const channelReadyRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const lastPresenceTrackAtRef = useRef(0);
  const localPendingRef = useRef(false);
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
  const remoteCollaborators = useMemo(
    () => collaborators.filter((collaborator) =>
      collaborator.sessionId !== sessionId && collaborator.userKey !== editorUserKey
    ),
    [collaborators, editorUserKey, sessionId]
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
    if (localPendingRef.current) return;
    const storedContent = selectedRecord?.content || '';
    contentRef.current = storedContent;
    setContent(storedContent);
    setSaveStatus('idle');
  }, [selectedRecord?.content, selectedRecord?.updatedAt, targetDate]);

  useEffect(() => {
    if (!supabase || !organizationId) {
      setViewerCount(1);
      setCollaborators([]);
      return;
    }

    const channel = supabase.channel(`morning-meeting:${organizationId}:${targetDate}`, {
      config: {
        broadcast: { self: false },
        presence: { key: sessionId },
      },
    });
    channelRef.current = channel;
    channelReadyRef.current = false;
    setCollaborators([]);

    const acceptRemoteActivity = (value: unknown) => {
      const activity = parseCollaboratorActivity(value);
      if (
        !activity ||
        activity.sessionId === sessionId ||
        activity.userKey === editorUserKey
      ) return;
      setCollaborators((current) => upsertCollaborator(current, activity));
    };

    channel
      .on('broadcast', { event: 'content' }, ({ payload }) => {
        const incoming = payload as {
          content?: unknown;
          senderId?: unknown;
          editorName?: unknown;
          activity?: unknown;
        };
        if (incoming.senderId === sessionId || typeof incoming.content !== 'string') return;
        acceptRemoteActivity(incoming.activity);
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        localPendingRef.current = false;
        const remoteContent = incoming.content.slice(0, 20000);
        contentRef.current = remoteContent;
        setContent(remoteContent);
        setRemoteEditor(typeof incoming.editorName === 'string' ? incoming.editorName : '別の職員');
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
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const presenceEntries = Object.values(state).flat();
        if (presenceEntries.length > 0) {
          const presenceActivities = presenceEntries
            .map((entry) => parseCollaboratorActivity(entry))
            .filter((activity): activity is CollaboratorActivity => Boolean(activity));
          const activitiesByUser = new Map<string, CollaboratorActivity>();
          presenceActivities.forEach((activity) => {
            const existing = activitiesByUser.get(activity.userKey);
            if (!existing || existing.lastActiveAt <= activity.lastActiveAt) {
              activitiesByUser.set(activity.userKey, activity);
            }
          });
          setViewerCount(Math.max(1, activitiesByUser.size));
          const remotePresenceActivities = [...activitiesByUser.values()].filter(
            (activity) => activity.sessionId !== sessionId && activity.userKey !== editorUserKey
          );
          setCollaborators((current) => remotePresenceActivities.map((activity) => {
            const broadcastActivity = current.find(
              (candidate) => candidate.userKey === activity.userKey
            );
            return broadcastActivity && broadcastActivity.lastActiveAt > activity.lastActiveAt
              ? broadcastActivity
              : activity;
          }));
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channelReadyRef.current = true;
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
        }
      });

    const heartbeatTimer = window.setInterval(() => {
      if (!channelReadyRef.current) return;
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
      if (channelReadyRef.current) {
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
    }, 5000);
    return () => window.clearInterval(staleCollaboratorTimer);
  }, []);

  const persistPendingContent = (showStatus: boolean) => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    if (!localPendingRef.current) return;

    localPendingRef.current = false;
    const date = targetDateRef.current;
    const now = new Date().toISOString();
    const storedRecord = recordsRef.current.find((record) => record.date === date);
    const nextRecord: MorningMeetingRecord = {
      date,
      content: contentRef.current,
      updatedByName: editorNameRef.current,
      updatedByRecorderId: recorderIdRef.current,
      createdAt: storedRecord?.createdAt || now,
      updatedAt: now,
    };

    void Promise.resolve(onSaveRef.current(nextRecord))
      .then(() => {
        if (showStatus && targetDateRef.current === date) setSaveStatus('saved');
      })
      .catch(() => {
        if (showStatus && targetDateRef.current === date) setSaveStatus('error');
      });
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
    if (channel && channelReadyRef.current) {
      const now = Date.now();
      if (forcePresenceTrack || now - lastPresenceTrackAtRef.current >= 400) {
        lastPresenceTrackAtRef.current = now;
        void channel.track(nextActivity);
      }
      void channel.send({
        type: 'broadcast',
        event: 'cursor',
        payload: { activity: nextActivity },
      });
    }
    return nextActivity;
  };

  useEffect(() => () => {
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    persistPendingContent(false);
  }, []);

  const scheduleSave = (nextContent: string) => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    localPendingRef.current = true;
    setSaveStatus('saving');
    setRemoteEditor('');
    contentRef.current = nextContent;
    saveTimerRef.current = window.setTimeout(() => persistPendingContent(true), 600);
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
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      publishLocalActivity({ typing: false }, true);
    }, 4000);
    if (channelRef.current && channelReadyRef.current) {
      void channelRef.current.send({
        type: 'broadcast',
        event: 'content',
        payload: {
          content: limited,
          senderId: sessionId,
          editorName,
          activity,
        },
      });
    }
  };

  const insertSection = (section: string) => {
    const separator = content.trim() ? '\n\n' : '';
    const nextContent = `${content}${separator}【${section}】\n・`;
    updateContent(nextContent, nextContent.length, nextContent.length);
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

  const changeDate = (nextDate: string) => {
    persistPendingContent(false);
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

  return (
    <section className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm">
      <div className="border-b border-sky-100 bg-sky-50/80 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-black text-slate-900">
              <ClipboardPenLine className="h-5 w-5 text-sky-700" />朝礼記録
            </h3>
            <p className="mt-1 text-xs text-slate-600">入力中の内容が、同じ日付を開いている職員へ即時表示されます。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[10px] font-bold ${
              organizationId ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
            }`}>
              <Radio className="h-3.5 w-3.5" />
              {organizationId ? 'リアルタイム共有中' : 'ローカル試用'}
            </span>
            <span className="flex min-h-9 items-center gap-1.5 rounded-full bg-white px-3 text-[10px] font-bold text-slate-700">
              <Users className="h-3.5 w-3.5 text-sky-600" />同時閲覧 {effectiveViewerCount}人
            </span>
            {typingCollaborators.length > 0 && (
              <span className="flex min-h-9 items-center gap-1.5 rounded-full bg-indigo-100 px-3 text-[10px] font-bold text-indigo-800">
                <PencilLine className="h-3.5 w-3.5 animate-pulse" />
                {typingCollaborators.map((collaborator) => collaborator.editorName).join('・')}が入力中
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-slate-600">朝礼日</span>
            <span className="relative block">
              <CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-sky-600" />
              <input
                type="date"
                value={targetDate}
                onChange={(event) => changeDate(event.target.value)}
                className="min-h-11 rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm font-bold text-slate-800"
              />
            </span>
          </label>
          <div className="text-[10px] text-slate-500 sm:text-right">
            {saveStatus === 'saving' && <span className="flex items-center gap-1 font-bold text-sky-700"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />自動保存中...</span>}
            {saveStatus === 'saved' && <span className="flex items-center gap-1 font-bold text-emerald-700"><Check className="h-3.5 w-3.5" />保存しました</span>}
            {saveStatus === 'remote' && <span className="font-bold text-indigo-700">{remoteEditor}さんの入力を反映しました</span>}
            {saveStatus === 'error' && <span className="font-bold text-rose-700">保存できませんでした。通信状態を確認してください。</span>}
            {saveStatus === 'idle' && selectedRecord && (
              <span>最終更新：{new Date(selectedRecord.updatedAt).toLocaleString('ja-JP')}・{selectedRecord.updatedByName || '職員'}</span>
            )}
          </div>
        </div>

        <section
          id="morning-collaboration-status"
          aria-live="polite"
          className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-black text-indigo-950">
                <Users className="h-4 w-4 text-indigo-600" />共同編集状況
              </h4>
              <p className="mt-0.5 text-[10px] text-indigo-700">
                色付きカーソルと行・列で、各職員の位置を確認できます。
              </p>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-bold text-indigo-700">
              {typingCollaborators.length > 0
                ? `${typingCollaborators.length}人が入力中`
                : '現在入力中なし'}
            </span>
          </div>
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
                      {collaborator.editorName}{isCurrentUser ? '（自分）' : ''}
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
        </section>

        <div>
          <p className="text-[10px] font-bold text-slate-500">見出しを追加</p>
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
        </div>

        <div className="relative">
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
            collaborators={remoteCollaborators}
            scrollTop={editorScroll.top}
            scrollLeft={editorScroll.left}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] text-slate-500">{content.length.toLocaleString()} / 20,000文字・入力後0.6秒で自動保存</p>
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
