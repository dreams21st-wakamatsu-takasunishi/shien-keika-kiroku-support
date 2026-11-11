import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { validDocumentDate } from "../utils/childDocuments";
import { validIndividualSupportTypes, validMonthlyDays, type ChildServiceEntitlement, type ChildVisitingPlan } from "../utils/childServiceEntitlements";

type Purpose = "record" | "schedule";
interface EntitlementResult { entitlements: ChildServiceEntitlement[]; visits: ChildVisitingPlan[] }
const empty: EntitlementResult = { entitlements: [], visits: [] };

export function parseChildServiceEntitlements(value: unknown, ids: string[], date: string, purpose: Purpose): EntitlementResult {
  const raw = value as Partial<EntitlementResult> | null;
  if (!raw || !Array.isArray(raw.entitlements) || !Array.isArray(raw.visits)) throw Error("支給量・受給者証の表示情報を確認できません。");
  const allowed = new Set(ids), seen = new Set<string>();
  const entitlements = raw.entitlements.map(row => {
    if (!row || !allowed.has(row.childId) || seen.has(row.childId)) throw Error("対象児童を確認できません。");
    seen.add(row.childId);
    if (purpose === "record" && validIndividualSupportTypes(row.individualSupportTypes)) return {childId: row.childId, individualSupportTypes: row.individualSupportTypes};
    if (purpose === "schedule" && validMonthlyDays(row.dayServiceDays) && validMonthlyDays(row.visitingDays)) return {childId: row.childId, dayServiceDays: row.dayServiceDays, visitingDays: row.visitingDays};
    throw Error("受給者証の表示情報を確認できません。");
  });
  const visits = purpose === "schedule" ? raw.visits.map(row => {
    if (!row || !allowed.has(row.childId) || !validDocumentDate(row.date) || row.date.slice(0,7) !== date.slice(0,7)) throw Error("訪問予定を確認できません。");
    return {childId: row.childId, date: row.date};
  }) : [];
  return { entitlements, visits };
}

export async function setChildVisitingPlan(childId: string, date: string, scheduled: boolean) {
  if (!supabase) throw Error("訪問予定の保存にはクラウド接続が必要です。");
  const { error } = await supabase.rpc("set_child_visiting_plan", {p_child_id: childId, p_date: date, p_scheduled: scheduled}).abortSignal(AbortSignal.timeout(20000));
  if (error) throw Error("訪問予定を保存できませんでした。再読み込みして確認してください。");
}

export function useChildServiceEntitlements(organizationId: string | undefined, ids: string[], date: string, purpose: Purpose, revision = 0, userId?: string) {
  const key = organizationId && ids.length && validDocumentDate(date) && supabase
    ? JSON.stringify([organizationId, userId ?? "", date, purpose, [...new Set(ids)].sort(), revision]) : "";
  const [state, setState] = useState<{key: string; result: EntitlementResult; status: "loading" | "ready" | "error"}>({key: "", result: empty, status: "ready"});
  useEffect(() => {
    const client = supabase;
    if (!key || !client) return;
    const controller = new AbortController();
    const [, , requestDate, requestPurpose, childIds] = JSON.parse(key) as [string, string, string, Purpose, string[]];
    setState({key, result: empty, status: "loading"});
    void (async () => {
      try {
        const {data, error} = await client.rpc("get_child_service_entitlements", {p_date: requestDate, p_child_ids: childIds, p_purpose: requestPurpose})
          .abortSignal(AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
        if (error) throw error;
        const result = parseChildServiceEntitlements(data, childIds, requestDate, requestPurpose);
        if (!controller.signal.aborted) setState({key, result, status: "ready"});
      } catch {
        if (!controller.signal.aborted) setState({key, result: empty, status: "error"});
      }
    })();
    return () => controller.abort();
  }, [key]);
  return state.key === key ? state : {key, result: empty, status: key ? "loading" as const : "ready" as const};
}
