import { supabase } from '../lib/supabase';
import {
  AiWritingSettings,
  Announcement,
  AnnouncementConfirmation,
  AttendanceCorrectionRequest,
  AttendanceQrChallenge,
  AttendanceRecord,
  CalendarEvent,
  ChildProfile,
  DailyChildPlan,
  DailyTransportRequirement,
  DEFAULT_AI_WRITING_SETTINGS,
  ExpressionType,
  HandoverConfirmation,
  HandoverItem,
  MorningMeetingConfirmation,
  MorningMeetingRecord,
  MorningMeetingTemplate,
  MonthlyScheduleDeleteResult,
  RecordDraftSummary,
  RecordRevision,
  RecorderMenuItemId,
  RecorderMenuPreferences,
  RecorderProfile,
  ReviewIssue,
  SchoolProfile,
  RegularDaySchedule,
  SnackType,
  StaffScheduleItem,
  StaffShiftTemplate,
  SupportPlan,
  SupportRecord,
  Template,
  TransportRun,
  TransportAssignmentChangeInput,
  TransportFieldAction,
  TransportFieldDashboard,
  TransportFieldRun,
  TransportRouteOptimizationRequest,
  TransportRouteOptimizationResult,
  TransportRouteSettings,
  TransportTimeChangeHistory,
  TransportMatrixRequest,
  TransportMatrixResult,
  TransportMapLocation,
  TransportAreaZone,
  TransportGeocodeRequestLocation,
  TransportGeocodeResult,
  TransportPlanDay,
  Vehicle,
  Weekday,
} from '../types';
import { normalizeTemplateFatigueScale } from '../utils/templateNormalizer';
import { upgradeStandardWeekdayTemplate } from '../data/weekdayTemplate';
import { upgradeStandardHolidayTemplate } from '../data/holidayTemplate';
import { calculateSchoolGrade } from '../utils/schoolGrade';
import { getLocalDateString } from '../utils/weekdays';
import { getAccessDeviceLabel, getAccessDevicePlatform, getAccessDeviceToken } from '../utils/accessDevice';
import { resolvedTransportArea } from '../utils/transportArea';

export interface WorkspaceData {
  children: ChildProfile[];
  schools: SchoolProfile[];
  recorderProfiles: RecorderProfile[];
  templates: Template[];
  records: SupportRecord[];
  handoverItems: HandoverItem[];
  handoverConfirmations: HandoverConfirmation[];
  morningMeetingRecords: MorningMeetingRecord[];
  morningMeetingTemplates: MorningMeetingTemplate[];
  morningMeetingConfirmations: MorningMeetingConfirmation[];
  supportPlans: SupportPlan[];
  aiWritingSettings: AiWritingSettings;
  announcements: Announcement[];
  announcementConfirmations: AnnouncementConfirmation[];
  staffScheduleItems: StaffScheduleItem[];
  calendarEvents: CalendarEvent[];
  dailyChildPlans: DailyChildPlan[];
  attendanceRecords: AttendanceRecord[];
  staffShiftTemplates: StaffShiftTemplate[];
  attendanceCorrectionRequests: AttendanceCorrectionRequest[];
  vehicles: Vehicle[];
  transportRuns: TransportRun[];
  transportPlanDays: TransportPlanDay[];
  dailyTransportRequirements: DailyTransportRequirement[];
  transportRouteSettings: TransportRouteSettings;
  transportMapLocations: TransportMapLocation[];
  transportAreaZones: TransportAreaZone[];
}

function assertSupabase() {
  if (!supabase) throw new Error('Supabaseが設定されていません。');
  return supabase;
}

async function loadSupportRecordsWithRetry(organizationId: string) {
  const client = assertSupabase();
  const retryDelays = [350, 900];

  for (let attempt = 0; ; attempt += 1) {
    const result = await client
      .from('support_records')
      .select('*')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .order('record_date', { ascending: false });

    const isTransientServerError = result.status >= 500 && result.status < 600;
    if (!result.error || !isTransientServerError || attempt >= retryDelays.length) return result;

    await new Promise((resolve) => window.setTimeout(resolve, retryDelays[attempt]));
  }
}

function mapChild(row: any): ChildProfile {
  return {
    id: row.id,
    name: row.name,
    kana: row.kana || undefined,
    birthDate: row.birth_date || undefined,
    grade: calculateSchoolGrade(row.birth_date) || row.grade || undefined,
    regularDays: Array.isArray(row.regular_days) ? row.regular_days as Weekday[] : [],
    regularDaysEffectiveFrom: row.regular_days_effective_from || undefined,
    careType: row.care_type || undefined,
    serviceSuspended: row.service_suspended === true,
    transportProgram: row.transport_program || undefined,
    transportationRequired: row.transportation_required === true,
    schoolName: row.school_name || undefined,
    schoolId: row.school_id || undefined,
    siblingIds: Array.isArray(row.sibling_ids) ? row.sibling_ids : undefined,
    siblingGroup: row.sibling_group || undefined,
    transportSchedule: Array.isArray(row.transport_schedule) ? row.transport_schedule : [],
    pickupLocation: row.pickup_location || undefined,
    dropoffLocation: row.dropoff_location || undefined,
    pickupArea: resolvedTransportArea(row.pickup_location, row.pickup_area),
    dropoffArea: resolvedTransportArea(row.dropoff_location, row.dropoff_area),
    transportLocations: Array.isArray(row.transport_locations)
      ? row.transport_locations.map((location: any) => ({
          ...location,
          area: resolvedTransportArea(location.address, location.area),
        }))
      : [],
    transportPermanentNote: row.transport_permanent_note || undefined,
    notes: row.notes || undefined,
  };
}

function mapRegularDaySchedule(row: any): RegularDaySchedule {
  return {
    id: row.id,
    effectiveFrom: row.effective_from,
    regularDays: Array.isArray(row.regular_days) ? row.regular_days as Weekday[] : [],
    createdAt: row.created_at || undefined,
  };
}

function mapTransportMapLocation(row: any): TransportMapLocation {
  return {
    id: row.id,
    sourceType: row.source_type,
    childId: row.child_id || undefined,
    schoolId: row.school_id || undefined,
    locationProfileId: row.location_profile_id || undefined,
    locationName: row.location_name,
    locationType: row.location_type,
    address: row.address,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    geocodeSource: row.geocode_source,
    googlePlaceId: row.google_place_id || undefined,
    geocodedAt: row.geocoded_at,
    updatedAt: row.updated_at,
  };
}

function mapTransportAreaZone(row: any): TransportAreaZone {
  const locationPriorities = row.location_priorities && typeof row.location_priorities === 'object' && !Array.isArray(row.location_priorities)
    ? Object.entries(row.location_priorities).reduce<Record<string, number>>((result, [locationId, rawPriority]) => {
      const priority = Number(rawPriority);
      if (Number.isFinite(priority) && priority > 0) result[locationId] = priority;
      return result;
    }, {})
    : {};
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    centerLatitude: Number(row.center_latitude),
    centerLongitude: Number(row.center_longitude),
    radiusKm: Number(row.radius_km),
    priority: Number(row.priority),
    active: row.active !== false,
    locationIds: Array.isArray(row.location_ids) ? row.location_ids : [],
    locationPriorities,
    showBoundary: row.show_boundary !== false,
    note: row.note || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSchool(row: any): SchoolProfile {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    area: row.area || undefined,
    note: row.note || undefined,
    active: row.active !== false,
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined,
  };
}

function mapDailyChildPlan(row: any): DailyChildPlan {
  return {
    id: row.id,
    childId: row.child_id,
    date: row.service_date,
    attendancePlan: row.attendance_plan,
    serviceCategory: row.service_category,
    recordFormat: row.record_format,
    dayPattern: row.day_pattern,
    hasMorningProgram: row.has_morning_program === true,
    hasLunch: row.has_lunch === true,
    hasAfternoonProgram: row.has_afternoon_program === true,
    hasSnack: row.has_snack === true,
    schoolEndTime: row.school_end_time || undefined,
    arrivalTime: row.arrival_time || undefined,
    departureTime: row.departure_time || undefined,
    note: row.note || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRecorderProfile(row: any): RecorderProfile {
  const allowedMenuItems = new Set<RecorderMenuItemId>([
    'home',
    'form',
    'records',
    'children',
    'templates',
    'team',
  ]);
  const rawPreferences = row.menu_preferences && typeof row.menu_preferences === 'object'
    ? row.menu_preferences as { order?: unknown; hidden?: unknown }
    : undefined;
  const menuPreferences = rawPreferences
    ? {
        order: Array.isArray(rawPreferences.order)
          ? rawPreferences.order.filter((item): item is RecorderMenuItemId => typeof item === 'string' && allowedMenuItems.has(item as RecorderMenuItemId))
          : [],
        hidden: Array.isArray(rawPreferences.hidden)
          ? rawPreferences.hidden.filter((item): item is RecorderMenuItemId => typeof item === 'string' && item !== 'home' && allowedMenuItems.has(item as RecorderMenuItemId))
          : [],
      }
    : undefined;
  return {
    id: row.id,
    displayName: row.display_name,
    active: row.active !== false,
    pinConfigured: row.pin_configured === true,
    employeeCode: row.employee_code || undefined,
    jobTitle: row.job_title || undefined,
    employmentType: row.employment_type === 'part_time' ? 'part_time' : 'full_time',
    contractedWeeklyHours: row.contracted_weekly_hours === null || row.contracted_weekly_hours === undefined
      ? undefined
      : Number(row.contracted_weekly_hours),
    individualLoginEnabled: row.individual_login_enabled === true,
    menuPreferences,
    createdAt: row.created_at || undefined,
  };
}

function mapStaffShiftTemplate(row: any): StaffShiftTemplate {
  return {
    id: row.id,
    name: row.name,
    targetEmploymentType: row.target_employment_type || 'all',
    startTime: String(row.start_time || '').slice(0, 5),
    endTime: String(row.end_time || '').slice(0, 5),
    breakMinutes: Number(row.break_minutes || 0),
    weekdays: Array.isArray(row.weekdays)
      ? row.weekdays.map(Number).filter((day: number) => Number.isInteger(day) && day >= 0 && day <= 6)
      : [],
    note: row.note || undefined,
    active: row.active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapHandoverItem(row: any, recorderNames?: Map<string, string>): HandoverItem {
  return {
    id: row.id,
    childId: row.child_id || undefined,
    transportRunId: row.transport_run_id || undefined,
    category: row.category,
    content: row.content,
    priority: row.priority,
    status: row.status,
    dueDate: row.due_date || undefined,
    assignee: row.assignee || undefined,
    createdByRecorderId: row.created_by_recorder_profile_id || undefined,
    createdByRecorderName: row.created_by_recorder_profile_id
      ? recorderNames?.get(row.created_by_recorder_profile_id)
      : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMorningMeetingRecord(row: any): MorningMeetingRecord {
  return {
    date: row.meeting_date,
    content: row.content || '',
    updatedByName: row.updated_by_name || undefined,
    updatedByRecorderId: row.updated_by_recorder_profile_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMorningMeetingTemplate(row: any): MorningMeetingTemplate {
  return {
    id: row.id,
    name: row.name,
    content: row.content || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMorningMeetingConfirmation(row: any): MorningMeetingConfirmation {
  return {
    date: row.meeting_date,
    confirmerKey: row.confirmer_key,
    recorderProfileId: row.recorder_profile_id || undefined,
    userId: row.user_id || undefined,
    confirmerName: row.confirmer_name,
    confirmedAt: row.confirmed_at,
  };
}

function mapHandoverConfirmation(row: any): HandoverConfirmation {
  return {
    handoverItemId: row.handover_item_id,
    confirmerKey: row.confirmer_key,
    recorderProfileId: row.recorder_profile_id || undefined,
    userId: row.user_id || undefined,
    confirmerName: row.confirmer_name,
    confirmedAt: row.confirmed_at,
  };
}

function mapAnnouncement(row: any): Announcement {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    priority: row.priority || 'normal',
    sourceType: 'manual',
    publishedAt: row.published_at,
    expiresAt: row.expires_at || undefined,
    createdByRecorderId: row.created_by_recorder_profile_id || undefined,
    createdByName: row.created_by_name || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAnnouncementConfirmation(row: any): AnnouncementConfirmation {
  return {
    announcementId: row.announcement_id,
    confirmerKey: row.confirmer_key,
    recorderProfileId: row.recorder_profile_id || undefined,
    userId: row.user_id || undefined,
    confirmerName: row.confirmer_name,
    readAt: row.read_at,
    confirmedAt: row.confirmed_at || undefined,
  };
}

function mapStaffScheduleItem(
  row: any,
  recorderNames?: Map<string, string>,
): StaffScheduleItem {
  return {
    id: row.id,
    recorderProfileId: row.recorder_profile_id,
    recorderName: recorderNames?.get(row.recorder_profile_id) || '職員',
    date: row.service_date,
    startTime: String(row.start_time || '').slice(0, 5),
    endTime: String(row.end_time || '').slice(0, 5),
    title: row.title,
    category: row.category,
    location: row.location || undefined,
    childIds: Array.isArray(row.child_ids)
      ? row.child_ids.filter((value: unknown): value is string => typeof value === 'string')
      : [],
    note: row.note || undefined,
    createdBy: row.created_by || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function mapCalendarEvent(row: any): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    eventType: row.event_type,
    date: row.event_date,
    endDate: row.end_date || undefined,
    allDay: row.all_day === true,
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : undefined,
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : undefined,
    location: row.location || undefined,
    recorderProfileIds: stringArray(row.recorder_profile_ids),
    childIds: stringArray(row.child_ids),
    note: row.note || undefined,
    notificationEnabled: row.notification_enabled === true,
    visibility: row.visibility || '全体',
    color: row.color || '#0f766e',
    recurrence: row.recurrence || 'なし',
    createdBy: row.created_by || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAttendanceRecord(row: any, recorderNames?: Map<string, string>): AttendanceRecord {
  return {
    id: row.id,
    recorderProfileId: row.recorder_profile_id,
    recorderName: recorderNames?.get(row.recorder_profile_id) || '職員',
    date: row.work_date,
    scheduledStartTime: row.scheduled_start_time ? String(row.scheduled_start_time).slice(0, 5) : undefined,
    scheduledEndTime: row.scheduled_end_time ? String(row.scheduled_end_time).slice(0, 5) : undefined,
    scheduledBreakMinutes: Number(row.scheduled_break_minutes || 0),
    status: row.status,
    clockInAt: row.clock_in_at || undefined,
    clockOutAt: row.clock_out_at || undefined,
    breakPeriods: Array.isArray(row.break_periods) ? row.break_periods : [],
    note: row.note || undefined,
    deviceId: row.device_id || undefined,
    lastActionByRecorderId: row.last_action_by_recorder_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAttendanceCorrection(
  row: any,
  recorderNames?: Map<string, string>,
): AttendanceCorrectionRequest {
  return {
    id: row.id,
    attendanceRecordId: row.attendance_record_id,
    recorderProfileId: row.recorder_profile_id,
    recorderName: recorderNames?.get(row.recorder_profile_id) || '職員',
    requestedClockInAt: row.requested_clock_in_at || undefined,
    requestedClockOutAt: row.requested_clock_out_at || undefined,
    reason: row.reason,
    status: row.status,
    reviewedByName: row.reviewed_by_name || undefined,
    reviewedAt: row.reviewed_at || undefined,
    reviewNote: row.review_note || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVehicle(row: any): Vehicle {
  return {
    id: row.id,
    name: row.name,
    registrationNumber: row.registration_number || undefined,
    capacity: Number(row.capacity || 1),
    wheelchairAccessible: row.wheelchair_accessible === true,
    inspectionDueDate: row.inspection_due_date || undefined,
    vehicleKind: row.vehicle_kind || 'facility',
    assignmentPriority: Number(row.assignment_priority || 100),
    autoAssignmentPolicy: row.auto_assignment_policy || 'always',
    ownerRecorderProfileId: row.owner_recorder_profile_id || undefined,
    insuranceDueDate: row.insurance_due_date || undefined,
    available: row.available !== false,
    note: row.note || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTransportPlanDay(row: any): TransportPlanDay {
  return {
    date: row.service_date,
    pickupMode: row.pickup_mode || 'school',
    targetArrivalTime: String(row.target_arrival_time || '10:00').slice(0, 5),
    status: row.status || 'draft',
    revision: Number(row.revision || 1),
    note: row.note || undefined,
    confirmedAt: row.confirmed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDailyTransportRequirement(row: any): DailyTransportRequirement {
  return {
    id: row.id,
    childId: row.child_id,
    date: row.service_date,
    pickupEnabled: row.pickup_enabled !== false,
    dropoffEnabled: row.dropoff_enabled !== false,
    pickupPattern: row.pickup_pattern || 'school',
    pickupLocationProfileId: row.pickup_location_profile_id || undefined,
    pickupLocationName: row.pickup_location_name || undefined,
    pickupAddress: row.pickup_address || undefined,
    pickupArea: resolvedTransportArea(row.pickup_address, row.pickup_area),
    pickupTimeMode: row.pickup_time_mode || (row.pickup_pattern === 'home' ? 'arrival_backward' : 'fixed'),
    pickupTargetTime: row.pickup_target_time ? String(row.pickup_target_time).slice(0, 5) : undefined,
    dropoffLocationProfileId: row.dropoff_location_profile_id || undefined,
    dropoffLocationName: row.dropoff_location_name || undefined,
    dropoffAddress: row.dropoff_address || undefined,
    dropoffArea: resolvedTransportArea(row.dropoff_address, row.dropoff_area),
    dropoffTimeMode: row.dropoff_time_mode || 'departure_forward',
    dropoffTargetTime: row.dropoff_target_time ? String(row.dropoff_target_time).slice(0, 5) : undefined,
    pickupPlannedTime: row.pickup_planned_time ? String(row.pickup_planned_time).slice(0, 5) : undefined,
    dropoffPlannedTime: row.dropoff_planned_time ? String(row.dropoff_planned_time).slice(0, 5) : undefined,
    plannedTimeUpdatedAt: row.planned_time_updated_at || undefined,
    stopDurationMinutes: Number(row.stop_duration_minutes || 5),
    keepSiblingsTogether: row.keep_siblings_together !== false,
    source: row.source || 'baseline',
    status: row.status || 'draft',
    revision: Number(row.revision || 1),
    note: row.note || undefined,
    timeChangeNote: row.time_change_note || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTransportRun(
  row: any,
  recorderNames?: Map<string, string>,
  vehicleNames?: Map<string, string>,
): TransportRun {
  return {
    id: row.id,
    date: row.service_date,
    name: row.name,
    direction: row.direction,
    startTime: String(row.start_time || '').slice(0, 5),
    endTime: String(row.end_time || '').slice(0, 5),
    driverRecorderProfileId: row.driver_recorder_profile_id || undefined,
    driverName: row.driver_recorder_profile_id
      ? recorderNames?.get(row.driver_recorder_profile_id)
      : undefined,
    assistantRecorderProfileIds: stringArray(row.assistant_recorder_profile_ids),
    vehicleId: row.vehicle_id || undefined,
    vehicleName: row.vehicle_id ? vehicleNames?.get(row.vehicle_id) : undefined,
    stops: Array.isArray(row.stops)
      ? row.stops.map((stop: any) => ({
          ...stop,
          area: resolvedTransportArea(stop.location, stop.area),
        }))
      : [],
    guardianNote: row.guardian_note || undefined,
    operationNote: row.operation_note || undefined,
    routeOrigin: row.route_origin || undefined,
    routeDestination: row.route_destination || undefined,
    routeOptimizedAt: row.route_optimized_at || undefined,
    status: row.status || '未出発',
    statusUpdatedAt: row.status_updated_at || undefined,
    statusUpdatedByRecorderId: row.status_updated_by_recorder_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTransportRouteSettings(row: any): TransportRouteSettings {
  const stopDuration = Number(row?.stop_duration_minutes);
  const sameLocationTimeWindow = Number(row?.same_location_time_window_minutes);
  const waitTolerance = Number(row?.school_wait_tolerance_minutes);
  const minimumStaff = Number(row?.minimum_facility_staff);
  return {
    facilityAddress: row?.facility_address || '',
    stopDurationMinutes: Math.max(0, Math.min(30, Number.isFinite(stopDuration) ? stopDuration : 5)),
    sameLocationTimeWindowMinutes: Math.max(0, Math.min(120, Number.isFinite(sameLocationTimeWindow) ? sameLocationTimeWindow : 15)),
    facilityPinColor: row?.facility_pin_color || '#7c3aed',
    residentialPinColor: row?.residential_pin_color || '#059669',
    educationPinColor: row?.education_pin_color || '#0284c7',
    otherPinColor: row?.other_pin_color || '#d97706',
    holidayOpeningTime: String(row?.holiday_opening_time || '09:00').slice(0, 5),
    holidayArrivalTime: String(row?.holiday_arrival_time || '10:00').slice(0, 5),
    weekdayElementaryDepartureTime: String(row?.weekday_elementary_departure_time || '17:45').slice(0, 5),
    weekdayCareersDepartureTime: String(row?.weekday_careers_departure_time || '19:20').slice(0, 5),
    holidayDepartureTime: String(row?.holiday_departure_time || '16:00').slice(0, 5),
    schoolWaitToleranceMinutes: Math.max(0, Math.min(60, Number.isFinite(waitTolerance) ? waitTolerance : 10)),
    minimumFacilityStaff: Math.max(0, Math.min(30, Number.isFinite(minimumStaff) ? minimumStaff : 2)),
    avoidTolls: row?.avoid_tolls === true,
    avoidHighways: row?.avoid_highways === true,
    updatedAt: row?.updated_at || undefined,
  };
}

function mapTemplate(row: any): Template {
  return upgradeStandardHolidayTemplate(upgradeStandardWeekdayTemplate(normalizeTemplateFatigueScale({
    id: row.id,
    name: row.name,
    type: row.template_type,
    isDefault: row.is_default,
    description: row.description || undefined,
    sections: row.sections || [],
    wizardQuestions: row.wizard_questions || undefined,
  })));
}

function mapSupportPlan(row: any): SupportPlan {
  return {
    id: row.id,
    childId: row.child_id,
    title: row.title,
    longTermGoal: row.long_term_goal || '',
    shortTermGoal: row.short_term_goal || '',
    domainGoals: row.domain_goals || {},
    validFrom: row.valid_from,
    validTo: row.valid_to || undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRecord(row: any): SupportRecord {
  const rawExpressions = Array.isArray(row.expression)
    ? row.expression
    : String(row.expression || '').split(/[、,]/).map((value) => value.trim()).filter(Boolean);
  return {
    id: row.id,
    templateId: row.template_id,
    templateName: row.template_name,
    templateType: row.template_type,
    templateSectionsSnapshot: row.template_snapshot?.sections || undefined,
    childId: row.child_id,
    childName: row.child_name,
    date: row.record_date,
    attendance: row.attendance || '',
    attendanceNote: row.attendance_note || undefined,
    expressions: rawExpressions as ExpressionType[],
    expressionNote: row.expression_note || undefined,
    snack: normalizeSnack(row.snack),
    snackNote: row.snack_note || undefined,
    recorderId: row.recorder_profile_id || undefined,
    recorderName: row.recorder_name,
    serviceStartTime: row.service_start_time || undefined,
    serviceEndTime: row.service_end_time || undefined,
    transportation: row.transportation || undefined,
    supportPlanId: row.support_plan_id || undefined,
    fiveDomains: row.five_domains || [],
    goalProgress: row.goal_progress || [],
    sectionAnswers: row.section_answers || {},
    skippedQuestionIds: row.skipped_question_ids || [],
    synthesizedSummary: row.synthesized_summary || undefined,
    approvalStatus: row.approval_status,
    jihatsukanComment: row.review_comment || undefined,
    reviewIssues: Array.isArray(row.review_issues) ? row.review_issues as ReviewIssue[] : [],
    reviewedBy: row.reviewer_name || undefined,
    reviewedAt: row.reviewed_at || undefined,
    version: Number(row.version || 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeSnack(value: unknown): SnackType | '' {
  const raw = String(value || '');
  if (raw === '食べた' || raw === '持ち帰り' || raw === '食べていない' || raw === '持ち込み') return raw;
  if (raw === '完食' || raw === '半量食べた') return '食べた';
  if (raw === '残した') return '持ち帰り';
  if (raw === '不食' || raw === 'なし') return '食べていない';
  return raw;
}

function mapAiWritingSettings(row: any): AiWritingSettings {
  if (!row) return DEFAULT_AI_WRITING_SETTINGS;
  return {
    tone: row.tone || DEFAULT_AI_WRITING_SETTINGS.tone,
    customTone: row.custom_tone || '',
    customInstructions: row.custom_instructions || '',
    targetLength: row.target_length || DEFAULT_AI_WRITING_SETTINGS.targetLength,
  };
}

export async function loadWorkspaceData(organizationId: string): Promise<WorkspaceData> {
  const client = assertSupabase();
  const [
    childrenResult,
    schoolsResult,
    schedulesResult,
    recorderProfilesResult,
    templatesResult,
    recordsResult,
    handoversResult,
    handoverConfirmationsResult,
    morningMeetingsResult,
    morningMeetingTemplatesResult,
    morningMeetingConfirmationsResult,
    plansResult,
    aiSettingsResult,
    announcementsResult,
    announcementConfirmationsResult,
    staffScheduleItemsResult,
    calendarEventsResult,
    dailyChildPlansResult,
    attendanceRecordsResult,
    staffShiftTemplatesResult,
    attendanceCorrectionsResult,
    vehiclesResult,
    transportRunsResult,
    transportPlanDaysResult,
    dailyTransportRequirementsResult,
    transportRouteSettingsResult,
    transportMapLocationsResult,
    transportAreaZonesResult,
  ] = await Promise.all([
    client.from('children').select('*').eq('organization_id', organizationId).is('deleted_at', null).order('name'),
    client.from('schools').select('*').eq('organization_id', organizationId).order('name'),
    client.from('child_regular_day_schedules').select('*').eq('organization_id', organizationId).order('effective_from'),
    client.from('recorder_profiles').select('id, display_name, active, pin_configured, employee_code, job_title, employment_type, contracted_weekly_hours, individual_login_enabled, menu_preferences, created_at').eq('organization_id', organizationId).eq('active', true).order('display_name'),
    client.from('record_templates').select('*').eq('organization_id', organizationId).is('archived_at', null).order('created_at'),
    loadSupportRecordsWithRetry(organizationId),
    client.from('handover_items').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }),
    client.from('handover_confirmations').select('*').eq('organization_id', organizationId).order('confirmed_at', { ascending: false }),
    client.from('morning_meeting_records').select('*').eq('organization_id', organizationId).order('meeting_date', { ascending: false }),
    client.from('morning_meeting_templates').select('*').eq('organization_id', organizationId).is('archived_at', null).order('updated_at', { ascending: false }),
    client.from('morning_meeting_confirmations').select('*').eq('organization_id', organizationId).order('confirmed_at', { ascending: false }),
    client.from('support_plans').select('*').eq('organization_id', organizationId).order('valid_from', { ascending: false }),
    client.from('organization_ai_settings').select('*').eq('organization_id', organizationId).maybeSingle(),
    client.from('announcements').select('*').eq('organization_id', organizationId).is('archived_at', null).order('published_at', { ascending: false }),
    client.from('announcement_confirmations').select('*').eq('organization_id', organizationId).order('read_at', { ascending: false }),
    client.from('staff_schedule_items').select('*').eq('organization_id', organizationId).order('service_date', { ascending: false }).order('start_time'),
    client.from('calendar_events').select('*').eq('organization_id', organizationId).order('event_date', { ascending: false }).order('start_time'),
    client.from('daily_child_plans').select('*').eq('organization_id', organizationId).order('service_date', { ascending: false }),
    client.from('attendance_records').select('*').eq('organization_id', organizationId).order('work_date', { ascending: false }),
    client.from('staff_shift_templates').select('*').eq('organization_id', organizationId).eq('active', true).order('name'),
    client.from('attendance_correction_requests').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }),
    client.from('vehicles').select('*').eq('organization_id', organizationId).order('name'),
    client.from('transport_runs').select('*').eq('organization_id', organizationId).order('service_date', { ascending: false }).order('start_time'),
    client.from('transport_plan_days').select('*').eq('organization_id', organizationId).order('service_date', { ascending: false }),
    client.from('daily_transport_requirements').select('*').eq('organization_id', organizationId).order('service_date', { ascending: false }),
    client.from('transport_route_settings').select('*').eq('organization_id', organizationId).eq('id', 'default').maybeSingle(),
    client.from('transport_map_locations').select('*').eq('organization_id', organizationId).order('location_name'),
    client.from('transport_area_zones').select('*').eq('organization_id', organizationId).order('priority').order('name'),
  ]);

  const requiredResults = [
    childrenResult,
    schoolsResult,
    schedulesResult,
    recorderProfilesResult,
    templatesResult,
    recordsResult,
    handoversResult,
    handoverConfirmationsResult,
    morningMeetingsResult,
    morningMeetingTemplatesResult,
    morningMeetingConfirmationsResult,
    plansResult,
    aiSettingsResult,
    transportMapLocationsResult,
    transportAreaZonesResult,
  ];
  const requiredResultLabels = [
    '児童情報',
    '学校台帳',
    '定期利用予定',
    '職員情報',
    '記録フォーマット',
    '支援記録',
    '申し送り',
    '申し送り確認',
    '朝礼記録',
    '朝礼テンプレート',
    '朝礼確認',
    '支援計画',
    'AI設定',
    '送迎地図地点',
    '優先配車エリア',
  ];

  for (const [index, result] of requiredResults.entries()) {
    if (result.error) {
      const detail = [result.error.code, result.error.message, result.error.details]
        .filter(Boolean)
        .join(' / ');
      throw new Error(`${requiredResultLabels[index]}の取得に失敗しました${detail ? `: ${detail}` : ''}`);
    }
  }

  const schedulesByChild = new Map<string, RegularDaySchedule[]>();
  for (const row of schedulesResult.data || []) {
    const schedules = schedulesByChild.get(row.child_id) || [];
    schedules.push(mapRegularDaySchedule(row));
    schedulesByChild.set(row.child_id, schedules);
  }

  const recorderProfiles = (recorderProfilesResult.data || []).map(mapRecorderProfile);
  const recorderNames = new Map(recorderProfiles.map((profile) => [profile.id, profile.displayName]));
  const vehicles = vehiclesResult.error ? [] : (vehiclesResult.data || []).map(mapVehicle);
  const vehicleNames = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle.name]));
  const schools = (schoolsResult.data || []).map(mapSchool);
  const schoolById = new Map(schools.map((school) => [school.id, school]));

  return {
    children: (childrenResult.data || []).map((row) => ({
      ...(() => {
        const child = mapChild(row);
        const school = child.schoolId ? schoolById.get(child.schoolId) : undefined;
        if (!school) return child;
        return {
          ...child,
          schoolName: school.name,
          transportLocations: (child.transportLocations || []).map((location) => location.schoolId === school.id || (location.type === '学校' && location.name === child.schoolName)
            ? { ...location, schoolId: school.id, name: school.name, address: school.address, area: school.area }
            : location),
        };
      })(),
      regularDaySchedules: schedulesByChild.get(row.id) || [],
    })),
    schools,
    recorderProfiles,
    templates: (templatesResult.data || []).map(mapTemplate),
    records: (recordsResult.data || []).map(mapRecord),
    handoverItems: (handoversResult.data || []).map((row) => mapHandoverItem(row, recorderNames)),
    handoverConfirmations: (handoverConfirmationsResult.data || []).map(mapHandoverConfirmation),
    morningMeetingRecords: (morningMeetingsResult.data || []).map(mapMorningMeetingRecord),
    morningMeetingTemplates: (morningMeetingTemplatesResult.data || []).map(mapMorningMeetingTemplate),
    morningMeetingConfirmations: (morningMeetingConfirmationsResult.data || []).map(mapMorningMeetingConfirmation),
    supportPlans: (plansResult.data || []).map(mapSupportPlan),
    aiWritingSettings: mapAiWritingSettings(aiSettingsResult.data),
    announcements: announcementsResult.error ? [] : (announcementsResult.data || []).map(mapAnnouncement),
    announcementConfirmations: announcementConfirmationsResult.error
      ? []
      : (announcementConfirmationsResult.data || []).map(mapAnnouncementConfirmation),
    staffScheduleItems: staffScheduleItemsResult.error
      ? []
      : (staffScheduleItemsResult.data || []).map((row) => mapStaffScheduleItem(row, recorderNames)),
    calendarEvents: calendarEventsResult.error ? [] : (calendarEventsResult.data || []).map(mapCalendarEvent),
    dailyChildPlans: dailyChildPlansResult.error ? [] : (dailyChildPlansResult.data || []).map(mapDailyChildPlan),
    attendanceRecords: attendanceRecordsResult.error
      ? []
      : (attendanceRecordsResult.data || []).map((row) => mapAttendanceRecord(row, recorderNames)),
    staffShiftTemplates: staffShiftTemplatesResult.error
      ? []
      : (staffShiftTemplatesResult.data || []).map(mapStaffShiftTemplate),
    attendanceCorrectionRequests: attendanceCorrectionsResult.error
      ? []
      : (attendanceCorrectionsResult.data || []).map((row) => mapAttendanceCorrection(row, recorderNames)),
    vehicles,
    transportRuns: transportRunsResult.error
      ? []
      : (transportRunsResult.data || []).map((row) => mapTransportRun(row, recorderNames, vehicleNames)),
    transportPlanDays: transportPlanDaysResult.error
      ? []
      : (transportPlanDaysResult.data || []).map(mapTransportPlanDay),
    dailyTransportRequirements: dailyTransportRequirementsResult.error
      ? []
      : (dailyTransportRequirementsResult.data || []).map(mapDailyTransportRequirement),
    transportRouteSettings: transportRouteSettingsResult.error
      ? mapTransportRouteSettings(null)
      : mapTransportRouteSettings(transportRouteSettingsResult.data),
    transportMapLocations: (transportMapLocationsResult.data || [])
      .filter((row) => row.latitude !== null && row.longitude !== null)
      .filter((row) => row.geocode_source !== 'google'
        || Date.now() - new Date(row.geocoded_at).getTime() < 30 * 24 * 60 * 60 * 1000)
      .map(mapTransportMapLocation),
    transportAreaZones: (transportAreaZonesResult.data || []).map(mapTransportAreaZone),
  };
}

export async function saveStaffScheduleItem(
  organizationId: string,
  item: StaffScheduleItem,
) {
  const { error } = await assertSupabase().from('staff_schedule_items').upsert(
    {
      organization_id: organizationId,
      id: item.id,
      recorder_profile_id: item.recorderProfileId,
      service_date: item.date,
      start_time: item.startTime,
      end_time: item.endTime,
      title: item.title.trim(),
      category: item.category,
      location: item.location?.trim() || null,
      child_ids: item.childIds,
      note: item.note?.trim() || null,
    },
    { onConflict: 'organization_id,id' }
  );
  if (error) throw error;
}

export async function deleteStaffScheduleItem(
  organizationId: string,
  itemId: string,
) {
  const { error } = await assertSupabase()
    .from('staff_schedule_items')
    .delete()
    .eq('organization_id', organizationId)
    .eq('id', itemId);
  if (error) throw error;
}

export async function saveCalendarEvent(organizationId: string, event: CalendarEvent) {
  const { error } = await assertSupabase().from('calendar_events').upsert({
    organization_id: organizationId,
    id: event.id,
    title: event.title.trim(),
    event_type: event.eventType,
    event_date: event.date,
    end_date: event.endDate || null,
    all_day: event.allDay,
    start_time: event.allDay ? null : event.startTime || null,
    end_time: event.allDay ? null : event.endTime || null,
    location: event.location?.trim() || null,
    recorder_profile_ids: event.recorderProfileIds,
    child_ids: event.childIds,
    note: event.note?.trim() || null,
    notification_enabled: event.notificationEnabled,
    visibility: event.visibility,
    color: event.color,
    recurrence: event.recurrence,
  }, { onConflict: 'organization_id,id' });
  if (error) throw error;
}

export async function saveDailyChildPlan(organizationId: string, plan: DailyChildPlan) {
  const { error } = await assertSupabase().from('daily_child_plans').upsert({
    organization_id: organizationId,
    id: plan.id,
    child_id: plan.childId,
    service_date: plan.date,
    attendance_plan: plan.attendancePlan,
    service_category: plan.serviceCategory,
    record_format: plan.recordFormat,
    day_pattern: plan.dayPattern,
    has_morning_program: plan.hasMorningProgram,
    has_lunch: plan.hasLunch,
    has_afternoon_program: plan.hasAfternoonProgram,
    has_snack: plan.hasSnack,
    school_end_time: plan.schoolEndTime || null,
    arrival_time: plan.arrivalTime || null,
    departure_time: plan.departureTime || null,
    note: plan.note?.trim() || null,
  }, { onConflict: 'organization_id,child_id,service_date' });
  if (error) throw error;
}

export async function deleteDailyChildPlan(
  organizationId: string,
  childId: string,
  date: string,
) {
  const { error } = await assertSupabase()
    .from('daily_child_plans')
    .delete()
    .eq('organization_id', organizationId)
    .eq('child_id', childId)
    .eq('service_date', date);
  if (error) throw error;
}

export async function deleteCalendarEvent(organizationId: string, eventId: string) {
  const { error } = await assertSupabase().from('calendar_events').delete()
    .eq('organization_id', organizationId).eq('id', eventId);
  if (error) throw error;
}

export async function saveAttendanceRecord(organizationId: string, record: AttendanceRecord) {
  const { error } = await assertSupabase().from('attendance_records').upsert({
    organization_id: organizationId,
    id: record.id,
    recorder_profile_id: record.recorderProfileId,
    work_date: record.date,
    scheduled_start_time: record.scheduledStartTime || null,
    scheduled_end_time: record.scheduledEndTime || null,
    scheduled_break_minutes: record.scheduledBreakMinutes || 0,
    status: record.status,
    clock_in_at: record.clockInAt || null,
    clock_out_at: record.clockOutAt || null,
    break_periods: record.breakPeriods,
    note: record.note?.trim() || null,
  }, { onConflict: 'organization_id,id' });
  if (error) throw error;
}

export async function saveAttendanceRecords(
  organizationId: string,
  records: AttendanceRecord[],
): Promise<AttendanceRecord[]> {
  if (records.length === 0) return [];
  const recorderNames = new Map(records.map((record) => [record.recorderProfileId, record.recorderName]));
  const { data, error } = await assertSupabase().from('attendance_records').upsert(
    records.map((record) => ({
      organization_id: organizationId,
      recorder_profile_id: record.recorderProfileId,
      work_date: record.date,
      scheduled_start_time: record.scheduledStartTime || null,
      scheduled_end_time: record.scheduledEndTime || null,
      scheduled_break_minutes: record.scheduledBreakMinutes || 0,
      status: record.status,
      clock_in_at: record.clockInAt || null,
      clock_out_at: record.clockOutAt || null,
      break_periods: record.breakPeriods,
      note: record.note?.trim() || null,
      device_id: record.deviceId || null,
      last_action_by_recorder_id: record.lastActionByRecorderId || null,
    })),
    { onConflict: 'organization_id,recorder_profile_id,work_date' },
  ).select('*');
  if (error) throw error;
  return (data || []).map((row) => mapAttendanceRecord(row, recorderNames));
}

export async function saveStaffShiftTemplate(
  organizationId: string,
  template: StaffShiftTemplate,
): Promise<StaffShiftTemplate> {
  const { data, error } = await assertSupabase().from('staff_shift_templates').upsert({
    organization_id: organizationId,
    id: template.id,
    name: template.name.trim(),
    target_employment_type: template.targetEmploymentType,
    start_time: template.startTime,
    end_time: template.endTime,
    break_minutes: template.breakMinutes,
    weekdays: template.weekdays,
    note: template.note?.trim() || null,
    active: template.active,
  }, { onConflict: 'organization_id,id' }).select('*').single();
  if (error) throw error;
  return mapStaffShiftTemplate(data);
}

export async function deleteStaffShiftTemplate(organizationId: string, templateId: string) {
  const { error } = await assertSupabase().from('staff_shift_templates')
    .update({ active: false })
    .eq('organization_id', organizationId)
    .eq('id', templateId);
  if (error) throw error;
}

export async function punchAttendance(
  organizationId: string,
  recorderProfileId: string,
  recorderName: string,
  pin: string,
  action: '出勤' | '退勤' | '休憩開始' | '休憩終了',
  deviceId: string,
) {
  const { data, error } = await assertSupabase().rpc('punch_attendance', {
    p_organization_id: organizationId,
    p_recorder_profile_id: recorderProfileId,
    p_pin: pin,
    p_action: action,
    p_device_id: deviceId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return mapAttendanceRecord(row, new Map([[recorderProfileId, recorderName]]));
}

export async function requestAttendanceCorrection(
  organizationId: string,
  recordId: string,
  recorderProfileId: string,
  pin: string,
  requestedClockInAt: string | undefined,
  requestedClockOutAt: string | undefined,
  reason: string,
) {
  const { data, error } = await assertSupabase().rpc('request_attendance_correction', {
    p_organization_id: organizationId,
    p_attendance_record_id: recordId,
    p_recorder_profile_id: recorderProfileId,
    p_pin: pin,
    p_clock_in_at: requestedClockInAt || null,
    p_clock_out_at: requestedClockOutAt || null,
    p_reason: reason.trim(),
  });
  if (error) throw error;
  return String(data || '');
}

export async function reviewAttendanceCorrection(
  organizationId: string,
  requestId: string,
  approved: boolean,
  reviewNote?: string,
) {
  const { error } = await assertSupabase().rpc('review_attendance_correction', {
    p_organization_id: organizationId,
    p_request_id: requestId,
    p_approved: approved,
    p_review_note: reviewNote?.trim() || null,
  });
  if (error) throw error;
}

export async function issueAttendanceQrChallenge(): Promise<AttendanceQrChallenge> {
  const { data, error } = await assertSupabase().rpc('issue_attendance_qr_challenge', {
    p_device_token: getAccessDeviceToken(),
  });
  if (error) throw error;
  const result = (data || {}) as Record<string, unknown>;
  const token = String(result.token || '');
  const expiresAt = String(result.expiresAt || '');
  if (!token || !expiresAt) throw new Error('打刻用QRコードを発行できませんでした。');
  const expiryTime = new Date(expiresAt).getTime();
  return {
    token,
    expiresAt,
    refreshAfterSeconds: Math.max(30, Number(result.refreshAfterSeconds) || 90),
    serverNow: Number.isFinite(expiryTime)
      ? new Date(expiryTime - 2 * 60 * 1000).toISOString()
      : new Date().toISOString(),
  };
}

export async function registerAttendanceKioskDevice() {
  const { data, error } = await assertSupabase().rpc('register_attendance_kiosk_device', {
    p_device_token: getAccessDeviceToken(),
    p_label: getAccessDeviceLabel(),
    p_platform: getAccessDevicePlatform(),
  });
  if (error) throw error;
  return String(data || '');
}

export async function punchAttendanceWithQr(
  recorderProfileId: string,
  recorderName: string,
  qrToken: string,
  action: '出勤' | '退勤',
) {
  const { data, error } = await assertSupabase().rpc('punch_attendance_with_qr', {
    p_qr_token: qrToken,
    p_action: action,
    p_device_token: getAccessDeviceToken(),
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('打刻結果を取得できませんでした。');
  return mapAttendanceRecord(row, new Map([[recorderProfileId, recorderName]]));
}

export async function saveVehicle(organizationId: string, vehicle: Vehicle) {
  const { error } = await assertSupabase().from('vehicles').upsert({
    organization_id: organizationId,
    id: vehicle.id,
    name: vehicle.name.trim(),
    registration_number: vehicle.registrationNumber?.trim() || null,
    capacity: vehicle.capacity,
    wheelchair_accessible: vehicle.wheelchairAccessible,
    inspection_due_date: vehicle.inspectionDueDate || null,
    vehicle_kind: vehicle.vehicleKind || 'facility',
    assignment_priority: Math.max(1, Math.min(999, Math.round(vehicle.assignmentPriority || 100))),
    auto_assignment_policy: vehicle.autoAssignmentPolicy || 'always',
    owner_recorder_profile_id: vehicle.ownerRecorderProfileId || null,
    insurance_due_date: vehicle.insuranceDueDate || null,
    available: vehicle.available,
    note: vehicle.note?.trim() || null,
  }, { onConflict: 'organization_id,id' });
  if (error) throw error;
}

export async function deleteVehicle(organizationId: string, vehicleId: string) {
  const { error } = await assertSupabase().from('vehicles').delete()
    .eq('organization_id', organizationId).eq('id', vehicleId);
  if (error) throw error;
}

export async function saveTransportPlanDay(
  organizationId: string,
  day: TransportPlanDay,
) {
  const { error } = await assertSupabase().from('transport_plan_days').upsert({
    organization_id: organizationId,
    service_date: day.date,
    pickup_mode: day.pickupMode,
    target_arrival_time: day.targetArrivalTime,
    status: day.status,
    revision: day.revision,
    note: day.note?.trim() || null,
    confirmed_at: day.confirmedAt || null,
  }, { onConflict: 'organization_id,service_date' });
  if (error) throw error;
}

export async function saveDailyTransportRequirement(
  organizationId: string,
  requirement: DailyTransportRequirement,
) {
  const { error } = await assertSupabase().from('daily_transport_requirements').upsert({
    organization_id: organizationId,
    id: requirement.id,
    child_id: requirement.childId,
    service_date: requirement.date,
    pickup_enabled: requirement.pickupEnabled,
    dropoff_enabled: requirement.dropoffEnabled,
    pickup_pattern: requirement.pickupPattern,
    pickup_location_profile_id: requirement.pickupLocationProfileId || null,
    pickup_location_name: requirement.pickupLocationName?.trim() || null,
    pickup_address: requirement.pickupAddress?.trim() || null,
    pickup_area: resolvedTransportArea(requirement.pickupAddress, requirement.pickupArea) || null,
    pickup_time_mode: requirement.pickupTimeMode,
    pickup_target_time: requirement.pickupTargetTime || null,
    dropoff_location_profile_id: requirement.dropoffLocationProfileId || null,
    dropoff_location_name: requirement.dropoffLocationName?.trim() || null,
    dropoff_address: requirement.dropoffAddress?.trim() || null,
    dropoff_area: resolvedTransportArea(requirement.dropoffAddress, requirement.dropoffArea) || null,
    dropoff_time_mode: requirement.dropoffTimeMode,
    dropoff_target_time: requirement.dropoffTargetTime || null,
    pickup_planned_time: requirement.pickupPlannedTime || null,
    dropoff_planned_time: requirement.dropoffPlannedTime || null,
    planned_time_updated_at: requirement.plannedTimeUpdatedAt || null,
    stop_duration_minutes: Math.max(0, Math.min(60, Math.round(requirement.stopDurationMinutes))),
    keep_siblings_together: requirement.keepSiblingsTogether,
    source: requirement.source,
    status: requirement.status,
    revision: requirement.revision,
    note: requirement.note?.trim() || null,
    time_change_note: requirement.timeChangeNote?.trim() || null,
  }, { onConflict: 'organization_id,child_id,service_date' });
  if (error) throw error;
}

export async function saveDailyTransportRequirements(
  organizationId: string,
  requirements: DailyTransportRequirement[],
) {
  if (requirements.length === 0) return;
  const rows = requirements.map((requirement) => ({
    organization_id: organizationId,
    id: requirement.id,
    child_id: requirement.childId,
    service_date: requirement.date,
    pickup_enabled: requirement.pickupEnabled,
    dropoff_enabled: requirement.dropoffEnabled,
    pickup_pattern: requirement.pickupPattern,
    pickup_location_profile_id: requirement.pickupLocationProfileId || null,
    pickup_location_name: requirement.pickupLocationName?.trim() || null,
    pickup_address: requirement.pickupAddress?.trim() || null,
    pickup_area: resolvedTransportArea(requirement.pickupAddress, requirement.pickupArea) || null,
    pickup_time_mode: requirement.pickupTimeMode,
    pickup_target_time: requirement.pickupTargetTime || null,
    dropoff_location_profile_id: requirement.dropoffLocationProfileId || null,
    dropoff_location_name: requirement.dropoffLocationName?.trim() || null,
    dropoff_address: requirement.dropoffAddress?.trim() || null,
    dropoff_area: resolvedTransportArea(requirement.dropoffAddress, requirement.dropoffArea) || null,
    dropoff_time_mode: requirement.dropoffTimeMode,
    dropoff_target_time: requirement.dropoffTargetTime || null,
    pickup_planned_time: requirement.pickupPlannedTime || null,
    dropoff_planned_time: requirement.dropoffPlannedTime || null,
    planned_time_updated_at: requirement.plannedTimeUpdatedAt || null,
    stop_duration_minutes: Math.max(0, Math.min(60, Math.round(requirement.stopDurationMinutes))),
    keep_siblings_together: requirement.keepSiblingsTogether,
    source: requirement.source,
    status: requirement.status,
    revision: requirement.revision,
    note: requirement.note?.trim() || null,
    time_change_note: requirement.timeChangeNote?.trim() || null,
  }));
  const { error } = await assertSupabase().from('daily_transport_requirements').upsert(rows, {
    onConflict: 'organization_id,child_id,service_date',
  });
  if (error) throw error;
}

function monthlyTransportPayload(requirements: DailyTransportRequirement[]) {
  return requirements.map((requirement) => ({
    id: requirement.id,
    child_id: requirement.childId,
    service_date: requirement.date,
    pickup_enabled: requirement.pickupEnabled,
    dropoff_enabled: requirement.dropoffEnabled,
    pickup_pattern: requirement.pickupPattern,
    pickup_location_profile_id: requirement.pickupLocationProfileId || null,
    pickup_location_name: requirement.pickupLocationName?.trim() || null,
    pickup_address: requirement.pickupAddress?.trim() || null,
    pickup_area: resolvedTransportArea(requirement.pickupAddress, requirement.pickupArea) || null,
    pickup_time_mode: requirement.pickupTimeMode,
    pickup_target_time: requirement.pickupTargetTime || null,
    dropoff_location_profile_id: requirement.dropoffLocationProfileId || null,
    dropoff_location_name: requirement.dropoffLocationName?.trim() || null,
    dropoff_address: requirement.dropoffAddress?.trim() || null,
    dropoff_area: resolvedTransportArea(requirement.dropoffAddress, requirement.dropoffArea) || null,
    dropoff_time_mode: requirement.dropoffTimeMode,
    dropoff_target_time: requirement.dropoffTargetTime || null,
    stop_duration_minutes: Math.max(0, Math.min(60, Math.round(requirement.stopDurationMinutes))),
    keep_siblings_together: requirement.keepSiblingsTogether,
    revision: Math.max(1, requirement.revision),
    note: requirement.note?.trim() || null,
    time_change_note: requirement.timeChangeNote?.trim() || null,
  }));
}

function mapTransportTimeChangeHistory(row: any): TransportTimeChangeHistory {
  return {
    id: row.id,
    childId: row.child_id,
    date: row.service_date,
    field: row.time_field,
    previousTime: row.previous_time ? String(row.previous_time).slice(0, 5) : undefined,
    newTime: row.new_time ? String(row.new_time).slice(0, 5) : undefined,
    previousMode: row.previous_mode || undefined,
    newMode: row.new_mode || undefined,
    note: row.change_note || '変更理由なし',
    changedByName: row.changed_by_name || undefined,
    createdAt: row.created_at,
  };
}

export async function loadTransportTimeChangeHistory(
  organizationId: string,
  childId: string,
  limit = 100,
) {
  const { data, error } = await assertSupabase()
    .from('transport_time_change_history')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('child_id', childId)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(200, limit)));
  if (error) throw error;
  return (data || []).map(mapTransportTimeChangeHistory);
}

async function loadMonthlyTransportRequirementsFromDatabase(
  organizationId: string,
  month: string,
) {
  const monthStart = `${month}-01`;
  const nextMonthDate = new Date(`${monthStart}T00:00:00Z`);
  nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth() + 1);
  const nextMonthStart = nextMonthDate.toISOString().slice(0, 10);
  const { data, error } = await assertSupabase()
    .from('daily_transport_requirements')
    .select('*')
    .eq('organization_id', organizationId)
    .gte('service_date', monthStart)
    .lt('service_date', nextMonthStart)
    .order('service_date')
    .order('pickup_target_time');
  if (error) throw error;
  return (data || []).map(mapDailyTransportRequirement);
}

export async function replaceMonthlyTransportRequirements(
  organizationId: string,
  month: string,
  requirements: DailyTransportRequirement[],
) {
  const payload = monthlyTransportPayload(requirements);
  const { error } = await assertSupabase().rpc('replace_monthly_transport_requirements', {
    p_organization_id: organizationId,
    p_month: `${month}-01`,
    p_requirements: payload,
  });
  if (error) throw error;
  return loadMonthlyTransportRequirementsFromDatabase(organizationId, month);
}

export async function replaceChildMonthlyTransportRequirements(
  organizationId: string,
  month: string,
  childId: string,
  requirements: DailyTransportRequirement[],
) {
  const { error } = await assertSupabase().rpc('replace_child_monthly_transport_requirements', {
    p_organization_id: organizationId,
    p_month: `${month}-01`,
    p_child_id: childId,
    p_requirements: monthlyTransportPayload(requirements),
  });
  if (error) throw error;
  return loadMonthlyTransportRequirementsFromDatabase(organizationId, month);
}

export async function deleteDailyTransportRequirement(
  organizationId: string,
  childId: string,
  date: string,
) {
  const { error } = await assertSupabase().from('daily_transport_requirements').delete()
    .eq('organization_id', organizationId)
    .eq('child_id', childId)
    .eq('service_date', date);
  if (error) throw error;
}

export async function deleteMonthlyDailySchedules(
  organizationId: string,
  month: string,
  childId?: string,
): Promise<MonthlyScheduleDeleteResult> {
  const { data, error } = await assertSupabase().rpc('delete_monthly_daily_schedules', {
    p_organization_id: organizationId,
    p_month: `${month}-01`,
    p_child_id: childId || null,
  });
  if (error) throw error;
  const result = (data || {}) as Record<string, unknown>;
  return {
    dailyPlanCount: Number(result.daily_plan_count || 0),
    requirementCount: Number(result.requirement_count || 0),
    affectedDateCount: Number(result.affected_date_count || 0),
  };
}

export async function saveTransportRun(organizationId: string, run: TransportRun) {
  const { error } = await assertSupabase().from('transport_runs').upsert({
    organization_id: organizationId,
    id: run.id,
    service_date: run.date,
    name: run.name.trim(),
    direction: run.direction,
    start_time: run.startTime,
    end_time: run.endTime,
    driver_recorder_profile_id: run.driverRecorderProfileId || null,
    assistant_recorder_profile_ids: run.assistantRecorderProfileIds,
    vehicle_id: run.vehicleId || null,
    stops: run.stops.map((stop) => ({
      ...stop,
      area: resolvedTransportArea(stop.location, stop.area),
    })),
    guardian_note: run.guardianNote?.trim() || null,
    operation_note: run.operationNote?.trim() || null,
    route_origin: run.routeOrigin?.trim() || null,
    route_destination: run.routeDestination?.trim() || null,
    route_optimized_at: run.routeOptimizedAt || null,
    status: run.status,
  }, { onConflict: 'organization_id,id' });
  if (error) throw error;
}

export async function changeTransportAssignment(
  organizationId: string,
  change: TransportAssignmentChangeInput,
) {
  const { data, error } = await assertSupabase().rpc('change_transport_assignment', {
    p_organization_id: organizationId,
    p_transport_run_id: change.runId,
    p_actor_recorder_profile_id: change.actorRecorderProfileId,
    p_actor_pin: change.actorPin,
    p_driver_recorder_profile_id: change.driverRecorderProfileId || null,
    p_assistant_recorder_profile_ids: change.assistantRecorderProfileIds,
    p_reason: change.reason.trim(),
  });
  if (error) throw error;
  return data as string | null;
}

export async function deleteTransportRun(organizationId: string, runId: string) {
  const { error } = await assertSupabase().from('transport_runs').delete()
    .eq('organization_id', organizationId).eq('id', runId);
  if (error) throw error;
}

export async function updateTransportRunStatus(
  organizationId: string,
  runId: string,
  recorderProfileId: string,
  pin: string,
  status: TransportRun['status'],
) {
  const { error } = await assertSupabase().rpc('update_transport_run_status', {
    p_organization_id: organizationId,
    p_transport_run_id: runId,
    p_recorder_profile_id: recorderProfileId,
    p_pin: pin,
    p_status: status,
  });
  if (error) throw error;
}

export async function loadPersonalTransportDashboard(serviceDate: string): Promise<TransportFieldDashboard> {
  const { data, error } = await assertSupabase().rpc('get_personal_transport_dashboard', {
    p_service_date: serviceDate,
    p_device_token: getAccessDeviceToken(),
  });
  if (error) throw error;
  const dashboard = data as TransportFieldDashboard | null;
  const resolvedDashboard = dashboard || {
    serviceDate,
    recorderProfileId: '',
    myRuns: [],
    allRuns: [],
  };
  const childIds = Array.from(new Set(resolvedDashboard.allRuns.flatMap((run) => run.stops.map((stop) => stop.childId).filter((id): id is string => Boolean(id)))));
  if (childIds.length === 0) return resolvedDashboard;
  const { data: childRows } = await assertSupabase()
    .from('children')
    .select('id,transport_permanent_note')
    .in('id', childIds);
  const permanentNoteByChild = new Map((childRows || []).map((row: any) => [row.id as string, row.transport_permanent_note as string | null]));
  const enrichRuns = (runs: TransportFieldRun[]) => runs.map((run) => ({
    ...run,
    stops: run.stops.map((stop) => ({
      ...stop,
      permanentNote: (stop.childId && permanentNoteByChild.get(stop.childId)) || stop.permanentNote || undefined,
    })),
  }));
  return {
    ...resolvedDashboard,
    myRuns: enrichRuns(resolvedDashboard.myRuns),
    allRuns: enrichRuns(resolvedDashboard.allRuns),
  };
}

export async function recordTransportFieldAction(
  runId: string,
  stopId: string | undefined,
  action: TransportFieldAction,
  note?: string,
) {
  const client = assertSupabase();
  const { data, error } = await client.rpc('record_transport_field_action', {
    p_transport_run_id: runId,
    p_stop_id: stopId || null,
    p_action: action,
    p_device_token: getAccessDeviceToken(),
    p_note: note?.trim() || null,
  });
  if (error) throw error;
  const eventId = String(data || '');
  if (eventId) {
    void client.functions.invoke('send-transport-notification', {
      body: { eventId },
    }).catch(() => undefined);
  }
  return eventId;
}

export async function cancelTransportFieldAction(eventId: string) {
  const { error } = await assertSupabase().rpc('cancel_transport_field_action', {
    p_event_id: eventId,
    p_device_token: getAccessDeviceToken(),
  });
  if (error) throw error;
}

export async function setTransportCover(runId: string, active: boolean) {
  const { error } = await assertSupabase().rpc('set_transport_cover', {
    p_transport_run_id: runId,
    p_active: active,
    p_device_token: getAccessDeviceToken(),
  });
  if (error) throw error;
}

export async function saveTransportRouteSettings(
  organizationId: string,
  settings: TransportRouteSettings,
) {
  const { error } = await assertSupabase().from('transport_route_settings').upsert({
    organization_id: organizationId,
    id: 'default',
    facility_address: settings.facilityAddress.trim(),
    stop_duration_minutes: Math.max(0, Math.min(30, Math.round(settings.stopDurationMinutes))),
    same_location_time_window_minutes: Math.max(0, Math.min(120, Math.round(settings.sameLocationTimeWindowMinutes))),
    facility_pin_color: settings.facilityPinColor,
    residential_pin_color: settings.residentialPinColor,
    education_pin_color: settings.educationPinColor,
    other_pin_color: settings.otherPinColor,
    holiday_opening_time: settings.holidayOpeningTime,
    holiday_arrival_time: settings.holidayArrivalTime,
    weekday_elementary_departure_time: settings.weekdayElementaryDepartureTime,
    weekday_careers_departure_time: settings.weekdayCareersDepartureTime,
    holiday_departure_time: settings.holidayDepartureTime,
    school_wait_tolerance_minutes: Math.max(0, Math.min(60, Math.round(settings.schoolWaitToleranceMinutes))),
    minimum_facility_staff: Math.max(0, Math.min(30, Math.round(settings.minimumFacilityStaff))),
    avoid_tolls: settings.avoidTolls,
    avoid_highways: settings.avoidHighways,
  }, { onConflict: 'organization_id,id' });
  if (error) throw error;
}

export async function optimizeTransportRoute(
  request: TransportRouteOptimizationRequest,
): Promise<TransportRouteOptimizationResult> {
  const { data, error } = await assertSupabase().functions.invoke('optimize-transport-route', {
    body: request,
  });
  if (error) {
    const context = (error as unknown as { context?: Response }).context;
    if (context) {
      const payload = await context.clone().json().catch(() => null) as { error?: string } | null;
      if (payload?.error) throw new Error(payload.error);
    }
    throw error;
  }
  if (!data || typeof data !== 'object') throw new Error('経路候補を取得できませんでした。');
  if (typeof data.error === 'string') throw new Error(data.error);
  return data as TransportRouteOptimizationResult;
}

export async function calculateTransportMatrix(
  request: TransportMatrixRequest,
): Promise<TransportMatrixResult> {
  const { data, error } = await assertSupabase().functions.invoke('calculate-transport-matrix', {
    body: request,
  });
  if (error) {
    const context = (error as unknown as { context?: Response }).context;
    if (context) {
      const payload = await context.clone().json().catch(() => null) as { error?: string } | null;
      if (payload?.error) throw new Error(payload.error);
    }
    throw error;
  }
  if (!data || typeof data !== 'object') throw new Error('道路所要時間を取得できませんでした。');
  if (typeof data.error === 'string') throw new Error(data.error);
  return data as TransportMatrixResult;
}

export async function geocodeTransportLocations(
  locations: TransportGeocodeRequestLocation[],
): Promise<TransportGeocodeResult[]> {
  const { data, error } = await assertSupabase().functions.invoke('geocode-transport-locations', {
    body: { locations },
  });
  if (error) {
    const context = (error as unknown as { context?: Response }).context;
    if (context) {
      const payload = await context.clone().json().catch(() => null) as { error?: string } | null;
      if (payload?.error) throw new Error(payload.error);
    }
    throw error;
  }
  if (!data || !Array.isArray(data.results)) throw new Error('住所の位置を取得できませんでした。');
  return data.results as TransportGeocodeResult[];
}

export async function saveTransportMapLocation(
  organizationId: string,
  location: TransportMapLocation,
) {
  const { error } = await assertSupabase().from('transport_map_locations').upsert({
    organization_id: organizationId,
    id: location.id,
    source_type: location.sourceType,
    child_id: location.childId || null,
    school_id: location.schoolId || null,
    location_profile_id: location.locationProfileId || null,
    location_name: location.locationName.trim(),
    location_type: location.locationType,
    address: location.address.trim(),
    latitude: location.latitude,
    longitude: location.longitude,
    geocode_source: location.geocodeSource,
    google_place_id: location.googlePlaceId || null,
    geocoded_at: location.geocodedAt,
  }, { onConflict: 'organization_id,id' });
  if (error) throw error;
}

export async function saveTransportAreaZone(
  organizationId: string,
  zone: TransportAreaZone,
) {
  const { error } = await assertSupabase().from('transport_area_zones').upsert({
    organization_id: organizationId,
    id: zone.id,
    name: zone.name.trim(),
    color: zone.color,
    center_latitude: zone.centerLatitude,
    center_longitude: zone.centerLongitude,
    radius_km: zone.radiusKm,
    priority: zone.priority,
    active: zone.active,
    location_ids: zone.locationIds || [],
    location_priorities: zone.locationPriorities || {},
    show_boundary: zone.showBoundary !== false,
    note: zone.note?.trim() || null,
  }, { onConflict: 'organization_id,id' });
  if (error) throw error;
}

export async function deleteTransportAreaZone(organizationId: string, zoneId: string) {
  const { error } = await assertSupabase().from('transport_area_zones').delete()
    .eq('organization_id', organizationId)
    .eq('id', zoneId);
  if (error) throw error;
}

export async function saveSchool(organizationId: string, school: SchoolProfile) {
  const { error } = await assertSupabase().from('schools').upsert({
    organization_id: organizationId,
    id: school.id,
    name: school.name.trim(),
    address: school.address.trim(),
    area: resolvedTransportArea(school.address, school.area) || null,
    note: school.note?.trim() || null,
    active: school.active,
  }, { onConflict: 'organization_id,id' });
  if (error) throw error;
}

export async function deleteSchool(organizationId: string, schoolId: string) {
  const { count, error: referenceError } = await assertSupabase()
    .from('children')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('school_id', schoolId)
    .is('deleted_at', null);
  if (referenceError) throw referenceError;
  if ((count || 0) > 0) throw new Error('この学校は児童情報で使用中です。削除せず「使用停止」にしてください。');
  const { error } = await assertSupabase().from('schools').delete()
    .eq('organization_id', organizationId)
    .eq('id', schoolId);
  if (error) throw error;
}

export async function saveAnnouncement(organizationId: string, announcement: Announcement) {
  const { error } = await assertSupabase().from('announcements').upsert({
    organization_id: organizationId,
    id: announcement.id,
    title: announcement.title.trim(),
    content: announcement.content.trim(),
    priority: announcement.priority,
    published_at: announcement.publishedAt,
    expires_at: announcement.expiresAt || null,
    created_by_recorder_profile_id: announcement.createdByRecorderId || null,
    created_by_name: announcement.createdByName || null,
    archived_at: null,
  }, { onConflict: 'organization_id,id' });
  if (error) throw error;
}

export async function saveAnnouncementConfirmation(
  organizationId: string,
  confirmation: AnnouncementConfirmation
) {
  const { error } = await assertSupabase().from('announcement_confirmations').upsert(
    {
      organization_id: organizationId,
      announcement_id: confirmation.announcementId,
      confirmer_key: confirmation.confirmerKey,
      user_id: confirmation.userId || null,
      recorder_profile_id: confirmation.recorderProfileId || null,
      confirmer_name: confirmation.confirmerName,
      read_at: confirmation.readAt,
      confirmed_at: confirmation.confirmedAt || null,
    },
    { onConflict: 'organization_id,announcement_id,confirmer_key' }
  );
  if (error) throw error;
}

export async function archiveAnnouncement(organizationId: string, announcementId: string) {
  const { error } = await assertSupabase()
    .from('announcements')
    .update({ archived_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('id', announcementId);
  if (error) throw error;
}

export async function savePushSubscription(
  organizationId: string,
  subscription: PushSubscription,
) {
  const json = subscription.toJSON();
  const { error } = await assertSupabase().from('push_subscriptions').upsert({
    organization_id: organizationId,
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh,
    auth_key: json.keys?.auth,
    user_agent: navigator.userAgent,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });
  if (error) throw error;
}

export async function sendAnnouncementNotification(announcementId: string) {
  const { data, error } = await assertSupabase().functions.invoke('send-announcement-notification', {
    body: { announcementId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as { sent?: number; failed?: number };
}

export async function saveChild(organizationId: string, child: ChildProfile) {
  const { error } = await assertSupabase().from('children').upsert(
    {
      organization_id: organizationId,
      id: child.id,
      name: child.name,
      kana: child.kana || null,
      birth_date: child.birthDate || null,
      grade: child.grade || null,
      regular_days: child.regularDays || [],
      regular_days_effective_from: getLocalDateString(),
      care_type: child.careType || null,
      service_suspended: child.serviceSuspended === true,
      transport_program: child.transportProgram || null,
      transportation_required: child.transportationRequired === true,
      school_name: child.schoolName?.trim() || null,
      school_id: child.schoolId || null,
      sibling_ids: child.siblingIds || [],
      sibling_group: null,
      transport_schedule: child.transportSchedule || [],
      pickup_location: child.pickupLocation?.trim() || null,
      dropoff_location: child.dropoffLocation?.trim() || null,
      pickup_area: resolvedTransportArea(child.pickupLocation, child.pickupArea) || null,
      dropoff_area: resolvedTransportArea(child.dropoffLocation, child.dropoffArea) || null,
      transport_locations: (child.transportLocations || []).map((location) => ({
        ...location,
        area: resolvedTransportArea(location.address, location.area),
      })),
      transport_permanent_note: child.transportPermanentNote?.trim() || null,
      notes: child.notes || null,
      deleted_at: null,
    },
    { onConflict: 'organization_id,id' }
  );
  if (error) throw error;
  const { error: siblingError } = await assertSupabase().rpc('set_child_sibling_links', {
    p_child_id: child.id,
    p_sibling_ids: child.siblingIds || [],
  });
  if (siblingError) throw siblingError;
}

export async function softDeleteChild(organizationId: string, childId: string) {
  const { error } = await assertSupabase()
    .from('children')
    .update({ deleted_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('id', childId);
  if (error) throw error;
}

export async function saveTemplate(organizationId: string, template: Template) {
  const normalizedTemplate = normalizeTemplateFatigueScale(template);
  const { error } = await assertSupabase().from('record_templates').upsert(
    {
      organization_id: organizationId,
      id: normalizedTemplate.id,
      name: normalizedTemplate.name,
      template_type: normalizedTemplate.type,
      is_default: Boolean(normalizedTemplate.isDefault),
      description: normalizedTemplate.description || null,
      sections: normalizedTemplate.sections,
      wizard_questions: normalizedTemplate.wizardQuestions || {},
      archived_at: null,
    },
    { onConflict: 'organization_id,id' }
  );
  if (error) throw error;
}

export async function archiveTemplate(organizationId: string, templateId: string) {
  const { error } = await assertSupabase()
    .from('record_templates')
    .update({ archived_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('id', templateId);
  if (error) throw error;
}

export async function saveSupportPlan(organizationId: string, plan: SupportPlan) {
  const { error } = await assertSupabase().from('support_plans').upsert(
    {
      organization_id: organizationId,
      id: plan.id,
      child_id: plan.childId,
      title: plan.title,
      long_term_goal: plan.longTermGoal,
      short_term_goal: plan.shortTermGoal,
      domain_goals: plan.domainGoals,
      valid_from: plan.validFrom,
      valid_to: plan.validTo || null,
      status: plan.status,
    },
    { onConflict: 'organization_id,id' }
  );
  if (error) throw error;
}

export async function closeSupportPlan(organizationId: string, planId: string) {
  const { error } = await assertSupabase()
    .from('support_plans')
    .update({ status: '終了' })
    .eq('organization_id', organizationId)
    .eq('id', planId);
  if (error) throw error;
}

function mapRecordForSave(organizationId: string, record: SupportRecord) {
  return {
      organization_id: organizationId,
      id: record.id,
      template_id: record.templateId,
      template_name: record.templateName,
      template_type: record.templateType,
      child_id: record.childId,
      child_name: record.childName,
      record_date: record.date,
      attendance: record.attendance,
      attendance_note: record.attendanceNote || null,
      expression: record.expressions.join('、'),
      expression_note: record.expressionNote || null,
      snack: record.snack,
      snack_note: record.snackNote || null,
      recorder_profile_id: record.recorderId || null,
      recorder_name: record.recorderName,
      service_start_time: record.serviceStartTime || null,
      service_end_time: record.serviceEndTime || null,
      transportation: record.transportation || null,
      support_plan_id: record.supportPlanId || null,
      five_domains: record.fiveDomains || [],
      goal_progress: record.goalProgress || [],
      section_answers: record.sectionAnswers,
      skipped_question_ids: record.skippedQuestionIds || [],
      template_snapshot: {
        id: record.templateId,
        name: record.templateName,
        type: record.templateType,
        sections: record.templateSectionsSnapshot || [],
      },
      synthesized_summary: record.synthesizedSummary || null,
      approval_status: record.approvalStatus,
      review_comment: record.jihatsukanComment || null,
      review_issues: record.reviewIssues || [],
      reviewer_name: record.reviewedBy || null,
      reviewed_at: record.reviewedAt || null,
      deleted_at: null,
      expected_version: record.version || 0,
    };
}

export interface SaveRecordResult {
  id: string;
  version: number;
  outcome: 'inserted' | 'updated' | 'already_saved';
}

export async function saveRecords(organizationId: string, records: SupportRecord[]): Promise<SaveRecordResult[]> {
  if (records.length === 0) return [];
  const { data, error } = await assertSupabase().rpc('save_support_records_guarded', {
    p_organization_id: organizationId,
    p_records: records.map((record) => mapRecordForSave(organizationId, record)),
  });
  if (error) {
    if (error.message.includes('RECORD_DUPLICATE_DAY')) {
      throw new Error('同じ児童・同じ日付の記録が別端末ですでに保存されています。既存の記録を確認してください。');
    }
    if (error.message.includes('RECORD_CONFLICT')) {
      throw new Error('別端末で記録が更新されたため、この端末の内容では上書きしませんでした。最新の記録を読み直してください。');
    }
    if (
      error.code === '23503'
      && `${error.details || ''} ${error.message}`.includes('support_records_organization_id_template_id_fkey')
    ) {
      throw new Error('記録フォーマットの同期が完了していないため保存できませんでした。画面を開き直してから再度保存してください。解消しない場合は管理者へお知らせください。');
    }
    throw error;
  }
  return ((data || []) as Array<{ record_id: string; new_version: number; outcome: SaveRecordResult['outcome'] }>).map((result) => ({
    id: result.record_id,
    version: Number(result.new_version),
    outcome: result.outcome,
  }));
}

export async function saveRecord(organizationId: string, record: SupportRecord) {
  const [result] = await saveRecords(organizationId, [record]);
  return result;
}

export async function saveAiWritingSettings(organizationId: string, settings: AiWritingSettings) {
  const { error } = await assertSupabase().from('organization_ai_settings').upsert(
    {
      organization_id: organizationId,
      tone: settings.tone,
      custom_tone: settings.customTone.trim(),
      custom_instructions: settings.customInstructions.trim(),
      target_length: Math.max(80, Math.min(800, settings.targetLength)),
    },
    { onConflict: 'organization_id' }
  );
  if (error) throw error;
}

export async function loadRecordDraft(organizationId: string, draftKey: string) {
  const { data, error } = await assertSupabase()
    .from('record_drafts')
    .select('payload, updated_at, revision, device_id, recorder_profile_id')
    .eq('organization_id', organizationId)
    .eq('draft_key', draftKey)
    .maybeSingle();
  if (error) throw error;
  return data ? {
    payload: data.payload as unknown,
    updatedAt: data.updated_at as string,
    revision: Number(data.revision || 1),
    deviceId: data.device_id as string | null,
    recorderId: data.recorder_profile_id as string | null,
  } : null;
}

export interface SaveRecordDraftOptions {
  deviceId: string;
  expectedRevision?: number | null;
  recorderId?: string | null;
}

export async function saveRecordDraft(
  organizationId: string,
  _userId: string,
  draftKey: string,
  payload: unknown,
  options: SaveRecordDraftOptions
) {
  const { data, error } = await assertSupabase().rpc('save_record_draft_guarded', {
    p_organization_id: organizationId,
    p_draft_key: draftKey,
    p_payload: payload,
    p_device_id: options.deviceId,
    p_expected_revision: options.expectedRevision ?? null,
    p_recorder_profile_id: options.recorderId || null,
  });
  if (error) throw error;
  const saved = Array.isArray(data) ? data[0] : data;
  return {
    revision: Number(saved?.new_revision || options.expectedRevision || 1),
    updatedAt: String(saved?.saved_at || new Date().toISOString()),
  };
}

export async function deleteRecordDraft(organizationId: string, draftKey: string) {
  const { error } = await assertSupabase()
    .from('record_drafts')
    .delete()
    .eq('organization_id', organizationId)
    .eq('draft_key', draftKey);
  if (error) throw error;
}

export async function takeOverRecordDraft(
  organizationId: string,
  draftKey: string,
  recorderId?: string | null,
) {
  const { data, error } = await assertSupabase().rpc('take_over_record_draft', {
    p_organization_id: organizationId,
    p_draft_key: draftKey,
    p_recorder_profile_id: recorderId || null,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  return {
    revision: Number(result?.new_revision || 1),
    updatedAt: String(result?.saved_at || new Date().toISOString()),
    payload: result?.draft_payload as unknown,
  };
}

export async function takeOverRecordDraftChild(
  organizationId: string,
  sourceDraftKey: string,
  childId: string,
  targetDraftKey: string,
  recorderId?: string | null,
) {
  const { data, error } = await assertSupabase().rpc('take_over_record_draft_child', {
    p_organization_id: organizationId,
    p_source_draft_key: sourceDraftKey,
    p_child_id: childId,
    p_target_draft_key: targetDraftKey,
    p_recorder_profile_id: recorderId || null,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  return {
    revision: Number(result?.new_revision || 1),
    updatedAt: String(result?.saved_at || new Date().toISOString()),
    payload: result?.draft_payload as unknown,
  };
}

export async function takeOverRecordDraftChildren(
  organizationId: string,
  items: Array<{ sourceDraftKey: string; childId: string }>,
  targetDraftKey: string,
  recorderId?: string | null,
) {
  const { data, error } = await assertSupabase().rpc('take_over_record_draft_children', {
    p_organization_id: organizationId,
    p_items: items,
    p_target_draft_key: targetDraftKey,
    p_recorder_profile_id: recorderId || null,
    p_device_token: getAccessDeviceToken(),
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  return {
    revision: Number(result?.new_revision || 1),
    updatedAt: String(result?.saved_at || new Date().toISOString()),
    payload: result?.draft_payload as unknown,
  };
}

export async function takeOverRecordDraftChildrenIntoExisting(
  organizationId: string,
  items: Array<{ sourceDraftKey: string; childId: string }>,
  targetDraftKey: string,
  recorderId?: string | null,
) {
  const { data, error } = await assertSupabase().rpc('take_over_record_draft_children_into_existing', {
    p_organization_id: organizationId,
    p_items: items,
    p_target_draft_key: targetDraftKey,
    p_recorder_profile_id: recorderId || null,
    p_device_token: getAccessDeviceToken(),
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  return {
    revision: Number(result?.new_revision || 1),
    updatedAt: String(result?.saved_at || new Date().toISOString()),
    payload: result?.draft_payload as unknown,
  };
}

export async function listRecordDrafts(organizationId: string): Promise<RecordDraftSummary[]> {
  const { data, error } = await assertSupabase()
    .from('record_drafts')
    .select('user_id, draft_key, payload, updated_at, revision, device_id, recorder_profile_id')
    .eq('organization_id', organizationId)
    .like('draft_key', 'record-%')
    .order('updated_at', { ascending: false });
  if (error) throw error;

  return (data || []).flatMap((row) => {
    const payload = row.payload && typeof row.payload === 'object'
      ? row.payload as Record<string, unknown>
      : null;
    if (!payload || !Array.isArray(payload.selectedChildIds)) return [];
    const takenOverFromDraftKeys = Array.isArray(payload.takenOverFromDraftKeys)
      ? payload.takenOverFromDraftKeys.filter((value): value is string => typeof value === 'string')
      : typeof payload.takenOverFromDraftKey === 'string'
        ? [payload.takenOverFromDraftKey]
        : [];
    return [{
      draftKey: row.draft_key,
      revision: Number(row.revision || 1),
      userId: row.user_id || undefined,
      deviceId: row.device_id || undefined,
      recorderId: row.recorder_profile_id || (typeof payload.recorderId === 'string' ? payload.recorderId : undefined),
      recorderName: typeof payload.recorderName === 'string' ? payload.recorderName : undefined,
      selectedChildIds: payload.selectedChildIds.filter((value): value is string => typeof value === 'string'),
      selectedTemplateId: typeof payload.selectedTemplateId === 'string' ? payload.selectedTemplateId : undefined,
      takenOverFromDraftKeys,
      takenOverAt: typeof payload.takenOverAt === 'string' ? payload.takenOverAt : undefined,
      date: typeof payload.date === 'string' ? payload.date : undefined,
      currentStepIndex: typeof payload.currentStepIndex === 'number' ? payload.currentStepIndex : 0,
      updatedAt: row.updated_at,
    }];
  });
}

export async function verifyRecorderPin(
  organizationId: string,
  recorderId: string,
  pin: string
) {
  const { data, error } = await assertSupabase().rpc('verify_recorder_pin', {
    p_organization_id: organizationId,
    p_recorder_profile_id: recorderId,
    p_pin: pin,
  });
  if (error) throw error;
  return data === true;
}

export async function setRecorderPin(
  organizationId: string,
  recorderId: string,
  pin: string
) {
  const { error } = await assertSupabase().rpc('set_recorder_pin', {
    p_organization_id: organizationId,
    p_recorder_profile_id: recorderId,
    p_pin: pin,
  });
  if (error) throw error;
}

export async function saveRecorderMenuPreferences(
  organizationId: string,
  recorderId: string,
  preferences: RecorderMenuPreferences,
) {
  const { data, error } = await assertSupabase().rpc('set_recorder_menu_preferences', {
    p_organization_id: organizationId,
    p_recorder_profile_id: recorderId,
    p_preferences: preferences,
  });
  if (error) throw error;
  const saved = data && typeof data === 'object'
    ? data as { order?: unknown; hidden?: unknown }
    : {};
  return {
    order: Array.isArray(saved.order) ? saved.order as RecorderMenuItemId[] : preferences.order,
    hidden: Array.isArray(saved.hidden) ? saved.hidden as RecorderMenuItemId[] : preferences.hidden,
  } satisfies RecorderMenuPreferences;
}

export async function saveHandoverItem(organizationId: string, item: HandoverItem) {
  const { error } = await assertSupabase().from('handover_items').upsert({
    id: item.id,
    organization_id: organizationId,
    child_id: item.childId || null,
    transport_run_id: item.transportRunId || null,
    category: item.category,
    content: item.content.trim(),
    priority: item.priority,
    status: item.status,
    due_date: item.dueDate || null,
    assignee: item.assignee?.trim() || null,
    created_by_recorder_profile_id: item.createdByRecorderId || null,
  });
  if (error) throw error;
}

export async function updateHandoverStatus(
  organizationId: string,
  itemId: string,
  status: HandoverItem['status']
) {
  const { error } = await assertSupabase()
    .from('handover_items')
    .update({ status })
    .eq('organization_id', organizationId)
    .eq('id', itemId);
  if (error) throw error;
}

export async function saveMorningMeetingRecord(
  organizationId: string,
  record: MorningMeetingRecord
) {
  const { error } = await assertSupabase().from('morning_meeting_records').upsert(
    {
      organization_id: organizationId,
      meeting_date: record.date,
      content: record.content,
      updated_by_recorder_profile_id: record.updatedByRecorderId || null,
      updated_by_name: record.updatedByName?.trim() || null,
    },
    { onConflict: 'organization_id,meeting_date' }
  );
  if (error) throw error;
}

export async function saveMorningMeetingTemplate(
  organizationId: string,
  template: MorningMeetingTemplate
) {
  const { error } = await assertSupabase().from('morning_meeting_templates').upsert(
    {
      id: template.id,
      organization_id: organizationId,
      name: template.name.trim(),
      content: template.content,
      archived_at: null,
    },
    { onConflict: 'id' }
  );
  if (error) throw error;
}

export async function archiveMorningMeetingTemplate(
  organizationId: string,
  templateId: string
) {
  const { error } = await assertSupabase()
    .from('morning_meeting_templates')
    .update({ archived_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('id', templateId);
  if (error) throw error;
}

export async function saveMorningMeetingConfirmation(
  organizationId: string,
  confirmation: MorningMeetingConfirmation
) {
  const { error } = await assertSupabase().from('morning_meeting_confirmations').upsert(
    {
      organization_id: organizationId,
      meeting_date: confirmation.date,
      confirmer_key: confirmation.confirmerKey,
      user_id: confirmation.userId || null,
      recorder_profile_id: confirmation.recorderProfileId || null,
      confirmer_name: confirmation.confirmerName,
      confirmed_at: confirmation.confirmedAt,
    },
    { onConflict: 'organization_id,meeting_date,confirmer_key' }
  );
  if (error) throw error;
}

export async function deleteMorningMeetingConfirmation(
  organizationId: string,
  date: string,
  confirmerKey: string
) {
  const { error } = await assertSupabase()
    .from('morning_meeting_confirmations')
    .delete()
    .eq('organization_id', organizationId)
    .eq('meeting_date', date)
    .eq('confirmer_key', confirmerKey);
  if (error) throw error;
}

export async function saveHandoverConfirmation(
  organizationId: string,
  confirmation: HandoverConfirmation
) {
  const { error } = await assertSupabase().from('handover_confirmations').upsert(
    {
      organization_id: organizationId,
      handover_item_id: confirmation.handoverItemId,
      confirmer_key: confirmation.confirmerKey,
      user_id: confirmation.userId || null,
      recorder_profile_id: confirmation.recorderProfileId || null,
      confirmer_name: confirmation.confirmerName,
      confirmed_at: confirmation.confirmedAt,
    },
    { onConflict: 'organization_id,handover_item_id,confirmer_key' }
  );
  if (error) throw error;
}

export async function deleteHandoverConfirmation(
  organizationId: string,
  handoverItemId: string,
  confirmerKey: string
) {
  const { error } = await assertSupabase()
    .from('handover_confirmations')
    .delete()
    .eq('organization_id', organizationId)
    .eq('handover_item_id', handoverItemId)
    .eq('confirmer_key', confirmerKey);
  if (error) throw error;
}

export async function loadRecordRevisions(
  organizationId: string,
  recordId: string
): Promise<RecordRevision[]> {
  const { data, error } = await assertSupabase()
    .from('record_revisions')
    .select('id, record_id, version, changed_by, snapshot, changed_at')
    .eq('organization_id', organizationId)
    .eq('record_id', recordId)
    .order('changed_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data || []).map((row) => ({
    id: String(row.id),
    recordId: row.record_id,
    version: Number(row.version),
    changedBy: row.changed_by || undefined,
    snapshot: row.snapshot || {},
    changedAt: row.changed_at,
  }));
}

export async function softDeleteRecord(organizationId: string, recordId: string) {
  const { error } = await assertSupabase()
    .from('support_records')
    .update({ deleted_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('id', recordId);
  if (error) throw error;
}

export async function seedDefaultTemplates(organizationId: string, templates: Template[]) {
  for (const template of templates) {
    await saveTemplate(organizationId, template);
  }
}
