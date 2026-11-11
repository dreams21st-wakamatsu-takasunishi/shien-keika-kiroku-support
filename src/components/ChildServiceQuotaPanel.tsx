import {useMemo,useState} from "react";
import type {ChildProfile,DailyChildPlan,DailyTransportRequirement} from "../types";
import {VISITING_SERVICE} from "../utils/careServices";
import {monthlyServiceUsage} from "../utils/childServiceEntitlements";
import {setChildVisitingPlan,useChildServiceEntitlements} from "../services/childServiceEntitlementService";

export function ChildServiceQuotaPanel({organizationId,userId,date,children,plans,requirements}: {
  key?: string; organizationId: string; userId?: string; date: string; children: ChildProfile[];
  plans: DailyChildPlan[]; requirements: DailyTransportRequirement[];
}) {
  const [revision,setRevision]=useState(0),[selected,setSelected]=useState(""),[busy,setBusy]=useState(false),
    [error,setError]=useState("");
  const active=useMemo(()=>children.filter(child=>!child.serviceSuspended),[children]);
  const {result,status}=useChildServiceEntitlements(organizationId,active.map(child=>child.id),date,"schedule",revision,userId);
  const month=date.slice(0,7);
  const usage=useMemo(()=>monthlyServiceUsage(month,active,plans,requirements,result.visits),[month,active,plans,requirements,result.visits]);
  const counts=result.entitlements.flatMap(row=>{
    const child=active.find(item=>item.id===row.childId);
    if(!child)return [];
    return [
      {child,service:"通所",limit:row.dayServiceDays,days:usage.day.get(child.id)?.size||0},
      {child,service:"訪問支援",limit:row.visitingDays,days:usage.visiting.get(child.id)?.size||0},
    ].filter(row=>row.limit!=null);
  });
  const over=counts.filter(row=>row.days>row.limit!);
  const eligible=active.filter(child=>child.careType===VISITING_SERVICE||child.visitingSupportEnabled);
  const visits=result.visits.filter(row=>row.date===date);
  const available=eligible.filter(child=>!visits.some(row=>row.childId===child.id));
  const save=async(id:string,scheduled:boolean)=>{
    if(!id||busy||status!=="ready")return;
    setBusy(true);setError("");
    try{await setChildVisitingPlan(id,date,scheduled);setSelected("");setRevision(v=>v+1);}
    catch(e){setError(e instanceof Error?e.message:"訪問予定を保存できませんでした。");}
    finally{setBusy(false);}
  };
  return <section aria-label="支給量と訪問予定" className="rounded-xl border border-violet-200 bg-white p-3">
    <h3 className="text-sm font-black text-violet-950">支給量・訪問支援の予定</h3>
    <p className="mt-1 text-xs text-slate-600">選択日の受給者証と、この月に登録された予定を比較します。欠席を除き、同じ日の予定は各サービスで1日です。他事業所の利用・請求可否は判定しません。</p>
    {status==="loading"&&<p role="status" className="mt-2 text-xs text-slate-600">支給量と訪問予定を確認中…</p>}
    {status==="error"&&<div role="alert" className="mt-2 text-xs text-rose-800">支給量・訪問予定を取得できません。超過の判定は行っていません。 <button type="button" className="underline" onClick={()=>setRevision(v=>v+1)}>再取得</button></div>}
    {!!over.length&&<div role="alert" className="mt-2 rounded-lg border border-rose-300 bg-rose-50 p-2 text-xs text-rose-950">
      <strong>支給量を超える利用予定があります</strong>
      <ul className="mt-1">{over.map(row=><li key={row.child.id+row.service}>{row.child.name}：{row.service} {row.days}日／支給量 {row.limit}日（{row.days-row.limit!}日超過）</li>)}</ul>
    </div>}
    {status==="ready"&&<details className="mt-2 text-xs">
      <summary className="min-h-9 cursor-pointer py-2 font-bold">登録済みの支給量と月内予定</summary>
      {counts.length?<ul className="space-y-1">{counts.map(row=><li key={row.child.id+row.service}>{row.child.name}：{row.service} {row.days}日／{row.limit}日</li>)}</ul>:<p>選択日で確認できる支給量はありません。</p>}
    </details>}
    {eligible.length>0&&status==="ready"&&<div className="mt-2 border-t pt-2">
      <h4 className="text-xs font-bold">{date} の保育所等訪問支援</h4>
      <ul className="my-1 space-y-1">{visits.map(row=><li key={row.childId} className="flex items-center gap-2 text-xs">
        <span>{active.find(child=>child.id===row.childId)?.name}</span>
        <button type="button" disabled={busy} className="min-h-9 rounded border px-2 text-rose-800"
          onClick={()=>{if(window.confirm("この日の訪問予定を取り消しますか？通所・送迎予定は変更しません。"))void save(row.childId,false);}}>訪問予定を取消</button>
      </li>)}</ul>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-bold">訪問予定の児童
          <select aria-label="訪問予定の児童" value={selected} disabled={busy} onChange={e=>setSelected(e.target.value)} className="block min-h-10 max-w-full rounded-lg border px-2">
            <option value="">選択してください</option>{available.map(child=><option key={child.id} value={child.id}>{child.name}</option>)}
          </select>
        </label>
        <button type="button" disabled={busy||!available.some(child=>child.id===selected)} onClick={()=>void save(selected,true)}
          className="min-h-10 rounded-lg bg-violet-700 px-3 text-xs font-bold text-white disabled:opacity-40">訪問予定を登録</button>
      </div>
    </div>}
    {error&&<p role="alert" className="mt-2 text-xs text-rose-800">{error}</p>}
  </section>;
}
