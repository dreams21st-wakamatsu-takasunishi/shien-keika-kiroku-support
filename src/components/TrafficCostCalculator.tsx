import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Calculator, Check, Copy, Fuel, Plus, Printer, RotateCcw, Trash2 } from 'lucide-react';
import { calculateTrafficCost, createTrafficCostInput, restoreTrafficCostInput, type TrafficCostInput } from '../utils/trafficCost';

const yen = (amount: number) => `${amount.toLocaleString('ja-JP', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}円`;
const decimal = (amount: number) => amount.toLocaleString('ja-JP', { maximumFractionDigits: 3 });
const fieldClass = 'mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base font-bold text-slate-950 focus:border-teal-500';

export function TrafficCostCalculator({ scopeKey }: { scopeKey: string }) {
  const storageKey = `d-support-traffic-cost-v1:${scopeKey}`;
  const [input, setInput] = useState<TrafficCostInput>(() => {
    try { return restoreTrafficCostInput(sessionStorage.getItem(storageKey)); }
    catch { return createTrafficCostInput(); }
  });
  const [message, setMessage] = useState('');
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const result = useMemo(() => calculateTrafficCost(input), [input]);
  const valid = result.errors.length === 0;
  const selectedCount = input.vehicles.filter((vehicle) => vehicle.selected).length;
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(input)); }
    catch { setStorageUnavailable(true); }
  }, [input, storageKey]);
  const update = <K extends keyof TrafficCostInput>(key: K, value: TrafficCostInput[K]) => {
    setInput((previous) => ({ ...previous, [key]: value }));
    setMessage('');
  };
  const updateVehicle = (id: string, patch: Partial<TrafficCostInput['vehicles'][number]>) => {
    setInput((previous) => ({ ...previous, vehicles: previous.vehicles.map((vehicle) => vehicle.id === id ? { ...vehicle, ...patch } : vehicle) }));
    setMessage('');
  };
  const copy = async () => {
    if (!valid) return;
    const text = [
      `交通費計算${input.destination ? `：${input.destination}` : ''}${input.date ? `（${input.date}）` : ''}`,
      `往復距離：${decimal(result.totalDistance)}km／ガソリン単価：${input.fuelPrice}円/L`,
      `使用車両：${result.costs.map((vehicle) => vehicle.name).join('、')}／利用児童：${input.childCount}名`,
      ...result.costs.map((vehicle) => `${vehicle.name}のガソリン代：${yen(vehicle.fuelCost)}`),
      `高速・駐車場代：${yen(result.extraTotal)}（${input.extraCostMode === 'total' ? '全車合計' : '1台あたり × 使用台数'}）`,
      `総費用：${yen(result.total)}／1人あたりの計算額：${yen(result.perChild)}`,
      `1人あたりの集金目安：${yen(result.chargePerChild)}（${roundingLabels[input.rounding]}）`,
      `集金合計：${yen(result.collectedTotal)}／総費用との差：${yen(result.balance)}`,
    ].join('\n');
    try { await navigator.clipboard.writeText(text); setMessage('計算結果をコピーしました。'); }
    catch { setMessage('コピーできませんでした。ブラウザのクリップボード許可を確認してください。'); }
  };

  return <section className="traffic-cost-page mx-auto max-w-6xl space-y-4 pb-6" aria-label="交通費計算">
    <header className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><Calculator className="h-6 w-6" /></span>
        <div><h1 className="text-xl font-black text-slate-950">交通費計算</h1><p className="mt-1 text-sm text-slate-600">距離・人数・使用車両を入力すると、すぐに金額が分かります。</p></div>
      </div>
      <a href={`${import.meta.env.BASE_URL}manuals/traffic-cost/index.html`} target="_blank" rel="noopener noreferrer" className="traffic-cost-no-print flex min-h-11 items-center gap-2 rounded-xl border border-teal-300 bg-teal-50 px-4 text-sm font-bold text-teal-800"><BookOpen className="h-4 w-4" />距離の調べ方（図解）</a>
    </header>

    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2"><h2 className="font-black text-slate-900">1. 距離と人数を入力</h2><span className="text-xs text-slate-500">必須：距離・単価・児童数</span></div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="text-sm font-bold text-slate-700">距離（km）<input aria-label="距離（km）" inputMode="decimal" value={input.distance} onChange={(event) => update('distance', event.target.value)} placeholder="例：8.5" className={fieldClass} />
          <select aria-label="距離の入力方式" value={input.distanceMode} onChange={(event) => update('distanceMode', event.target.value as TrafficCostInput['distanceMode'])} className="mt-2 min-h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm font-bold"><option value="oneWay">片道距離を入力（自動で2倍）</option><option value="roundTrip">往復の合計距離を入力</option></select>
        </label>
        <label className="text-sm font-bold text-slate-700">ガソリン単価（円/L）<input inputMode="decimal" value={input.fuelPrice} onChange={(event) => update('fuelPrice', event.target.value)} className={fieldClass} /><span className="mt-2 block text-xs font-normal text-slate-500">160円はExcelの初期値です。当日の単価に変更してください。</span></label>
        <label className="text-sm font-bold text-slate-700">利用児童数（名）<input inputMode="numeric" value={input.childCount} onChange={(event) => update('childCount', event.target.value)} placeholder="例：8" className={fieldClass} /><span className="mt-2 block text-xs font-normal text-slate-500">職員は人数に含めません。</span></label>
      </div>
      <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-bold text-slate-700">活動名・日付を付ける（任意）</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">活動名・目的地<input value={input.destination} onChange={(event) => update('destination', event.target.value)} placeholder="例：外出活動" className={fieldClass} /></label><label className="text-xs font-bold">活動日<input type="date" value={input.date} onChange={(event) => update('date', event.target.value)} className={fieldClass} /></label></div>
      </details>
    </div>

    <fieldset className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <legend className="sr-only">使用車両と燃費</legend>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-black text-slate-900">2. 使用する車両を選択 <span className="ml-2 rounded-full bg-sky-50 px-2 py-1 text-xs text-sky-800">{selectedCount}台</span></h2><span className="text-xs text-slate-500">燃費はExcelの値・変更可能</span></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {input.vehicles.map((vehicle) => <div key={vehicle.id} className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${vehicle.selected ? 'border-teal-400 bg-teal-50/60' : 'border-slate-200 bg-slate-50'}`}>
          <label className="flex min-h-11 min-w-28 flex-1 cursor-pointer items-center gap-3 text-sm font-black text-slate-900"><input type="checkbox" checked={vehicle.selected} onChange={(event) => updateVehicle(vehicle.id, { selected: event.target.checked })} className="h-5 w-5 accent-teal-600" /><span>{vehicle.name || '追加車両'}</span></label>
          <label className="w-28 text-xs font-bold text-slate-600">燃費（km/L）<input aria-label={`${vehicle.name || '追加車両'}の燃費（km/L）`} disabled={!vehicle.selected} inputMode="decimal" value={vehicle.efficiency} onChange={(event) => updateVehicle(vehicle.id, { efficiency: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-bold text-slate-950 disabled:bg-slate-100 disabled:text-slate-400" /></label>
          {vehicle.id.startsWith('custom-') && <div className="flex w-full gap-2"><input aria-label="追加車両の名前" value={vehicle.name} onChange={(event) => updateVehicle(vehicle.id, { name: event.target.value })} placeholder="車両名" className="min-h-10 flex-1 rounded-lg border border-slate-300 px-2 text-sm" /><button type="button" aria-label={`${vehicle.name || '追加車両'}を削除`} onClick={() => update('vehicles', input.vehicles.filter((item) => item.id !== vehicle.id))} className="traffic-cost-no-print grid h-10 w-10 shrink-0 place-items-center rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button></div>}
        </div>)}
      </div>
      <button type="button" onClick={() => update('vehicles', [...input.vehicles, { id: `custom-${crypto.randomUUID()}`, name: '', efficiency: '', selected: true }])} className="traffic-cost-no-print mt-3 flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-700"><Plus className="h-4 w-4" />別の車両を追加</button>
      <p className="mt-2 text-xs text-slate-500">チェックした車両だけを計算します。すべての車両が同じ往復距離を走る前提です。</p>
    </fieldset>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="font-black text-slate-900">3. 追加費用と端数処理</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <label className="text-sm font-bold text-slate-700">高速・駐車場代（円）<input inputMode="decimal" value={input.extraCost} onChange={(event) => update('extraCost', event.target.value)} className={fieldClass} /><span className="mt-1 block text-xs font-normal text-slate-500">不要な場合は0。往復分を入力します。</span></label>
        <label className="text-sm font-bold text-slate-700">追加費用の扱い<select value={input.extraCostMode} onChange={(event) => update('extraCostMode', event.target.value as TrafficCostInput['extraCostMode'])} className={fieldClass}><option value="total">全車合計（1回だけ加算）</option><option value="perVehicle">1台あたり（使用台数を掛ける）</option></select><span className="mt-1 block text-xs font-normal text-slate-500">1台あたりは、全車の追加費用が同じ場合のみ。</span></label>
        <label className="text-sm font-bold text-slate-700">1人あたりの端数処理<select value={input.rounding} onChange={(event) => update('rounding', event.target.value as TrafficCostInput['rounding'])} className={fieldClass}>{Object.entries(roundingLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      </div>
    </section>

    {!valid ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="status"><p className="font-bold">計算に必要な入力を確認してください</p><ul className="mt-2 list-inside list-disc space-y-1">{result.errors.map((error) => <li key={error}>{error}</li>)}</ul></div>
      : <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-label="計算内訳">
        <h2 className="flex items-center gap-2 font-black text-slate-900"><Fuel className="h-5 w-5 text-teal-700" />計算内訳</h2>
        <p className="mt-2 text-sm text-slate-600">往復{decimal(result.totalDistance)}km ÷ 各車の燃費 × {input.fuelPrice}円/L</p>
        <div className="mt-3 divide-y divide-slate-100">{result.costs.map((vehicle) => <div key={vehicle.id} className="flex items-center justify-between gap-2 py-2 text-sm"><div><span className="font-bold text-slate-800">{vehicle.name}</span><span className="ml-2 text-xs text-slate-500">{decimal(vehicle.liters)}L</span></div><span className="font-bold tabular-nums text-slate-900">{yen(vehicle.fuelCost)}</span></div>)}</div>
        <dl className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-3"><div><dt className="text-xs text-slate-500">端数処理前の1人あたり</dt><dd className="mt-1 font-bold text-slate-900">{yen(result.perChild)}</dd></div><div><dt className="text-xs text-slate-500">集金合計（目安 × 児童数）</dt><dd className="mt-1 font-bold text-slate-900">{yen(result.collectedTotal)}</dd></div><div><dt className="text-xs text-slate-500">集金合計と総費用の差</dt><dd className={`mt-1 font-bold ${result.balance < -0.005 ? 'text-amber-800' : 'text-slate-900'}`}>{result.balance > 0 ? '+' : ''}{yen(result.balance)}</dd></div></dl>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">途中の金額は丸めずに計算しています。表示は小数第2位まで。集金目安は選んだ端数処理による金額で、実費とは差が出る場合があります。</p>
      </section>}

    <div className="grid gap-3 sm:grid-cols-2" aria-live="polite" aria-atomic="true">
      <ResultCard label="総費用（全車の往復合計）" value={valid ? yen(result.total) : '—'} detail={valid ? `ガソリン ${yen(result.fuelTotal)} ＋ 高速・駐車場 ${yen(result.extraTotal)}` : '上の入力欄を埋めると計算します'} />
      <ResultCard label="児童1人あたりの集金目安" value={valid ? yen(result.chargePerChild) : '—'} detail={valid ? `${input.childCount}名で分担・${roundingLabels[input.rounding]}` : '職員を含めず、利用児童数を入力してください'} primary />
    </div>

    <footer className="traffic-cost-no-print flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div><p className="text-xs text-slate-500">{storageUnavailable ? 'このブラウザでは入力を保持できません。画面を閉じる前に結果をコピーしてください。' : '入力はこのタブ内で保持されます。別端末には共有されません。'}</p>{message && <p className="mt-1 text-xs font-bold text-teal-800" role="status">{message}</p>}</div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => { if (window.confirm('交通費計算の入力を初期状態に戻しますか？')) { setInput(createTrafficCostInput()); setMessage('入力をリセットしました。'); } }} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-600"><RotateCcw className="h-4 w-4" />リセット</button><button type="button" disabled={!valid} onClick={() => window.print()} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-700 disabled:opacity-40"><Printer className="h-4 w-4" />印刷</button><button type="button" disabled={!valid} onClick={() => void copy()} className="flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-bold text-white disabled:opacity-40">{message.startsWith('計算結果') ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}結果をコピー</button></div>
    </footer>
  </section>;
}

const roundingLabels: Record<TrafficCostInput['rounding'], string> = {
  nearest: '1円単位で四捨五入', ceil1: '1円単位で切り上げ', ceil10: '10円単位で切り上げ', ceil100: '100円単位で切り上げ',
};

function ResultCard({ label, value, detail, primary = false }: { label: string; value: string; detail: string; primary?: boolean }) {
  return <div className={`rounded-2xl border p-4 sm:p-5 ${primary ? 'border-teal-700 bg-teal-800 text-white' : 'border-slate-200 bg-white text-slate-950'}`}><p className={`text-sm font-bold ${primary ? 'text-teal-100' : 'text-slate-600'}`}>{label}</p><p className="mt-2 text-3xl font-black tabular-nums sm:text-4xl">{value}</p><p className={`mt-2 text-xs leading-relaxed ${primary ? 'text-teal-100' : 'text-slate-500'}`}>{detail}</p></div>;
}
