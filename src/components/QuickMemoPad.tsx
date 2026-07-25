import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Cloud, StickyNote, Trash2, X } from 'lucide-react';
import { deleteRecordDraft, loadRecordDraft, saveRecordDraft } from '../services/dataService';
import { getCurrentDraftCycleKey, getNextDraftResetAt, isDraftCurrent } from '../utils/draftExpiry';

interface QuickMemoPadProps {
  organizationId?: string;
  userId?: string;
}

interface QuickMemoPayload {
  version: 1 | 2;
  content: string;
  updatedAt: string;
  draftCycleKey?: string;
}

type SaveStatus = 'restored' | 'saving' | 'saved' | 'reset' | 'error' | null;

function isQuickMemoPayload(value: unknown): value is QuickMemoPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<QuickMemoPayload>;
  return (payload.version === 1 || payload.version === 2)
    && typeof payload.content === 'string'
    && typeof payload.updatedAt === 'string';
}

function readLocalMemo(storageKey: string): QuickMemoPayload | null {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as unknown;
    if (!isQuickMemoPayload(parsed) || !isDraftCurrent(parsed.draftCycleKey, parsed.updatedAt)) {
      localStorage.removeItem(storageKey);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export const QuickMemoPad: React.FC<QuickMemoPadProps> = ({ organizationId, userId }) => {
  const draftKey = 'quick-memo';
  const storageKey = `support-quick-memo-v1:${organizationId || 'local'}:${userId || 'local'}`;
  const initialLocal = useMemo(() => readLocalMemo(storageKey), [storageKey]);
  const localUpdatedAt = useRef(initialLocal?.updatedAt || '');
  const [content, setContent] = useState(initialLocal?.content || '');
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(!organizationId || !userId);
  const [status, setStatus] = useState<SaveStatus>(initialLocal ? 'restored' : null);
  const skipNextSave = useRef(false);

  useEffect(() => {
    if (!organizationId || !userId) return;
    let alive = true;
    setReady(false);
    void loadRecordDraft(organizationId, draftKey)
      .then((remote) => {
        if (!alive || !remote) return;
        if (
          !isQuickMemoPayload(remote.payload) ||
          !isDraftCurrent(remote.payload.draftCycleKey, remote.updatedAt)
        ) {
          localStorage.removeItem(storageKey);
          void deleteRecordDraft(organizationId, draftKey);
          return;
        }
        const remoteTime = new Date(remote.updatedAt).getTime();
        const localTime = localUpdatedAt.current ? new Date(localUpdatedAt.current).getTime() : 0;
        if (remoteTime > localTime) {
          const restored = { ...remote.payload, updatedAt: remote.updatedAt };
          setContent(restored.content);
          localUpdatedAt.current = restored.updatedAt;
          localStorage.setItem(storageKey, JSON.stringify(restored));
          setStatus('restored');
        }
      })
      .catch(() => setStatus('error'))
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [draftKey, organizationId, storageKey, userId]);

  useEffect(() => {
    if (!ready) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const updatedAt = new Date().toISOString();
    localUpdatedAt.current = updatedAt;

    if (!content) {
      localStorage.removeItem(storageKey);
      setStatus(null);
      if (organizationId) {
        const timer = window.setTimeout(() => {
          void deleteRecordDraft(organizationId, draftKey).catch(() => setStatus('error'));
        }, 700);
        return () => window.clearTimeout(timer);
      }
      return;
    }

    const payload: QuickMemoPayload = {
      version: 2,
      content,
      updatedAt,
      draftCycleKey: getCurrentDraftCycleKey(),
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      setStatus('error');
      return;
    }

    if (!organizationId || !userId) {
      setStatus('saved');
      return;
    }

    setStatus('saving');
    const timer = window.setTimeout(() => {
      void saveRecordDraft(organizationId, userId, draftKey, payload)
        .then(() => setStatus('saved'))
        .catch(() => setStatus('error'));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [content, draftKey, organizationId, ready, storageKey, userId]);

  useEffect(() => {
    let timer: number;
    const scheduleNextReset = () => {
      const now = new Date();
      const resetAt = getNextDraftResetAt(now);
      timer = window.setTimeout(() => {
        skipNextSave.current = true;
        setContent('');
        localUpdatedAt.current = '';
        localStorage.removeItem(storageKey);
        if (organizationId) void deleteRecordDraft(organizationId, draftKey);
        setStatus('reset');
        scheduleNextReset();
      }, resetAt.getTime() - now.getTime());
    };
    scheduleNextReset();
    return () => window.clearTimeout(timer);
  }, [draftKey, organizationId, storageKey]);

  const clearMemo = () => {
    if (content && !window.confirm('クイックメモの内容をすべて消去しますか？')) return;
    setContent('');
  };

  const statusLabel = status === 'saving'
    ? '共有保存中'
    : status === 'saved'
      ? '保存済み'
      : status === 'restored'
        ? '保存内容を復元'
        : status === 'reset'
          ? '午前3時にリセットしました'
        : status === 'error'
          ? '端末には保存済み・共有保存に失敗'
          : '入力すると自動保存';

  return (
    <>
      <section
        aria-label="クイックメモ"
        aria-hidden={!open}
        className={`fixed inset-x-3 bottom-36 z-50 max-h-[min(68vh,34rem)] origin-bottom-right overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 shadow-2xl transition-all duration-300 ease-out sm:inset-x-auto sm:right-5 sm:w-96 md:bottom-24 ${
          open ? 'pointer-events-auto translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-5 scale-90 opacity-0'
        }`}
      >
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-100/80 px-4 py-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-amber-950">
              <StickyNote className="h-4 w-4" />クイックメモ
            </h3>
            <p className="mt-0.5 text-[11px] text-amber-800">入力内容は自動保存され、毎日午前3時にリセットされます</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            tabIndex={open ? 0 : -1}
            className="flex min-h-10 min-w-10 items-center justify-center rounded-full text-amber-900 hover:bg-amber-200"
            aria-label="メモ帳をしまう"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4">
          <textarea
            rows={9}
            maxLength={4000}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            tabIndex={open ? 0 : -1}
            placeholder={'例：\n・15:20　〇〇さんが活動室で困っている様子\n・△△さんから「あとで話したい」と相談あり'}
            className="w-full resize-none rounded-xl border border-amber-300 bg-white p-3 text-base leading-relaxed text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 sm:text-sm"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p aria-live="polite" className={`flex min-w-0 items-center gap-1 text-[10px] ${status === 'error' ? 'text-rose-700' : 'text-amber-800'}`}>
              {status === 'saved' ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Cloud className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate">{statusLabel}</span>
            </p>
            <span className="shrink-0 text-[10px] text-amber-700">{content.length} / 4000</span>
          </div>
          <button
            type="button"
            onClick={clearMemo}
            disabled={!content}
            tabIndex={open ? 0 : -1}
            className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white text-xs font-bold text-rose-700 disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />メモを消去
          </button>
        </div>
      </section>

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={open ? 'メモ帳をしまう' : 'クイックメモを開く'}
        className={`fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full border-2 shadow-xl transition-all duration-300 active:scale-95 md:bottom-6 md:right-6 ${
          open
            ? 'rotate-6 border-amber-300 bg-amber-100 text-amber-950'
            : 'border-amber-300 bg-amber-400 text-amber-950 hover:-translate-y-1 hover:bg-amber-300'
        }`}
      >
        {open ? <X className="h-6 w-6" /> : <StickyNote className="h-6 w-6" />}
        {!open && content && <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" aria-label="保存済みメモあり" />}
      </button>
    </>
  );
};
