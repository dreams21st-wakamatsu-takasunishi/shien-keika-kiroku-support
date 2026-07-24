import type { Weekday } from '../types';

export const WEEKDAYS: Weekday[] = ['月', '火', '水', '木', '金', '土', '日'];
const JS_DAY_TO_WEEKDAY: Weekday[] = ['日', '月', '火', '水', '木', '金', '土'];

export function getWeekdayFromDate(date: string): Weekday {
  const parsed = new Date(`${date}T00:00:00`);
  return JS_DAY_TO_WEEKDAY[parsed.getDay()] || '月';
}

export function formatRegularDays(days?: Weekday[]) {
  return days?.length ? days.join('・') : '曜日未設定';
}
