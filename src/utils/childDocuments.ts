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
  benefitRenewal?: { previousValidUntil: string; availableFrom: string };
  usagePlanRenewal?: { previousValidUntil: string; availableFrom: string };
}
export const FINAL_PLAN_LABELS = {not_created:'未作成',pending:'未交付・未同意',completed:'交付・同意済み'} as const;
export type FinalPlanProgress = keyof typeof FINAL_PLAN_LABELS;
export function finalPlanProgress(entry?:ChildDocumentEntry):FinalPlanProgress {
  if(!entry||!validDocumentDate(entry.documentDate))return 'not_created';
  return validDocumentDate(entry.consentDate)&&validDocumentDate(entry.guardianDeliveryDate)?'completed':'pending';
}
export function isDocumentPending(slot:DocumentSlot){
  return slot.status!=='complete'||(slot.type==='plan_final'&&finalPlanProgress(slot.entry)!=='completed');
}
export const DOCUMENT_CATEGORIES = [
  {
    id: "contracts",
    title: "契約・同意書",
    description: "利用開始時の契約書と各種同意書",
    types: ["contract", "important", "portrait", "privacy"],
  },
  {
    id: "assessment",
    title: "基本情報・アセスメント",
    description: "児童の基本情報とアセスメントの更新",
    types: ["face", "assessment"],
  },
  {
    id: "benefits",
    title: "受給者証・利用計画",
    description: "受給者証、利用計画と別表の更新",
    types: ["benefit", "usage_plan", "annex"],
  },
  {
    id: "support",
    title: "個別支援計画・モニタリング",
    description: "原案・会議・本案とモニタリング",
    types: ["plan_draft", "plan_meeting", "plan_final", "monitoring"],
  },
  {
    id: "other",
    title: "証明書・その他",
    description: "名称で登録した証明書と追加書類",
    types: ["certificate", "additional"],
  },
] as const satisfies ReadonlyArray<{
  id: string;
  title: string;
  description: string;
  types: ReadonlyArray<DocumentType>;
}>;
export type DocumentCategoryId = (typeof DOCUMENT_CATEGORIES)[number]["id"];
export function groupDocumentSlots(slots: DocumentSlot[]) {
  return DOCUMENT_CATEGORIES.map((category) => ({
    ...category,
    groups: category.types.map((type) => {
      const rows = slots.filter((slot) => slot.type === type);
      return {
        type,
        slots: rows,
        registered: rows.filter((slot) => slot.entry).length,
        confirmed: rows.filter((slot) => slot.status === "complete").length,
        required: rows.filter((slot) => slot.required).length,
        pending: rows.filter(isDocumentPending).length,
        latestDate:
          rows
            .map((slot) => slot.entry?.documentDate || "")
            .filter(Boolean)
            .sort()
            .at(-1) || "",
      };
    }),
  }));
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
export const benefitRenewalCycleKey = (validUntil: string) =>
  "extra:benefit-renewal-" + validUntil;
export const usagePlanRenewalCycleKey = (validUntil: string) =>
  "extra:usage-plan-renewal-" + validUntil;
export function latestBenefitEntry(
  childId: string,
  register: DocumentRegister,
  today: string,
) {
  return activeDocumentEntries(register.entries.filter(row => row.childId === childId))
    .filter(row => row.type === "benefit" && row.documentDate <= today)
    .sort((a,b) => b.documentDate.localeCompare(a.documentDate)
      || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
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
  const hasRegisteredExpiry = validDocumentDate(latestBenefitEntry(childId, register, today)?.validUntil || "");
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
      ] as DocumentType[]) {
        // Once a real expiry is known, it supersedes unsaved anniversary
        // placeholders for certificates and usage plans. Saved rows stay below.
        if (year > 0 && ["benefit", "usage_plan"].includes(type) && hasRegisteredExpiry
          && !active.some(row=>row.type===type&&row.cycleKey==="annual:"+due)) continue;
        add(
          type,
          "annual:" + due,
          year ? "年次更新 " + due : "初回 " + start,
          due,
        );
      }
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
  // Renewal windows use an explicit expiry, not the contract anniversary.
  // A stable, already-supported extra key keeps each renewal independent.
  const certificates = active.filter(row => row.type === "benefit"
    && validDocumentDate(row.validUntil) && row.documentDate <= today);
  const latestExpiry = latestBenefitEntry(childId, register, today)?.validUntil;
  for (const certificate of certificates) {
    const cycleKey = benefitRenewalCycleKey(certificate.validUntil);
    const availableFrom = addDocumentMonths(certificate.validUntil, -1);
    const registered = active.some(row => row.type === "benefit" && row.cycleKey === cycleKey);
    // A newer certificate entered elsewhere already fulfils an older renewal.
    // Retain saved renewal rows, but do not manufacture historical missing rows.
    if (!registered && (availableFrom > today || certificate.validUntil !== latestExpiry)) continue;
    add("benefit", cycleKey, "更新分（前回期限 " + certificate.validUntil + "）", certificate.validUntil);
    const slot = slots.find(row => row.type === "benefit" && row.cycleKey === cycleKey)!;
    slot.benefitRenewal = { previousValidUntil: certificate.validUntil, availableFrom };
  }
  // A saved renewal must retain its label even if the source is later voided.
  for (const row of active.filter(row => row.type === "benefit")) {
    const expiry = row.cycleKey.match(/^extra:benefit-renewal-(\d{4}-\d{2}-\d{2})$/)?.[1];
    if (!expiry || !validDocumentDate(expiry)) continue;
    add("benefit", row.cycleKey, "更新分（前回期限 " + expiry + "）", expiry);
    slots.find(slot => slot.type === "benefit" && slot.cycleKey === row.cycleKey)!.benefitRenewal = {
      previousValidUntil: expiry, availableFrom: addDocumentMonths(expiry, -1),
    };
  }
  // Usage-plan renewals are independent of certificate registration: entering
  // the next certificate must not hide a still-unregistered usage plan.
  for (const certificate of certificates) {
    const expiry = certificate.validUntil;
    const availableFrom = addDocumentMonths(expiry, -1);
    const cycleKey = usagePlanRenewalCycleKey(expiry);
    const registered = active.some(row => row.type === "usage_plan" && row.cycleKey === cycleKey);
    if (!registered && availableFrom > today) continue;
    add("usage_plan", cycleKey, "受給者証更新に伴う利用計画（前回期限 " + expiry + "）", expiry);
    slots.find(row => row.type === "usage_plan" && row.cycleKey === cycleKey)!.usagePlanRenewal = {
      previousValidUntil: expiry, availableFrom,
    };
  }
  // Keep saved renewal rows intelligible after a certificate correction/void.
  for (const row of active.filter(row => row.type === "usage_plan")) {
    const expiry = row.cycleKey.match(/^extra:usage-plan-renewal-(\d{4}-\d{2}-\d{2})$/)?.[1];
    if (!expiry || !validDocumentDate(expiry)) continue;
    add("usage_plan", row.cycleKey, "受給者証更新に伴う利用計画（前回期限 " + expiry + "）", expiry);
    slots.find(slot => slot.type === "usage_plan" && slot.cycleKey === row.cycleKey)!.usagePlanRenewal = {
      previousValidUntil: expiry, availableFrom: addDocumentMonths(expiry, -1),
    };
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
