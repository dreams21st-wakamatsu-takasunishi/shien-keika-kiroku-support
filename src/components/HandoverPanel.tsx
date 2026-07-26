import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ClipboardPlus,
  Filter,
  LoaderCircle,
  MessageSquareText,
  Plus,
  Search,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type {
  ChildProfile,
  HandoverCategory,
  HandoverConfirmation,
  HandoverItem,
  HandoverPriority,
  HandoverStatus,
  RecorderProfile,
  UserProfile,
} from '../types';

interface HandoverPanelProps {
  items: HandoverItem[];
  confirmations: HandoverConfirmation[];
  childrenList: ChildProfile[];
  recorderProfiles: RecorderProfile[];
  activeRecorder?: RecorderProfile;
  currentUser?: UserProfile | null;
  onSave: (item: HandoverItem) => Promise<void> | void;
  onStatusChange: (itemId: string, status: HandoverStatus) => Promise<void> | void;
  onSetConfirmation: (
    confirmation: HandoverConfirmation,
    confirmed: boolean
  ) => Promise<void> | void;
}

type StatusFilter = '未完了' | 'すべて' | HandoverStatus;
type ConfirmationFilter = 'すべて' | '自分が未確認' | '自分が確認済み';

const categories: HandoverCategory[] = ['申し送り', '保護者連絡', 'けが・事故', '次回確認', 'その他'];
const priorities: HandoverPriority[] = ['通常', '重要', '緊急'];
const statuses: HandoverStatus[] = ['未対応', '対応中', '完了'];
const priorityOrder: Record<HandoverPriority, number> = { 緊急: 0, 重要: 1, 通常: 2 };
const statusOrder: Record<HandoverStatus, number> = { 未対応: 0, 対応中: 1, 完了: 2 };

function isConfirmationCurrent(confirmation: HandoverConfirmation | undefined, item: HandoverItem) {
  if (!confirmation) return false;
  const confirmedTime = Date.parse(confirmation.confirmedAt);
  const updatedTime = Date.parse(item.updatedAt);
  if (Number.isNaN(confirmedTime) || Number.isNaN(updatedTime)) {
    return confirmation.confirmedAt >= item.updatedAt;
  }
  return confirmedTime >= updatedTime;
}

export const HandoverPanel: React.FC<HandoverPanelProps> = ({
  items,
  confirmations,
  childrenList,
  recorderProfiles,
  activeRecorder,
  currentUser,
  onSave,
  onStatusChange,
  onSetConfirmation,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [childId, setChildId] = useState('');
  const [category, setCategory] = useState<HandoverCategory>('申し送り');
  const [priority, setPriority] = useState<HandoverPriority>('通常');
  const [content, setContent] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignee, setAssignee] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('未完了');
  const [priorityFilter, setPriorityFilter] = useState<'すべて' | HandoverPriority>('すべて');
  const [confirmationFilter, setConfirmationFilter] = useState<ConfirmationFilter>('すべて');
  const [busy, setBusy] = useState(false);
  const [busyItemId, setBusyItemId] = useState('');
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());
  const [expandedConfirmationIds, setExpandedConfirmationIds] = useState<Set<string>>(new Set());

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

  const confirmationMap = useMemo(() => {
    const map = new Map<string, HandoverConfirmation[]>();
    confirmations.forEach((confirmation) => {
      map.set(confirmation.handoverItemId, [
        ...(map.get(confirmation.handoverItemId) || []),
        confirmation,
      ]);
    });
    return map;
  }, [confirmations]);

  const getCurrentActorConfirmation = (item: HandoverItem) =>
    confirmationActor
      ? confirmationMap.get(item.id)?.find((confirmation) =>
          confirmation.confirmerKey === confirmationActor.confirmerKey
        )
      : undefined;

  const visibleItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase('ja');
    return items
      .filter((item) => {
        if (statusFilter === '未完了' && item.status === '完了') return false;
        if (!['未完了', 'すべて'].includes(statusFilter) && item.status !== statusFilter) return false;
        if (priorityFilter !== 'すべて' && item.priority !== priorityFilter) return false;
        const actorConfirmed = isConfirmationCurrent(getCurrentActorConfirmation(item), item);
        if (confirmationFilter === '自分が未確認' && actorConfirmed) return false;
        if (confirmationFilter === '自分が確認済み' && !actorConfirmed) return false;
        if (!normalizedQuery) return true;
        const childName = childrenList.find((child) => child.id === item.childId)?.name || '事業所全体';
        return [item.content, item.category, item.priority, item.status, childName, item.assignee || '']
          .some((value) => value.toLocaleLowerCase('ja').includes(normalizedQuery));
      })
      .sort((left, right) => {
        const leftDue = left.dueDate || '9999-12-31';
        const rightDue = right.dueDate || '9999-12-31';
        return priorityOrder[left.priority] - priorityOrder[right.priority]
          || statusOrder[left.status] - statusOrder[right.status]
          || leftDue.localeCompare(rightDue)
          || right.createdAt.localeCompare(left.createdAt);
      });
  }, [
    childrenList,
    confirmationFilter,
    confirmationMap,
    confirmationActor,
    items,
    priorityFilter,
    searchQuery,
    statusFilter,
  ]);

  const openItems = items.filter((item) => item.status !== '完了');
  const urgentOpenCount = openItems.filter((item) => item.priority === '緊急').length;
  const unconfirmedOpenCount = confirmationActor
    ? openItems.filter((item) => !isConfirmationCurrent(getCurrentActorConfirmation(item), item)).length
    : 0;

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
        assignee: assignee.trim() || undefined,
        createdByRecorderId: activeRecorder?.id,
        createdByRecorderName: activeRecorder?.displayName || currentUser?.displayName,
        createdAt: now,
        updatedAt: now,
      });
      setContent('');
      setChildId('');
      setCategory('申し送り');
      setPriority('通常');
      setDueDate('');
      setAssignee('');
      setShowForm(false);
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (itemId: string, status: HandoverStatus) => {
    setBusyItemId(itemId);
    try {
      await Promise.resolve(onStatusChange(itemId, status));
    } finally {
      setBusyItemId('');
    }
  };

  const toggleConfirmation = async (item: HandoverItem) => {
    if (!confirmationActor) return;
    const current = getCurrentActorConfirmation(item);
    const confirmed = isConfirmationCurrent(current, item);
    setBusyItemId(item.id);
    try {
      await Promise.resolve(onSetConfirmation({
        handoverItemId: item.id,
        ...confirmationActor,
        confirmedAt: new Date().toISOString(),
      }, !confirmed));
    } finally {
      setBusyItemId('');
    }
  };

  const toggleConfirmationDetails = (itemId: string) => {
    setExpandedConfirmationIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const toggleItemDetails = (itemId: string) => {
    setExpandedItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
        setExpandedConfirmationIds((confirmationIds) => {
          const nextConfirmationIds = new Set(confirmationIds);
          nextConfirmationIds.delete(itemId);
          return nextConfirmationIds;
        });
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('未完了');
    setPriorityFilter('すべて');
    setConfirmationFilter('すべて');
  };

  const activeFilterCount = Number(Boolean(searchQuery.trim()))
    + Number(statusFilter !== '未完了')
    + Number(priorityFilter !== 'すべて')
    + Number(confirmationFilter !== 'すべて');

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm">
      <div className="border-b border-indigo-100 bg-indigo-50/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-black text-slate-900">
              <MessageSquareText className="h-5 w-5 text-indigo-700" />重要事項・申し送り
            </h3>
            <p className="mt-0.5 text-[10px] text-slate-600">未完了・緊急・未確認を優先して共有します。</p>
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

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={() => {
              setStatusFilter('未完了');
              setPriorityFilter('すべて');
            }}
            className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-white bg-white px-3 text-[10px] font-bold text-slate-600 shadow-xs"
          >
            未完了 <span className="font-black text-indigo-800">{openItems.length}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('未完了');
              setPriorityFilter('緊急');
            }}
            className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-rose-100 bg-white px-3 text-[10px] font-bold text-rose-700 shadow-xs"
          >
            緊急 <span className="font-black">{urgentOpenCount}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('未完了');
              setConfirmationFilter('自分が未確認');
            }}
            className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-amber-100 bg-white px-3 text-[10px] font-bold text-amber-800 shadow-xs"
          >
            自分が未確認 <span className="font-black">{unconfirmedOpenCount}</span>
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={submit} className="space-y-3 border-b border-indigo-100 bg-indigo-50/30 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-950">
            <ClipboardPlus className="h-4 w-4 text-indigo-600" />新しい申し送り
          </div>
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
              placeholder="誰が読んでも対応内容が分かるよう、簡潔に入力してください。"
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-base leading-relaxed"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-700">
              対応期限（任意）
              <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" />
            </label>
            <label className="text-xs font-bold text-slate-700">
              対応担当（任意）
              <input value={assignee} onChange={(event) => setAssignee(event.target.value)} maxLength={100} placeholder="例：山田指導員" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" />
            </label>
          </div>
          <button type="submit" disabled={busy || !content.trim()} className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-5 text-sm font-black text-white disabled:bg-slate-300 sm:ml-auto sm:w-auto">
            {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {busy ? '登録中...' : '申し送りを登録'}
          </button>
        </form>
      )}

      <div className="border-b border-slate-100 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-slate-500">
            {visibleItems.length}件・確認者：{confirmationActor?.confirmerName || '未選択'}
          </p>
          <button
            type="button"
            aria-expanded={showFilters}
            onClick={() => setShowFilters((current) => !current)}
            className="flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-[10px] font-bold text-indigo-800"
          >
            <Filter className="h-4 w-4" />検索・絞り込み
            {activeFilterCount > 0 && <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[9px] text-white">{activeFilterCount}</span>}
            <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {showFilters && (
          <div className="mt-2 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-3">
            <label className="relative block sm:col-span-3">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="児童名・内容・担当者で検索"
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm"
              />
            </label>
            <label className="text-[10px] font-bold text-slate-600">
              対応状況
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs">
                {(['未完了', 'すべて', ...statuses] as StatusFilter[]).map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label className="text-[10px] font-bold text-slate-600">
              重要度
              <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as 'すべて' | HandoverPriority)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs">
                {(['すべて', ...priorities] as const).map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label className="text-[10px] font-bold text-slate-600">
              確認状況
              <select value={confirmationFilter} onChange={(event) => setConfirmationFilter(event.target.value as ConfirmationFilter)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs">
                {(['すべて', '自分が未確認', '自分が確認済み'] as ConfirmationFilter[]).map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <button type="button" onClick={clearFilters} className="min-h-9 text-[10px] font-bold text-indigo-700 sm:col-span-3 sm:justify-self-end">
              条件をリセット
            </button>
          </div>
        )}
      </div>

      <div className="divide-y divide-slate-100">
        {visibleItems.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-500">条件に一致する申し送りはありません。</p>
        )}
        {visibleItems.map((item) => {
          const child = childrenList.find((candidate) => candidate.id === item.childId);
          const itemConfirmations = confirmationMap.get(item.id) || [];
          const validConfirmations = itemConfirmations.filter((confirmation) =>
            isConfirmationCurrent(confirmation, item)
          );
          const confirmedRecorderIds = new Set(validConfirmations.flatMap((confirmation) =>
            confirmation.recorderProfileId ? [confirmation.recorderProfileId] : []
          ));
          const actorReceipt = getCurrentActorConfirmation(item);
          const actorConfirmed = isConfirmationCurrent(actorReceipt, item);
          const itemExpanded = expandedItemIds.has(item.id);
          const confirmationDetailsExpanded = expandedConfirmationIds.has(item.id);
          const overdue = Boolean(
            item.dueDate
            && item.status !== '完了'
            && item.dueDate < new Date().toISOString().slice(0, 10)
          );
          return (
            <article key={item.id} className={`p-3 sm:p-4 ${item.priority === '緊急' ? 'bg-rose-50/60' : ''}`}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full px-2 py-1 text-[10px] font-black ${
                  item.priority === '緊急'
                    ? 'bg-rose-600 text-white'
                    : item.priority === '重要'
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-slate-100 text-slate-700'
                }`}>{item.priority}</span>
                <span className="rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-bold text-indigo-800">{item.category}</span>
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                  item.status === '完了'
                    ? 'bg-emerald-100 text-emerald-800'
                    : item.status === '対応中'
                      ? 'bg-sky-100 text-sky-800'
                      : 'bg-white text-slate-700'
                }`}>{item.status}</span>
                <span className="text-xs font-black text-slate-800">{child?.name || '事業所全体'}</span>
                {item.dueDate && (
                  <span className={`text-[10px] font-bold ${overdue ? 'text-rose-700' : 'text-slate-500'}`}>
                    {overdue ? '期限超過 ' : '期限 '}{item.dueDate}
                  </span>
                )}
              </div>

              <p className={`mt-2 whitespace-pre-wrap text-sm font-medium leading-relaxed text-slate-900 ${
                itemExpanded ? '' : 'line-clamp-2'
              }`}>{item.content}</p>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-[10px]">
                  <span className="flex items-center gap-1 font-bold text-emerald-800">
                    <Users className="h-3.5 w-3.5" />確認 {confirmedRecorderIds.size}/{recorderProfiles.length}
                  </span>
                  {item.assignee && <span className="truncate text-slate-500">担当：{item.assignee}</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!confirmationActor || busyItemId === item.id}
                    onClick={() => void toggleConfirmation(item)}
                    className={`flex min-h-10 items-center gap-1 rounded-lg px-2.5 text-[10px] font-black disabled:bg-slate-300 disabled:text-white ${
                      actorConfirmed
                        ? 'border border-emerald-300 bg-white text-emerald-800'
                        : 'bg-emerald-700 text-white'
                    }`}
                  >
                    {busyItemId === item.id
                      ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      : <UserCheck className="h-3.5 w-3.5" />}
                    {actorConfirmed ? '確認取消' : actorReceipt ? '再確認' : '確認する'}
                  </button>
                  <button
                    type="button"
                    aria-expanded={itemExpanded}
                    onClick={() => toggleItemDetails(item.id)}
                    className="flex min-h-10 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[10px] font-bold text-slate-700"
                  >
                    {itemExpanded ? '閉じる' : '詳細'}
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${itemExpanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>

              {itemExpanded && (
              <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                <p className="text-[10px] text-slate-500">
                  {item.assignee && <span className="mr-3 font-bold text-slate-700">対応担当：{item.assignee}</span>}
                  登録者：{item.createdByRecorderName || '職員'}・{new Date(item.createdAt).toLocaleString('ja-JP')}
                </p>

                <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-2.5">
                    <button
                      type="button"
                      aria-expanded={confirmationDetailsExpanded}
                      aria-label={`全指導員の確認状況 ${confirmedRecorderIds.size}/${recorderProfiles.length}名`}
                      onClick={() => toggleConfirmationDetails(item.id)}
                      className="flex min-h-9 w-full items-center justify-between gap-2 text-left text-[10px] font-black text-emerald-900"
                    >
                      <span className="flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-emerald-700" />
                        全指導員の確認状況
                      </span>
                      <span className="flex items-center gap-1">
                        {confirmedRecorderIds.size}/{recorderProfiles.length}名
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${confirmationDetailsExpanded ? 'rotate-180' : ''}`} />
                      </span>
                    </button>
                    {confirmationDetailsExpanded && (
                    <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                      {recorderProfiles.map((profile) => {
                        const receipt = itemConfirmations.find((confirmation) =>
                          confirmation.recorderProfileId === profile.id
                        );
                        const confirmed = isConfirmationCurrent(receipt, item);
                        return (
                          <div key={profile.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-[10px]">
                            <span className="truncate font-bold text-slate-700">{profile.displayName}</span>
                            <span className={`shrink-0 font-black ${
                              confirmed ? 'text-emerald-700' : receipt ? 'text-amber-700' : 'text-slate-400'
                            }`}>
                              {confirmed
                                ? `確認済 ${new Date(receipt.confirmedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
                                : receipt
                                  ? '再確認が必要'
                                  : '未確認'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </div>

                  <div>
                    <p className="mb-1 text-[9px] font-bold text-slate-500">対応状況</p>
                    <div className="grid grid-cols-3 gap-1.5 lg:min-w-64">
                      {statuses.map((status) => (
                        <button
                          key={status}
                          type="button"
                          disabled={busyItemId === item.id}
                          onClick={() => void changeStatus(item.id, status)}
                          className={`min-h-11 rounded-lg border px-2 text-[11px] font-bold disabled:opacity-50 ${
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
                </div>
              </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};
