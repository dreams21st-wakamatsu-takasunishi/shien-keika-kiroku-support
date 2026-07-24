import type { ChildProfile, Weekday } from '../types';

export const WEEKDAYS: Weekday[] = ['月', '火', '水', '木', '金', '土', '日'];
const JS_DAY_TO_WEEKDAY: Weekday[] = ['日', '月', '火', '水', '木', '金', '土'];

export function getWeekdayFromDate(date: string): Weekday {
  const parsed = new Date(`${date}T00:00:00`);
  return JS_DAY_TO_WEEKDAY[parsed.getDay()] || '月';
}

export function formatRegularDays(days?: Weekday[]) {
  return days?.length ? days.join('・') : '曜日未設定';
}

export function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getRegularDaysForDate(child: ChildProfile, targetDate: string): Weekday[] {
  const baseEffectiveFrom = child.regularDaysEffectiveFrom || '0001-01-01';
  const candidates = [
    {
      effectiveFrom: baseEffectiveFrom,
      regularDays: child.regularDays || [],
      priority: 1,
    },
    ...(child.regularDaySchedules || []).map((schedule) => ({
      effectiveFrom: schedule.effectiveFrom,
      regularDays: schedule.regularDays,
      priority: 0,
    })),
  ]
    .filter((candidate) => candidate.effectiveFrom <= targetDate)
    .sort((left, right) =>
      right.effectiveFrom.localeCompare(left.effectiveFrom) || right.priority - left.priority
    );

  return candidates[0]?.regularDays || [];
}

export function formatJapaneseDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return `${year}年${month}月${day}日`;
}
