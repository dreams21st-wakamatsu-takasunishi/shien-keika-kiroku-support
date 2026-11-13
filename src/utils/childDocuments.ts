import type { ChildProfile, UserProfile } from "../types";
import { childCareTypes, VISITING_SERVICE } from "./careServices";
import type { BenefitEntitlements } from "./childServiceEntitlements";

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
  visiting_consent: "保育所等訪問支援にかかる情報連携同意書",
  additional: "その他の保管書類",
} as const;
export type DocumentType = keyof typeof DOCUMENT_TYPES;
export interface ChildDocumentSettings {
  childId: string;
  revision: number;
  contractDate: string;
  visitingContractDate?: string;
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
  /** Date the plan takes effect; never inferred from its creation date. */
  planStartDate?: string;
  /** Undefined for legacy registrations. An empty list means no months were entered on this certificate. */
  monitoringMonths?: number[];
  entitlements?: BenefitEntitlements;
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
  visitingReviewException?: VisitingReviewException;
}
export interface VisitingReviewException {
  revision: number;
  from: string;
  through: string;
  reason: string;
  enabled: boolean;
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
  historicalAnnex?: boolean;
  serviceScope?: "visiting" | "legacy";
  /** The key is shown because an existing record (or its plan set) was retained. */
  unmatchedCycle?: true;
  entry?: ChildDocumentEntry;
  status: "missing" | "unconfirmed" | "complete" | "upcoming";
  benefitRenewal?: { previousValidUntil: string; availableFrom: string };
  usagePlanRenewal?: { previousValidUntil: string; availableFrom: string };
  visitingReview?: { kind: "initial" | "renewal" | "resume"; anchor?: string };
  reviewException?: VisitingReviewException;
}
export const FINAL_PLAN_LABELS = {not_created:'未作成',pending:'未交付・未同意',completed:'交付・同意済み'} as const;
export type FinalPlanProgress = keyof typeof FINAL_PLAN_LABELS;
export function finalPlanProgress(entry?:ChildDocumentEntry):FinalPlanProgress {
  if(!entry||!validDocumentDate(entry.documentDate))return 'not_created';
  return validDocumentDate(entry.consentDate)&&validDocumentDate(entry.guardianDeliveryDate)?'completed':'pending';
}
export function isDocumentPending(slot:DocumentSlot){
  return !slot.historicalAnnex&&!slot.reviewException&&slot.serviceScope!=="legacy"
    &&(!(slot.visitingReview && slot.visitingReview.kind !== "initial" && !slot.entry) || slot.status !== "upcoming")
    &&(slot.status!=='complete'||(slot.type==='plan_final'&&(finalPlanProgress(slot.entry)!=='completed'
      ||(isVisitingDocumentKey(slot.cycleKey)&&!validDocumentDate(slot.entry?.planStartDate || "")))));
}
export const ANNEX_REQUIRED_FROM = "2024-04-01";
const CONTRACT_TYPES = ["contract", "important", "portrait", "privacy"] as const;
const PLAN_TYPES = ["plan_draft", "plan_meeting", "plan_final", "monitoring"] as const;
export const VISITING_DOCUMENT_TYPES: readonly DocumentType[] = [...CONTRACT_TYPES, ...PLAN_TYPES, "visiting_consent"];
export const isVisitingDocumentKey = (key: string) => /^(initial|plan|extra):visit-/.test(key);
export function childDocumentServices(child?: Pick<ChildProfile, "careType" | "visitingSupportEnabled">) {
  const services = child ? childCareTypes(child) : [];
  return { visiting: services.includes(VISITING_SERVICE), visitingOnly: services.length === 1 && services[0] === VISITING_SERVICE };
}
export const DOCUMENT_SERVICE_LABELS = {
  day: "放デイ",
  visiting: "訪問支援",
  shared: "共通",
  development: "児童発達支援",
  unspecified: "サービス区分未確認",
} as const;
export type DocumentDisplayScope = keyof typeof DOCUMENT_SERVICE_LABELS;
const SHARED_DOCUMENT_TYPES: readonly DocumentType[] = ["face", "assessment", "benefit", "usage_plan"];
/** Display only; this neither changes a key nor establishes the actual service of a historical record. */
export function documentDisplayScope(
  child: Pick<ChildProfile, "careType" | "visitingSupportEnabled">,
  slot: Pick<DocumentSlot, "type" | "cycleKey" | "unmatchedCycle">,
): DocumentDisplayScope {
  if (slot.type === "visiting_consent" || isVisitingDocumentKey(slot.cycleKey)) return "visiting";
  const primary = child.careType;
  if (!primary || slot.type === "certificate" || slot.type === "additional") return "unspecified";
  if (SHARED_DOCUMENT_TYPES.includes(slot.type)) {
    if (primary === VISITING_SERVICE) return "visiting";
    if (child.visitingSupportEnabled) return "shared";
  } else if (slot.type === "annex") {
    // Visiting support has no annex slot. Do not reclassify an old annex as visiting.
    if (primary === VISITING_SERVICE) return "unspecified";
  } else if (slot.unmatchedCycle || primary === VISITING_SERVICE) {
    return "unspecified";
  }
  return primary === "放課後等デイサービス" ? "day" : "development";
}
export const DOCUMENT_CATEGORIES = [
  {
    id: "contracts",
    title: "契約・同意書",
    description: "利用開始時の契約書と各種同意書",
    types: ["contract", "important", "portrait", "privacy", "visiting_consent"],
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
function monthEnd(date: string) {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}
function followingDay(date: string) {
  return new Date(Date.parse(date + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
}
export const visitingRenewalKey = (due: string) => "plan:visit-renewal-" + due;

/** Generated slots only. Existing entries remain under their original cycle key. */
function visitingPlanReviews(since: string, active: ChildDocumentEntry[], today: string, exception?: VisitingReviewException) {
  const initialKey = "initial:visit-" + since;
  const contract = active.find(row => row.type === "contract" && row.cycleKey === initialKey);
  const contractDate = contract && validDocumentDate(contract.documentDate) && contract.documentDate <= today
    ? contract.documentDate : since;
  const reviews: Array<{key: string; due: string; kind: NonNullable<DocumentSlot["visitingReview"]>["kind"]; anchor?: string; exception?: VisitingReviewException}> = [
    {key: initialKey, due: monthEnd(contractDate), kind: "initial"},
  ];
  const plans = active.filter(row => row.type === "plan_final" && isVisitingDocumentKey(row.cycleKey)
    && validDocumentDate(row.planStartDate || "") && row.planStartDate! >= contractDate && row.documentDate <= today)
    .sort((a, b) => a.planStartDate!.localeCompare(b.planStartDate!) || a.cycleKey.localeCompare(b.cycleKey));
  for (const [index, plan] of plans.entries()) {
    const anchor = plan.planStartDate!;
    if (anchor > today || plans[index + 1]?.planStartDate === anchor) continue;
    const due = addDocumentMonths(anchor, 6);
    if (!validDocumentDate(due)) continue;
    const next = plans[index + 1];
    const key = visitingRenewalKey(due);
    const excluded = exception?.enabled && exception.from <= due && due <= exception.through ? exception : undefined;
    if (next && next.cycleKey !== initialKey && (!excluded || next.planStartDate! <= due)) {
      reviews.push({key: next.cycleKey, due, kind: "renewal", anchor});
      continue;
    }
    if (addDocumentMonths(due, -1) <= today || active.some(row => row.cycleKey === key)) {
      reviews.push({key, due, kind: "renewal", anchor, exception: excluded});
    }
    // When there is no newer plan by the end of the exception, resume review
    // immediately afterwards without inventing a start date or rewriting a saved cycle.
    if (excluded && (!next || next.planStartDate! > excluded.through)) {
      const resume = followingDay(excluded.through);
      if (validDocumentDate(resume) && resume <= today) {
        reviews.push({key: next?.cycleKey ?? visitingRenewalKey(resume), due: resume, kind: "resume", anchor});
      }
    }
  }
  return reviews;
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
export function suggestedMonitoringMonths(birthDate: string, today: string) {
  if (!validDocumentDate(birthDate) || birthDate > today) return [];
  const month = Number(birthDate.slice(5, 7));
  return [month, (month + 5) % 12 + 1].sort((a, b) => a - b);
}
/** Resolve each month from the certificate in force for it, not from the latest entry globally. */
export function documentMonitoringSchedule(childId: string, register: DocumentRegister, today: string) {
  const versions = register.settings.filter(row => row.childId === childId).sort((a, b) => b.revision - a.revision);
  const certificates = activeDocumentEntries(register.entries.filter(row => row.childId === childId))
    .filter(row => row.type === "benefit" && validDocumentDate(row.documentDate) && row.documentDate <= today)
    .map(entry => {
      const previousExpiry = entry.cycleKey.match(/^extra:benefit-renewal-(\d{4}-\d{2}-\d{2})$/)?.[1];
      const start = previousExpiry && validDocumentDate(previousExpiry) && previousExpiry >= entry.documentDate
        ? new Date(Date.parse(previousExpiry + "T00:00:00Z") + 86400000).toISOString().slice(0, 10)
        : entry.documentDate;
      return {entry, start};
    }).sort((a, b) => b.start.localeCompare(a.start) || b.entry.documentDate.localeCompare(a.entry.documentDate)
      || b.entry.createdAt.localeCompare(a.entry.createdAt) || b.entry.id.localeCompare(a.entry.id));
  return (first: string) => {
    const [year, month] = first.split("-").map(Number);
    const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const through = first <= today && today < last ? today : last;
    const applicable = certificates.filter(row => row.start <= through);
    const certificate = applicable[0]?.entry;
    const certificateBased = applicable.some(row => row.entry.monitoringMonths !== undefined);
    if (certificateBased) {
      const expired = Boolean(certificate?.validUntil && certificate.validUntil < first);
      return {months: expired ? [] : certificate?.monitoringMonths ?? [], certificate, expired, source: "certificate" as const};
    }
    return {months: versions.find(row => row.effectiveFrom <= first)?.monitoringMonths ?? [],
      certificate, expired: false, source: "legacy" as const};
  };
}
export function documentSlots(
  childId: string,
  register: DocumentRegister,
  today: string,
  child?: Pick<ChildProfile, "careType" | "visitingSupportEnabled">,
): DocumentSlot[] {
  if (!validDocumentDate(today)) throw Error("確認日を確認してください。");
  const settings = latestDocumentSettings(register.settings, childId),
    active = activeDocumentEntries(
      register.entries.filter((row) => row.childId === childId),
    );
  const slots: DocumentSlot[] = [],
    seen = new Set<string>();
  const { visiting, visitingOnly } = childDocumentServices(child);
  const hasRegisteredExpiry = validDocumentDate(latestBenefitEntry(childId, register, today)?.validUntil || "");
  const add = (
    type: DocumentType,
    cycleKey: string,
    label: string,
    dueDate: string,
    required = true,
    historicalAnnex = false,
    serviceScope?: DocumentSlot["serviceScope"],
    unmatchedCycle?: true,
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
      ...(historicalAnnex ? {historicalAnnex} : {}),
      ...(serviceScope ? {serviceScope} : {}),
      ...(unmatchedCycle ? {unmatchedCycle} : {}),
      entry,
      status,
    });
  };
  if (settings && settings.contractDate <= today) {
    const start = settings.contractDate,
      initial = "initial:" + start;
    add("face", initial, "契約時", start);
    if (!visitingOnly) for (const type of CONTRACT_TYPES) add(type, initial, "契約時", start);
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
        if (type === "annex" && (visitingOnly || due < ANNEX_REQUIRED_FROM)) continue;
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
    const schedule = documentMonitoringSchedule(childId, register, today);
    const addPlans = (since: string) => {
      for (const type of PLAN_TYPES.slice(0,3))
        add(type, "initial:" + since, "初回計画", since);
      for (let y = Number(since.slice(0, 4)); y <= Number(today.slice(0, 4)); y++)
      for (let m = 1; m <= 12; m++) {
        const period = `${y}-${String(m).padStart(2, "0")}`,
          first = period + "-01",
          last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
        if (period <= since.slice(0, 7) || first > today) continue;
        const monitoring = schedule(first);
        if (!monitoring.months.includes(m)) continue;
        for (const type of PLAN_TYPES)
          add(type, "plan:" + period, period + " 更新月", last);
      }
    };
    if (!visitingOnly) addPlans(start);
    const visitingStart = visitingOnly ? start : settings.visitingContractDate;
    if (visiting && visitingStart && visitingStart <= today) {
      for (const type of [...CONTRACT_TYPES, "visiting_consent"] as const)
        add(type, "initial:visit-" + visitingStart, "訪問支援／契約時", visitingStart, true, false, "visiting");
      for (const review of visitingPlanReviews(visitingStart, active, today, register.visitingReviewException)) {
        const label = review.kind === "initial" ? review.due.slice(0, 7) + " 初回計画"
          : review.kind === "resume" ? "例外期間終了後の更新確認" : "開始日から6か月の更新";
        for (const type of review.kind === "initial" ? PLAN_TYPES.slice(0,3) : PLAN_TYPES) {
          const key = type + "|" + review.key;
          if (seen.has(key)) continue;
          add(type, review.key, "訪問支援／" + label, review.due, true, false, "visiting");
          const slot = slots.at(-1)!;
          slot.visitingReview = {kind: review.kind, anchor: review.anchor};
          // Only absent documents are exempt. Existing documents still show their actual status.
          if (!slot.entry && review.exception) {
            slot.reviewException = review.exception;
            slot.required = false;
          }
        }
      }
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
    const visit = isVisitingDocumentKey(row.cycleKey);
    if ((visitingOnly && !visit) || (visit && !row.cycleKey.startsWith("extra:"))) continue;
    for (const type of [
      "plan_draft",
      "plan_meeting",
      "plan_final",
    ] as DocumentType[])
      add(type, row.cycleKey, (visit ? "訪問支援／" : "") + "追加・旧設定の計画", row.documentDate || today, true, false, visit ? "visiting" : undefined, true);
  }
  for (const row of active) {
    const historicalAnnex = row.type === "annex"
      && (visitingOnly || (row.cycleKey.match(/^annual:(\d{4}-\d{2}-\d{2})$/)?.[1] || row.documentDate || today) < ANNEX_REQUIRED_FROM);
    const visit = isVisitingDocumentKey(row.cycleKey);
    const legacy = visitingOnly && !visit && VISITING_DOCUMENT_TYPES.includes(row.type);
    add(
      row.type,
      row.cycleKey,
      row.title || (visit ? "訪問支援／" : legacy ? "サービス区分未設定／" : "") + "追加・旧設定の書類",
      row.documentDate || today,
      false,
      historicalAnnex,
      visit ? "visiting" : legacy ? "legacy" : undefined,
      true,
    );
  }
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
