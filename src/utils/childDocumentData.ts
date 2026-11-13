import {
  DOCUMENT_TYPES,
  validDocumentDate,
  type ChildDocumentSettings,
  type ChildDocumentEntry,
  type VisitingReviewException,
} from "./childDocuments";
import { validBenefitEntitlements } from "./childServiceEntitlements";
function text(value: unknown) {
  return typeof value === "string" ? value : "";
}
function validMonths(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(m => Number.isInteger(m) && m >= 1 && m <= 12)
    && new Set(value).size === value.length;
}
export function parseVisitingReviewException(row: any): VisitingReviewException {
  if (!row || !Number.isSafeInteger(Number(row.revision)) || Number(row.revision) < 1
    || !validDocumentDate(row.starts_on) || !validDocumentDate(row.ends_on) || row.starts_on > row.ends_on
    || typeof row.reason !== "string" || !row.reason.trim() || typeof row.enabled !== "boolean")
    throw Error("訪問支援の例外設定を確認できません。");
  return {revision: Number(row.revision), from: row.starts_on, through: row.ends_on, reason: row.reason, enabled: row.enabled};
}
export function parseDocumentSettings(row: any): ChildDocumentSettings {
  if (
    !row ||
    typeof row.child_id !== "string" ||
    !Number.isSafeInteger(Number(row.revision)) ||
    Number(row.revision) < 1 ||
    !validDocumentDate(row.contract_date) ||
    !validDocumentDate(row.effective_from) ||
    (row.visiting_contract_date != null && !validDocumentDate(row.visiting_contract_date)) ||
    !validMonths(row.monitoring_months)
  )
    throw Error("書類管理の設定を確認できません。");
  return {
    childId: row.child_id,
    revision: Number(row.revision),
    contractDate: row.contract_date,
    ...(row.visiting_contract_date ? {visitingContractDate: row.visiting_contract_date} : {}),
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
    (row.monitoring_months != null && (row.document_type !== "benefit" || !validMonths(row.monitoring_months))) ||
    (row.entitlements != null && (row.document_type !== "benefit" || !validBenefitEntitlements(row.entitlements))) ||
    (row.plan_start_date != null && (row.document_type !== "plan_final" || !validDocumentDate(row.plan_start_date))) ||
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
    ...(row.plan_start_date != null ? {planStartDate: row.plan_start_date} : {}),
    ...(row.monitoring_months != null ? {monitoringMonths: [...row.monitoring_months].sort((a, b) => a - b)} : {}),
    ...(row.entitlements != null ? {entitlements: row.entitlements} : {}),
    consentDate: text(row.consent_date),
    guardianDeliveryDate: text(row.guardian_delivery_date),
    consultationDeliveryDate: text(row.consultation_delivery_date),
    operation: row.operation,
    replacesId: row.replaces_id || null,
    createdAt: text(row.created_at),
    createdByName: text(row.created_by_name),
  };
}
