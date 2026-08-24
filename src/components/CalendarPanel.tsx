import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, Plus, Trash2, X } from 'lucide-react';
import type {
  AttendanceRecord,
  CalendarEvent,
  CalendarEventType,
  CalendarRecurrence,
  CalendarVisibility,
  ChildProfile,
  RecorderProfile,
} from '../types';

const EVENT_TYPES: CalendarEventType[] = [
  '通常利用', '追加利用', '欠席', '勤務予定', '会議', '朝礼', '研修',
  '保護者面談', '学校行事', '事業所行事', '送迎予定', '提出期限', 'その他',
];
const COLORS = ['#0f766e', '#2563eb', '#7c3aed', '#ea580c', '#dc2626', '#475569'];
type CalendarView = 'month' | 'week' | 'day' | 'agenda';

interface CalendarPanelProps {
  events: CalendarEvent[];
  attendanceRecords: AttendanceRecord[];
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
  attendanceRecords,
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
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const handleChange = (event: MediaQueryListEvent) => setView(event.matches ? 'agenda' : 'month');
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);
  const visibleDates = useMemo(() => datesForView(view, selectedDate), [view, selectedDate]);
  const attendanceEvents = useMemo<CalendarEvent[]>(() => attendanceRecords.map((record) => ({
    id: `attendance:${record.id}`,
    title: `${record.recorderName}：${record.status}`,
    eventType: '勤務予定',
    date: record.date,
    allDay: !record.scheduledStartTime,
    startTime: record.scheduledStartTime,
    endTime: record.scheduledEndTime,
    recorderProfileIds: [record.recorderProfileId],
    childIds: [],
    notificationEnabled: false,
    visibility: '全体',
    color: ['欠勤', '有給', '公休', '特別休暇'].includes(record.status) ? '#7c3aed' : '#0f766e',
    recurrence: 'なし',
    note: record.note,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  })), [attendanceRecords]);
  const visibleEvents = useMemo(() => [...events, ...attendanceEvents]
    .filter((event) => eventOccursInRange(event, visibleDates[0], visibleDates.at(-1) || visibleDates[0]))
    .sort((left, right) => `${left.date}${left.startTime || ''}`.localeCompare(`${right.date}${right.startTime || ''}`)),
  [attendanceEvents, events, visibleDates]);
  const openEvent = (event: CalendarEvent) => {
    if (event.id.startsWith('attendance:')) return;
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
            <p className="mt-1 text-xs text-slate-600">利用予定・勤務・会議・面談・行事を一つの予定として管理します。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {([['month', '月'], ['week', '週'], ['day', '日'], ['agenda', '今日']] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setView(value)} className={`min-h-10 rounded-lg border px-3 text-xs font-black ${view === value ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{label}</button>
            ))}
            {canEdit && <button type="button" onClick={openNew} className="flex min-h-10 items-center gap-1 rounded-lg bg-slate-900 px-3 text-xs font-black text-white"><Plus className="h-4 w-4" />予定追加</button>}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" aria-label="前の期間" onClick={() => onDateChange(shiftDate(selectedDate, view === 'month' ? -30 : view === 'week' ? -7 : -1))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white"><ChevronLeft className="h-4 w-4" /></button>
          <input type="date" value={selectedDate} onChange={(event) => onDateChange(event.target.value)} className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold sm:max-w-52" />
          <button type="button" aria-label="次の期間" onClick={() => onDateChange(shiftDate(selectedDate, view === 'month' ? 30 : view === 'week' ? 7 : 1))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </header>

      {view === 'month' ? (
        <MonthGrid dates={visibleDates} events={visibleEvents} selectedDate={selectedDate} onSelectDate={onDateChange} onOpen={openEvent} />
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

function MonthGrid({ dates, events, selectedDate, onSelectDate, onOpen }: {
  dates: string[];
  events: CalendarEvent[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onOpen: (event: CalendarEvent) => void;
}) {
  return <div className="overflow-x-auto"><div className="min-w-[700px]">
    <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-100">{['日', '月', '火', '水', '木', '金', '土'].map((day) => <div key={day} className="p-2 text-center text-xs font-black text-slate-600">{day}</div>)}</div>
    <div className="grid grid-cols-7">{dates.map((date) => {
      const dayEvents = events.filter((event) => eventOccursOn(event, date));
      const selected = date === selectedDate;
      return <div key={date} className={`min-h-28 border-b border-r border-slate-100 p-1.5 ${selected ? 'bg-teal-50' : 'bg-white'}`}>
        <button type="button" onClick={() => onSelectDate(date)} className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${selected ? 'bg-teal-600 text-white' : 'text-slate-700'}`}>{Number(date.slice(-2))}</button>
        <div className="space-y-1">{dayEvents.slice(0, 3).map((event) => <button key={event.id} type="button" onClick={() => onOpen(event)} className="block w-full truncate rounded px-1.5 py-1 text-left text-[9px] font-bold text-white" style={{ backgroundColor: event.color }}>{event.allDay ? '' : `${event.startTime || ''} `}{event.title}</button>)}{dayEvents.length > 3 && <p className="text-[9px] font-bold text-slate-500">ほか{dayEvents.length - 3}件</p>}</div>
      </div>;
    })}</div>
  </div></div>;
}

function AgendaList({ dates, events, onOpen }: { dates: string[]; events: CalendarEvent[]; onOpen: (event: CalendarEvent) => void }) {
  return <div className="space-y-4 p-3 sm:p-4">{dates.map((date) => {
    const dayEvents = events.filter((event) => eventOccursOn(event, date));
    return <section key={date}><h4 className="mb-2 text-xs font-black text-slate-600">{new Date(`${date}T00:00:00`).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}</h4>{dayEvents.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-400">予定なし</p> : <div className="space-y-2">{dayEvents.map((event) => <button key={event.id} type="button" onClick={() => onOpen(event)} className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left"><span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: event.color }} /><span className="w-16 shrink-0 text-xs font-black text-slate-600">{event.allDay ? '終日' : event.startTime || '時刻未定'}</span><span className="min-w-0 flex-1"><strong className="block text-sm text-slate-900">{event.title}</strong><span className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-500">{event.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{event.location}</span>}<span>{event.eventType}</span></span></span></button>)}</div>}</section>;
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
      <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm font-bold text-slate-700">種類<select value={event.eventType} onChange={(e) => update('eventType', e.target.value as CalendarEventType)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3">{EVENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label><label className="text-sm font-bold text-slate-700">開始日<input type="date" value={event.date} onChange={(e) => update('date', e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label><label className="text-sm font-bold text-slate-700">終了日（任意）<input type="date" min={event.date} value={event.endDate || ''} onChange={(e) => update('endDate', e.target.value || undefined)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label></div>
      <label className="flex min-h-11 items-center gap-3 rounded-xl bg-slate-50 px-3 text-sm font-bold"><input type="checkbox" checked={event.allDay} onChange={(e) => update('allDay', e.target.checked)} className="h-5 w-5" />終日の予定</label>
      {!event.allDay && <div className="grid grid-cols-2 gap-3"><label className="text-sm font-bold text-slate-700">開始<input type="time" value={event.startTime || ''} onChange={(e) => update('startTime', e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label><label className="text-sm font-bold text-slate-700">終了<input type="time" value={event.endTime || ''} onChange={(e) => update('endTime', e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label></div>}
      <label className="block text-sm font-bold text-slate-700">場所<input value={event.location || ''} onChange={(e) => update('location', e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
      <CheckGrid title="対象職員" values={event.recorderProfileIds} options={recorderProfiles.map((profile) => ({ id: profile.id, label: profile.displayName }))} onChange={(values) => update('recorderProfileIds', values)} />
      <CheckGrid title="対象児童" values={event.childIds} options={childrenList.map((child) => ({ id: child.id, label: child.name }))} onChange={(values) => update('childIds', values)} />
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold text-slate-700">繰り返し<select value={event.recurrence} onChange={(e) => update('recurrence', e.target.value as CalendarRecurrence)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3">{(['なし', '毎日', '毎週', '毎月'] as CalendarRecurrence[]).map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-sm font-bold text-slate-700">公開範囲<select value={event.visibility} onChange={(e) => update('visibility', e.target.value as CalendarVisibility)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3">{(['全体', '関係者のみ', '管理者のみ'] as CalendarVisibility[]).map((value) => <option key={value}>{value}</option>)}</select></label></div>
      <div><p className="mb-2 text-sm font-bold text-slate-700">色分け</p><div className="flex gap-2">{COLORS.map((color) => <button key={color} type="button" aria-label={`色 ${color}`} onClick={() => update('color', color)} className={`h-10 w-10 rounded-full border-4 ${event.color === color ? 'border-slate-900' : 'border-white'}`} style={{ backgroundColor: color }} />)}</div></div>
      <label className="flex min-h-11 items-center gap-3 rounded-xl bg-slate-50 px-3 text-sm font-bold"><input type="checkbox" checked={event.notificationEnabled} onChange={(e) => update('notificationEnabled', e.target.checked)} className="h-5 w-5" />端末通知を有効にする</label>
      <label className="block text-sm font-bold text-slate-700">補足<textarea rows={3} value={event.note || ''} onChange={(e) => update('note', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-3" /></label>
      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
    </fieldset>
    <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white p-4 sm:flex-row sm:justify-between">{canEdit && canDelete && <button type="button" disabled={saving} onClick={onDelete} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-300 px-4 text-sm font-bold text-rose-700"><Trash2 className="h-4 w-4" />削除</button>}<div className="flex gap-2"><button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-xl border border-slate-300 px-4 text-sm font-bold sm:flex-none">閉じる</button>{canEdit && <button type="button" disabled={saving} onClick={onSave} className="min-h-11 flex-1 rounded-xl bg-teal-600 px-5 text-sm font-black text-white sm:flex-none">{saving ? '保存中...' : '保存'}</button>}</div></footer>
  </div></div>;
}

function CheckGrid({ title, values, options, onChange }: { title: string; values: string[]; options: { id: string; label: string }[]; onChange: (values: string[]) => void }) {
  return <div><p className="mb-2 text-sm font-bold text-slate-700">{title}（複数選択可）</p><div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto rounded-xl border border-slate-200 p-2 sm:grid-cols-3">{options.map((option) => { const selected = values.includes(option.id); return <button key={option.id} type="button" onClick={() => onChange(selected ? values.filter((id) => id !== option.id) : [...values, option.id])} className={`min-h-10 rounded-lg border px-2 text-xs font-bold ${selected ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{option.label}</button>; })}</div></div>;
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

function shiftDate(date: string, days: number) { const next = new Date(`${date}T00:00:00`); next.setDate(next.getDate() + days); return localDate(next); }
function localDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function createUuid() { return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `calendar-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
