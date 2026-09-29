import React, { useEffect, useState } from 'react';
import type { ChildProfile } from '../types';
import { listMeetingProgress } from './meetingService';
import type { MeetingProgressRecord } from './types';

export function MeetingProgressList({ organizationId, childrenList, onOpenMeetings }: {
  organizationId?: string; childrenList: ChildProfile[]; onOpenMeetings: (meetingId?: string, childId?: string) => void;
}) {
  const [items, setItems] = useState<MeetingProgressRecord[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!organizationId) return;
    let active = true;
    void listMeetingProgress(organizationId).then((records) => {
      if (active) setItems(records);
    }).catch(() => { if (active) setError('会議由来の記録を読み込めませんでした。'); });
    return () => { active = false; };
  }, [organizationId]);
  if (!organizationId) return null;
  return <section className="rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm" aria-label="会議由来の支援経過記録">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-black text-slate-900">会議由来の支援経過</h2><p className="text-xs text-slate-600">日々の利用記録とは別の記録です。</p></div><button className="min-h-10 rounded-xl bg-indigo-700 px-4 py-2 text-sm font-bold text-white" onClick={() => onOpenMeetings()}>会議支援を開く</button></div>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    <div className="mt-3 space-y-2">{items.slice(0, 20).map((record) => <button key={record.id} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-indigo-400" onClick={() => onOpenMeetings(record.meetingId, record.childId)}><span><span className="font-bold">{record.recordDate}　{childrenList.find((child) => child.id === record.childId)?.name || '児童'}</span><span className="mt-1 block text-xs text-slate-600">{record.body.slice(0, 100)}</span></span><span className="shrink-0 text-xs font-bold text-indigo-700">{record.approvalStatus}</span></button>)}{items.length === 0 && !error && <p className="text-sm text-slate-500">会議由来の記録はまだありません。</p>}</div>
  </section>;
}
