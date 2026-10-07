import type { ChildProfile } from '../types';
import type { AutomaticLessonResult } from '../services/useLessonAutoHistory';
import { formatLessonCheckTime } from '../learning/lessonCheckTime';

export function LessonAutoStatus({results,issues,childrenList,disabled,onRefresh}:{
  results:Record<string,AutomaticLessonResult>;issues:{childId:string;message:string}[];
  childrenList:ChildProfile[];disabled:boolean;onRefresh:(childId?:string)=>void;
}) {
  const rows=Object.values(results),loading=rows.some(row=>row.status==='loading');
  return <>
    <details className="mt-2"><summary className="cursor-pointer py-1 text-xs font-bold">取得状況：{rows.filter(row=>row.status==='ready').length}名の実績あり{issues.length>0?`・要確認 ${issues.length}名`:''}{loading?'・取得中':''}</summary>
      <ul className="mt-2 divide-y divide-teal-200 text-xs">{rows.map(row=>{
        const name=childrenList.find(child=>child.id===row.childId)?.name||'児童';
        const issue=issues.find(item=>item.childId===row.childId);
        return <li key={row.childId} className="flex flex-wrap items-start justify-between gap-2 py-2">
          <div className="min-w-0 flex-1"><p className={`break-words ${issue||row.status==='error'?'font-bold text-rose-800':''}`}>{name}：{issue?.message||row.message}</p>
            {row.checkedAt&&<p className="mt-1 text-slate-600">確認時刻（端末時計）：{formatLessonCheckTime(row.checkedAt)}</p>}
          </div>
          <button type="button" disabled={disabled||loading} aria-label={`${name}の実績を再取得`} onClick={()=>onRefresh(row.childId)} className="min-h-10 shrink-0 rounded-lg border border-teal-400 bg-white px-3 font-bold text-teal-900 disabled:opacity-50">この児童を再取得</button>
        </li>;
      })}</ul>
    </details>
    {issues.length>0&&<p role="alert" className="mt-2 text-xs font-bold text-rose-800">一部の実績は自動反映できませんでした。取得状況を確認し、必要に応じて再取得してください。手入力は続けられます。</p>}
  </>;
}
