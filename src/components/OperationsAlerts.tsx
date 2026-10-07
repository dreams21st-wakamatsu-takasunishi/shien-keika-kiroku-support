import {AlertTriangle,Info} from 'lucide-react';
import type {OperationsWarning} from '../utils/operationsTimeline';
export function OperationsAlerts({warnings,onSelectRun}:{warnings:OperationsWarning[];onSelectRun:(id:string)=>void}) {
  if(!warnings.length)return null;
  const critical=warnings.filter(warning=>warning.severity==='critical').length;
  const caution=warnings.length-critical;
  return <details aria-label="配車アラート" className={`mb-2 shrink-0 rounded-lg border px-3 py-2 ${critical?'border-red-300 bg-red-50':'border-yellow-300 bg-yellow-50'}`}>
    <summary className="cursor-pointer text-xs font-bold text-slate-950">
      配車アラート <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
        {critical>0&&<span data-severity="critical" className="inline-flex items-center gap-1 rounded bg-red-700 px-2 py-1 text-white"><AlertTriangle size={13} aria-hidden="true"/>要対応 {critical}件</span>}
        {caution>0&&<span data-severity="warning" className="inline-flex items-center gap-1 rounded border border-yellow-400 bg-yellow-100 px-2 py-1 text-yellow-950"><Info size={13} aria-hidden="true"/>要確認 {caution}件</span>}
      </span>
    </summary>
    <p className="mt-2 text-[11px] text-slate-700">赤：重複・定員等の要対応／黄：予定の照合・要確認。項目を押すと該当便を開きます。</p>
    <div className="mt-2 max-h-36 space-y-1 overflow-auto">
      {[...warnings].sort((a,b)=>Number(b.severity==='critical')-Number(a.severity==='critical')).map(warning=><button type="button" data-severity={warning.severity} key={warning.key} onClick={()=>onSelectRun(warning.runId)} className={`flex min-h-10 w-full items-start gap-2 rounded-lg border px-2 py-2 text-left text-xs ${warning.severity==='critical'?'border-red-300 bg-red-100 text-red-950':'border-yellow-300 bg-yellow-100 text-yellow-950'}`}>
        {warning.severity==='critical'?<AlertTriangle size={15} className="shrink-0" aria-hidden="true"/>:<Info size={15} className="shrink-0" aria-hidden="true"/>}
        <span><strong className="mr-1">{warning.severity==='critical'?'要対応':'要確認'}</strong>{warning.message}</span>
      </button>)}
    </div>
  </details>;
}
