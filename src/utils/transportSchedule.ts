import type { ChildProfile, ChildTransportSchedule, TransportDirection, Weekday } from '../types';
import { getWeekdayFromDate } from './weekdays';

export function getTransportScheduleForDate(child: ChildProfile, date: string): ChildTransportSchedule | undefined {
  const weekday = getWeekdayFromDate(date);
  return child.transportSchedule?.find((schedule) => schedule.weekday === weekday);
}

export function getTransportTargetTime(child: ChildProfile, date: string, direction: TransportDirection) {
  const schedule = getTransportScheduleForDate(child, date);
  if (!schedule) return '';
  return direction === '迎え'
    ? schedule.pickupTime || schedule.schoolEndTime || ''
    : schedule.dropoffTime || '';
}

export function updateTransportSchedule(
  schedules: ChildTransportSchedule[],
  weekday: Weekday,
  patch: Partial<Omit<ChildTransportSchedule, 'weekday'>>,
) {
  const current = schedules.find((schedule) => schedule.weekday === weekday) || { weekday };
  const next = { ...current, ...patch };
  return [...schedules.filter((schedule) => schedule.weekday !== weekday), next]
    .filter((schedule) => schedule.schoolEndTime || schedule.pickupTime || schedule.dropoffTime);
}
