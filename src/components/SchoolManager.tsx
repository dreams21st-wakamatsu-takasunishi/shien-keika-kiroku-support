import React, { useMemo, useState } from 'react';
import { CheckCircle2, MapPin, PencilLine, Plus, Save, School, Search, Trash2, X } from 'lucide-react';
import type { ChildProfile, SchoolProfile } from '../types';
import { resolvedTransportArea } from '../utils/transportArea';

interface SchoolManagerProps {
  schools: SchoolProfile[];
  childrenList: ChildProfile[];
  onSave: (school: SchoolProfile) => Promise<void> | void;
  onDelete: (schoolId: string) => Promise<void> | void;
}

const createId = () => globalThis.crypto?.randomUUID?.() || `school-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function blankSchool(): SchoolProfile {
  return { id: createId(), name: '', address: '', area: '', note: '', active: true };
}

export const SchoolManager: React.FC<SchoolManagerProps> = ({ schools, childrenList, onSave, onDelete }) => {
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<SchoolProfile>();
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

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.address.trim()) return setError('学校名と住所を入力してください。');
    setSaving(true);
    setError('');
    try {
      await onSave({
        ...draft,
        name: draft.name.trim(),
        address: draft.address.trim(),
        area: resolvedTransportArea(draft.address, draft.area),
        note: draft.note?.trim() || undefined,
        updatedAt: new Date().toISOString(),
      });
      setMessage(`${draft.name.trim()}を学校台帳へ保存しました。地図を開くと住所からピン位置を反映します。`);
      setDraft(undefined);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '学校を保存できませんでした。');
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
          <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-sky-300"><School className="h-6 w-6" /></span><div><h2 className="text-lg font-black">学校台帳</h2><p className="mt-0.5 text-xs text-slate-300">学校名と住所は一度だけ登録し、児童情報・送迎・地図で共通利用します。</p></div></div>
          <button type="button" onClick={() => { setDraft(blankSchool()); setError(''); }} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 text-sm font-black text-white"><Plus className="h-5 w-5" />学校を登録</button>
        </div>
      </section>

      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" />{message}</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</p>}

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <label className="relative block"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="学校名・住所・エリアで検索" className="min-h-11 w-full rounded-xl border border-slate-300 pl-10 pr-3 text-base" /></label>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {filtered.map((school) => {
            const count = usageCount(school.id);
            return <article key={school.id} className={`rounded-xl border p-3 ${school.active ? 'border-slate-200 bg-white' : 'border-dashed border-slate-300 bg-slate-50 opacity-70'}`}><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700"><School className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><strong className="text-sm text-slate-950">{school.name}</strong>{!school.active && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-black text-slate-600">使用停止</span>}<span className="rounded-full bg-teal-50 px-2 py-0.5 text-[9px] font-black text-teal-700">登録児童 {count}名</span></div><p className="mt-1 text-xs leading-relaxed text-slate-600"><MapPin className="mr-1 inline h-3.5 w-3.5" />{school.address}</p>{school.area && <p className="mt-1 text-[10px] font-bold text-sky-700">送迎エリア：{school.area}</p>}</div><div className="flex shrink-0 gap-1"><button type="button" onClick={() => { setDraft({ ...school }); setError(''); }} aria-label={`${school.name}を編集`} className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-700"><PencilLine className="h-4 w-4" /></button><button type="button" onClick={() => void remove(school)} aria-label={`${school.name}を削除`} className="grid h-9 w-9 place-items-center rounded-lg bg-rose-50 text-rose-700"><Trash2 className="h-4 w-4" /></button></div></div></article>;
          })}
          {filtered.length === 0 && <p className="col-span-full rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">学校はまだ登録されていません。</p>}
        </div>
      </section>

      {draft && <div className="fixed inset-0 z-[130] grid place-items-center bg-slate-950/60 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="学校情報を編集"><form onSubmit={(event) => { event.preventDefault(); void save(); }} className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="flex items-center justify-between bg-slate-950 px-4 py-3 text-white"><div><p className="text-[10px] font-black text-sky-300">学校台帳</p><h3 className="font-black">{schools.some((school) => school.id === draft.id) ? '学校情報を編集' : '学校を登録'}</h3></div><button type="button" onClick={() => setDraft(undefined)} aria-label="閉じる" className="grid h-10 w-10 place-items-center rounded-xl bg-white/10"><X className="h-5 w-5" /></button></header><div className="space-y-3 p-4"><label className="block text-xs font-bold text-slate-700">学校名<input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例：北九州市立○○小学校" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base" /></label><label className="block text-xs font-bold text-slate-700">住所<input value={draft.address} onChange={(event) => { const address = event.target.value; setDraft({ ...draft, address, area: resolvedTransportArea(address, '') }); }} placeholder="都道府県・市区町村・番地" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base" /></label><label className="block text-xs font-bold text-slate-700">送迎エリア<input value={draft.area || ''} onChange={(event) => setDraft({ ...draft, area: event.target.value })} placeholder="住所から自動反映・必要時は修正可能" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base" /></label><label className="block text-xs font-bold text-slate-700">乗降場所などの補足（任意）<textarea rows={3} value={draft.note || ''} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="例：正門前、下校時は北側入口" className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-base" /></label><label className="flex min-h-11 items-center justify-between rounded-xl bg-slate-50 px-3 text-sm font-bold text-slate-700">児童情報で選択できる状態にする<input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} className="h-5 w-5 accent-sky-600" /></label>{error && <p className="rounded-lg bg-rose-50 p-2 text-xs font-bold text-rose-700">{error}</p>}</div><footer className="flex justify-end gap-2 border-t border-slate-200 p-3"><button type="button" onClick={() => setDraft(undefined)} className="min-h-11 rounded-xl px-4 text-sm font-bold text-slate-600">キャンセル</button><button type="submit" disabled={saving} className="flex min-h-11 items-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-black text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? '保存中…' : '保存する'}</button></footer></form></div>}
    </div>
  );
};
