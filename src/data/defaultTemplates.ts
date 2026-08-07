import type { Template } from '../types';
import { STANDARD_HOLIDAY_TEMPLATE } from './holidayTemplate';
import { UNIFIED_TEMPLATE } from './unifiedTemplate';
import { STANDARD_WEEKDAY_TEMPLATE } from './weekdayTemplate';

export const defaultTemplates: Template[] = [
  STANDARD_WEEKDAY_TEMPLATE,
  STANDARD_HOLIDAY_TEMPLATE,
];

// The unified template is a system-owned persistence target. It stays out of
// the editable template list, but every organization must have its database row
// so support_records.template_id can satisfy the foreign key.
export const requiredRecordTemplates: Template[] = [
  ...defaultTemplates,
  UNIFIED_TEMPLATE,
];
