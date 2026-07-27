import type { Template } from '../types';
import { STANDARD_HOLIDAY_TEMPLATE } from './holidayTemplate';
import { STANDARD_WEEKDAY_TEMPLATE } from './weekdayTemplate';

export const defaultTemplates: Template[] = [
  STANDARD_WEEKDAY_TEMPLATE,
  STANDARD_HOLIDAY_TEMPLATE,
];
