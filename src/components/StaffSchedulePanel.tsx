import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  PencilLine,
  Plus,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react';
import type {
  ChildProfile,
  RecorderProfile,
  StaffScheduleCategory,
  StaffScheduleItem,
} from '../types';
import { getLocalDateString } from '../utils/weekdays';

const START_HOUR = 7;
const END_HOUR = 20;
const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;
const CATEGORIES: StaffScheduleCategory[] = ['送迎', '支援', '休憩', '会議', '事務', '外出', 'その他'];

const CATEGORY_STYLES: Record<StaffScheduleCategory, string> = {
  送迎: 'border-sky-500 bg-sky-500 text-white',
  支援: 'border-teal-600 bg-teal-600 text-white',
  休憩: 'border-amber-400 bg-amber-300 text-amber-950',
  会議: 'border-violet-500 bg-violet-500 text-white',
  事務: 'border-slate-500 bg-slate-500 text-white',
  外出: 'border-rose-500 bg-rose-500 text-white',
  その他: 'border-lime-500 bg-lime-400 text-lime-950',
};

interface StaffSchedulePanelProps {
  items: StaffScheduleItem[];
  recorderProfiles: RecorderProfile[];
  childrenList: ChildProfile[];
  canEdit: boolean;
  onSave: (item: StaffScheduleItem) => Promise<void> | void;
  onDelete: (itemId: string) => Promise<void> | void;
}

interface ScheduleFormState {
  id?: string;
  recorderProfileId: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  category: StaffScheduleCategory;
  location: string;
  childIds: string[];
  note: string;
  createdAt?: string;
}

interface PlacedSchedule {
  item: StaffScheduleItem;
  lane: number;
}

export const StaffSchedulePanel: React.FC<StaffSchedulePanelProps> = ({
  items,
  recorderProfiles,
  childrenList,
  canEdit,
  onSave,
  onDelete,
}) => {
  const [selectedDate, setSelectedDate] = useState(getLocalDateString);
  const [form, setForm] = useState<ScheduleFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const activeRecorders = useMemo(
    () => recorderProfiles.filter((profile) => profile.active),
    [recorderProfiles],
  );
  const dayItems = useMemo(
    () => items
      .filter((item) => item.date === selectedDate)
      .sort((left, right) =>
        `${left.startTime}${left.recorderName}`.localeCompare(`${right.startTime}${right.recorderName}`)
      ),
    [items, selectedDate],
  );
  const childNames = useMemo(
    () => new Map(childrenList.map((child) => [child.id, child.name])),
    [childrenList],
  );
  const rows = useMemo(() => activeRecorders.map((recorder) => {
    const recorderItems = dayItems
      .filter((item) => item.recorderProfileId === recorder.id)
      .sort((left, right) => left.startTime.localeCompare(right.startTime));
    const laneEnds: number[] = [];
    const placed: PlacedSchedule[] = recorderItems.map((item) => {
      const start = timeToMinutes(item.startTime);
      let lane = laneEnds.findIndex((end) => end <= start);
      if (lane < 0) {
        lane = laneEnds.length;
        laneEnds.push(timeToMinutes(item.endTime));
      } else {
        laneEnds[lane] = timeToMinutes(item.endTime);
      }
      return { item, lane };
    });
    return {
      recorder,
      placed,
      laneCount: Math.max(1, laneEnds.length),
    };
  }), [activeRecorders, dayItems]);

  const openNew = () => {
    setError('');
    setForm({
      recorderProfileId: activeRecorders[0]?.id || '',
      date: selectedDate,
      startTime: '09:00',
      endTime: '10:00',
      title: '',
      category: '支援',
      location: '',
      childIds: [],
      note: '',
    });
  };

  const openExisting = (item: StaffScheduleItem) => {
    setError('');
    setForm({
      id: item.id,
      recorderProfileId: item.recorderProfileId,
      date: item.date,
      startTime: item.startTime,
      endTime: item.endTime,
      title: item.title,
      category: item.category,
      location: item.location || '',
      childIds: item.childIds,
      note: item.note || '',
      createdAt: item.createdAt,
    });
  };

  const handleSave = async () => {
    if (!form) return;
    if (!form.recorderProfileId || !form.title.trim()) {
      setError('職員と業務内容を入力してください。');
      return;
    }
    if (timeToMinutes(form.startTime) >= timeToMinutes(form.endTime)) {
      setError('終了時刻は開始時刻より後にしてください。');
      return;
    }
    const overlap = items.some((item) =>
      item.id !== form.id
      && item.date === form.date
      && item.recorderProfileId === form.recorderProfileId
      && timeToMinutes(item.startTime) < timeToMinutes(form.endTime)
      && timeToMinutes(form.startTime) < timeToMinutes(item.endTime)
    );
    if (
      overlap
      && !window.confirm('この職員には同じ時間帯の予定があります。重ねて登録しますか？')
    ) return;

    const now = new Date().toISOString();
    const recorder = activeRecorders.find((candidate) => candidate.id === form.recorderProfileId);
    const item: StaffScheduleItem = {
      id: form.id || createUuid(),
      recorderProfileId: form.recorderProfileId,
      recorderName: recorder?.displayName || '職員',
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      title: form.title.trim(),
      category: form.category,
      location: form.location.trim() || undefined,
      childIds: form.childIds,
      note: form.note.trim() || undefined,
      createdAt: form.createdAt || now,
      updatedAt: now,
    };
    setSaving(true);
    setError('');
    try {
      await onSave(item);
      setSelectedDate(item.date);
      setForm(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '予定を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!form?.id || !canEdit) return;
    if (!window.confirm('この予定を削除しますか？')) return;
    setSaving(true);
    setError('');
    try {
      await onDelete(form.id);
      setForm(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '予定を削除できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-teal-950 p-4 text-white sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-wide text-teal-300">1日の配置と役割を共有</p>
            <h3 className="mt-0.5 flex items-center gap-2 text-lg font-black">
              <UsersRound className="h-5 w-5 text-teal-300" />
              職員配置ガントチャート
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              PC・タブレットでは時間軸、狭い画面や高いズーム率では時系列リストに自動で切り替わります。
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={openNew}
              disabled={activeRecorders.length === 0}
              className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-400 px-4 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-5 w-5" />
              予定を追加
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <button
            type="button"
            aria-label="前の日"
            onClick={() => setSelectedDate((date) => shiftDate(date, -1))}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <label className="relative min-w-0 flex-1 sm:flex-none">
            <CalendarDays className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-teal-600" />
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm font-bold text-slate-800 sm:w-auto"
            />
          </label>
          <button
            type="button"
            aria-label="次の日"
            onClick={() => setSelectedDate((date) => shiftDate(date, 1))}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((category) => (
            <span
              key={category}
              className={`rounded-full border px-2 py-1 text-[9px] font-black ${CATEGORY_STYLES[category]}`}
            >
              {category}
            </span>
          ))}
        </div>
      </div>

      <div className="hidden min-w-0 md:block">
        <div className="overflow-x-auto overscroll-x-contain" aria-label="職員配置時間軸">
          <div className="min-w-[1040px]">
            <div className="grid grid-cols-[160px_1fr] border-b border-slate-200 bg-slate-50">
              <div className="sticky left-0 z-30 flex min-h-11 items-center border-r border-slate-200 bg-slate-50 px-4 text-xs font-black text-slate-700">
                職員
              </div>
              <div className="grid" style={{ gridTemplateColumns: `repeat(${END_HOUR - START_HOUR}, minmax(0, 1fr))` }}>
                {Array.from({ length: END_HOUR - START_HOUR }, (_, index) => (
                  <div key={index} className="border-r border-slate-200 px-1 py-3 text-center text-[10px] font-bold text-slate-500">
                    {String(START_HOUR + index).padStart(2, '0')}:00
                  </div>
                ))}
              </div>
            </div>

            {rows.map(({ recorder, placed, laneCount }) => {
              const rowHeight = Math.max(64, 14 + laneCount * 38);
              return (
                <div
                  key={recorder.id}
                  className="grid grid-cols-[160px_1fr] border-b border-slate-100 last:border-b-0"
                  style={{ minHeight: rowHeight }}
                >
                  <div className="sticky left-0 z-20 flex items-center border-r border-slate-200 bg-white px-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">{recorder.displayName}</p>
                      <p className="mt-0.5 text-[9px] font-bold text-slate-400">
                        {placed.length > 0 ? `${placed.length}件` : '予定なし'}
                      </p>
                    </div>
                  </div>
                  <div
                    className="relative overflow-hidden bg-white"
                    style={{
                      backgroundImage: 'repeating-linear-gradient(to right, transparent 0, transparent calc(7.6923% - 1px), #e2e8f0 calc(7.6923% - 1px), #e2e8f0 7.6923%)',
                    }}
                  >
                    {placed.map(({ item, lane }) => {
                      const start = Math.max(START_HOUR * 60, timeToMinutes(item.startTime));
                      const end = Math.min(END_HOUR * 60, timeToMinutes(item.endTime));
                      const left = ((start - START_HOUR * 60) / TOTAL_MINUTES) * 100;
                      const width = Math.max(0.8, ((end - start) / TOTAL_MINUTES) * 100);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => openExisting(item)}
                          title={`${item.startTime}〜${item.endTime} ${item.title}`}
                          className={`absolute overflow-hidden rounded-lg border px-2 text-left shadow-sm transition hover:brightness-105 focus:z-10 focus:outline-none focus:ring-2 focus:ring-teal-300 ${CATEGORY_STYLES[item.category]}`}
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            top: 8 + lane * 38,
                            height: 32,
                          }}
                        >
                          <span className="block truncate text-[10px] font-black">{item.title}</span>
                          <span className="block truncate text-[8px] font-bold opacity-90">{item.startTime}–{item.endTime}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-3 p-3 md:hidden">
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] leading-relaxed text-sky-800">
          画面幅に合わせて、予定を時刻順に表示しています。
        </div>
        {dayItems.length === 0 ? (
          <EmptySchedule canEdit={canEdit} onAdd={openNew} />
        ) : dayItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => openExisting(item)}
            className="flex w-full min-w-0 gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm"
          >
            <div className="w-[4.5rem] shrink-0">
              <p className="text-sm font-black text-slate-900">{item.startTime}</p>
              <p className="text-[10px] font-bold text-slate-500">〜{item.endTime}</p>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black ${CATEGORY_STYLES[item.category]}`}>
                  {item.category}
                </span>
                <strong className="truncate text-sm text-slate-900">{item.title}</strong>
              </div>
              <p className="mt-1 text-xs font-bold text-teal-700">{item.recorderName}</p>
              {(item.location || item.childIds.length > 0) && (
                <p className="mt-1 truncate text-[10px] text-slate-500">
                  {[item.location, ...item.childIds.map((id) => childNames.get(id)).filter(Boolean)].filter(Boolean).join('・')}
                </p>
              )}
            </div>
            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
          </button>
        ))}
      </div>

      <div className="hidden border-t border-slate-100 p-4 text-center md:block">
        {dayItems.length === 0 && <EmptySchedule canEdit={canEdit} onAdd={openNew} />}
      </div>

      {form && (
        <ScheduleDialog
          form={form}
          setForm={setForm}
          recorderProfiles={activeRecorders}
          childrenList={childrenList}
          canEdit={canEdit}
          saving={saving}
          error={error}
          onClose={() => !saving && setForm(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </section>
  );
};

function ScheduleDialog({
  form,
  setForm,
  recorderProfiles,
  childrenList,
  canEdit,
  saving,
  error,
  onClose,
  onSave,
  onDelete,
}: {
  form: ScheduleFormState;
  setForm: React.Dispatch<React.SetStateAction<ScheduleFormState | null>>;
  recorderProfiles: RecorderProfile[];
  childrenList: ChildProfile[];
  canEdit: boolean;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const update = <K extends keyof ScheduleFormState>(key: K, value: ScheduleFormState[K]) => {
    setForm((previous) => previous ? { ...previous, [key]: value } : previous);
  };
  const readonly = !canEdit;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-schedule-dialog-title"
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
          <div>
            <p className="text-[10px] font-bold text-teal-700">{readonly ? '予定の確認' : form.id ? '予定を編集' : '予定を追加'}</p>
            <h4 id="staff-schedule-dialog-title" className="text-base font-black text-slate-900">職員配置</h4>
          </div>
          <button type="button" aria-label="閉じる" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-bold text-slate-700">職員</span>
            <select
              value={form.recorderProfileId}
              disabled={readonly || saving}
              onChange={(event) => update('recorderProfileId', event.target.value)}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold disabled:bg-slate-100"
            >
              <option value="">職員を選択</option>
              {recorderProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.displayName}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-700">日付</span>
            <input type="date" value={form.date} disabled={readonly || saving} onChange={(event) => update('date', event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold disabled:bg-slate-100" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-700">区分</span>
            <select value={form.category} disabled={readonly || saving} onChange={(event) => update('category', event.target.value as StaffScheduleCategory)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold disabled:bg-slate-100">
              {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-700">開始</span>
            <input type="time" value={form.startTime} disabled={readonly || saving} onChange={(event) => update('startTime', event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold disabled:bg-slate-100" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-700">終了</span>
            <input type="time" value={form.endTime} disabled={readonly || saving} onChange={(event) => update('endTime', event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold disabled:bg-slate-100" />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-bold text-slate-700">業務内容</span>
            <input
              value={form.title}
              disabled={readonly || saving}
              onChange={(event) => update('title', event.target.value)}
              placeholder="例：学校迎え、個別支援、記録作成"
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-bold text-slate-700">場所（任意）</span>
            <input
              value={form.location}
              disabled={readonly || saving}
              onChange={(event) => update('location', event.target.value)}
              placeholder="例：支援室A、○○小学校"
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100"
            />
          </label>

          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-xs font-bold text-slate-700">対象児童（任意・複数選択可）</legend>
            <div className="grid max-h-40 gap-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2 sm:grid-cols-2">
              {childrenList.length === 0 && <p className="p-2 text-xs text-slate-400">登録児童がいません。</p>}
              {childrenList.map((child) => {
                const checked = form.childIds.includes(child.id);
                return (
                  <label key={child.id} className="flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={readonly || saving}
                      onChange={() => update(
                        'childIds',
                        checked
                          ? form.childIds.filter((id) => id !== child.id)
                          : [...form.childIds, child.id],
                      )}
                      className="h-4 w-4"
                    />
                    <span className="truncate">{child.name}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-bold text-slate-700">補足（任意）</span>
            <textarea
              rows={3}
              value={form.note}
              disabled={readonly || saving}
              onChange={(event) => update('note', event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm leading-relaxed disabled:bg-slate-100"
            />
          </label>

          {error && <p role="alert" className="sm:col-span-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">{error}</p>}
        </div>

        <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:px-5">
          {canEdit && form.id && (
            <button type="button" disabled={saving} onClick={onDelete} className="flex min-h-11 items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 text-xs font-black text-rose-700 disabled:opacity-50">
              <Trash2 className="h-4 w-4" />削除
            </button>
          )}
          <button type="button" disabled={saving} onClick={onClose} className="min-h-11 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 disabled:opacity-50">
            {readonly ? '閉じる' : 'キャンセル'}
          </button>
          {canEdit && (
            <button type="button" disabled={saving} onClick={onSave} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 text-xs font-black text-white disabled:opacity-50">
              <PencilLine className="h-4 w-4" />{saving ? '保存中...' : '保存'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptySchedule({ canEdit, onAdd }: { canEdit: boolean; onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center">
      <Clock3 className="mx-auto h-6 w-6 text-slate-400" />
      <p className="mt-2 text-xs font-bold text-slate-600">この日の職員予定はまだありません。</p>
      {canEdit && (
        <button type="button" onClick={onAdd} className="mt-2 text-xs font-black text-teal-700 underline">
          最初の予定を追加
        </button>
      )}
    </div>
  );
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function shiftDate(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return value.toISOString().slice(0, 10);
}

function createUuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  const suffix = Date.now().toString().padStart(12, '0').slice(-12);
  return `00000000-0000-4000-8000-${suffix}`;
}
