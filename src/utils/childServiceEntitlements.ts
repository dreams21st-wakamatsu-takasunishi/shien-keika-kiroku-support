import type { ChildProfile, DailyChildPlan, DailyTransportRequirement } from "../types";
import { VISITING_SERVICE } from "./careServices";

export const INDIVIDUAL_SUPPORT_TYPES = ["I", "II", "III"] as const;
export type IndividualSupportType = typeof INDIVIDUAL_SUPPORT_TYPES[number];
export const INDIVIDUAL_SUPPORT_LABELS = { I: "Ⅰ", II: "Ⅱ", III: "Ⅲ" } as const;

export interface BenefitEntitlements {
  dayServiceDays: number | null;
  visitingEnabled: boolean;
  visitingDays: number | null;
  individualSupportEnabled: boolean;
  individualSupportTypes: IndividualSupportType[];
}
export const emptyBenefitEntitlements = (): BenefitEntitlements => ({
  dayServiceDays: null, visitingEnabled: false, visitingDays: null,
  individualSupportEnabled: false, individualSupportTypes: [],
});
export function validMonthlyDays(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 31);
}
export function validIndividualSupportTypes(value: unknown): value is IndividualSupportType[] {
  return Array.isArray(value) && value.every(type => INDIVIDUAL_SUPPORT_TYPES.includes(type))
    && value.length === new Set(value).size;
}
export function validBenefitEntitlements(value: unknown): value is BenefitEntitlements {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<BenefitEntitlements>;
  return Object.keys(v).length === 5 && validMonthlyDays(v.dayServiceDays) && validMonthlyDays(v.visitingDays)
    && typeof v.visitingEnabled === "boolean" && (v.visitingEnabled || v.visitingDays === null)
    && typeof v.individualSupportEnabled === "boolean" && validIndividualSupportTypes(v.individualSupportTypes)
    && v.individualSupportEnabled === (v.individualSupportTypes.length > 0);
}
export interface ChildServiceEntitlement {
  childId: string;
  dayServiceDays?: number | null;
  visitingDays?: number | null;
  individualSupportTypes?: IndividualSupportType[];
}
export interface ChildVisitingPlan { childId: string; date: string }

export function monthlyServiceUsage(
  month: string,
  children: ChildProfile[],
  plans: DailyChildPlan[],
  requirements: DailyTransportRequirement[],
  visitingPlans: ChildVisitingPlan[],
) {
  const active = new Map(children.filter(child => !child.serviceSuspended).map(child => [child.id, child]));
  const attendance = new Map(plans.filter(row => row.date.slice(0, 7) === month).map(row => [row.childId + ":" + row.date, row.attendancePlan]));
  const day = new Map<string, Set<string>>(), visiting = new Map<string, Set<string>>();
  const add = (to: Map<string, Set<string>>, childId: string, date: string) => {
    if (!to.has(childId)) to.set(childId, new Set());
    to.get(childId)!.add(date);
  };
  for (const row of [...plans, ...requirements]) {
    const child = active.get(row.childId);
    if (child && child.careType !== VISITING_SERVICE && row.date.slice(0, 7) === month
      && attendance.get(row.childId + ":" + row.date) !== "欠席") add(day, row.childId, row.date);
  }
  for (const row of visitingPlans) {
    const child = active.get(row.childId);
    if (child && (child.careType === VISITING_SERVICE || child.visitingSupportEnabled)
      && row.date.slice(0, 7) === month) add(visiting, row.childId, row.date);
  }
  return { day, visiting };
}
