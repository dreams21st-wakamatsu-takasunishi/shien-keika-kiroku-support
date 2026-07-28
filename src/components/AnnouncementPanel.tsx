import React, { useMemo, useState } from 'react';
import {
  Bell,
  BellRing,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  Megaphone,
  Plus,
  Send,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import type {
  Announcement,
  AnnouncementConfirmation,
  AnnouncementPriority,
  RecorderProfile,
  UserProfile,
} from '../types';
import { deviceNotificationsSupported, enableDeviceNotifications } from '../utils/deviceNotifications';

interface AnnouncementPanelProps {
  announcements: Announcement[];
  confirmations: AnnouncementConfirmation[];
  recorderProfiles: RecorderProfile[];
  organizationId?: string;
  activeRecorder?: RecorderProfile;
  currentUser?: UserProfile | null;
  canCreate: boolean;
  canArchive: boolean;
  onOpenRecord?: (recordId: string) => void;
  onSave: (announcement: Announcement) => Promise<void> | void;
  onArchive: (announcementId: string) => Promise<void> | void;
  onSaveConfirmation: (confirmation: AnnouncementConfirmation) => Promise<void> | void;
}

export const AnnouncementPanel: React.FC<AnnouncementPanelProps> = ({
  announcements,
  confirmations,
  recorderProfiles,
  organizationId,
  activeRecorder,
  currentUser,
  canCreate,
  canArchive,
  onOpenRecord,
  onSave,
  onArchive,
  onSaveConfirmation,
}) => {
  const [composerOpen, setComposerOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<AnnouncementPriority>('normal');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const timestamp = Date.now();
  const visible = useMemo(() => announcements
    .filter((item) => !item.expiresAt || new Date(item.expiresAt).getTime() >= timestamp)
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt)), [announcements, timestamp]);
  const actor = activeRecorder
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
      : {
          confirmerKey: 'user:local-user',
          recorderProfileId: undefined,
          userId: undefined,
          confirmerName: 'ローカル職員',
        };

  const receiptFor = (announcement: Announcement) => confirmations.find((confirmation) =>
    confirmation.announcementId === announcement.id
    && confirmation.confirmerKey === actor.confirmerKey
  );
  const isCurrent = (date: string | undefined, announcement: Announcement) =>
    Boolean(date && new Date(date).getTime() >= new Date(announcement.updatedAt).getTime());
  const unreadCount = visible.filter((announcement) =>
    !isCurrent(receiptFor(announcement)?.readAt, announcement)
  ).length;
  const displayed = showAll ? visible : visible.slice(0, 4);

  const saveReceipt = async (announcement: Announcement, confirmed: boolean) => {
    const existing = receiptFor(announcement);
    const now = new Date().toISOString();
    await onSaveConfirmation({
      announcementId: announcement.id,
      ...actor,
      readAt: isCurrent(existing?.readAt, announcement) ? existing!.readAt : now,
      confirmedAt: confirmed ? now : existing?.confirmedAt,
    });
  };

  const toggleAnnouncement = async (announcement: Announcement) => {
    const opening = !expandedIds.includes(announcement.id);
    setExpandedIds((previous) => opening
      ? [...previous, announcement.id]
      : previous.filter((id) => id !== announcement.id)
    );
    if (opening && !isCurrent(receiptFor(announcement)?.readAt, announcement)) {
      try {
        await saveReceipt(announcement, false);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '既読状態を保存できませんでした。');
      }
    }
  };

  const enableNotifications = async () => {
    if (!organizationId) {
      setMessage('共有データベース接続時に通知を設定できます。');
      return;
    }
    try {
      const result = await enableDeviceNotifications(organizationId);
      setMessage(result.pushEnabled
        ? 'この端末への通知を有効にしました。'
        : '通知を許可しました。VAPID公開鍵の設定後、アプリを閉じている時の通知も有効になります。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '通知を設定できませんでした。');
    }
  };

  const submit = async () => {
    if (!title.trim() || !content.trim()) {
      setMessage('件名と本文を入力してください。');
      return;
    }
    const createdAt = new Date().toISOString();
    const announcement: Announcement = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `announcement-${Date.now()}`,
      title: title.trim(),
      content: content.trim(),
      priority,
      sourceType: 'manual',
      publishedAt: createdAt,
      expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : undefined,
      createdByRecorderId: activeRecorder?.id,
      createdByName: activeRecorder?.displayName || currentUser?.displayName,
      createdAt,
      updatedAt: createdAt,
    };
    setBusy(true);
    setMessage('');
    try {
      await onSave(announcement);
      setTitle('');
      setContent('');
      setPriority('normal');
      setExpiresAt('');
      setComposerOpen(false);
      setMessage('お知らせを送信しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'お知らせを送信できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-indigo-50 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-black text-indigo-950">
            <Megaphone className="h-4 w-4 text-indigo-700" />お知らせ
            {visible.length > 0 && <span className="rounded-full bg-indigo-700 px-2 py-0.5 text-[10px] text-white">{visible.length}件</span>}
            {unreadCount > 0 && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] text-white">未読 {unreadCount}</span>}
          </h2>
          <p className="mt-0.5 text-[10px] text-indigo-800">件名を選ぶと内容を表示し、自動的に既読になります。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {deviceNotificationsSupported() && (
            <button type="button" onClick={() => void enableNotifications()} className="flex min-h-10 items-center gap-1 rounded-lg border border-indigo-300 bg-white px-3 text-xs font-black text-indigo-800">
              <Bell className="h-4 w-4" />端末通知
            </button>
          )}
          {canCreate && (
            <button type="button" onClick={() => setComposerOpen((current) => !current)} className="flex min-h-10 items-center gap-1 rounded-lg bg-indigo-700 px-3 text-xs font-black text-white">
              {composerOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {composerOpen ? '閉じる' : '作成'}
            </button>
          )}
        </div>
      </header>

      {message && <p aria-live="polite" className="border-t border-indigo-100 bg-indigo-50/60 px-4 py-2 text-xs font-bold text-indigo-900">{message}</p>}

      {composerOpen && canCreate && (
        <div className="space-y-3 border-t border-indigo-100 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black text-slate-900">新しいお知らせ</p>
            <p className="text-[10px] text-slate-500">送信者：{activeRecorder?.displayName || currentUser?.displayName || '職員'}</p>
          </div>
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="件名" className="min-h-12 w-full rounded-xl border border-slate-300 px-3 text-sm" />
          <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={2000} rows={4} placeholder="共有する内容" className="w-full rounded-xl border border-slate-300 p-3 text-sm" />
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <label className="text-xs font-black text-slate-700">重要度
              <select value={priority} onChange={(event) => setPriority(event.target.value as AnnouncementPriority)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
                <option value="normal">通常</option>
                <option value="important">重要</option>
                <option value="urgent">緊急</option>
              </select>
            </label>
            <label className="text-xs font-black text-slate-700">表示期限（任意）
              <input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" />
            </label>
            <button type="button" disabled={busy} onClick={() => void submit()} className="min-h-11 self-end rounded-xl bg-indigo-700 px-5 text-sm font-black text-white disabled:opacity-50">
              <Send className="mr-1 inline h-4 w-4" />{busy ? '送信中' : '送信'}
            </button>
          </div>
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {visible.length === 0 && <p className="px-4 py-4 text-xs text-slate-500">現在のお知らせはありません。</p>}
        {displayed.map((announcement) => {
          const expanded = expandedIds.includes(announcement.id);
          const receipt = receiptFor(announcement);
          const read = isCurrent(receipt?.readAt, announcement);
          const confirmed = isCurrent(receipt?.confirmedAt, announcement);
          const announcementReceipts = confirmations.filter((confirmation) =>
            confirmation.announcementId === announcement.id
            && isCurrent(confirmation.readAt, announcement)
          );
          const confirmedReceipts = announcementReceipts.filter((confirmation) =>
            isCurrent(confirmation.confirmedAt, announcement)
          );
          const tone = announcement.sourceType === 'record_correction' || announcement.priority === 'urgent'
            ? 'bg-rose-50'
            : announcement.priority === 'important'
              ? 'bg-amber-50'
              : 'bg-white';
          return (
            <article key={announcement.id} className={tone}>
              <button type="button" onClick={() => void toggleAnnouncement(announcement)} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left">
                {announcement.sourceType === 'record_correction'
                  ? <Wrench className="h-4 w-4 shrink-0 text-rose-700" />
                  : <BellRing className="h-4 w-4 shrink-0 text-indigo-700" />}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="truncate text-sm text-slate-950">{announcement.title}</strong>
                    {!read && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[9px] font-black text-white">未読</span>}
                    {confirmed && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-800">確認済み</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                    {new Date(announcement.publishedAt).toLocaleString('ja-JP')}・{announcement.createdByName || '職員'}
                  </span>
                </span>
                <span className="hidden text-[10px] font-bold text-slate-500 sm:block">
                  既読 {announcementReceipts.length}・確認 {confirmedReceipts.length}
                </span>
                {expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />}
              </button>

              {expanded && (
                <div className="border-t border-slate-200/80 px-4 pb-4 pt-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{announcement.content}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {announcement.relatedRecordId && onOpenRecord && (
                      <button type="button" onClick={() => onOpenRecord(announcement.relatedRecordId!)} className="flex min-h-10 items-center gap-1 rounded-lg bg-rose-600 px-3 text-xs font-black text-white">
                        <Wrench className="h-4 w-4" />該当記録を開く
                      </button>
                    )}
                    {!confirmed && (
                      <button type="button" onClick={() => void saveReceipt(announcement, true)} className="flex min-h-10 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-black text-white">
                        <Check className="h-4 w-4" />確認しました
                      </button>
                    )}
                    {confirmed && <span className="flex min-h-10 items-center gap-1 rounded-lg bg-emerald-100 px-3 text-xs font-black text-emerald-800"><Check className="h-4 w-4" />確認済み</span>}
                    {canArchive && announcement.sourceType !== 'record_correction' && (
                      <button type="button" onClick={() => void onArchive(announcement.id)} className="ml-auto flex min-h-10 items-center gap-1 rounded-lg px-3 text-xs font-bold text-rose-700 hover:bg-rose-100">
                        <Trash2 className="h-4 w-4" />表示を終了
                      </button>
                    )}
                  </div>

                  <details className="mt-3 rounded-lg border border-slate-200 bg-white">
                    <summary className="flex min-h-10 cursor-pointer items-center gap-2 px-3 text-xs font-bold text-slate-700">
                      <Eye className="h-4 w-4" />確認状況を見る
                    </summary>
                    <div className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-600">
                      <p>既読：{announcementReceipts.map((item) => item.confirmerName).join('、') || 'まだありません'}</p>
                      <p className="mt-1">確認済み：{confirmedReceipts.map((item) => item.confirmerName).join('、') || 'まだありません'}</p>
                      {recorderProfiles.length > 0 && (
                        <p className="mt-1 text-slate-400">登録指導員 {recorderProfiles.length}名</p>
                      )}
                    </div>
                  </details>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {visible.length > 4 && (
        <button type="button" onClick={() => setShowAll((current) => !current)} className="flex min-h-11 w-full items-center justify-center gap-1 border-t border-slate-200 text-xs font-black text-indigo-700">
          {showAll ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {showAll ? '表示を少なくする' : `残り${visible.length - 4}件を表示`}
        </button>
      )}
    </section>
  );
};
