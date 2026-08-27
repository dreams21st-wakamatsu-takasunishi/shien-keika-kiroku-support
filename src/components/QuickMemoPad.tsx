import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Cloud, Send, StickyNote, Trash2, X } from 'lucide-react';
import { deleteRecordDraft, loadRecordDraft, saveRecordDraft } from '../services/dataService';
import { getCurrentDraftCycleKey, getNextDraftResetAt, isDraftCurrent } from '../utils/draftExpiry';
import { getDeviceId } from '../utils/deviceId';

interface QuickMemoPadProps {
  organizationId?: string;
  userId?: string;
  recorderId?: string;
  allowLocalSensitiveStorage?: boolean;
  children?: Array<{ id: string; name: string }>;
  onCreateHandover?: (content: string, childId?: string) => Promise<void> | void;
}

interface QuickMemoPayload {
  version: 1 | 2;
  content: string;
  updatedAt: string;
  draftCycleKey?: string;
}

type SaveStatus = 'restored' | 'saving' | 'saved' | 'reset' | 'error' | null;

interface MemoPosition {
  x: number;
  y: number;
}

interface MemoDragState {
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  active: boolean;
}

const MEMO_TRIGGER_SIZE = 56;

function readMemoPosition(storageKey: string): MemoPosition | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || 'null') as Partial<MemoPosition> | null;
    return value && Number.isFinite(value.x) && Number.isFinite(value.y)
      ? { x: Number(value.x), y: Number(value.y) }
      : null;
  } catch {
    return null;
  }
}

function clampMemoPosition(position: MemoPosition): MemoPosition {
  const safeTop = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-safe-area-top')) || 0;
  const edge = 10;
  return {
    x: Math.min(Math.max(position.x, edge), Math.max(edge, window.innerWidth - MEMO_TRIGGER_SIZE - edge)),
    y: Math.min(Math.max(position.y, safeTop + edge), Math.max(safeTop + edge, window.innerHeight - MEMO_TRIGGER_SIZE - edge)),
  };
}

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

export const QuickMemoPad: React.FC<QuickMemoPadProps> = ({
  organizationId,
  userId,
  recorderId,
  allowLocalSensitiveStorage = true,
  children = [],
  onCreateHandover,
}) => {
  const draftKey = `quick-memo-${recorderId || 'account'}`;
  const storageKey = `support-quick-memo-v1:${organizationId || 'local'}:${userId || 'local'}:${recorderId || 'account'}`;
  const positionStorageKey = `support-quick-memo-position-v1:${organizationId || 'local'}:${userId || 'local'}:${recorderId || 'account'}`;
  const initialLocal = useMemo(() => readLocalMemo(storageKey), [storageKey]);
  const localUpdatedAt = useRef(initialLocal?.updatedAt || '');
  const [content, setContent] = useState(initialLocal?.content || '');
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(!organizationId || !userId);
  const [status, setStatus] = useState<SaveStatus>(initialLocal ? 'restored' : null);
  const [forwarding, setForwarding] = useState(false);
  const [handoverChildId, setHandoverChildId] = useState('');
  const [position, setPosition] = useState<MemoPosition | null>(() => readMemoPosition(positionStorageKey));
  const [dragging, setDragging] = useState(false);
  const skipNextSave = useRef(false);
  const sheetRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const longPressTimer = useRef<number | null>(null);
  const dragState = useRef<MemoDragState | null>(null);
  const suppressNextClick = useRef(false);
  const deviceId = useRef(getDeviceId()).current;
  const remoteRevision = useRef<number | null>(null);
  const [sheetTransformOrigin, setSheetTransformOrigin] = useState('100% 100%');
  const writeLocalMemo = (payload: QuickMemoPayload, remoteConfirmed = false) => {
    try {
      if (allowLocalSensitiveStorage) localStorage.setItem(storageKey, JSON.stringify(payload));
      else if (remoteConfirmed) localStorage.removeItem(storageKey);
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (!organizationId || !userId) return;
    let alive = true;
    setReady(false);
    void loadRecordDraft(organizationId, draftKey)
      .then((remote) => {
        if (!alive || !remote) return;
        remoteRevision.current = remote.revision;
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
          writeLocalMemo(restored, true);
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
  }, [draftKey, organizationId, storageKey, userId, allowLocalSensitiveStorage]);

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
    if (!writeLocalMemo(payload)) {
      setStatus('error');
      return;
    }

    if (!organizationId || !userId) {
      setStatus('saved');
      return;
    }

    setStatus('saving');
    const timer = window.setTimeout(() => {
      void saveRecordDraft(organizationId, userId, draftKey, payload, {
        deviceId,
        expectedRevision: remoteRevision.current,
        recorderId: recorderId || null,
      })
        .then((saved) => {
          remoteRevision.current = saved.revision;
          if (!allowLocalSensitiveStorage) localStorage.removeItem(storageKey);
          setStatus('saved');
        })
        .catch(() => setStatus('error'));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [content, deviceId, draftKey, organizationId, ready, recorderId, storageKey, userId, allowLocalSensitiveStorage]);

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

  useEffect(() => {
    const stored = readMemoPosition(positionStorageKey);
    setPosition(stored ? clampMemoPosition(stored) : null);
  }, [positionStorageKey]);

  useEffect(() => () => {
    document.documentElement.classList.remove('quick-memo-drag-active');
  }, []);

  const updateSheetTransformOrigin = () => {
    const sheet = sheetRef.current;
    const trigger = triggerRef.current;
    if (!sheet || !trigger) return;
    const triggerRect = trigger.getBoundingClientRect();
    const computed = getComputedStyle(sheet);
    const left = computed.left !== 'auto'
      ? Number.parseFloat(computed.left)
      : window.innerWidth - Number.parseFloat(computed.right || '0') - sheet.offsetWidth;
    const top = computed.top !== 'auto'
      ? Number.parseFloat(computed.top)
      : window.innerHeight - Number.parseFloat(computed.bottom || '0') - sheet.offsetHeight;
    const originX = triggerRect.left + triggerRect.width / 2 - left;
    const originY = triggerRect.top + triggerRect.height / 2 - top;
    setSheetTransformOrigin(`${originX}px ${originY}px`);
  };

  useLayoutEffect(() => {
    updateSheetTransformOrigin();
  }, [position, open]);

  useEffect(() => {
    const handleResize = () => {
      setPosition((current) => {
        if (!current) return null;
        const next = clampMemoPosition(current);
        localStorage.setItem(positionStorageKey, JSON.stringify(next));
        return next;
      });
      window.requestAnimationFrame(updateSheetTransformOrigin);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [positionStorageKey]);

  const clearLongPressTimer = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    clearLongPressTimer();
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      active: false,
    };
    longPressTimer.current = window.setTimeout(() => {
      if (!dragState.current || dragState.current.pointerId !== event.pointerId) return;
      dragState.current.active = true;
      triggerRef.current?.setPointerCapture(event.pointerId);
      document.documentElement.classList.add('quick-memo-drag-active');
      window.getSelection()?.removeAllRanges();
      setDragging(true);
      navigator.vibrate?.(35);
    }, 430);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (!state.active) {
      if (Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > 8) {
        clearLongPressTimer();
        dragState.current = null;
      }
      return;
    }
    event.preventDefault();
    setPosition(clampMemoPosition({
      x: event.clientX - state.offsetX,
      y: event.clientY - state.offsetY,
    }));
  };

  const finishPointerInteraction = (event: React.PointerEvent<HTMLButtonElement>) => {
    clearLongPressTimer();
    const state = dragState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (state.active) {
      suppressNextClick.current = true;
      setPosition((current) => {
        if (!current) return null;
        const next = clampMemoPosition(current);
        localStorage.setItem(positionStorageKey, JSON.stringify(next));
        return next;
      });
      setDragging(false);
      document.documentElement.classList.remove('quick-memo-drag-active');
      if (triggerRef.current?.hasPointerCapture(event.pointerId)) triggerRef.current.releasePointerCapture(event.pointerId);
      window.setTimeout(() => { suppressNextClick.current = false; }, 0);
    }
    dragState.current = null;
  };

  const clearMemo = () => {
    if (content && !window.confirm('クイックメモの内容をすべて消去しますか？')) return;
    setContent('');
  };

  const createHandover = async () => {
    if (!content.trim() || !onCreateHandover) return;
    const targetName = children.find((child) => child.id === handoverChildId)?.name || '事業所全体';
    if (!window.confirm(`${targetName}への「申し送り」として登録しますか？登録後、メモ欄は空になります。`)) return;
    setForwarding(true);
    try {
      await onCreateHandover(content.trim(), handoverChildId || undefined);
      setContent('');
      setHandoverChildId('');
    } finally {
      setForwarding(false);
    }
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
          ? allowLocalSensitiveStorage
            ? '端末には保存済み・共有保存に失敗'
            : 'クラウド保存に失敗・端末保存なし'
          : allowLocalSensitiveStorage
            ? '入力すると自動保存'
            : '入力するとクラウドだけに保存';

  return createPortal(
    <>
      <section
        ref={sheetRef}
        aria-label="クイックメモ"
        aria-hidden={!open}
        style={{ transformOrigin: sheetTransformOrigin }}
        className={`quick-memo-sheet fixed inset-x-3 z-50 max-h-[min(68vh,34rem)] overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 shadow-2xl transition-[transform,opacity] duration-300 ease-out sm:inset-x-auto sm:w-96 ${
          open ? 'pointer-events-auto scale-100 opacity-100' : 'pointer-events-none scale-[0.08] opacity-0'
        }`}
      >
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-100/80 px-4 py-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-amber-950">
              <StickyNote className="h-4 w-4" />クイックメモ
            </h3>
            <p className="mt-0.5 text-[11px] text-amber-800">
              {allowLocalSensitiveStorage ? '自動保存' : 'クラウド保存・端末内保存なし'}・毎日午前3時リセット／アイコンは長押しで移動
            </p>
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
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {onCreateHandover && (
              <div className="space-y-2 sm:col-span-2">
                <label className="block text-[11px] font-black text-amber-950">
                  申し送りの対象
                  <select value={handoverChildId} onChange={(event) => setHandoverChildId(event.target.value)} tabIndex={open ? 0 : -1} className="mt-1 min-h-11 w-full rounded-lg border border-amber-300 bg-white px-3 text-sm text-slate-900">
                    <option value="">事業所全体（全児童の記録画面に表示）</option>
                    {children.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => void createHandover()}
                  disabled={!content.trim() || forwarding}
                  tabIndex={open ? 0 : -1}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 text-xs font-bold text-white disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />{forwarding ? '登録中...' : '申し送りに登録'}
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={clearMemo}
              disabled={!content}
              tabIndex={open ? 0 : -1}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3 text-xs font-bold text-rose-700 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />メモを消去
            </button>
          </div>
        </div>
      </section>

      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (suppressNextClick.current) return;
          setOpen((current) => !current);
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerInteraction}
        onPointerCancel={finishPointerInteraction}
        onContextMenu={(event) => event.preventDefault()}
        onDragStart={(event) => event.preventDefault()}
        draggable={false}
        aria-expanded={open}
        aria-label={open ? 'メモ帳をしまう' : 'クイックメモを開く'}
        title="タップで開く・長押しして移動"
        style={position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto', touchAction: 'none' } : { touchAction: 'none' }}
        className={`quick-memo-trigger fixed z-50 flex h-14 w-14 items-center justify-center rounded-full border-2 shadow-xl transition-[transform,background-color,border-color,box-shadow] duration-200 ${dragging ? 'scale-110 cursor-grabbing ring-4 ring-amber-200' : 'active:scale-95'} ${
          open
            ? 'rotate-6 border-amber-300 bg-amber-100 text-amber-950'
            : 'border-amber-300 bg-amber-400 text-amber-950 hover:-translate-y-1 hover:bg-amber-300'
        }`}
      >
        {open ? <X className="h-6 w-6" /> : <StickyNote className="h-6 w-6" />}
        {!open && content && <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" aria-label="保存済みメモあり" />}
      </button>
    </>,
    document.body,
  );
};
