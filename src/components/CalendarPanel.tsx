import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Filter, MapPin, Plus, Search, Trash2, X } from 'lucide-react';
import { getLocalDateString } from '../utils/weekdays';
import type {
  CalendarEvent,
  CalendarEventType,
  CalendarRecurrence,
  CalendarVisibility,
  ChildProfile,
  RecorderProfile,
} from '../types';

const EVENT_TYPES: CalendarEventType[] = [
  '会議', '外出', '朝礼', '研修', '保護者面談', '学校行事', '事業所行事', '提出期限', '職員休み', 'その他',
];
const BUSINESS_EVENT_TYPES = new Set<CalendarEventType>(EVENT_TYPES);
const COLORS = ['#0f766e', '#0891b2', '#2563eb', '#4f46e5', '#7c3aed', '#c026d3', '#db2777', '#e11d48', '#dc2626', '#ea580c', '#ca8a04', '#65a30d', '#059669', '#475569'];
type CalendarView = 'month' | 'week' | 'day' | 'agenda';

interface CalendarPanelProps {
  events: CalendarEvent[];
  recorderProfiles: RecorderProfile[];
  childrenList: ChildProfile[];
  selectedDate: string;
  onDateChange: (date: string) => void;
  canEdit: boolean;
  onSave: (event: CalendarEvent) => Promise<void> | void;
  onDelete: (eventId: string) => Promise<void> | void;
}

export const CalendarPanel: React.FC<CalendarPanelProps> = ({
  events,
  recorderProfiles,
  childrenList,
  selectedDate,
  onDateChange,
  canEdit,
  onSave,
  onDelete,
}) => {
  const [view, setView] = useState<CalendarView>(() => window.matchMedia('(max-width: 767px)').matches ? 'agenda' : 'month');
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [staffFilterOpen, setStaffFilterOpen] = useState(false);
  const [staffFilterIds, setStaffFilterIds] = useState<string[]>([]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const handleChange = (event: MediaQueryListEvent) => setView(event.matches ? 'agenda' : 'month');
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);
  const visibleDates = useMemo(() => datesForView(view, selectedDate), [view, selectedDate]);
  const visibleEvents = useMemo(() => events
    .filter((event) => BUSINESS_EVENT_TYPES.has(event.eventType))
    .filter((event) => staffFilterIds.length === 0 || event.recorderProfileIds.some((id) => staffFilterIds.includes(id)))
    .filter((event) => eventOccursInRange(event, visibleDates[0], visibleDates.at(-1) || visibleDates[0]))
    .sort((left, right) => `${left.date}${left.startTime || ''}`.localeCompare(`${right.date}${right.startTime || ''}`)),
  [events, staffFilterIds, visibleDates]);
  const openEvent = (event: CalendarEvent) => {
    setEditing(event);
  };

  const openNew = () => {
    const now = new Date().toISOString();
    setEditing({
      id: createUuid(),
      title: '',
      eventType: 'その他',
      date: selectedDate,
      allDay: false,
      startTime: '10:00',
      endTime: '11:00',
      recorderProfileIds: [],
      childIds: [],
      notificationEnabled: false,
      visibility: '全体',
      color: COLORS[0],
      recurrence: 'なし',
      createdAt: now,
      updatedAt: now,
    });
    setError('');
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.title.trim()) return setError('予定名を入力してください。');
    if (editing.eventType === '職員休み' && editing.recorderProfileIds.length === 0) return setError('休みを登録する職員を選択してください。');
    if (editing.endDate && editing.endDate < editing.date) return setError('終了日は開始日以降にしてください。');
    if (!editing.allDay && !editing.startTime) return setError('開始時刻を入力してください。');
    if (!editing.allDay && editing.endTime && editing.startTime && editing.startTime >= editing.endTime) {
      return setError('終了時刻は開始時刻より後にしてください。');
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ ...editing, title: editing.title.trim(), updatedAt: new Date().toISOString() });
      setEditing(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '予定を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing || !window.confirm('この予定を削除しますか？')) return;
    setSaving(true);
    try {
      await onDelete(editing.id);
      setEditing(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '予定を削除できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="border-b border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-black text-slate-900"><CalendarDays className="h-5 w-5 text-teal-700" />業務カレンダー</h3>
            <p className="mt-1 text-xs text-slate-600">会議・外出・研修・面談・行事など、業務上の予定を確認します。勤務予定は出勤予定画面で管理します。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {([['month', '月'], ['week', '週'], ['day', '日'], ['agenda', '今日']] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setView(value)} className={`min-h-10 rounded-lg border px-3 text-xs font-black ${view === value ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{label}</button>
            ))}
            {canEdit && <button type="button" onClick={openNew} className="flex min-h-10 items-center gap-1 rounded-lg bg-slate-900 px-3 text-xs font-black text-white"><Plus className="h-4 w-4" />予定追加</button>}
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-2">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setStaffFilterOpen((open) => !open)} aria-expanded={staffFilterOpen} className={`flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-black ${staffFilterIds.length ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}><Filter className="h-4 w-4" />参加職員で絞り込み{staffFilterIds.length ? `（${staffFilterIds.length}名）` : ''}</button>
            {staffFilterIds.length > 0 && <button type="button" onClick={() => setStaffFilterIds([])} className="min-h-9 rounded-lg px-3 text-xs font-black text-indigo-700">全職員の予定へ戻す</button>}
            <p className="text-[10px] font-bold text-slate-500">選択した職員が参加予定に登録されている予定だけを表示します。</p>
          </div>
          {staffFilterOpen && <div className="mt-2"><CheckGrid title="表示する職員" values={staffFilterIds} options={recorderProfiles.filter((profile) => profile.active).map((profile) => ({ id: profile.id, label: profile.displayName }))} onChange={setStaffFilterIds} /></div>}
        </div>
        <div className="mx-auto mt-3 flex max-w-md items-center justify-center gap-1.5 rounded-xl bg-white p-1.5 shadow-sm">
          <button type="button" aria-label="前の期間" onClick={() => onDateChange(shiftCalendarPeriod(selectedDate, view, -1))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white"><ChevronLeft className="h-4 w-4" /></button>
          <input type="date" value={selectedDate} onChange={(event) => onDateChange(event.target.value)} className={`min-h-10 min-w-0 flex-1 rounded-lg border px-2 text-center text-xs font-black sm:max-w-44 ${selectedDate === getLocalDateString() ? 'border-amber-400 bg-amber-50 text-amber-950' : 'border-teal-300 bg-teal-50 text-teal-950'}`} />
          <button type="button" aria-label="次の期間" onClick={() => onDateChange(shiftCalendarPeriod(selectedDate, view, 1))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </header>

      {view === 'month' ? (
        <MonthGrid dates={visibleDates} events={visibleEvents} selectedDate={selectedDate} today={getLocalDateString()} onSelectDate={onDateChange} onOpen={openEvent} />
      ) : (
        <AgendaList dates={visibleDates} events={visibleEvents} onOpen={openEvent} />
      )}

      {editing && (
        <EventDialog
          event={editing}
          onChange={setEditing}
          recorderProfiles={recorderProfiles}
          childrenList={childrenList}
          saving={saving}
          error={error}
          canEdit={canEdit}
          canDelete={events.some((event) => event.id === editing.id)}
          onClose={() => !saving && setEditing(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </section>
  );
};

function MonthGrid({ dates, events, selectedDate, today, onSelectDate, onOpen }: {
  dates: string[];
  events: CalendarEvent[];
  selectedDate: string;
  today: string;
  onSelectDate: (date: string) => void;
  onOpen: (event: CalendarEvent) => void;
}) {
  const weeks = Array.from({ length: Math.ceil(dates.length / 7) }, (_, index) => dates.slice(index * 7, index * 7 + 7));
  const selectedMonth = selectedDate.slice(0, 7);
  return <div className="overflow-x-auto"><div className="min-w-[700px]">
    <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-100">{['日', '月', '火', '水', '木', '金', '土'].map((day, index) => <div key={day} className={`p-2 text-center text-xs font-black ${index === 0 ? 'text-rose-700' : index === 6 ? 'text-sky-700' : 'text-slate-600'}`}>{day}</div>)}</div>
    {weeks.map((week) => {
      const weekStart = week[0];
      const weekEnd = week.at(-1) || weekStart;
      const weekEvents = events.filter((event) => eventOccursInRange(event, weekStart, weekEnd)).slice(0, 3);
      return <div key={weekStart} className="grid grid-cols-7">{week.map((date) => {
        const dayEvents = events.filter((event) => eventOccursOn(event, date));
        const selected = date === selectedDate;
        const isToday = date === today;
        const weekday = new Date(`${date}T12:00:00`).getDay();
        const holiday = isJapaneseHoliday(date);
        const outsideMonth = date.slice(0, 7) !== selectedMonth;
        return <div key={date} className={`min-h-28 border-b border-r px-1.5 pb-1.5 pt-1 ${selected ? 'border-teal-200 bg-teal-50' : isToday ? 'border-amber-300 bg-amber-50' : outsideMonth ? 'border-slate-100 bg-slate-50/70' : 'border-slate-100 bg-white'}`}>
          <button type="button" onClick={() => onSelectDate(date)} className={`mb-1 flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-black ${selected ? 'bg-teal-600 text-white' : isToday ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-200' : holiday || weekday === 0 ? 'text-rose-700' : weekday === 6 ? 'text-sky-700' : outsideMonth ? 'text-slate-300' : 'text-slate-700'}`}>{Number(date.slice(-2))}{isToday && <span className="ml-1 text-[7px]">本日</span>}</button>
          <div className="space-y-1">{weekEvents.map((event) => {
            if (!eventOccursOn(event, date)) return <span key={event.id} className="block h-[22px]" />;
            const segment = eventSegment(event, date, weekStart, weekEnd);
            const segmentWidth = segment.starts && segment.ends
              ? 'w-full'
              : segment.starts
                ? 'w-[calc(100%+0.375rem)]'
                : segment.ends
                  ? '-ml-1.5 w-[calc(100%+0.375rem)]'
                  : '-ml-1.5 w-[calc(100%+0.75rem)]';
            return <button key={event.id} type="button" onClick={() => onOpen(event)} title={event.title} className={`relative z-[1] block h-[22px] truncate px-1.5 text-left text-[9px] font-bold leading-[22px] text-white ${segmentWidth} ${segment.starts ? 'rounded-l' : 'rounded-l-none'} ${segment.ends ? 'rounded-r' : 'rounded-r-none'}`} style={{ backgroundColor: event.color }}>{segment.showLabel ? `${event.allDay ? '' : `${event.startTime || ''} `}${event.title}` : '\u00a0'}</button>;
          })}{dayEvents.length > weekEvents.filter((event) => eventOccursOn(event, date)).length && <p className="text-[9px] font-bold text-slate-500">ほか{dayEvents.length - weekEvents.filter((event) => eventOccursOn(event, date)).length}件</p>}</div>
        </div>;
      })}</div>;
    })}
  </div></div>;
}

function AgendaList({ dates, events, onOpen }: { dates: string[]; events: CalendarEvent[]; onOpen: (event: CalendarEvent) => void }) {
  return <div className="space-y-4 p-3 sm:p-4">{dates.map((date) => {
    const dayEvents = events.filter((event) => eventOccursOn(event, date));
    const weekday = new Date(`${date}T12:00:00`).getDay();
    return <section key={date}><h4 className={`mb-2 text-xs font-black ${isJapaneseHoliday(date) || weekday === 0 ? 'text-rose-700' : weekday === 6 ? 'text-sky-700' : 'text-slate-600'}`}>{new Date(`${date}T00:00:00`).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}</h4>{dayEvents.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-400">予定なし</p> : <div className="space-y-2">{dayEvents.map((event) => <button key={event.id} type="button" onClick={() => onOpen(event)} className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left"><span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: event.color }} /><span className="w-16 shrink-0 text-xs font-black text-slate-600">{event.allDay ? '終日' : event.startTime || '時刻未定'}</span><span className="min-w-0 flex-1"><strong className="block text-sm text-slate-900">{event.title}</strong><span className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-500">{event.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{event.location}</span>}<span>{event.eventType}</span></span></span></button>)}</div>}</section>;
  })}</div>;
}

function EventDialog({ event, onChange, recorderProfiles, childrenList, saving, error, canEdit, canDelete, onClose, onSave, onDelete }: {
  event: CalendarEvent;
  onChange: (event: CalendarEvent) => void;
  recorderProfiles: RecorderProfile[];
  childrenList: ChildProfile[];
  saving: boolean;
  error: string;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const update = <K extends keyof CalendarEvent>(key: K, value: CalendarEvent[K]) => onChange({ ...event, [key]: value });
  return <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4"><div role="dialog" aria-modal="true" aria-label="カレンダー予定" className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3"><div><p className="text-xs font-bold text-teal-700">カレンダー</p><h3 className="font-black text-slate-900">予定の詳細</h3></div><button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100"><X className="h-5 w-5" /></button></header>
    <fieldset disabled={!canEdit || saving} className="space-y-4 p-4 sm:p-6">
      <label className="block text-sm font-bold text-slate-700">予定名<input value={event.title} onChange={(e) => update('title', e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
      <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm font-bold text-slate-700">種類<select value={event.eventType} onChange={(e) => { const eventType = e.target.value as CalendarEventType; onChange(eventType === '職員休み' ? { ...event, eventType, title: event.title.trim() ? event.title : '職員休み', allDay: true, startTime: undefined, endTime: undefined, color: '#e11d48', childIds: [] } : { ...event, eventType }); }} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3">{EVENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label><label className="text-sm font-bold text-slate-700">開始日<input type="date" value={event.date} onChange={(e) => update('date', e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label><label className="text-sm font-bold text-slate-700">終了日（任意）<input type="date" min={event.date} value={event.endDate || ''} onChange={(e) => update('endDate', e.target.value || undefined)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label></div>
      {event.eventType === '職員休み' && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold leading-relaxed text-rose-900">対象職員を選ぶと、出勤予定・シフト表・配車の職員ガントに「休み」として反映します。勤務予定そのものは業務カレンダーへ表示しません。</p>}
      <label className="flex min-h-11 items-center gap-3 rounded-xl bg-slate-50 px-3 text-sm font-bold"><input type="checkbox" checked={event.allDay} onChange={(e) => update('allDay', e.target.checked)} className="h-5 w-5" />終日の予定</label>
      {!event.allDay && <div className="grid grid-cols-2 gap-3"><label className="text-sm font-bold text-slate-700">開始<input type="time" value={event.startTime || ''} onChange={(e) => update('startTime', e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label><label className="text-sm font-bold text-slate-700">終了<input type="time" value={event.endTime || ''} onChange={(e) => update('endTime', e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label></div>}
      <label className="block text-sm font-bold text-slate-700">場所<input value={event.location || ''} onChange={(e) => update('location', e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
      <CheckGrid title="対象職員" values={event.recorderProfileIds} options={recorderProfiles.map((profile) => ({ id: profile.id, label: profile.displayName }))} onChange={(values) => update('recorderProfileIds', values)} />
      {event.eventType !== '職員休み' && <CheckGrid title="対象児童" values={event.childIds} options={childrenList.map((child) => ({ id: child.id, label: child.name }))} onChange={(values) => update('childIds', values)} />}
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold text-slate-700">繰り返し<select value={event.recurrence} onChange={(e) => update('recurrence', e.target.value as CalendarRecurrence)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3">{(['なし', '毎日', '毎週', '毎月'] as CalendarRecurrence[]).map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-sm font-bold text-slate-700">公開範囲<select value={event.visibility} onChange={(e) => update('visibility', e.target.value as CalendarVisibility)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3">{(['全体', '関係者のみ', '管理者のみ'] as CalendarVisibility[]).map((value) => <option key={value}>{value}</option>)}</select></label></div>
      <div><p className="mb-2 text-sm font-bold text-slate-700">色分け</p><div className="flex flex-wrap gap-2">{COLORS.map((color) => <button key={color} type="button" aria-label={`色 ${color}`} onClick={() => update('color', color)} className={`h-9 w-9 rounded-full border-4 ${event.color === color ? 'border-slate-900 ring-2 ring-slate-300' : 'border-white'}`} style={{ backgroundColor: color }} />)}</div></div>
      <label className="flex min-h-11 items-center gap-3 rounded-xl bg-slate-50 px-3 text-sm font-bold"><input type="checkbox" checked={event.notificationEnabled} onChange={(e) => update('notificationEnabled', e.target.checked)} className="h-5 w-5" /><span>予定前の自動通知<span className="mt-0.5 block text-[10px] font-normal text-slate-500">予定時刻が近づいたら登録端末へ通知します</span></span></label>
      <label className="block text-sm font-bold text-slate-700">補足<textarea rows={3} value={event.note || ''} onChange={(e) => update('note', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-3" /></label>
      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
    </fieldset>
    <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white p-4 sm:flex-row sm:justify-between">{canEdit && canDelete && <button type="button" disabled={saving} onClick={onDelete} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-300 px-4 text-sm font-bold text-rose-700"><Trash2 className="h-4 w-4" />削除</button>}<div className="flex gap-2"><button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-xl border border-slate-300 px-4 text-sm font-bold sm:flex-none">閉じる</button>{canEdit && <button type="button" disabled={saving} onClick={onSave} className="min-h-11 flex-1 rounded-xl bg-teal-600 px-5 text-sm font-black text-white sm:flex-none">{saving ? '保存中...' : '保存'}</button>}</div></footer>
  </div></div>;
}

function CheckGrid({ title, values, options, onChange }: { title: string; values: string[]; options: { id: string; label: string }[]; onChange: (values: string[]) => void }) {
  const [search, setSearch] = useState('');
  const displayed = options.filter((option) => option.label.normalize('NFKC').toLowerCase().includes(search.normalize('NFKC').toLowerCase()));
  return <div><p className="mb-2 text-sm font-bold text-slate-700">{title}（検索・複数選択可）</p><label className="relative mb-2 block"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`${title}を検索`} className="min-h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm" /></label><div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto rounded-xl border border-slate-200 p-2 sm:grid-cols-3">{displayed.map((option) => { const selected = values.includes(option.id); return <button key={option.id} type="button" onClick={() => onChange(selected ? values.filter((id) => id !== option.id) : [...values, option.id])} className={`min-h-10 rounded-lg border px-2 text-xs font-bold ${selected ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{option.label}</button>; })}{displayed.length === 0 && <p className="col-span-full p-3 text-center text-xs text-slate-400">一致する候補がありません</p>}</div></div>;
}

function datesForView(view: CalendarView, selectedDate: string) {
  const selected = new Date(`${selectedDate}T00:00:00`);
  if (view === 'day' || view === 'agenda') return [selectedDate];
  const start = new Date(selected);
  if (view === 'week') start.setDate(start.getDate() - start.getDay());
  else {
    start.setDate(1);
    start.setDate(start.getDate() - start.getDay());
  }
  const length = view === 'week' ? 7 : 42;
  return Array.from({ length }, (_, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    return localDate(date);
  });
}

function eventOccursOn(event: CalendarEvent, date: string) {
  if (event.recurrence === 'なし') return event.endDate
    ? event.date <= date && event.endDate >= date
    : event.date === date;
  if (date < event.date || (event.endDate && date > event.endDate)) return false;
  if (event.recurrence === '毎日') return true;
  const start = new Date(`${event.date}T00:00:00`);
  const target = new Date(`${date}T00:00:00`);
  if (event.recurrence === '毎週') return start.getDay() === target.getDay();
  return start.getDate() === target.getDate();
}

function eventOccursInRange(event: CalendarEvent, start: string, end: string) {
  if (event.recurrence !== 'なし') return event.date <= end && (!event.endDate || event.endDate >= start);
  return event.date <= end && (event.endDate || event.date) >= start;
}

function eventSegment(event: CalendarEvent, date: string, weekStart: string, weekEnd: string) {
  if (event.recurrence !== 'なし') return { starts: true, ends: true, showLabel: true };
  const displayStart = event.date < weekStart ? weekStart : event.date;
  const eventEnd = event.endDate || event.date;
  const displayEnd = eventEnd > weekEnd ? weekEnd : eventEnd;
  return {
    starts: date === displayStart,
    ends: date === displayEnd,
    showLabel: date === displayStart,
  };
}

const japaneseHolidayCache = new Map<number, Set<string>>();

function isJapaneseHoliday(date: string) {
  const year = Number(date.slice(0, 4));
  let holidays = japaneseHolidayCache.get(year);
  if (!holidays) {
    holidays = buildJapaneseHolidays(year);
    japaneseHolidayCache.set(year, holidays);
  }
  return holidays.has(date);
}

function buildJapaneseHolidays(year: number) {
  const holidays = new Set<string>();
  const add = (month: number, day: number) => holidays.add(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  const nthMonday = (month: number, nth: number) => {
    const first = new Date(year, month - 1, 1);
    return 1 + ((8 - first.getDay()) % 7) + (nth - 1) * 7;
  };
  const vernal = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  const autumnal = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  add(1, 1); add(1, nthMonday(1, 2)); add(2, 11);
  if (year >= 2020) add(2, 23);
  add(3, vernal); add(4, 29); add(5, 3); add(5, 4); add(5, 5);
  if (year === 2020) { add(7, 23); add(7, 24); add(8, 10); }
  else if (year === 2021) { add(7, 22); add(7, 23); add(8, 8); }
  else { add(7, nthMonday(7, 3)); add(8, 11); }
  add(9, nthMonday(9, 3)); add(9, autumnal);
  if (year === 2020) add(7, 24);
  else if (year === 2021) add(7, 23);
  else add(10, nthMonday(10, 2));
  add(11, 3); add(11, 23);

  // 国民の休日（祝日に挟まれた平日）
  for (let month = 1; month <= 12; month += 1) {
    const lastDay = new Date(year, month, 0).getDate();
    for (let day = 2; day < lastDay; day += 1) {
      const current = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (holidays.has(current)) continue;
      const previous = localDate(new Date(year, month - 1, day - 1));
      const next = localDate(new Date(year, month - 1, day + 1));
      if (holidays.has(previous) && holidays.has(next)) holidays.add(current);
    }
  }
  // 振替休日（日曜の祝日後、最初の祝日でない日）
  [...holidays].sort().forEach((holiday) => {
    const source = new Date(`${holiday}T12:00:00`);
    if (source.getDay() !== 0) return;
    const substitute = new Date(source);
    do substitute.setDate(substitute.getDate() + 1); while (holidays.has(localDate(substitute)));
    if (substitute.getFullYear() === year) holidays.add(localDate(substitute));
  });
  return holidays;
}

function shiftCalendarPeriod(date: string, view: CalendarView, amount: number) {
  const next = new Date(`${date}T12:00:00`);
  if (view === 'month') {
    const targetDay = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + amount);
    next.setDate(Math.min(targetDay, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  }
  else next.setDate(next.getDate() + amount * (view === 'week' ? 7 : 1));
  return localDate(next);
}

function localDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function createUuid() { return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `calendar-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
