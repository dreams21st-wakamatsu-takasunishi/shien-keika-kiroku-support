import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  CalendarDays,
  Check,
  ClipboardPenLine,
  Copy,
  LoaderCircle,
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

function createSessionId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
  const [remoteEditor, setRemoteEditor] = useState('');
  const [copied, setCopied] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const localPendingRef = useRef(false);
  const sessionId = useRef(createSessionId()).current;
  const editorName = activeRecorder?.displayName || currentUser?.displayName || '職員';
  const contentRef = useRef(content);
  const targetDateRef = useRef(targetDate);
  const recordsRef = useRef(records);
  const onSaveRef = useRef(onSave);
  const editorNameRef = useRef(editorName);
  const recorderIdRef = useRef(activeRecorder?.id);
  contentRef.current = content;
  targetDateRef.current = targetDate;
  recordsRef.current = records;
  onSaveRef.current = onSave;
  editorNameRef.current = editorName;
  recorderIdRef.current = activeRecorder?.id;

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
      return;
    }

    const channel = supabase.channel(`morning-meeting:${organizationId}:${targetDate}`, {
      config: {
        broadcast: { self: false },
        presence: { key: sessionId },
      },
    });
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'content' }, ({ payload }) => {
        const incoming = payload as {
          content?: unknown;
          senderId?: unknown;
          editorName?: unknown;
        };
        if (incoming.senderId === sessionId || typeof incoming.content !== 'string') return;
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        localPendingRef.current = false;
        const remoteContent = incoming.content.slice(0, 20000);
        contentRef.current = remoteContent;
        setContent(remoteContent);
        setRemoteEditor(typeof incoming.editorName === 'string' ? incoming.editorName : '別の職員');
        setSaveStatus('remote');
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const count = Object.values(state).reduce((sum, entries) => sum + entries.length, 0);
        setViewerCount(Math.max(1, count));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.track({ editorName, joinedAt: new Date().toISOString() });
        }
      });

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [editorName, organizationId, sessionId, targetDate]);

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

  useEffect(() => () => {
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

  const updateContent = (nextContent: string) => {
    const limited = nextContent.slice(0, 20000);
    contentRef.current = limited;
    setContent(limited);
    scheduleSave(limited);
    if (channelRef.current) {
      void channelRef.current.send({
        type: 'broadcast',
        event: 'content',
        payload: {
          content: limited,
          senderId: sessionId,
          editorName,
        },
      });
    }
  };

  const insertSection = (section: string) => {
    const separator = content.trim() ? '\n\n' : '';
    updateContent(`${content}${separator}【${section}】\n・`);
  };

  const clearContent = () => {
    if (!content || !window.confirm(`${targetDate}の朝礼記録をすべて消去しますか？`)) return;
    updateContent('');
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

  const changeDate = (nextDate: string) => {
    persistPendingContent(false);
    targetDateRef.current = nextDate;
    setTargetDate(nextDate);
    setRemoteEditor('');
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
              <Users className="h-3.5 w-3.5 text-sky-600" />同時閲覧 {viewerCount}人
            </span>
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

        <textarea
          value={content}
          onChange={(event) => updateContent(event.target.value)}
          rows={12}
          placeholder={'例：\n【本日の予定】\n・15:00から避難訓練\n\n【児童対応】\n・〇〇さんは来所時の体調を確認'}
          className="min-h-72 w-full resize-y rounded-2xl border-2 border-slate-300 bg-slate-50 p-4 text-sm leading-7 text-slate-900 focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
        />

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
