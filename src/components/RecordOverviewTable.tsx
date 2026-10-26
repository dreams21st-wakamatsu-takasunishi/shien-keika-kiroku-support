import {useState} from 'react';
export interface RecordOverviewCell {value:string;options?:readonly string[];stepId?:string;skipped?:boolean}
export interface RecordOverviewRow {id:string;name:string;program:string;cells:RecordOverviewCell[];unanswered:number;active:boolean}
export function RecordOverviewTable({columns,rows,disabled,onChange,onOpen}:{columns:{id:string;label:string}[];rows:RecordOverviewRow[];disabled:boolean;onChange:(childId:string,stepId:string,value:string)=>void;onOpen:(childId:string)=>void}){
 const [collapsed,setCollapsed]=useState(false);
 return <section className="record-overview rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" aria-label="児童ごとの記録一覧">
  <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-black text-slate-900">この場面の入力一覧・{rows.length}名</h2><button type="button" aria-expanded={!collapsed} className="min-h-11 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700" onClick={()=>setCollapsed(v=>!v)}>{collapsed?'一覧を開く':'一覧を収納'}</button></div>
  <table hidden={collapsed} className="record-overview-table w-full table-fixed text-sm"><thead><tr><th className="w-32">児童</th>{columns.map(c=><th key={c.id}>{c.label}</th>)}<th className="w-24">確認</th></tr></thead><tbody>{rows.map(row=><tr key={row.id} data-overview-child={row.id} className={row.active?'is-active':''}>
   <th scope="row"><span className="block break-words">{row.name}</span><span className={`record-program-badge ${row.program==='キャリアズ'?'is-careers':row.program==='小学部'?'is-elementary':'is-unknown'}`}>{row.program}</span></th>
   {columns.map((column,i)=>{const cell=row.cells[i]||{value:''};return <td key={column.id} data-label={column.label}>{cell.options&&cell.stepId?<select aria-label={`${row.name}の${column.label}`} title={cell.value||'未確認'} value={cell.value} disabled={disabled} className="min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-950 disabled:opacity-60" onChange={e=>onChange(row.id,cell.stepId!,e.target.value)}><option value="">{cell.skipped?'スキップ済み':'未確認'}</option>{cell.options.map(value=><option key={value} value={value}>{value}</option>)}</select>:<span className="block break-words text-xs text-slate-600">{cell.value||'個別入力で確認'}</span>}</td>;})}
   <td data-label="確認"><button type="button" onClick={()=>{setCollapsed(true);onOpen(row.id);}} className="min-h-11 w-full rounded-lg border border-teal-300 bg-teal-50 px-2 text-xs font-bold text-teal-900">個別入力<span className="block text-[11px]">未回答 {row.unanswered}</span></button></td>
  </tr>)}</tbody></table>
 </section>;
}
