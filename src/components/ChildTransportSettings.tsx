import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Home,
  MapPin,
  Plus,
  School,
  Star,
  Trash2,
  Users,
} from 'lucide-react';
import type {
  ChildProfile,
  ChildTransportLocation,
  ChildTransportSchedule,
  SchoolProfile,
  TransportDirection,
  TransportLocationType,
  TransportRouteSettings,
  Weekday,
} from '../types';
import { WEEKDAYS } from '../utils/weekdays';
import { inferTransportArea } from '../utils/transportArea';

interface ChildTransportSettingsProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  regularDays: Weekday[];
  transportProgram: '小学部' | 'キャリアズ';
  routeSettings: TransportRouteSettings;
  childrenList: ChildProfile[];
  currentChildId?: string;
  siblingIds: string[];
  onSiblingIdsChange: (ids: string[]) => void;
  schedule: ChildTransportSchedule[];
  onScheduleChange: (day: Weekday, patch: Partial<ChildTransportSchedule>) => void;
  locations: ChildTransportLocation[];
  schools: SchoolProfile[];
  selectedSchoolId?: string;
  onSchoolChange: (schoolId?: string) => void;
  expandedLocationId?: string;
  onExpandedLocationChange: (id?: string) => void;
  onAddLocation: (type: TransportLocationType) => void;
  onUpdateLocation: (id: string, patch: Partial<ChildTransportLocation>) => void;
  onDeleteLocation: (id: string) => void;
  onSetDefaultLocation: (id: string, direction: TransportDirection) => void;
  formError?: string;
}

const LOCATION_TYPES: TransportLocationType[] = ['自宅', '学校', '学童', '習い事', '親族宅', '事業所', 'その他'];

function iconForType(type: TransportLocationType) {
  if (type === '学校' || type === '学童') return School;
  if (type === '自宅' || type === '親族宅') return Home;
  return MapPin;
}

function defaultLocationName(locations: ChildTransportLocation[], direction: TransportDirection) {
  return locations.find((location) => location.defaultDirections?.includes(direction))?.name
    || locations.find((location) => location.directions.includes(direction))?.name
    || '未設定';
}

export const ChildTransportSettings: React.FC<ChildTransportSettingsProps> = ({
  enabled,
  onEnabledChange,
  regularDays,
  transportProgram,
  routeSettings,
  childrenList,
  currentChildId,
  siblingIds,
  onSiblingIdsChange,
  schedule,
  onScheduleChange,
  locations,
  schools,
  selectedSchoolId,
  onSchoolChange,
  expandedLocationId,
  onExpandedLocationChange,
  onAddLocation,
  onUpdateLocation,
  onDeleteLocation,
  onSetDefaultLocation,
  formError,
}) => {
  const [siblingSearch, setSiblingSearch] = useState('');
  const siblingCandidates = useMemo(() => childrenList
    .filter((child) => child.id !== currentChildId)
    .filter((child) => `${child.name}${child.kana || ''}${child.schoolName || ''}`.normalize('NFKC').toLocaleLowerCase('ja-JP').includes(siblingSearch.trim().normalize('NFKC').toLocaleLowerCase('ja-JP')))
    .sort((left, right) => (left.kana || left.name).localeCompare(right.kana || right.name, 'ja')),
  [childrenList, currentChildId, siblingSearch]);
  const selectedSiblings = siblingIds
    .map((id) => childrenList.find((child) => child.id === id))
    .filter((child): child is ChildProfile => Boolean(child));
  const toggleSibling = (childId: string) => onSiblingIdsChange(
    siblingIds.includes(childId)
      ? siblingIds.filter((id) => id !== childId)
      : [...siblingIds, childId],
  );

  const toggleDirection = (location: ChildTransportLocation, direction: TransportDirection) => {
    const selected = location.directions.includes(direction);
    onUpdateLocation(location.id, {
      directions: selected
        ? location.directions.filter((item) => item !== direction)
        : [...location.directions, direction],
      defaultDirections: selected
        ? (location.defaultDirections || []).filter((item) => item !== direction)
        : location.defaultDirections,
    });
  };

  return (
    <fieldset className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
      <legend className="sr-only">送迎設定</legend>
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-base font-black text-slate-900">送迎設定</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">送迎先の名称・区分・住所を登録すると、月間予定と配車画面へそのまま反映されます。</p>
        </div>
        <div className="shrink-0" role="radiogroup" aria-label="送迎利用の有無">
          <p className="mb-1 text-[10px] font-black text-slate-500">送迎利用</p>
          <div className="grid grid-cols-2 rounded-xl border border-slate-300 bg-slate-100 p-1">
            <button
              type="button"
              role="radio"
              aria-checked={enabled}
              onClick={() => onEnabledChange(true)}
              className={`min-h-9 rounded-lg px-3 text-xs font-black transition-colors ${enabled ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:bg-white'}`}
            >
              利用する
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!enabled}
              onClick={() => onEnabledChange(false)}
              className={`min-h-9 rounded-lg px-3 text-xs font-black transition-colors ${!enabled ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:bg-white'}`}
            >
              利用しない
            </button>
          </div>
        </div>
      </div>

      <section className="border-b border-slate-200 bg-amber-50/60 p-3 sm:p-4">
        <div className="flex items-start gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800"><Users className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-900">兄弟設定</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-slate-600">登録済みの児童を選ぶと、自動配車で同じ便を優先します。当日の迎え先が同じ場合は、同じ到着時刻として計算します。</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selectedSiblings.map((child) => <button key={child.id} type="button" onClick={() => toggleSibling(child.id)} className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-[10px] font-black text-amber-900">{child.name}<span className="ml-1 text-amber-500">×</span></button>)}
              {selectedSiblings.length === 0 && <span className="rounded-lg border border-dashed border-amber-300 bg-white/70 px-2.5 py-1.5 text-[10px] font-bold text-slate-500">兄弟は未設定です</span>}
            </div>
            <details className="mt-2 rounded-xl border border-amber-200 bg-white">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3 text-xs font-black text-amber-900"><span>児童リストから選択</span><span>{selectedSiblings.length}名選択</span></summary>
              <div className="border-t border-amber-100 p-2.5">
                <input value={siblingSearch} onChange={(event) => setSiblingSearch(event.target.value)} placeholder="児童名・ふりがな・学校名で検索" className="min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" />
                <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                  {siblingCandidates.map((child) => { const selected = siblingIds.includes(child.id); return <button key={child.id} type="button" aria-pressed={selected} onClick={() => toggleSibling(child.id)} className={`flex min-h-11 w-full items-center justify-between rounded-lg border px-3 text-left ${selected ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'}`}><span className="min-w-0"><strong className="block truncate text-xs text-slate-900">{child.name}{child.serviceSuspended ? <span className="ml-1 text-[9px] text-slate-400">利用休止中</span> : null}</strong><span className="block truncate text-[9px] text-slate-500">{child.schoolName || child.grade || '学校未登録'}</span></span><span className={`ml-2 shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${selected ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{selected ? '選択中' : '選択'}</span></button>; })}
                  {siblingCandidates.length === 0 && <p className="p-3 text-center text-[10px] text-slate-400">該当する児童がいません。</p>}
                </div>
              </div>
            </details>
          </div>
        </div>
      </section>

      {enabled && (
        <div className="space-y-4 p-3 sm:p-4">
          <section className="rounded-2xl border border-sky-200 bg-sky-50 p-3 sm:p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-sky-700 shadow-sm"><School className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <label className="block text-sm font-black text-slate-900">所属学校
                  <select value={selectedSchoolId || ''} onChange={(event) => onSchoolChange(event.target.value || undefined)} className="mt-1.5 min-h-11 w-full rounded-xl border border-sky-300 bg-white px-3 text-sm font-bold">
                    <option value="">学校台帳から選択</option>
                    {schools.filter((school) => school.active || school.id === selectedSchoolId).map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
                  </select>
                </label>
                <p className="mt-1.5 text-[10px] leading-relaxed text-sky-900">選択すると学校名・住所・送迎エリアを自動反映します。学校の追加・住所変更は「設定 → 学校台帳」で一度だけ行います。</p>
              </div>
            </div>
          </section>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3"><span className="text-[10px] font-black text-sky-700">通常の迎え先</span><strong className="mt-1 block truncate text-sm text-slate-900">{defaultLocationName(locations, '迎え')}</strong></div>
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-3"><span className="text-[10px] font-black text-violet-700">通常の送り先</span><strong className="mt-1 block truncate text-sm text-slate-900">{defaultLocationName(locations, '送り')}</strong></div>
            <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-3 sm:col-span-1"><span className="text-[10px] font-black text-slate-500">登録送迎先</span><strong className="mt-1 block text-sm text-slate-900">{locations.length}か所</strong></div>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-black text-slate-900"><MapPin className="h-4 w-4 text-teal-600" />送迎先台帳</p>
                <p className="mt-0.5 text-[10px] text-slate-500">学校、自宅、祖母宅、学童、習い事などをすべて同じ形式で管理します。</p>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button type="button" onClick={() => onAddLocation('学校')} className="flex min-h-10 items-center justify-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 text-[10px] font-black text-sky-800"><School className="h-3.5 w-3.5" />学校</button>
                <button type="button" onClick={() => onAddLocation('自宅')} className="flex min-h-10 items-center justify-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 text-[10px] font-black text-violet-800"><Home className="h-3.5 w-3.5" />自宅</button>
                <button type="button" onClick={() => onAddLocation('その他')} className="flex min-h-10 items-center justify-center gap-1 rounded-lg bg-teal-600 px-2 text-[10px] font-black text-white"><Plus className="h-3.5 w-3.5" />その他</button>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {locations.map((location) => {
                const expanded = expandedLocationId === location.id;
                const Icon = iconForType(location.type);
                const pickupDefault = location.defaultDirections?.includes('迎え');
                const dropoffDefault = location.defaultDirections?.includes('送り');
                return (
                  <article key={location.id} className={`overflow-hidden rounded-xl border bg-white transition-colors ${expanded ? 'border-teal-300 ring-2 ring-teal-50' : 'border-slate-200'}`}>
                    <div className="flex items-start gap-2 p-3">
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${location.type === '学校' ? 'bg-sky-100 text-sky-700' : location.type === '自宅' ? 'bg-violet-100 text-violet-700' : 'bg-teal-50 text-teal-700'}`}><Icon className="h-5 w-5" /></span>
                      <button type="button" onClick={() => onExpandedLocationChange(expanded ? undefined : location.id)} className="min-w-0 flex-1 text-left">
                        <span className="flex flex-wrap items-center gap-1.5"><strong className="truncate text-sm text-slate-950">{location.name || '名称未入力'}</strong><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-600">{location.type}</span>{pickupDefault && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[9px] font-black text-sky-700">通常迎え</span>}{dropoffDefault && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-black text-violet-700">通常送り</span>}</span>
                        <span className="mt-1 block truncate text-[10px] text-slate-500">{location.address || '住所未入力'}{location.area ? `・${location.area}` : ''}</span>
                      </button>
                      <button type="button" onClick={() => onExpandedLocationChange(expanded ? undefined : location.id)} aria-label={expanded ? '送迎先を閉じる' : '送迎先を編集'} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-50">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
                      {!location.schoolId && <button type="button" onClick={() => { if ((!location.name && !location.address) || window.confirm(`${location.name || 'この送迎先'}を削除しますか？`)) onDeleteLocation(location.id); }} aria-label="送迎先を削除" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600"><Trash2 className="h-4 w-4" /></button>}
                    </div>

                    {expanded && (
                      <div className="ui-panel-enter space-y-4 border-t border-slate-200 bg-slate-50/70 p-3 sm:p-4">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wide text-teal-700">基本情報</p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
                            <label className="text-xs font-bold text-slate-700">送迎先の名称<input value={location.name} disabled={Boolean(location.schoolId)} onChange={(event) => onUpdateLocation(location.id, { name: event.target.value })} placeholder="例：高須小学校 正門" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm disabled:bg-sky-50" /></label>
                            <label className="text-xs font-bold text-slate-700">場所の区分<select value={location.type} disabled={Boolean(location.schoolId)} onChange={(event) => onUpdateLocation(location.id, { type: event.target.value as TransportLocationType })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold disabled:bg-sky-50">{LOCATION_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
                          </div>
                          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
                            <label className="text-xs font-bold text-slate-700">住所・乗降場所<input value={location.address} disabled={Boolean(location.schoolId)} onChange={(event) => { const address = event.target.value; onUpdateLocation(location.id, { address, area: inferTransportArea(address) || '' }); }} placeholder="都道府県・市区町村・番地、門や入口" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm disabled:bg-sky-50" />{location.schoolId && <span className="mt-1 block text-[9px] font-bold text-sky-700">学校台帳と連動しています</span>}</label>
                            <label className="text-xs font-bold text-slate-700">送迎エリア（住所から自動）<div className="mt-1 flex gap-1.5"><input value={location.area || ''} disabled={Boolean(location.schoolId)} onChange={(event) => onUpdateLocation(location.id, { area: event.target.value })} placeholder="住所入力後に自動反映" className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm disabled:bg-sky-50" /><button type="button" disabled={Boolean(location.schoolId) || !inferTransportArea(location.address)} onClick={() => onUpdateLocation(location.id, { area: inferTransportArea(location.address) })} className="shrink-0 rounded-xl border border-teal-300 bg-teal-50 px-2 text-[10px] font-black text-teal-800 disabled:opacity-40">再判定</button></div><span className="mt-1 block text-[9px] font-normal text-slate-500">区・市町村・町域から自動判定します。必要な場合は直接修正できます。</span></label>
                          </div>
                        </div>

                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wide text-teal-700">使用する場面</p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {(['迎え', '送り'] as TransportDirection[]).map((direction) => {
                              const selected = location.directions.includes(direction);
                              const isDefault = location.defaultDirections?.includes(direction);
                              const tone = direction === '迎え' ? 'sky' : 'violet';
                              return <div key={direction} className={`rounded-xl border p-3 ${selected ? tone === 'sky' ? 'border-sky-300 bg-sky-50' : 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white'}`}><label className="flex min-h-8 cursor-pointer items-center justify-between gap-3 text-sm font-black text-slate-800"><span>{direction}に使う</span><input type="checkbox" checked={selected} onChange={() => toggleDirection(location, direction)} className="h-5 w-5 accent-teal-600" /></label>{selected && <button type="button" onClick={() => onSetDefaultLocation(location.id, direction)} className={`mt-2 flex min-h-9 w-full items-center justify-center gap-1 rounded-lg border text-[10px] font-black ${isDefault ? tone === 'sky' ? 'border-sky-500 bg-sky-600 text-white' : 'border-violet-500 bg-violet-600 text-white' : 'border-slate-300 bg-white text-slate-600'}`}><Star className={`h-3.5 w-3.5 ${isDefault ? 'fill-current' : ''}`} />{isDefault ? `通常の${direction}先` : `通常の${direction}先にする`}</button>}</div>;
                            })}
                          </div>
                        </div>

                        <details className="rounded-xl border border-slate-200 bg-white">
                          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-xs font-black text-slate-700"><span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-teal-600" />曜日・期間・注意事項を設定</span><ChevronDown className="h-4 w-4" /></summary>
                          <div className="space-y-3 border-t border-slate-100 p-3">
                            <label className="flex min-h-10 items-center gap-2 rounded-lg bg-teal-50 px-3 text-xs font-bold text-teal-900"><input type="checkbox" checked={Boolean(location.autoSelect)} onChange={(event) => onUpdateLocation(location.id, { autoSelect: event.target.checked })} />条件に合う日はこの場所を自動提案する</label>
                            <fieldset><legend className="text-xs font-bold text-slate-700">利用曜日（未選択は全曜日）</legend><div className="mt-1 grid grid-cols-7 gap-1">{WEEKDAYS.map((day) => { const selected = location.weekdays?.includes(day); return <button key={day} type="button" aria-pressed={selected} onClick={() => onUpdateLocation(location.id, { weekdays: selected ? (location.weekdays || []).filter((item) => item !== day) : [...(location.weekdays || []), day] })} className={`min-h-9 rounded-md border text-[11px] font-black ${selected ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white text-slate-600'}`}>{day}</button>; })}</div></fieldset>
                            <div className="grid gap-2 sm:grid-cols-2"><label className="text-xs font-bold text-slate-700">開始日（任意）<input type="date" value={location.validFrom || ''} onChange={(event) => onUpdateLocation(location.id, { validFrom: event.target.value || undefined })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label><label className="text-xs font-bold text-slate-700">終了日（任意）<input type="date" value={location.validTo || ''} onChange={(event) => onUpdateLocation(location.id, { validTo: event.target.value || undefined })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label></div>
                            <label className="block text-xs font-bold text-slate-700">乗降時の注意（任意）<textarea value={location.note || ''} onChange={(event) => onUpdateLocation(location.id, { note: event.target.value })} placeholder="例：到着前に連絡、北側入口で乗降" className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 p-3 text-sm" /></label>
                          </div>
                        </details>
                      </div>
                    )}
                  </article>
                );
              })}
              {locations.length === 0 && <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-5 text-center"><MapPin className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-xs font-bold text-slate-500">送迎先が未登録です。学校または自宅から追加してください。</p></div>}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
            <div><p className="text-sm font-black text-slate-900">曜日別の迎え基準時刻</p><p className="mt-0.5 text-[10px] text-slate-500">学校の下校時刻など、迎えに向かう基準時刻を登録します。定期利用曜日だけを色付きで表示します。</p></div>
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
              <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-px bg-slate-200 text-center text-[10px] font-black text-slate-600"><span className="bg-slate-50 px-1 py-2">曜日</span><span className="bg-slate-50 px-1 py-2">迎え基準時刻</span></div>
              {WEEKDAYS.map((day) => {
                const daySchedule = schedule.find((item) => item.weekday === day);
                const regular = regularDays.includes(day);
                return <div key={day} className={`grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-px border-t border-slate-100 ${regular ? 'bg-teal-50' : 'bg-white'}`}><strong className={`text-center text-xs ${regular ? 'text-teal-800' : 'text-slate-400'}`}>{day}</strong><input aria-label={`${day}曜日の迎え基準時刻`} type="time" value={daySchedule?.schoolEndTime || ''} onChange={(event) => onScheduleChange(day, { schoolEndTime: event.target.value || undefined })} className="min-h-11 min-w-0 border-0 bg-transparent px-3 text-center text-sm font-bold" /></div>;
              })}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3 text-center">
              <div><span className="block text-[9px] font-black text-violet-700">平日・{transportProgram}</span><strong className="mt-0.5 block text-base text-slate-950">{transportProgram === '小学部' ? routeSettings.weekdayElementaryDepartureTime : routeSettings.weekdayCareersDepartureTime}</strong></div>
              <div className="border-l border-violet-200"><span className="block text-[9px] font-black text-violet-700">休日・共通</span><strong className="mt-0.5 block text-base text-slate-950">{routeSettings.holidayDepartureTime}</strong></div>
              <p className="col-span-2 text-left text-[10px] leading-relaxed text-violet-900">退所予定は自動設定されます。早退・延長など当日だけ異なる場合は「日別利用予定」で変更してください。</p>
            </div>
          </section>

          {formError && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">{formError}</p>}
        </div>
      )}
    </fieldset>
  );
};
