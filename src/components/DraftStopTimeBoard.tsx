import React, { useMemo } from 'react';
import type { ChildProfile, TransportDirection, TransportRun } from '../types';
import { getTransportProgram } from '../utils/transportDeparture';
import { draftTimeBoardRows, groupDraftTimeBoardStops, timeBoardWindowMinutes, type DraftTimeBoardGroup } from '../utils/transportTimeBoard';

interface DraftStopTimeBoardProps {
  direction: TransportDirection;
  drafts: TransportRun[];
  childrenList: ChildProfile[];
  sameLocationTimeWindowMinutes: number;
}

export const DraftStopTimeBoard: React.FC<DraftStopTimeBoardProps> = ({ direction, drafts, childrenList, sameLocationTimeWindowMinutes }) => {
  const windowMinutes = timeBoardWindowMinutes(sameLocationTimeWindowMinutes);
  const groups = useMemo(() => groupDraftTimeBoardStops(drafts, direction, windowMinutes), [drafts, direction, windowMinutes]);
  const rows = useMemo(() => draftTimeBoardRows(groups), [groups]);
  const childrenById = useMemo(() => new Map(childrenList.map((child) => [child.id, child])), [childrenList]);
  const unscheduled = groups.filter((group) => group.firstMinute === undefined);

  const renderGroup = (group: DraftTimeBoardGroup) => {
    const runNames = [...new Map(group.items.map((item) => [item.runId, item.runName])).values()];
    const timeLabel = group.firstTime
      ? group.firstTime === group.lastTime ? group.firstTime : `${group.firstTime}〜${group.lastTime}`
      : '未計算';
    return (
      <article key={group.key} aria-label={`${group.locationName} ${timeLabel}`} className={`rounded-lg border-l-4 bg-white p-2 shadow-sm ${direction === '迎え' ? 'border-sky-500' : 'border-violet-500'}`}>
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
          <strong className="min-w-0 truncate text-[10px] text-slate-950" title={group.locationName}>{group.locationName}</strong>
          <span className="shrink-0 text-[10px] font-black tabular-nums text-teal-800">{timeLabel}</span>
        </div>
        {group.address && <span className="mt-0.5 block truncate text-[8px] font-bold text-slate-400" title={group.address}>{group.address}</span>}
        <div className="mt-1 space-y-0.5">
          {group.items.map((item) => {
            const child = item.stop.childId ? childrenById.get(item.stop.childId) : undefined;
            const program = child ? getTransportProgram(child) : undefined;
            return <p key={item.key} className="flex items-center justify-between gap-2 text-[9px] font-black text-slate-700">
              <span className="flex min-w-0 items-center gap-1"><span className="truncate">{item.stop.childName || '児童'}</span>{program && <span className={`shrink-0 rounded px-1 py-0.5 text-[6px] ${program === 'キャリアズ' ? 'bg-violet-100 text-violet-900' : 'bg-sky-100 text-sky-900'}`}>{program}</span>}</span>
              <span className="shrink-0 tabular-nums text-teal-800">{item.time || '未計算'}</span>
            </p>;
          })}
        </div>
        <span className={`mt-1 block text-[8px] font-bold ${runNames.length > 1 ? 'text-amber-700' : 'text-slate-500'}`}>{runNames.length > 1 ? '複数便：' : '便：'}{runNames.join('・')}</span>
      </article>
    );
  };

  return (
    <section aria-label={`${direction}先・時間表`} className="flex min-h-[22rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm lg:h-full lg:min-h-0">
      <header className="shrink-0 border-b border-slate-200 p-3">
        <p className="text-[9px] font-black text-teal-700">編集内容をリアルタイム反映</p>
        <h3 className="mt-0.5 text-sm font-black text-slate-950">{direction}先・時間表</h3>
        <p className="mt-1 text-[9px] font-bold text-slate-500">同じ送迎先・時間差{windowMinutes}分以内でまとめます。時刻未計算は別表示です。</p>
      </header>
      <div className="ui-scrollbar min-h-0 flex-1 overflow-y-auto bg-slate-50/60 p-2">
        {groups.length === 0 ? <p className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-5 text-center text-[10px] font-bold text-slate-400">児童を便へ配置すると表示されます。</p> : <>
          {rows.map((row) => <div key={row.time} data-time={row.time} className="grid grid-cols-[2.8rem_minmax(0,1fr)] border-t border-slate-200 first:border-t-0">
            <time className={`py-2 pr-1 text-[9px] font-black tabular-nums ${row.groups.length ? 'text-teal-800' : 'text-slate-500'}`}>{row.time}</time>
            <div className="space-y-1 border-l border-slate-200 py-1.5 pl-2">{row.groups.map(renderGroup)}</div>
          </div>)}
          {unscheduled.length > 0 && <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2">
            <p className="mb-1 text-[9px] font-black text-amber-900">時刻未計算</p><div className="space-y-1">{unscheduled.map(renderGroup)}</div>
          </div>}
        </>}
      </div>
    </section>
  );
};
