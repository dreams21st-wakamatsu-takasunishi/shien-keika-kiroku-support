import {useState} from "react";
import {useChildServiceEntitlements} from "../services/childServiceEntitlementService";
import {INDIVIDUAL_SUPPORT_LABELS} from "../utils/childServiceEntitlements";

export function ChildIndividualSupportBadge({organizationId,userId,childId,date}: {
  organizationId?: string; userId?: string; childId?: string; date: string;
}) {
  const [retry,setRetry]=useState(0);
  const {result,status}=useChildServiceEntitlements(userId?organizationId:undefined,childId?[childId]:[],date,"record",retry,userId);
  const types=result.entitlements[0]?.individualSupportTypes??[];
  if(status==="error")return <button type="button" onClick={()=>setRetry(v=>v+1)} className="min-h-9 rounded-lg border border-amber-200 bg-amber-50 px-2 text-xs text-amber-950">受給者証の区分を再取得</button>;
  if(!types.length)return null;
  return <span className="rounded-lg border border-violet-300 bg-violet-50 px-2 py-1.5 text-xs font-black text-violet-950" title="受給者証に登録された区分。請求可否の判定ではありません。">
    受給者証：個別サポート加算 {types.map(type=>INDIVIDUAL_SUPPORT_LABELS[type]).join("・")}
  </span>;
}
