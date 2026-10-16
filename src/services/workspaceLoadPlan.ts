import type { WorkspaceData } from './dataService';

// Query order matches loadWorkspaceData. Unknown notifications conservatively
// request a full refresh; no data is cached across users or device permissions.
export const WORKSPACE_TABLES = [
  'children', 'schools', 'child_regular_day_schedules', 'recorder_profiles',
  'record_templates', 'support_records', 'handover_items', 'handover_confirmations',
  'morning_meeting_records', 'morning_meeting_templates', 'morning_meeting_confirmations',
  'support_plans', 'organization_ai_settings', 'announcements', 'announcement_confirmations',
  'staff_schedule_items', 'calendar_events', 'daily_child_plans', 'attendance_records',
  'staff_shift_templates', 'staff_shift_requests', 'organization_role_permissions',
  'attendance_correction_requests', 'vehicles', 'transport_runs', 'transport_plan_days',
  'daily_transport_requirements', 'transport_route_settings', 'transport_map_locations',
  'transport_area_zones',
] as const;
const fields: (keyof WorkspaceData)[] = [
  'children', 'schools', 'children', 'recorderProfiles', 'templates', 'records',
  'handoverItems', 'handoverConfirmations', 'morningMeetingRecords', 'morningMeetingTemplates',
  'morningMeetingConfirmations', 'supportPlans', 'aiWritingSettings', 'announcements',
  'announcementConfirmations', 'staffScheduleItems', 'calendarEvents', 'dailyChildPlans',
  'attendanceRecords', 'staffShiftTemplates', 'staffShiftRequests', 'rolePermissions',
  'attendanceCorrectionRequests', 'vehicles', 'transportRuns', 'transportPlanDays',
  'dailyTransportRequirements', 'transportRouteSettings', 'transportMapLocations', 'transportAreaZones',
];
const recorderDependents = ['handover_items', 'staff_schedule_items', 'attendance_records',
  'staff_shift_requests', 'attendance_correction_requests', 'transport_runs'];

export function workspaceLoadPlan(changed?: readonly string[]) {
  const requested = changed?.map(table => ['transport_stop_events', 'transport_run_covers'].includes(table) ? 'transport_runs' : table);
  const full = !requested || requested.some(table => !(WORKSPACE_TABLES as readonly string[]).includes(table));
  const changedTables = new Set<string>(full ? WORKSPACE_TABLES : requested);
  if (changedTables.has('recorder_profiles')) recorderDependents.forEach(table => changedTables.add(table));
  if (changedTables.has('schools')) changedTables.add('children');
  if (changedTables.has('vehicles')) changedTables.add('transport_runs');
  const outputs = new Set<keyof WorkspaceData>();
  WORKSPACE_TABLES.forEach((table, index) => { if (changedTables.has(table)) outputs.add(fields[index]); });
  const queries = new Set(changedTables);
  // Resolve display-name / school / vehicle dependencies without publishing
  // placeholder values for unrelated state.
  if (outputs.has('children')) ['children', 'schools', 'child_regular_day_schedules'].forEach(table => queries.add(table));
  if (recorderDependents.some(table => queries.has(table))) queries.add('recorder_profiles');
  if (queries.has('transport_runs')) queries.add('vehicles');
  return { full, queries, outputs };
}

export async function runWorkspaceQueries<T>(changed: readonly string[] | undefined, queries: (() => PromiseLike<T>)[], empty: T): Promise<T[]> {
  const plan = workspaceLoadPlan(changed);
  if (queries.length !== WORKSPACE_TABLES.length) throw new Error('Workspace query plan mismatch');
  return Promise.all(queries.map((query, index) => plan.queries.has(WORKSPACE_TABLES[index]) ? query() : empty));
}

export function selectWorkspacePatch(workspace: WorkspaceData, changed?: readonly string[]): Partial<WorkspaceData> {
  const outputs = workspaceLoadPlan(changed).outputs;
  return Object.fromEntries(Object.entries(workspace).filter(([key]) => outputs.has(key as keyof WorkspaceData)));
}
