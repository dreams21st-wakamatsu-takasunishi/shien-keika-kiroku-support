import React, { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, MapPin, PencilLine, Plus, Save, School, Search, Trash2, X } from 'lucide-react';
import type { ChildProfile, SchoolHolidayPeriod, SchoolProfile } from '../types';
import { resolvedTransportArea } from '../utils/transportArea';

interface SchoolManagerProps {
  schools: SchoolProfile[];
  childrenList: ChildProfile[];
  onSave: (school: SchoolProfile) => Promise<void> | void;
  onDelete: (schoolId: string) => Promise<void> | void;
}

const createId = () => globalThis.crypto?.randomUUID?.() || `school-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function blankSchool(): SchoolProfile {
  return { id: createId(), name: '', address: '', area: '', note: '', holidayPeriods: [], active: true };
}

function blankHolidayPeriod(): SchoolHolidayPeriod {
  return { id: createId(), name: '長期休暇', startDate: '', endDate: '' };
}

export const SchoolManager: React.FC<SchoolManagerProps> = ({ schools, childrenList, onSave, onDelete }) => {
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<SchoolProfile>();
  const [bulkHolidayOpen, setBulkHolidayOpen] = useState(false);
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<string[]>([]);
  const [bulkHoliday, setBulkHoliday] = useState<SchoolHolidayPeriod>(() => blankHolidayPeriod());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const filtered = useMemo(() => {
    const query = search.trim().normalize('NFKC').toLocaleLowerCase('ja-JP');
    return [...schools]
      .filter((school) => !query || `${school.name}${school.address}${school.area || ''}`.normalize('NFKC').toLocaleLowerCase('ja-JP').includes(query))
      .sort((left, right) => Number(right.active) - Number(left.active) || left.name.localeCompare(right.name, 'ja'));
  }, [schools, search]);
  const usageCount = (schoolId: string) => childrenList.filter((child) => child.schoolId === schoolId).length;
  const activeSchools = useMemo(
    () => [...schools].filter((school) => school.active).sort((left, right) => left.name.localeCompare(right.name, 'ja')),
    [schools],
  );

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.address.trim()) return setError('学校名と住所を入力してください。');
    const holidayPeriods = (draft.holidayPeriods || []).map((period) => ({
      ...period,
      name: period.name.trim() || '長期休暇',
    }));
    if (holidayPeriods.some((period) => !period.startDate || !period.endDate)) return setError('長期休暇期間の開始日と終了日を入力してください。');
    if (holidayPeriods.some((period) => period.startDate > period.endDate)) return setError('長期休暇期間の終了日は開始日以降にしてください。');
    setSaving(true);
    setError('');
    try {
      await onSave({
        ...draft,
        name: draft.name.trim(),
        address: draft.address.trim(),
        area: resolvedTransportArea(draft.address, draft.area),
        note: draft.note?.trim() || undefined,
        holidayPeriods: holidayPeriods.sort((left, right) => left.startDate.localeCompare(right.startDate)),
        updatedAt: new Date().toISOString(),
      });
      setMessage(`${draft.name.trim()}を保存しました。登録した長期休暇期間は所属児童の基本予定へ反映されます。`);
      setDraft(undefined);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '学校を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const updatePeriod = (periodId: string, patch: Partial<SchoolHolidayPeriod>) => {
    if (!draft) return;
    setDraft({
      ...draft,
      holidayPeriods: (draft.holidayPeriods || []).map((period) => period.id === periodId ? { ...period, ...patch } : period),
    });
  };

  const applyBulkHoliday = async () => {
    const selectedSchools = activeSchools.filter((school) => selectedSchoolIds.includes(school.id));
    if (!selectedSchools.length) return setError('長期休みを登録する学校を選択してください。');
    if (!bulkHoliday.startDate || !bulkHoliday.endDate) return setError('長期休みの開始日と終了日を入力してください。');
    if (bulkHoliday.startDate > bulkHoliday.endDate) return setError('長期休みの終了日は開始日以降にしてください。');
    const sharedPeriod: SchoolHolidayPeriod = {
      ...bulkHoliday,
      id: createId(),
      name: bulkHoliday.name.trim() || '長期休暇',
    };
    setSaving(true);
    setError('');
    try {
      let changedCount = 0;
      for (const school of selectedSchools) {
        const periods = school.holidayPeriods || [];
        const alreadyRegistered = periods.some((period) => period.name === sharedPeriod.name
          && period.startDate === sharedPeriod.startDate
          && period.endDate === sharedPeriod.endDate);
        if (alreadyRegistered) continue;
        await onSave({
          ...school,
          holidayPeriods: [...periods, sharedPeriod].sort((left, right) => left.startDate.localeCompare(right.startDate)),
          updatedAt: new Date().toISOString(),
        });
        changedCount += 1;
      }
      setMessage(changedCount
        ? `${sharedPeriod.name}（${sharedPeriod.startDate}〜${sharedPeriod.endDate}）を${changedCount}校へ登録しました。`
        : '選択した学校には同じ長期休みがすでに登録されています。');
      setSelectedSchoolIds([]);
      setBulkHoliday(blankHolidayPeriod());
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '長期休みを一括登録できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (school: SchoolProfile) => {
    if (!window.confirm(`${school.name}を学校台帳から削除しますか？`)) return;
    setError('');
    try {
      await onDelete(school.id);
      setMessage(`${school.name}を削除しました。`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '学校を削除できませんでした。');
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <section className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-950 to-slate-950 p-4 text-white shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-sky-300"><School className="h-6 w-6" /></span><div><h2 className="text-lg font-black">学校台帳</h2><p className="mt-0.5 text-xs text-slate-300">学校名・住所・長期休暇期間を一度登録し、児童情報・利用予定・送迎で共通利用します。</p></div></div>
          <button type="button" onClick={() => { setDraft(blankSchool()); setError(''); }} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 text-sm font-black text-white"><Plus className="h-5 w-5" />学校を登録</button>
        </div>
      </section>

      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" />{message}</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</p>}

      <section className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm">
        <button
          type="button"
          aria-expanded={bulkHolidayOpen}
          onClick={() => { setBulkHolidayOpen((open) => !open); setError(''); }}
          className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-sky-50"
        >
          <span className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-700"><CalendarDays className="h-5 w-5" /></span><span><strong className="block text-sm text-slate-950">複数校へ長期休みを一括登録</strong><span className="mt-0.5 block text-[10px] leading-relaxed text-slate-500">対象校を複数選び、共通の夏休み・冬休みなどを一度に登録します。</span></span></span>
          <span className="shrink-0 rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-black text-sky-700">{selectedSchoolIds.length ? `${selectedSchoolIds.length}校選択中` : bulkHolidayOpen ? '閉じる' : '開く'}</span>
        </button>
        {bulkHolidayOpen && <div className="space-y-3 border-t border-sky-100 bg-sky-50/40 p-3 sm:p-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black text-sky-950">1. 対象校を選択</p><div className="flex gap-1.5"><button type="button" onClick={() => setSelectedSchoolIds(activeSchools.map((school) => school.id))} className="min-h-8 rounded-lg bg-white px-2.5 text-[10px] font-black text-sky-700 shadow-sm">全校選択</button><button type="button" onClick={() => setSelectedSchoolIds([])} className="min-h-8 rounded-lg bg-white px-2.5 text-[10px] font-black text-slate-600 shadow-sm">解除</button></div></div>
            <div className="grid max-h-52 gap-2 overflow-y-auto rounded-xl border border-sky-100 bg-white p-2 sm:grid-cols-2 lg:grid-cols-3">
              {activeSchools.map((school) => {
                const selected = selectedSchoolIds.includes(school.id);
                return <button key={school.id} type="button" aria-pressed={selected} onClick={() => setSelectedSchoolIds((current) => selected ? current.filter((id) => id !== school.id) : [...current, school.id])} className={`flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 text-left text-xs font-bold transition ${selected ? 'border-sky-500 bg-sky-50 text-sky-950 ring-1 ring-sky-300' : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300'}`}><span className="truncate">{school.name}</span><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-black ${selected ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{selected ? '✓' : ''}</span></button>;
              })}
              {!activeSchools.length && <p className="col-span-full p-3 text-center text-xs text-slate-500">利用中の学校がありません。</p>}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-black text-sky-950">2. 共通期間を入力</p>
            <div className="grid gap-2 rounded-xl border border-sky-100 bg-white p-3 sm:grid-cols-3"><label className="text-[10px] font-bold text-slate-600">名称<input value={bulkHoliday.name} onChange={(event) => setBulkHoliday({ ...bulkHoliday, name: event.target.value })} placeholder="夏休み" className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label><label className="text-[10px] font-bold text-slate-600">開始日<input type="date" value={bulkHoliday.startDate} onChange={(event) => setBulkHoliday({ ...bulkHoliday, startDate: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label><label className="text-[10px] font-bold text-slate-600">終了日<input type="date" value={bulkHoliday.endDate} onChange={(event) => setBulkHoliday({ ...bulkHoliday, endDate: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label></div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-[10px] leading-relaxed text-slate-500">終了日までは利用予定へ反映し、終了日の翌日から画面・DBの両方で自動整理されます。</p><button type="button" disabled={saving || selectedSchoolIds.length === 0} onClick={() => void applyBulkHoliday()} className="min-h-11 shrink-0 rounded-xl bg-sky-700 px-5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{saving ? '登録中…' : `${selectedSchoolIds.length}校へ登録`}</button></div>
        </div>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <label className="relative block"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="学校名・住所・エリアで検索" className="min-h-11 w-full rounded-xl border border-slate-300 pl-10 pr-3 text-base" /></label>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {filtered.map((school) => {
            const count = usageCount(school.id);
            const periods = school.holidayPeriods || [];
            return <article key={school.id} className={`rounded-xl border p-3 ${school.active ? 'border-slate-200 bg-white' : 'border-dashed border-slate-300 bg-slate-50 opacity-70'}`}>
              <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700"><School className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><strong className="text-sm text-slate-950">{school.name}</strong>{!school.active && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-black text-slate-600">使用停止</span>}<span className="rounded-full bg-teal-50 px-2 py-0.5 text-[9px] font-black text-teal-700">登録児童 {count}名</span></div><p className="mt-1 text-xs leading-relaxed text-slate-600"><MapPin className="mr-1 inline h-3.5 w-3.5" />{school.address}</p>{school.area && <p className="mt-1 text-[10px] font-bold text-sky-700">送迎エリア：{school.area}</p>}</div><div className="flex shrink-0 gap-1"><button type="button" onClick={() => { setDraft({ ...school, holidayPeriods: [...periods] }); setError(''); }} aria-label={`${school.name}を編集`} className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-700"><PencilLine className="h-4 w-4" /></button><button type="button" onClick={() => void remove(school)} aria-label={`${school.name}を削除`} className="grid h-9 w-9 place-items-center rounded-lg bg-rose-50 text-rose-700"><Trash2 className="h-4 w-4" /></button></div></div>
              <div className="mt-2 rounded-lg bg-sky-50 px-2.5 py-2 text-[10px] font-bold text-sky-900"><CalendarDays className="mr-1 inline h-3.5 w-3.5" />{periods.length ? periods.map((period) => `${period.name} ${period.startDate}〜${period.endDate}`).join('／') : '長期休暇期間は未登録'}</div>
            </article>;
          })}
          {filtered.length === 0 && <p className="col-span-full rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">学校はまだ登録されていません。</p>}
        </div>
      </section>

      {draft && <div className="fixed inset-0 z-[130] grid place-items-center bg-slate-950/60 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="学校情報を編集">
        <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
          <header className="flex items-center justify-between bg-slate-950 px-4 py-3 text-white"><div><p className="text-[10px] font-black text-sky-300">学校台帳</p><h3 className="font-black">{schools.some((school) => school.id === draft.id) ? '学校情報を編集' : '学校を登録'}</h3></div><button type="button" onClick={() => setDraft(undefined)} aria-label="閉じる" className="grid h-10 w-10 place-items-center rounded-xl bg-white/10"><X className="h-5 w-5" /></button></header>
          <div className="space-y-3 overflow-y-auto p-4">
            <label className="block text-xs font-bold text-slate-700">学校名<input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例：北九州市立○○小学校" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base" /></label>
            <label className="block text-xs font-bold text-slate-700">住所<input value={draft.address} onChange={(event) => { const address = event.target.value; setDraft({ ...draft, address, area: resolvedTransportArea(address, '') }); }} placeholder="都道府県・市区町村・番地" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base" /></label>
            <label className="block text-xs font-bold text-slate-700">送迎エリア<input value={draft.area || ''} onChange={(event) => setDraft({ ...draft, area: event.target.value })} placeholder="住所から自動反映・必要時は修正可能" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base" /></label>
            <section className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
              <div className="flex items-center justify-between gap-2"><div><p className="text-xs font-black text-sky-950">長期休暇期間</p><p className="mt-0.5 text-[10px] text-sky-800">この期間は、所属児童の基本予定を休日利用として反映します。</p></div><button type="button" onClick={() => setDraft({ ...draft, holidayPeriods: [...(draft.holidayPeriods || []), blankHolidayPeriod()] })} className="flex min-h-9 items-center gap-1 rounded-lg bg-sky-700 px-3 text-[10px] font-black text-white"><Plus className="h-3.5 w-3.5" />期間を追加</button></div>
              <div className="mt-2 space-y-2">{(draft.holidayPeriods || []).map((period) => <div key={period.id} className="grid gap-2 rounded-lg border border-sky-100 bg-white p-2 sm:grid-cols-[minmax(110px,1fr)_140px_140px_36px] sm:items-end"><label className="text-[10px] font-bold text-slate-600">名称<input value={period.name} onChange={(event) => updatePeriod(period.id, { name: event.target.value })} placeholder="夏休み" className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label><label className="text-[10px] font-bold text-slate-600">開始日<input type="date" value={period.startDate} onChange={(event) => updatePeriod(period.id, { startDate: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label><label className="text-[10px] font-bold text-slate-600">終了日<input type="date" value={period.endDate} onChange={(event) => updatePeriod(period.id, { endDate: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label><button type="button" onClick={() => setDraft({ ...draft, holidayPeriods: (draft.holidayPeriods || []).filter((item) => item.id !== period.id) })} aria-label="期間を削除" className="grid h-9 w-9 place-items-center rounded-lg bg-rose-50 text-rose-700"><Trash2 className="h-4 w-4" /></button></div>)}{!(draft.holidayPeriods || []).length && <p className="rounded-lg bg-white p-3 text-center text-[10px] text-slate-500">登録すると、該当校の児童だけ休日利用の予定になります。</p>}</div>
            </section>
            <label className="block text-xs font-bold text-slate-700">乗降場所などの補足（任意）<textarea rows={3} value={draft.note || ''} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="例：正門前、下校時は北側入口" className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-base" /></label>
            <label className="flex min-h-11 items-center justify-between rounded-xl bg-slate-50 px-3 text-sm font-bold text-slate-700">児童情報で選択できる状態にする<input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} className="h-5 w-5 accent-sky-600" /></label>
            {error && <p className="rounded-lg bg-rose-50 p-2 text-xs font-bold text-rose-700">{error}</p>}
          </div>
          <footer className="flex justify-end gap-2 border-t border-slate-200 p-3"><button type="button" onClick={() => setDraft(undefined)} className="min-h-11 rounded-xl px-4 text-sm font-bold text-slate-600">キャンセル</button><button type="submit" disabled={saving} className="flex min-h-11 items-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-black text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? '保存中…' : '保存する'}</button></footer>
        </form>
      </div>}
    </div>
  );
};
