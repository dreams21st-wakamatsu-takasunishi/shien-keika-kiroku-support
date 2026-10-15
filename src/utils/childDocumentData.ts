import {
  DOCUMENT_TYPES,
  validDocumentDate,
  type ChildDocumentSettings,
  type ChildDocumentEntry,
} from "./childDocuments";
function text(value: unknown) {
  return typeof value === "string" ? value : "";
}
export function parseDocumentSettings(row: any): ChildDocumentSettings {
  if (
    !row ||
    typeof row.child_id !== "string" ||
    !Number.isSafeInteger(Number(row.revision)) ||
    Number(row.revision) < 1 ||
    !validDocumentDate(row.contract_date) ||
    !validDocumentDate(row.effective_from) ||
    !Array.isArray(row.monitoring_months) ||
    row.monitoring_months.some(
      (m: unknown) => !Number.isInteger(m) || Number(m) < 1 || Number(m) > 12,
    ) ||
    new Set(row.monitoring_months).size !== row.monitoring_months.length
  )
    throw Error("書類管理の設定を確認できません。");
  return {
    childId: row.child_id,
    revision: Number(row.revision),
    contractDate: row.contract_date,
    monitoringMonths: row.monitoring_months,
    effectiveFrom: row.effective_from,
    createdAt: text(row.created_at),
    createdByName: text(row.created_by_name),
  };
}
export function parseDocumentEntry(row: any): ChildDocumentEntry {
  if (
    !row ||
    typeof row.id !== "string" ||
    typeof row.child_id !== "string" ||
    !Object.hasOwn(DOCUMENT_TYPES, row.document_type) ||
    typeof row.cycle_key !== "string" ||
    typeof row.confirmed !== "boolean" ||
    !["record", "void"].includes(row.operation) ||
    [
      row.document_date,
      row.valid_until,
      row.consent_date,
      row.guardian_delivery_date,
      row.consultation_delivery_date,
    ].some((d) => d != null && !validDocumentDate(d))
  )
    throw Error("書類の登録履歴を確認できません。");
  return {
    id: row.id,
    childId: row.child_id,
    type: row.document_type,
    cycleKey: row.cycle_key,
    documentDate: text(row.document_date),
    title: text(row.title),
    confirmed: row.confirmed,
    note: text(row.note),
    validUntil: text(row.valid_until),
    consentDate: text(row.consent_date),
    guardianDeliveryDate: text(row.guardian_delivery_date),
    consultationDeliveryDate: text(row.consultation_delivery_date),
    operation: row.operation,
    replacesId: row.replaces_id || null,
    createdAt: text(row.created_at),
    createdByName: text(row.created_by_name),
  };
}
