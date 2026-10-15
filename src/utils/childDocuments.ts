import type { UserProfile } from "../types";

export const DOCUMENT_TYPES = {
  face: "フェイスシート",
  assessment: "アセスメントシート",
  benefit: "受給者証のコピー",
  usage_plan: "利用計画",
  annex: "別表",
  plan_draft: "個支原案",
  plan_meeting: "個支会議",
  plan_final: "個支本案",
  monitoring: "モニタリング",
  certificate: "証明書等",
  contract: "利用契約書（冊子1部）",
  important: "重要事項説明書（署名ページ1枚）",
  portrait: "肖像権使用同意書（1枚）",
  privacy: "個人情報使用同意書（1枚）",
  additional: "その他の保管書類",
} as const;
export type DocumentType = keyof typeof DOCUMENT_TYPES;
export interface ChildDocumentSettings {
  childId: string;
  revision: number;
  contractDate: string;
  monitoringMonths: number[];
  effectiveFrom: string;
  createdAt: string;
  createdByName: string;
}
export interface ChildDocumentEntry {
  id: string;
  childId: string;
  type: DocumentType;
  cycleKey: string;
  documentDate: string;
  title: string;
  confirmed: boolean;
  note: string;
  validUntil: string;
  consentDate: string;
  guardianDeliveryDate: string;
  consultationDeliveryDate: string;
  operation: "record" | "void";
  replacesId: string | null;
  createdAt: string;
  createdByName: string;
}
export interface DocumentRegister {
  settings: ChildDocumentSettings[];
  entries: ChildDocumentEntry[];
}
export type DocumentEntryInput = Omit<
  ChildDocumentEntry,
  "childId" | "createdAt" | "createdByName"
>;
export interface DocumentSlot {
  key: string;
  type: DocumentType;
  cycleKey: string;
  label: string;
  dueDate: string;
  required: boolean;
  entry?: ChildDocumentEntry;
  status: "missing" | "unconfirmed" | "complete" | "upcoming";
}
export const canManageChildDocuments = (
  user?: Pick<UserProfile, "role" | "fieldModeOnly"> | null,
) =>
  Boolean(
    user &&
    !user.fieldModeOnly &&
    (user.role === "admin" || user.role === "manager"),
  );
export function validDocumentDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(+d) &&
    d.toISOString().slice(0, 10) === value &&
    value >= "1900-01-01" &&
    value <= "2100-12-31"
  );
}
export function addDocumentMonths(value: string, months: number) {
  if (!validDocumentDate(value)) throw Error("日付を確認してください。");
  const [year, month, day] = value.split("-").map(Number),
    base = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
export const latestDocumentSettings = (
  rows: ChildDocumentSettings[],
  childId: string,
) =>
  rows
    .filter((row) => row.childId === childId)
    .sort((a, b) => b.revision - a.revision)[0];
export function activeDocumentEntries(rows: ChildDocumentEntry[]) {
  const replaced = new Set(rows.map((row) => row.replacesId).filter(Boolean));
  return rows.filter(
    (row) => row.operation === "record" && !replaced.has(row.id),
  );
}
export function documentSlots(
  childId: string,
  register: DocumentRegister,
  today: string,
): DocumentSlot[] {
  if (!validDocumentDate(today)) throw Error("確認日を確認してください。");
  const settings = latestDocumentSettings(register.settings, childId),
    active = activeDocumentEntries(
      register.entries.filter((row) => row.childId === childId),
    );
  const slots: DocumentSlot[] = [],
    seen = new Set<string>();
  const add = (
    type: DocumentType,
    cycleKey: string,
    label: string,
    dueDate: string,
    required = true,
  ) => {
    const key = type + "|" + cycleKey;
    if (seen.has(key)) return;
    seen.add(key);
    const entry = active.find(
      (row) => row.type === type && row.cycleKey === cycleKey,
    );
    const status = entry?.confirmed
      ? "complete"
      : entry
        ? "unconfirmed"
        : dueDate > today
          ? "upcoming"
          : "missing";
    slots.push({
      key,
      type,
      cycleKey,
      label,
      dueDate,
      required,
      entry,
      status,
    });
  };
  if (settings && settings.contractDate <= today) {
    const start = settings.contractDate,
      initial = "initial:" + start;
    for (const type of [
      "face",
      "contract",
      "important",
      "portrait",
      "privacy",
    ] as DocumentType[])
      add(type, initial, "契約時", start);
    for (
      let year = 0;
      year <= Number(today.slice(0, 4)) - Number(start.slice(0, 4));
      year++
    ) {
      const due = addDocumentMonths(start, year * 12);
      if (due > today) continue;
      for (const type of [
        "assessment",
        "benefit",
        "usage_plan",
        "annex",
      ] as DocumentType[])
        add(
          type,
          "annual:" + due,
          year ? "年次更新 " + due : "初回 " + start,
          due,
        );
    }
    for (const type of [
      "plan_draft",
      "plan_meeting",
      "plan_final",
    ] as DocumentType[])
      add(type, initial, "初回計画", start);
    const versions = register.settings
      .filter((row) => row.childId === childId)
      .sort((a, b) => b.revision - a.revision);
    for (let y = Number(start.slice(0, 4)); y <= Number(today.slice(0, 4)); y++)
      for (let m = 1; m <= 12; m++) {
        const period = `${y}-${String(m).padStart(2, "0")}`,
          first = period + "-01",
          last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
        if (period <= start.slice(0, 7) || first > today) continue;
      // A mid-month change takes effect from the next month's first day.
      // The checklist already shown for this month must not disappear.
      const version = versions.find((row) => row.effectiveFrom <= first);
        if (!version?.monitoringMonths.includes(m)) continue;
        for (const type of [
          "plan_draft",
          "plan_meeting",
          "plan_final",
          "monitoring",
        ] as DocumentType[])
          add(type, "plan:" + period, period + " 更新月", last);
      }
  }
  // Ad-hoc plans are linked as a set: every final plan has its own draft and meeting.
  for (const row of active.filter((row) =>
    ["plan_draft", "plan_meeting", "plan_final"].includes(row.type),
  )) {
    for (const type of [
      "plan_draft",
      "plan_meeting",
      "plan_final",
    ] as DocumentType[])
      add(type, row.cycleKey, "追加・旧設定の計画", row.documentDate || today);
  }
  for (const row of active)
    add(
      row.type,
      row.cycleKey,
      row.title || "追加・旧設定の書類",
      row.documentDate || today,
      false,
    );
  return slots.sort(
    (a, b) =>
      a.dueDate.localeCompare(b.dueDate) ||
      a.cycleKey.localeCompare(b.cycleKey) ||
      Object.keys(DOCUMENT_TYPES).indexOf(a.type) -
        Object.keys(DOCUMENT_TYPES).indexOf(b.type),
  );
}
export function documentWarnings(
  childId: string,
  register: DocumentRegister,
  today: string,
  dayService = true,
) {
  const settings = latestDocumentSettings(register.settings, childId),
    active = activeDocumentEntries(
      register.entries.filter((row) => row.childId === childId),
    ),
    warnings: string[] = [];
  if (!settings) return ["契約日が未登録のため、必要書類の計算は未完了です。"];
  if (settings.contractDate > today)
    return ["契約開始前です。必要書類は契約日から表示します。"];
  const currentSchedule = register.settings
    .filter((row) => row.childId === childId && row.effectiveFrom <= today)
    .sort((a, b) => b.revision - a.revision)[0];
  if (!currentSchedule?.monitoringMonths.length)
    warnings.push(
      "受給者証のモニタリング更新月が未登録です。更新月の書類枠は計算できていません。",
    );
  if (dayService) {
    const last =
      active
        .filter(
          (row) =>
            row.type === "monitoring" &&
            row.confirmed &&
            row.documentDate <= today,
        )
        .map((row) => row.documentDate)
        .sort()
        .at(-1) || settings.contractDate;
    if (addDocumentMonths(last, 6) <= today)
      warnings.push(
        "放デイ自身の計画見直し・モニタリングが6か月以上確認できていません。受給者証の更新月とは別に確認してください。",
      );
  }
  const certificate = active
    .filter((row) => row.type === "benefit" && row.confirmed)
    .sort((a, b) => b.documentDate.localeCompare(a.documentDate))[0];
  if (certificate?.validUntil && certificate.validUntil < today)
    warnings.push(
      "最新の受給者証の有効期限を過ぎています。更新・保管状況を確認してください。",
    );
  for (const plan of active.filter(
    (row) => row.type === "plan_final" && row.confirmed,
  )) {
    if (!plan.consentDate || !plan.guardianDeliveryDate)
      warnings.push(
        `${plan.documentDate}の個支本案：保護者の同意・交付日の確認が残っています。`,
      );
  }
  return warnings;
}
export function newDocumentEntry(
  type: DocumentType,
  cycleKey: string,
): DocumentEntryInput {
  return {
    id: crypto.randomUUID(),
    type,
    cycleKey,
    documentDate: "",
    title: "",
    confirmed: false,
    note: "",
    validUntil: "",
    consentDate: "",
    guardianDeliveryDate: "",
    consultationDeliveryDate: "",
    operation: "record",
    replacesId: null,
  };
}
