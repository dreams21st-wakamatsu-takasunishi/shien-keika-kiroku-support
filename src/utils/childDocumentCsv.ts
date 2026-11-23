import type { ChildProfile } from "../types";
import {
  ADDITIONAL_DOCUMENT_SERVICE_LABELS, DOCUMENT_CATEGORIES, DOCUMENT_TYPES,
  documentDisplayScope, documentSlots, finalPlanProgress, FINAL_PLAN_LABELS,
  type ChildDocumentEntry, type DocumentRegister,
} from "./childDocuments";

const headers = [
  "児童名", "カテゴリ", "書類種別", "書類名", "対象枠", "サービス区分",
  "作成日", "保管確認", "有効期限", "計画開始日", "個支本案の交付・同意", "保護者交付日", "保護者同意日",
];

function quoteCsv(value: string) {
  // CSV quoting handles commas/quotes/newlines, but does not block Excel formulas.
  const safe = /^[\t\r\n]/.test(value) || /^[=+\-@]/.test(value.trimStart().normalize("NFKC"))
    ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function buildChildDocumentCsv(
  children: Pick<ChildProfile, "id" | "name" | "careType" | "visitingSupportEnabled">[],
  register: DocumentRegister,
  asOf: string,
) {
  const byChild = new Map<string, ChildDocumentEntry[]>();
  for (const entry of register.entries) {
    const entries = byChild.get(entry.childId) || [];
    entries.push(entry);
    byChild.set(entry.childId, entries);
  }
  const rows: string[][] = [];
  for (const child of children) {
    const entries = byChild.get(child.id);
    if (!entries?.length) continue;
    // Use the same service classification and current revisions as the UI.
    for (const slot of documentSlots(child.id, { ...register, entries }, asOf, child)) {
      const entry = slot.entry;
      if (!entry) continue;
      const category = DOCUMENT_CATEGORIES.find(item => item.types.some(type => type === entry.type));
      rows.push([
        child.name, category?.title || "", DOCUMENT_TYPES[entry.type], entry.title,
        slot.label === entry.title ? "" : slot.label,
        ADDITIONAL_DOCUMENT_SERVICE_LABELS[documentDisplayScope(child, slot)],
        entry.documentDate, entry.confirmed ? "保管確認済み" : "未確認",
        entry.validUntil, entry.planStartDate || "",
        entry.type === "plan_final" ? FINAL_PLAN_LABELS[finalPlanProgress(entry)] : "",
        entry.guardianDeliveryDate, entry.consentDate,
      ]);
    }
  }
  return {
    count: rows.length,
    csv: "\uFEFF" + [headers, ...rows].map(row => row.map(quoteCsv).join(",")).join("\r\n") + "\r\n",
  };
}

export function downloadChildDocumentCsv(csv: string, asOf: string, singleChild: boolean) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `保管書類一覧_${singleChild ? "選択児童" : "全児童"}_${asOf}.csv`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
