import React, {useState, type FormEvent} from 'react';
import {Activity, ExternalLink} from 'lucide-react';
import {
  assessFreeEgress, browserTransferCounter, createTransferHistory, EGRESS_TARGET_GB, FREE_EGRESS_GB,
  mergeTransferSample, parseTransferGB, parseTransferSample, projectTransferSample, SUPABASE_USAGE_URL,
  transferToday, type TransferSample,
} from '../services/transferUsage';

const formatGB=(n:number)=>new Intl.NumberFormat('ja-JP',{maximumFractionDigits:3}).format(n);
const statusText={ok:'目標内',watch:'注意：無料枠の70％以上',high:'警戒：無料枠の85％以上',limit:'無料枠に到達・超過'};
const barColor={ok:'bg-teal-600',watch:'bg-amber-500',high:'bg-orange-600',limit:'bg-rose-600'};
const input='mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-base text-slate-950';

function FreeQuotaCard({label,gb,forecast}:{label:string;gb?:number;forecast?:number}) {
  const gauge=gb===undefined?null:assessFreeEgress(gb);
  return <section aria-label={label} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
    <h3 className="text-sm font-black">{label}</h3>
    {!gauge || gb===undefined ? <p className="mt-2 text-sm text-slate-600">未計測：公式の利用量を記録してください。</p> : <>
      <p className="mt-2 text-xl font-black tabular-nums">{formatGB(gb)} <span className="text-sm">/ {FREE_EGRESS_GB} GB</span></p>
      <div role="progressbar" aria-label={label+'の無料枠到達率'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100,Math.round(gauge.percentage))}
        aria-valuetext={formatGB(gauge.percentage)+'％'} className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200">
        <div className={'h-full rounded-full '+barColor[gauge.level]} style={{width:Math.min(100,gauge.percentage)+'%'}}/>
      </div>
      <p className="mt-2 text-sm font-bold">{formatGB(gauge.percentage)}％ · {statusText[gauge.level]}</p>
      <p className="mt-1 text-xs text-slate-600">無料枠の残り {formatGB(gauge.remaining)} GB</p>
      {forecast!==undefined && <p className={'mt-2 text-sm font-bold '+(forecast>=FREE_EGRESS_GB?'text-rose-800':'text-slate-700')}>期末の単純見込み {formatGB(forecast)} GB{forecast>=FREE_EGRESS_GB?'（無料枠以上）':''}</p>}
    </>}
  </section>;
}

export function TransferUsagePanel({organizationId}:{key?:string;organizationId:string}) {
  const [initial]=useState(()=>{
    try {return {history:createTransferHistory(localStorage,organizationId).read(),failed:false};}
    catch {return {history:[] as TransferSample[],failed:true};}
  });
  const [history,setHistory]=useState(initial.history);
  const latest=history[0];
  const [start,setStart]=useState(latest?.start||''),[end,setEnd]=useState(latest?.end||'');
  const [observed,setObserved]=useState(transferToday);
  const [uncached,setUncached]=useState(''),[cached,setCached]=useState('');
  const [error,setError]=useState(''),[saved,setSaved]=useState(false);
  const [api,setApi]=useState(()=>browserTransferCounter.read());
  const forecast=latest?projectTransferSample(latest):null;
  const save=(event:FormEvent)=>{
    event.preventDefault();setError('');setSaved(false);
    const sample=parseTransferSample({start,end,observed,uncached:parseTransferGB(uncached),cached:parseTransferGB(cached)});
    if (!sample || sample.observed>transferToday()) {
      setError('請求期間内の確認日と、キャッシュなし・あり両方の数値（GB）を確認してください。0 GBも入力できます。');return;
    }
    try {
      const store=createTransferHistory(localStorage,organizationId);
      const next=mergeTransferSample(store.read(),sample);
      store.write(next);setHistory(next);setSaved(true);
    } catch {setError('このブラウザに保存できませんでした。入力内容は残しています。');}
  };
  const totalRequests=api.reduce((sum,row)=>sum+row.requests,0);
  const measured=api.reduce((sum,row)=>sum+row.measured,0);
  const bytes=api.reduce((sum,row)=>sum+row.declaredBytes,0);
  return <section aria-label="データ転送量の確認" className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-xl font-black"><Activity aria-hidden="true" className="h-5 w-5 text-teal-700"/>データ転送量の確認</h2>
      <p className="mt-1 text-sm text-slate-600">Dサポート・Dレッスンを含むSupabase組織全体を、無料枠と比較します。</p></div>
      <a href={SUPABASE_USAGE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-teal-300 px-3 text-sm font-bold text-teal-800">
        Supabase公式の利用状況を開く <ExternalLink aria-hidden="true" className="h-4 w-4"/>
      </a>
    </header>
    <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
      無料枠はキャッシュなし・ありで各 {FREE_EGRESS_GB} GB。目標は各 {EGRESS_TARGET_GB} GB 以下です。現在の契約プランにかかわらず、無料枠を基準に表示します。
    </div>
    {latest && <p className="text-sm font-bold text-slate-800">最終入力：{latest.observed} ／ 請求期間：{latest.start} ～ {latest.end}{latest.observed!==transferToday()?'（現在値ではありません）':''}</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <FreeQuotaCard label="キャッシュなし（Egress）" gb={latest?.uncached} forecast={forecast?.uncached}/>
      <FreeQuotaCard label="キャッシュあり（Cached Egress）" gb={latest?.cached} forecast={forecast?.cached}/>
    </div>
    {latest && <p className="text-xs text-slate-600">{forecast?'期末見込みは入力値を日数で引き延ばした参考値です。繁忙日や増減は予測しません。':'期末見込みは請求期間の7日目以降、期間内の途中経過から表示します。'}</p>}
    <form onSubmit={save} className="space-y-3 rounded-xl border border-slate-200 p-3">
      <h3 className="font-black">公式の利用量を記録</h3>
      <p className="text-xs leading-relaxed text-slate-600">公式画面で対象組織・請求期間・「All projects」を選び、Egress と Cached Egress の合計値を別々に転記してください。数字と日付だけをこのブラウザに保存します。自動取得・他端末との同期はありません。</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="min-w-0 text-sm font-bold">請求期間の開始日<input required type="date" value={start} onChange={e=>setStart(e.target.value)} className={input}/></label>
        <label className="min-w-0 text-sm font-bold">次の請求期間の開始日<input required type="date" value={end} onChange={e=>setEnd(e.target.value)} className={input}/></label>
        <label className="min-w-0 text-sm font-bold">利用量の確認日<input required type="date" max={transferToday()} value={observed} onChange={e=>setObserved(e.target.value)} className={input}/></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-sm font-bold">キャッシュなし（GB）<input required inputMode="decimal" value={uncached} onChange={e=>setUncached(e.target.value)} className={input} placeholder="例：2.450"/></label>
        <label className="min-w-0 text-sm font-bold">キャッシュあり（GB）<input required inputMode="decimal" value={cached} onChange={e=>setCached(e.target.value)} className={input} placeholder="例：0"/></label>
      </div>
      <button type="submit" className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-bold text-white">この端末に記録</button>
      {error && <p role="alert" className="text-sm font-bold text-rose-800">{error}</p>}
      {saved && <p role="status" className="text-sm font-bold text-teal-800">この端末に記録しました。</p>}
      {initial.failed && !saved && !error && <p role="alert" className="text-sm text-rose-800">以前の記録を読み込めませんでした。公式画面で現在値を確認してください。</p>}
    </form>
    <details className="rounded-xl border border-slate-200 p-3">
      <summary className="cursor-pointer font-bold">入力履歴（{history.length}件）</summary>
      {!history.length ? <p className="mt-2 text-sm text-slate-600">まだ記録されていません。</p> : <ul className="mt-2 divide-y divide-slate-200">
        {history.map(row=><li key={row.observed+row.start+row.end} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <span><b>{row.observed}</b> <span className="text-xs text-slate-600">（{row.start} ～ {row.end}）</span></span>
          <span>なし {formatGB(row.uncached)} GB ／ あり {formatGB(row.cached)} GB</span>
        </li>)}
      </ul>}
    </details>
    <details className="rounded-xl border border-slate-200 p-3">
      <summary className="cursor-pointer font-bold">このタブの通信内訳（診断用）</summary>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">アプリが使うSupabase APIの完了分を集計します。サイズは応答ヘッダーに明示されたものだけで、ブラウザキャッシュや通信方式を含む実転送量ではありません。Dレッスン・他端末・Realtime・サーバー間通信は対象外。再読み込みやアカウント切り替えでリセットされます。</p>
      <button type="button" onClick={()=>setApi(browserTransferCounter.read())} className="mt-2 min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-bold">このタブの集計を更新</button>
      <p className="mt-2 text-sm">完了 {totalRequests}回 ／ サイズ判明 {measured}回 ／ サイズ不明 {totalRequests-measured}回{measured>0?` ／ 判明分 ${formatGB(bytes/1_000_000)} MB`:''}</p>
      {api.length>0 && <ul className="mt-2 divide-y divide-slate-200">
        {api.slice(0,12).map(row=><li key={row.operation} className="flex flex-wrap justify-between gap-x-2 py-2 text-xs">
          <span className="break-all font-bold">{row.operation}</span><span>{row.requests}回（失敗 {row.failures}回） ／ {row.measured?formatGB(row.declaredBytes/1_000_000)+' MB':'サイズ不明'}</span>
        </li>)}
      </ul>}
    </details>
  </section>;
}
