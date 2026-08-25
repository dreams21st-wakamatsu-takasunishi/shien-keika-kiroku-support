import type { SchoolHolidayPeriod } from '../types';

export function localDateKey(date = new Date()): string {
  return date.toLocaleDateString('sv-SE');
}

/**
 * Keep current and future periods. A period remains effective through its end
 * date and is removed from operational views from the following day.
 */
export function currentSchoolHolidayPeriods(
  periods: SchoolHolidayPeriod[] | undefined,
  today = localDateKey(),
): SchoolHolidayPeriod[] {
  return (periods || []).filter((period) => !period.endDate || period.endDate >= today);
}

