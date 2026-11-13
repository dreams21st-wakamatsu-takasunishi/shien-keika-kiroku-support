import { supabase } from "../lib/supabase";
import type {
  DocumentRegister,
  DocumentEntryInput,
  VisitingReviewException,
} from "../utils/childDocuments";
import {
  parseDocumentSettings,
  parseDocumentEntry,
  parseVisitingReviewException,
} from "../utils/childDocumentData";
async function rpc(name: string, args?: Record<string, unknown>) {
  if (!supabase) throw Error("書類管理はクラウド接続が必要です。");
  const { data, error } = await supabase.rpc(name, args).abortSignal(AbortSignal.timeout(25000));
  if (error) {
    if (error.code === "PGRST202" || error.code === "42P01")
      throw Error(
        "書類管理のデータベース更新が未反映です。管理者に確認してください。",
      );
    throw Error(error.message || "書類管理を読み書きできませんでした。");
  }
  return data;
}
export async function loadDocumentRegister(): Promise<DocumentRegister> {
  const data = await rpc("get_child_document_register");
  if (!data || !Array.isArray(data.settings) || !Array.isArray(data.entries))
    throw Error(
      "保管状況を取得できません。揃っているかの判定は行っていません。",
    );
  return {
    settings: data.settings.map(parseDocumentSettings),
    entries: data.entries.map(parseDocumentEntry),
    ...(data.visiting_review_exception == null ? {} : {visitingReviewException: parseVisitingReviewException(data.visiting_review_exception)}),
  };
}
export async function saveDocumentSettings(
  childId: string,
  expectedRevision: number,
  contractDate: string,
  monitoringMonths: number[],
  effectiveFrom: string,
  visitingContractDate?: string,
) {
  return parseDocumentSettings(
    await rpc(visitingContractDate === undefined ? "save_child_document_settings" : "save_child_document_settings_v2", {
      p_child_id: childId,
      p_expected_revision: expectedRevision,
      p_contract_date: contractDate,
      p_monitoring_months: [...monitoringMonths].sort((a, b) => a - b),
      p_effective_from: effectiveFrom,
      ...(visitingContractDate === undefined ? {} : {p_visiting_contract_date: visitingContractDate}),
    }),
  );
}
export async function saveDocumentEntry(
  childId: string,
  entry: DocumentEntryInput,
) {
  return parseDocumentEntry(
    await rpc(entry.type === "plan_final" && (entry.planStartDate !== undefined || /^(initial|plan|extra):visit-/.test(entry.cycleKey))
      ? "save_child_document_entry_v4"
      : entry.entitlements !== undefined || entry.type === "visiting_consent" || /^(initial|plan|extra):visit-/.test(entry.cycleKey)
      ? "save_child_document_entry_v3" : entry.monitoringMonths !== undefined ? "save_child_document_entry_v2" : "save_child_document_entry", {
      p_child_id: childId,
      p_entry: entry,
    }),
  );
}
async function saveVisitingReviewException(expectedRevision: number, value: Omit<VisitingReviewException, "revision">) {
  return parseVisitingReviewException(await rpc("save_child_document_visiting_exception", {
    p_expected_revision: expectedRevision,
    p_from: value.from,
    p_through: value.through,
    p_reason: value.reason.trim(),
    p_enabled: value.enabled,
  }));
}
export const childDocumentApi = {
  load: loadDocumentRegister,
  settings: saveDocumentSettings,
  entry: saveDocumentEntry,
  visitingReviewException: saveVisitingReviewException,
};
export type ChildDocumentApi = typeof childDocumentApi;
