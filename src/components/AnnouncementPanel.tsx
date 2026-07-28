import React, { useMemo, useState } from 'react';
import { Bell, BellRing, Megaphone, Plus, Send, Trash2, X } from 'lucide-react';
import type { Announcement, AnnouncementPriority } from '../types';
import { deviceNotificationsSupported, enableDeviceNotifications } from '../utils/deviceNotifications';

interface AnnouncementPanelProps {
  announcements: Announcement[];
  organizationId?: string;
  canManage: boolean;
  currentUserName?: string;
  onSave: (announcement: Announcement) => Promise<void> | void;
  onArchive: (announcementId: string) => Promise<void> | void;
}

export const AnnouncementPanel: React.FC<AnnouncementPanelProps> = ({
  announcements,
  organizationId,
  canManage,
  currentUserName,
  onSave,
  onArchive,
}) => {
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<AnnouncementPriority>('normal');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const now = new Date();
  const visible = useMemo(() => announcements.filter((item) =>
    !item.expiresAt || new Date(item.expiresAt).getTime() >= now.getTime()
  ), [announcements, now]);

  const enableNotifications = async () => {
    if (!organizationId) {
      setMessage('共有データベース接続時に通知を設定できます。');
      return;
    }
    try {
      const result = await enableDeviceNotifications(organizationId);
      setMessage(result.pushEnabled
        ? 'この端末への通知を有効にしました。アプリを閉じている時も通知できます。'
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
      publishedAt: createdAt,
      expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : undefined,
      createdByName: currentUserName,
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
      setMessage('お知らせを送信しました。通知許可済みの端末へ配信します。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'お知らせを送信できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 bg-indigo-50 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-black text-indigo-950">
            <Megaphone className="h-4 w-4 text-indigo-700" />お知らせ
            {visible.length > 0 && <span className="rounded-full bg-indigo-700 px-2 py-0.5 text-[10px] text-white">{visible.length}件</span>}
          </h2>
          <p className="mt-0.5 text-[10px] text-indigo-800">重要事項をホーム上部と端末通知で共有します。</p>
        </div>
        <div className="flex gap-2">
          {deviceNotificationsSupported() && (
            <button type="button" onClick={() => void enableNotifications()} className="flex min-h-10 items-center gap-1 rounded-lg border border-indigo-300 bg-white px-3 text-xs font-black text-indigo-800">
              <Bell className="h-4 w-4" />この端末の通知
            </button>
          )}
          {canManage && (
            <button type="button" onClick={() => setComposerOpen((current) => !current)} className="flex min-h-10 items-center gap-1 rounded-lg bg-indigo-700 px-3 text-xs font-black text-white">
              {composerOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {composerOpen ? '閉じる' : 'お知らせ作成'}
            </button>
          )}
        </div>
      </header>

      {message && <p aria-live="polite" className="border-t border-indigo-100 bg-indigo-50/60 px-4 py-2 text-xs font-bold text-indigo-900">{message}</p>}

      {composerOpen && canManage && (
        <div className="space-y-3 border-t border-indigo-100 bg-white p-4">
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="お知らせの件名" className="min-h-12 w-full rounded-xl border border-slate-300 px-3 text-sm" />
          <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={2000} rows={5} placeholder="全端末へ共有する内容" className="w-full rounded-xl border border-slate-300 p-3 text-sm" />
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
        {visible.length === 0 && <p className="px-4 py-3 text-xs text-slate-500">現在のお知らせはありません。</p>}
        {visible.slice(0, 5).map((announcement) => (
          <article key={announcement.id} className={`px-4 py-3 ${announcement.priority === 'urgent' ? 'bg-rose-50' : announcement.priority === 'important' ? 'bg-amber-50' : 'bg-white'}`}>
            <div className="flex items-start gap-3">
              <BellRing className={`mt-0.5 h-4 w-4 shrink-0 ${announcement.priority === 'urgent' ? 'text-rose-700' : announcement.priority === 'important' ? 'text-amber-700' : 'text-indigo-700'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-slate-950">{announcement.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{announcement.content}</p>
                <p className="mt-1 text-[10px] text-slate-500">{new Date(announcement.publishedAt).toLocaleString('ja-JP')}・{announcement.createdByName || '管理者'}</p>
              </div>
              {canManage && (
                <button type="button" onClick={() => void onArchive(announcement.id)} aria-label={`${announcement.title}を終了`} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg text-rose-700 hover:bg-rose-100">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
