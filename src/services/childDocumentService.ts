import { supabase } from "../lib/supabase";
import type {
  DocumentRegister,
  DocumentEntryInput,
} from "../utils/childDocuments";
import {
  parseDocumentSettings,
  parseDocumentEntry,
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
  };
}
export async function saveDocumentSettings(
  childId: string,
  expectedRevision: number,
  contractDate: string,
  monitoringMonths: number[],
  effectiveFrom: string,
) {
  return parseDocumentSettings(
    await rpc("save_child_document_settings", {
      p_child_id: childId,
      p_expected_revision: expectedRevision,
      p_contract_date: contractDate,
      p_monitoring_months: [...monitoringMonths].sort((a, b) => a - b),
      p_effective_from: effectiveFrom,
    }),
  );
}
export async function saveDocumentEntry(
  childId: string,
  entry: DocumentEntryInput,
) {
  return parseDocumentEntry(
    await rpc("save_child_document_entry", {
      p_child_id: childId,
      p_entry: entry,
    }),
  );
}
export const childDocumentApi = {
  load: loadDocumentRegister,
  settings: saveDocumentSettings,
  entry: saveDocumentEntry,
};
export type ChildDocumentApi = typeof childDocumentApi;
