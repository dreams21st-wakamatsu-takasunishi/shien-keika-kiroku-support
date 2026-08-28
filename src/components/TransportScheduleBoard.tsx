import React, { useMemo, useState } from 'react';
import { BusFront, CalendarClock, MapPin, Users } from 'lucide-react';

export interface TransportScheduleRunLike {
  id: string;
  name: string;
  direction: '迎え' | '送り';
  startTime: string;
  endTime: string;
  driverName?: string;
  vehicleName?: string;
  status: string;
  stops: Array<{
    id: string;
    childName?: string;
    locationName?: string;
    location?: string;
    plannedTime?: string;
  }>;
}

interface TransportScheduleBoardProps {
  runs: TransportScheduleRunLike[];
  selectedRunId?: string;
  onSelectRun?: (runId: string) => void;
  emptyText?: string;
  compact?: boolean;
}

const START_HOUR = 7;
const END_HOUR = 21;
const SLOT_HEIGHT = 58;
const PALETTE = [
  ['bg-sky-100', 'border-sky-400', 'text-sky-950'],
  ['bg-violet-100', 'border-violet-400', 'text-violet-950'],
  ['bg-amber-100', 'border-amber-400', 'text-amber-950'],
  ['bg-emerald-100', 'border-emerald-400', 'text-emerald-950'],
  ['bg-rose-100', 'border-rose-400', 'text-rose-950'],
] as const;

function timeToMinutes(value?: string) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return START_HOUR * 60;
  return Number(match[1]) * 60 + Number(match[2]);
}

function shortTime(value?: string) {
  return String(value || '').slice(0, 5) || '未定';
}

function runPalette(run: TransportScheduleRunLike, index: number) {
  if (run.direction === '迎え') return PALETTE[index % PALETTE.length];
  return PALETTE[(index + 1) % PALETTE.length];
}

export const TransportScheduleBoard: React.FC<TransportScheduleBoardProps> = ({
  runs,
  selectedRunId,
  onSelectRun,
  emptyText = '送迎便はありません。',
  compact = false,
}) => {
  const [mobileView, setMobileView] = useState<'list' | 'schedule'>('list');
  const orderedRuns = useMemo(
    () => [...runs].sort((left, right) => left.startTime.localeCompare(right.startTime) || left.name.localeCompare(right.name, 'ja')),
    [runs],
  );
  const timelineLayout = useMemo(() => {
    const columnEnds: number[] = [];
    const items = orderedRuns.map((run, index) => {
      const start = timeToMinutes(run.startTime);
      const end = Math.max(start + 20, timeToMinutes(run.endTime));
      let column = columnEnds.findIndex((columnEnd) => columnEnd <= start);
      if (column < 0) column = columnEnds.length;
      columnEnds[column] = end;
      return { run, index, column };
    });
    return { items, columnCount: Math.max(1, columnEnds.length) };
  }, [orderedRuns]);
  const timelineHeight = (END_HOUR - START_HOUR) * SLOT_HEIGHT;

  if (orderedRuns.length === 0) {
    return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-bold text-slate-400">{emptyText}</div>;
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black text-slate-950"><CalendarClock className="h-4 w-4 text-teal-600" />本日の送迎スケジュール</h3>
          <p className="mt-0.5 text-[10px] font-bold text-slate-500">便を選ぶと詳細と操作を確認できます。</p>
        </div>
        <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 md:hidden">
          <button type="button" onClick={() => setMobileView('list')} className={`min-h-9 rounded-lg px-3 text-[11px] font-black ${mobileView === 'list' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>便リスト</button>
          <button type="button" onClick={() => setMobileView('schedule')} className={`min-h-9 rounded-lg px-3 text-[11px] font-black ${mobileView === 'schedule' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>時間表</button>
        </div>
      </header>

      <div className={`grid min-h-0 ${compact ? 'md:grid-cols-[minmax(190px,.7fr)_minmax(330px,1.3fr)]' : 'md:grid-cols-[minmax(220px,.72fr)_minmax(400px,1.28fr)]'}`}>
        <div className={`${mobileView === 'schedule' ? 'hidden md:block' : 'block'} border-slate-200 md:border-r`}>
          <div className="max-h-[34rem] space-y-1.5 overflow-y-auto p-2.5">
            {orderedRuns.map((run, index) => {
              const selected = selectedRunId === run.id;
              const colors = runPalette(run, index);
              return (
                <button key={run.id} type="button" onClick={() => onSelectRun?.(run.id)} aria-pressed={selected} className={`w-full rounded-xl border p-2.5 text-left transition ${selected ? `${colors[0]} ${colors[1]} ring-2 ring-offset-1 ring-teal-500` : 'border-slate-200 bg-slate-50 hover:border-slate-400 hover:bg-white'}`}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <strong className="block truncate text-xs text-slate-950">{run.name}</strong>
                      <span className="mt-0.5 block text-[10px] font-black text-slate-700">{shortTime(run.startTime)}〜{shortTime(run.endTime)}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${run.direction === '迎え' ? 'bg-sky-600 text-white' : 'bg-violet-600 text-white'}`}>{run.direction}</span>
                  </span>
                  <span className="mt-2 grid grid-cols-2 gap-1 text-[9px] font-bold text-slate-600">
                    <span className="truncate"><BusFront className="mr-1 inline h-3 w-3" />{run.vehicleName || '車両未設定'}</span>
                    <span className="truncate"><Users className="mr-1 inline h-3 w-3" />{run.driverName || '運転未設定'}</span>
                  </span>
                  <span className="mt-1.5 flex items-center justify-between text-[9px] text-slate-500"><span>{run.stops.length}地点</span><span>{run.status}</span></span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={`${mobileView === 'list' ? 'hidden md:block' : 'block'} overflow-x-auto bg-slate-50/70`}>
          <div className="relative min-w-[390px]" style={{ height: `${timelineHeight + 24}px` }}>
            {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => {
              const hour = START_HOUR + index;
              return (
                <div key={hour} className="absolute inset-x-0 border-t border-slate-200" style={{ top: `${index * SLOT_HEIGHT + 12}px` }}>
                  <span className="absolute left-2 top-0 -translate-y-1/2 rounded bg-slate-50 px-1 text-[9px] font-black text-slate-500">{hour}:00</span>
                </div>
              );
            })}
            <div className="absolute bottom-3 left-[3.7rem] right-2 top-3">
              {timelineLayout.items.map(({ run, index, column }) => {
                const start = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60, timeToMinutes(run.startTime)));
                const end = Math.max(start + 20, Math.min(END_HOUR * 60, timeToMinutes(run.endTime)));
                const top = ((start - START_HOUR * 60) / 60) * SLOT_HEIGHT;
                const height = Math.max(44, ((end - start) / 60) * SLOT_HEIGHT);
                const colors = runPalette(run, index);
                const selected = selectedRunId === run.id;
                return (
                  <button key={run.id} type="button" onClick={() => onSelectRun?.(run.id)} aria-pressed={selected} className={`absolute overflow-hidden rounded-xl border-l-4 px-2 py-2 text-left shadow-sm transition ${colors.join(' ')} ${selected ? 'z-20 ring-2 ring-teal-500 ring-offset-2' : 'z-10 hover:brightness-95'}`} style={{ top: `${top}px`, minHeight: `${height}px`, left: `calc(${(column / timelineLayout.columnCount) * 100}% + 2px)`, width: `calc(${100 / timelineLayout.columnCount}% - 4px)` }}>
                    <strong className="block truncate text-[11px]">{shortTime(run.startTime)} {run.name}</strong>
                    <span className="mt-0.5 block truncate text-[9px] font-bold opacity-80">{run.vehicleName || '車両未設定'}・{run.driverName || '運転未設定'}</span>
                    {height >= 58 && run.stops[0] && <span className="mt-1 flex min-w-0 items-center gap-1 truncate text-[9px] font-bold opacity-80"><MapPin className="h-3 w-3 shrink-0" />{run.stops[0].locationName || run.stops[0].childName || run.stops[0].location || '送迎先未設定'}{run.stops.length > 1 ? `ほか${run.stops.length - 1}地点` : ''}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
