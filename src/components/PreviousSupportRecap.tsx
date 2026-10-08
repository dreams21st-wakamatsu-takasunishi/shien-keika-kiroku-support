import {useMemo,useState} from 'react';
import {History,Search} from 'lucide-react';
import type {ChildProfile,SupportRecord} from '../types';
import {buildPreviousSupportRecaps,previousSupportDate,shortRecapLine,supportRecapLines} from '../utils/previousSupportRecap';

export function PreviousSupportRecap({meetingDate,childrenList,records}:{meetingDate:string;childrenList:ChildProfile[];records:SupportRecord[]}){
 const date=previousSupportDate(meetingDate);
 const [query,setQuery]=useState('');
 const rows=useMemo(()=>buildPreviousSupportRecaps(childrenList,records,date),[childrenList,records,date]);
 const visible=rows.filter(row=>row.child.name.replace(/\s/g,'').includes(query.replace(/\s/g,'')));
 return <aside aria-label="前回の支援の振り返り" className="min-w-0 border-t border-slate-200 pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
  <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900"><History className="h-4 w-4 text-teal-700"/>前回の支援の振り返り</h4>
  <p className="mt-1 text-sm text-slate-700">{date} / 記録あり {rows.filter(row=>row.records.length).length}名</p>
  <p className="mt-1 text-xs text-slate-500">支援記録の要点（抜粋）</p>
  <label className="relative mt-3 block"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500"/><input aria-label="振り返りの児童を検索" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="児童名" className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm"/></label>
  <div className="mt-3 max-h-[34rem] divide-y divide-slate-200 overflow-y-auto pr-2">
   {visible.length===0&&<p className="py-3 text-sm text-slate-600">該当する児童はいません。</p>}
   {visible.map(({child,records:childRecords})=><section key={child.id} aria-label={`${child.name}の振り返り`} className="py-3">
    <h5 className="break-words text-sm font-bold text-slate-900">{child.name}</h5>
    {childRecords.length===0?<p className="mt-1 text-sm text-slate-500">この日の支援記録はありません。</p>:childRecords.map(record=>{
     const lines=supportRecapLines(record);
     return <div key={record.id} className="mt-2 space-y-2">
      <p className={`text-xs ${record.approvalStatus==='確認済み'?'text-teal-800':'font-bold text-amber-800'}`}>{record.templateName} / {record.approvalStatus} / 記録者：{record.recorderName||'未設定'}</p>
      <ul className="space-y-1 text-sm leading-6 text-slate-800">{lines.slice(0,3).map((line,index)=><li key={index} className="whitespace-pre-wrap break-words">{shortRecapLine(line)}</li>)}</ul>
      {lines.length===0&&<p className="text-sm text-slate-500">様子の記載はありません。</p>}
      <details><summary className="cursor-pointer py-1 text-xs font-bold text-teal-800">元の記録を確認</summary><div className="mt-2 space-y-2 text-sm leading-6 text-slate-700">{lines.map((line,index)=><p key={index} className="whitespace-pre-wrap break-words">{line}</p>)}</div></details>
     </div>;
    })}
   </section>)}
  </div>
 </aside>;
}
