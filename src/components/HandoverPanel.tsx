import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardPlus, MessageSquareText, Plus, X } from 'lucide-react';
import type {
  ChildProfile,
  HandoverCategory,
  HandoverItem,
  HandoverPriority,
  HandoverStatus,
  RecorderProfile,
} from '../types';

interface HandoverPanelProps {
  items: HandoverItem[];
  childrenList: ChildProfile[];
  activeRecorder?: RecorderProfile;
  onSave: (item: HandoverItem) => Promise<void> | void;
  onStatusChange: (itemId: string, status: HandoverStatus) => Promise<void> | void;
}

const categories: HandoverCategory[] = ['申し送り', '保護者連絡', 'けが・事故', '次回確認', 'その他'];
const priorities: HandoverPriority[] = ['通常', '重要', '緊急'];

export const HandoverPanel: React.FC<HandoverPanelProps> = ({
  items,
  childrenList,
  activeRecorder,
  onSave,
  onStatusChange,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [childId, setChildId] = useState('');
  const [category, setCategory] = useState<HandoverCategory>('申し送り');
  const [priority, setPriority] = useState<HandoverPriority>('通常');
  const [content, setContent] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);

  const visibleItems = items
    .filter((item) => showCompleted || item.status !== '完了')
    .sort((left, right) => {
      const priorityOrder = { 緊急: 0, 重要: 1, 通常: 2 };
      return priorityOrder[left.priority] - priorityOrder[right.priority]
        || left.status.localeCompare(right.status, 'ja')
        || right.createdAt.localeCompare(left.createdAt);
    });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      await onSave({
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `handover-${Date.now()}`,
        childId: childId || undefined,
        category,
        content: content.trim(),
        priority,
        status: '未対応',
        dueDate: dueDate || undefined,
        createdByRecorderId: activeRecorder?.id,
        createdByRecorderName: activeRecorder?.displayName,
        createdAt: now,
        updatedAt: now,
      });
      setContent('');
      setChildId('');
      setCategory('申し送り');
      setPriority('通常');
      setDueDate('');
      setShowForm(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-indigo-100 bg-indigo-50/70 p-5">
        <div>
          <h3 className="flex items-center gap-2 text-base font-black text-slate-900">
            <MessageSquareText className="h-5 w-5 text-indigo-700" />重要事項・引き継ぎ
          </h3>
          <p className="mt-1 text-xs text-slate-600">未対応事項を職員間で共有し、対応状況を管理します。</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((current) => !current)}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 text-xs font-bold text-white"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? '閉じる' : '新規登録'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="space-y-3 border-b border-indigo-100 bg-indigo-50/30 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-bold text-slate-700">
              対象児童（任意）
              <select value={childId} onChange={(event) => setChildId(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
                <option value="">事業所全体</option>
                {childrenList.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-700">
              種別
              <select value={category} onChange={(event) => setCategory(event.target.value as HandoverCategory)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
                {categories.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-700">
              重要度
              <select value={priority} onChange={(event) => setPriority(event.target.value as HandoverPriority)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
                {priorities.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-xs font-bold text-slate-700">
            内容
            <textarea
              rows={4}
              required
              maxLength={4000}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="対応が必要な内容を、簡潔に入力してください。"
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-base leading-relaxed"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="text-xs font-bold text-slate-700">
              対応期限（任意）
              <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" />
            </label>
            <button type="submit" disabled={busy || !content.trim()} className="min-h-11 self-end rounded-xl bg-indigo-600 px-5 text-sm font-black text-white disabled:bg-slate-300">
              {busy ? '登録中...' : '引き継ぎを登録'}
            </button>
          </div>
        </form>
      )}

      <div className="divide-y divide-slate-100">
        {visibleItems.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-500">未対応の引き継ぎ事項はありません。</p>
        )}
        {visibleItems.map((item) => {
          const child = childrenList.find((candidate) => candidate.id === item.childId);
          const urgent = item.priority === '緊急';
          return (
            <article key={item.id} className={`p-4 ${urgent ? 'bg-rose-50/60' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-1 text-[10px] font-black ${
                  item.priority === '緊急'
                    ? 'bg-rose-600 text-white'
                    : item.priority === '重要'
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-slate-100 text-slate-700'
                }`}>{item.priority}</span>
                <span className="rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-bold text-indigo-800">{item.category}</span>
                <span className="text-xs font-bold text-slate-700">{child?.name || '事業所全体'}</span>
                {item.dueDate && <span className="text-[10px] text-slate-500">期限 {item.dueDate}</span>}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-relaxed text-slate-900">{item.content}</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[10px] text-slate-500">
                  登録者：{item.createdByRecorderName || '職員'}・{new Date(item.createdAt).toLocaleString('ja-JP')}
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['未対応', '対応中', '完了'] as HandoverStatus[]).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => void onStatusChange(item.id, status)}
                      className={`min-h-10 rounded-lg border px-2 text-[11px] font-bold ${
                        item.status === status
                          ? status === '完了'
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-300 bg-white text-slate-600'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {items.some((item) => item.status === '完了') && (
        <button
          type="button"
          onClick={() => setShowCompleted((current) => !current)}
          className="flex min-h-11 w-full items-center justify-center gap-2 border-t border-slate-100 bg-slate-50 text-xs font-bold text-slate-600"
        >
          {showCompleted ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          {showCompleted ? '完了項目を隠す' : '完了項目も表示'}
        </button>
      )}
    </section>
  );
};
