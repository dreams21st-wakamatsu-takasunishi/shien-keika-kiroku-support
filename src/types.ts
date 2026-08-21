export type AttendanceType = string;
export type ExpressionType = string;
export type SnackType = string;
export type ApprovalStatus = '未確認' | '確認済み' | '要修正';
export type UserRole = 'staff' | 'manager' | 'admin';
export type FiveDomain =
  | '健康・生活'
  | '運動・感覚'
  | '認知・行動'
  | '言語・コミュニケーション'
  | '人間関係・社会性';
export type GoalProgressStatus = '未評価' | '達成' | '一部達成' | '継続支援';
export type Weekday = '月' | '火' | '水' | '木' | '金' | '土' | '日';

export interface RegularDaySchedule {
  id?: string;
  effectiveFrom: string;
  regularDays: Weekday[];
  createdAt?: string;
}

export type TransportLocationType =
  | '自宅'
  | '学校'
  | '学童'
  | '習い事'
  | '親族宅'
  | '事業所'
  | 'その他';

export interface ChildTransportLocation {
  id: string;
  /** Shared school ledger reference. When present, name/address/area follow the school entry. */
  schoolId?: string;
  name: string;
  type: TransportLocationType;
  address: string;
  area?: string;
  directions: Array<'迎え' | '送り'>;
  /** Directions for which this is the normal location. One normal location per direction. */
  defaultDirections?: Array<'迎え' | '送り'>;
  weekdays?: Weekday[];
  validFrom?: string;
  validTo?: string;
  autoSelect?: boolean;
  note?: string;
}

export interface TransportMapLocation {
  id: string;
  sourceType: 'facility' | 'child' | 'school';
  childId?: string;
  schoolId?: string;
  locationProfileId?: string;
  locationName: string;
  locationType: TransportLocationType | '事業所';
  address: string;
  latitude: number;
  longitude: number;
  geocodeSource: 'google' | 'manual';
  /** Google Place ID may be retained for refreshing an expired geocode. */
  googlePlaceId?: string;
  geocodedAt: string;
  updatedAt: string;
}

export interface TransportAreaZone {
  id: string;
  name: string;
  color: string;
  centerLatitude: number;
  centerLongitude: number;
  radiusKm: number;
  priority: number;
  active: boolean;
  /** Legacy pin membership retained for backward compatibility. */
  locationIds?: string[];
  /** Per-pin preferred area rank. 1 is the highest priority for that pin. */
  locationPriorities?: Record<string, number>;
  /** Whether the circular boundary is shown and used as a fallback. */
  showBoundary?: boolean;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolProfile {
  id: string;
  name: string;
  address: string;
  area?: string;
  note?: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface TransportGeocodeRequestLocation {
  id: string;
  address: string;
  label?: string;
}

export interface TransportGeocodeResult {
  id: string;
  address: string;
  formattedAddress?: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  status: 'resolved' | 'not_found' | 'error';
  code?: string;
}

export type HomeAssistantActionType =
  | 'schedule_regular_days'
  | 'update_child_profile'
  | 'update_child_notes'
  | 'update_daily_transport'
  | 'start_support_record'
  | 'open_child_records'
  | 'summarize_recent_records';

export interface HomeAssistantProposalDetail {
  label: string;
  value: string;
}

export interface HomeAssistantProposal {
  actionId: string;
  actionType: HomeAssistantActionType;
  childId: string;
  childName: string;
  instruction: string;
  summary: string;
  details: HomeAssistantProposalDetail[];
  confirmationNote: string;
  effectiveDate?: string;
  regularDays?: Weekday[];
  profileChanges?: Partial<Pick<ChildProfile, 'name' | 'kana' | 'birthDate' | 'careType'>>;
  notesMode?: 'append' | 'replace';
  notesText?: string;
  recordDate?: string;
  periodDays?: number;
  transportDate?: string;
  transportDirection?: TransportDirection;
  transportTargetTime?: string;
}

export interface HomeAssistantExecutionResult {
  message: string;
  schedule?: RegularDaySchedule;
  updatedChild?: Partial<ChildProfile>;
  output?: string;
  updatedTransportRequirement?: DailyTransportRequirement;
  clientAction?: {
    type: 'start_support_record' | 'open_child_records';
    childId: string;
    date?: string;
  };
}

export type FieldType =
  | 'radio'
  | 'checkbox'
  | 'text'
  | 'number'
  | 'textarea'
  | 'time_select'
  | 'hand_count'
  | 'fatigue_scale'
  | 'rating_scale'
  | 'homework_subjects'
  | 'study_extras'
  | 'pc_activities'
  | 'posture_observation'
  | 'meal_details';

export interface FieldOption {
  id: string;
  label: string;
  description?: string;
}

export interface TemplateField {
  id: string;
  label: string; // e.g., 【疲労感】
  type: FieldType;
  options?: string[]; // e.g., ['あり', 'なし']
  defaultValue?: string;
  unit?: string; // e.g., '分', '本'
  hasNote?: boolean; // If true, adds a supplementary text input ( )
  noteVisibleWhen?: string | string[];
  notePlaceholder?: string;
  helpText?: string;
  required?: boolean;
  questionTitle?: string;
  warningText?: string;
  scaleLowLabel?: string;
  scaleHighLabel?: string;
  visibleWhen?: {
    fieldId: string;
    equals: string | string[];
  } | Array<{
    fieldId: string;
    equals: string | string[];
  }>;
  hiddenWhen?: {
    fieldId: string;
    equals: string | string[];
  } | Array<{
    fieldId: string;
    equals: string | string[];
  }>;
}

export interface TemplateSection {
  id: string;
  title: string; // e.g., '生活', '学習', 'PC', '活動'
  fields: TemplateField[];
  hasSubTitleField?: boolean; // e.g., 【宿題】 or 取組内容/活動名
  subTitleLabel?: string;
}

export type WizardQuestionId =
  | 'template'
  | 'children'
  | 'date'
  | 'recorder'
  | 'attendance'
  | 'expression'
  | 'snack'
  | 'abcBehavior'
  | 'abcConsequence'
  | 'abcAntecedent'
  | 'abcSummary';

export interface WizardQuestionConfig {
  title: string;
  help?: string;
  options?: string[];
  noteLabel?: string;
  notePlaceholder?: string;
}

export type WizardQuestions = Record<WizardQuestionId, WizardQuestionConfig>;

export interface Template {
  id: string;
  name: string; // e.g., '支援経過記録 (平日)', '支援経過記録 (休日)'
  isDefault?: boolean;
  type: '平日' | '休日' | 'カスタム';
  description?: string;
  sections: TemplateSection[];
  wizardQuestions?: Partial<WizardQuestions>;
}

export interface ChildProfile {
  id: string;
  name: string; // e.g. 田中 太郎
  kana?: string;
  birthDate?: string; // YYYY-MM-DD
  grade?: string; // e.g. 小学校3年生
  regularDays?: Weekday[];
  regularDaysEffectiveFrom?: string;
  regularDaySchedules?: RegularDaySchedule[];
  careType?: '児童発達支援' | '放課後等デイサービス';
  serviceSuspended?: boolean;
  transportProgram?: '小学部' | 'キャリアズ';
  transportationRequired?: boolean;
  schoolName?: string;
  schoolId?: string;
  /** Registered child IDs belonging to the same sibling/household group. */
  siblingIds?: string[];
  /** @deprecated Legacy free-text grouping. Use siblingIds for new edits. */
  siblingGroup?: string;
  transportSchedule?: ChildTransportSchedule[];
  pickupLocation?: string;
  dropoffLocation?: string;
  pickupArea?: string;
  dropoffArea?: string;
  transportLocations?: ChildTransportLocation[];
  notes?: string;
}

export interface ChildTransportSchedule {
  weekday: Weekday;
  schoolEndTime?: string;
  /** @deprecated 迎え基準時刻へ統合。既存データの読み取り互換用。 */
  pickupTime?: string;
  /** @deprecated 退所時刻は所属区分・利用形態と日別変更から決定する。 */
  dropoffTime?: string;
}

export type DailyAttendancePlan = '利用予定' | '追加利用' | '欠席';
export type DailyServiceCategory = '平日' | '休日';
export type DailyRecordFormat = '平日' | '休日';
export type DailyDayPattern = '通常' | '短縮授業' | '午前のみ' | '午後のみ' | '個別';

export interface DailyChildPlan {
  id: string;
  childId: string;
  date: string;
  attendancePlan: DailyAttendancePlan;
  serviceCategory: DailyServiceCategory;
  recordFormat: DailyRecordFormat;
  dayPattern: DailyDayPattern;
  hasMorningProgram: boolean;
  hasLunch: boolean;
  hasAfternoonProgram: boolean;
  hasSnack: boolean;
  schoolEndTime?: string;
  arrivalTime?: string;
  departureTime?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  organizationId: string;
  organizationName?: string;
  displayName: string;
  role: UserRole;
  email?: string;
  recorderProfileId?: string;
  loginMethod?: 'email' | 'staff_id';
  fieldModeOnly?: boolean;
  accessDeviceId?: string;
  accessDeviceKind?: 'personal' | 'facility_shared' | 'unmanaged';
}

export interface RecorderProfile {
  id: string;
  displayName: string;
  active: boolean;
  pinConfigured?: boolean;
  employeeCode?: string;
  jobTitle?: string;
  individualLoginEnabled?: boolean;
  menuPreferences?: RecorderMenuPreferences;
  createdAt?: string;
}

export type RecorderMenuItemId = 'home' | 'form' | 'records' | 'children' | 'templates' | 'team';

export interface RecorderMenuPreferences {
  order: RecorderMenuItemId[];
  hidden: RecorderMenuItemId[];
}

export type StaffScheduleCategory =
  | '送迎'
  | '支援'
  | '休憩'
  | '会議'
  | '事務'
  | '外出'
  | 'その他';

export interface StaffScheduleItem {
  id: string;
  recorderProfileId: string;
  recorderName: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  category: StaffScheduleCategory;
  location?: string;
  childIds: string[];
  note?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  sourceType?: 'manual' | 'calendar' | 'attendance' | 'transport';
  sourceId?: string;
  generated?: boolean;
}

export type CalendarEventType =
  | '通常利用'
  | '追加利用'
  | '欠席'
  | '勤務予定'
  | '会議'
  | '朝礼'
  | '研修'
  | '保護者面談'
  | '学校行事'
  | '事業所行事'
  | '送迎予定'
  | '提出期限'
  | 'その他';

export type CalendarVisibility = '全体' | '関係者のみ' | '管理者のみ';
export type CalendarRecurrence = 'なし' | '毎日' | '毎週' | '毎月';

export interface CalendarEvent {
  id: string;
  title: string;
  eventType: CalendarEventType;
  date: string;
  endDate?: string;
  allDay: boolean;
  startTime?: string;
  endTime?: string;
  location?: string;
  recorderProfileIds: string[];
  childIds: string[];
  note?: string;
  notificationEnabled: boolean;
  visibility: CalendarVisibility;
  color: string;
  recurrence: CalendarRecurrence;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type AttendanceStatus =
  | '勤務予定'
  | '出勤中'
  | '休憩中'
  | '退勤済み'
  | '遅刻'
  | '早退'
  | '欠勤'
  | '有給'
  | '公休'
  | '研修';

export interface AttendanceBreakPeriod {
  startedAt: string;
  endedAt?: string;
}

export interface AttendanceRecord {
  id: string;
  recorderProfileId: string;
  recorderName: string;
  date: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  status: AttendanceStatus;
  clockInAt?: string;
  clockOutAt?: string;
  breakPeriods: AttendanceBreakPeriod[];
  note?: string;
  deviceId?: string;
  lastActionByRecorderId?: string;
  createdAt: string;
  updatedAt: string;
}

export type AttendanceCorrectionStatus = '申請中' | '承認' | '却下';

export interface AttendanceCorrectionRequest {
  id: string;
  attendanceRecordId: string;
  recorderProfileId: string;
  recorderName: string;
  requestedClockInAt?: string;
  requestedClockOutAt?: string;
  reason: string;
  status: AttendanceCorrectionStatus;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceQrChallenge {
  token: string;
  expiresAt: string;
  refreshAfterSeconds: number;
  /** Server-synchronized issue time derived from the challenge expiry. */
  serverNow: string;
}

export interface Vehicle {
  id: string;
  name: string;
  registrationNumber?: string;
  capacity: number;
  wheelchairAccessible: boolean;
  inspectionDueDate?: string;
  vehicleKind?: 'facility' | 'reserve' | 'private';
  assignmentPriority?: number;
  autoAssignmentPolicy?: 'always' | 'when_needed' | 'manual_only';
  ownerRecorderProfileId?: string;
  insuranceDueDate?: string;
  available: boolean;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export type TransportPickupMode = 'school' | 'home' | 'custom';
export type TransportTimeMode = 'fixed' | 'arrival_backward' | 'departure_forward';
export type TransportPlanDayStatus = 'draft' | 'requirements_confirmed' | 'dispatch_draft' | 'dispatch_confirmed';

export interface TransportPlanDay {
  date: string;
  pickupMode: TransportPickupMode;
  targetArrivalTime: string;
  status: TransportPlanDayStatus;
  revision: number;
  note?: string;
  confirmedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyTransportRequirement {
  id: string;
  childId: string;
  date: string;
  pickupEnabled: boolean;
  dropoffEnabled: boolean;
  pickupPattern: TransportPickupMode;
  pickupLocationProfileId?: string;
  pickupLocationName?: string;
  pickupAddress?: string;
  pickupArea?: string;
  pickupTimeMode: TransportTimeMode;
  pickupTargetTime?: string;
  dropoffLocationProfileId?: string;
  dropoffLocationName?: string;
  dropoffAddress?: string;
  dropoffArea?: string;
  dropoffTimeMode: TransportTimeMode;
  dropoffTargetTime?: string;
  stopDurationMinutes: number;
  keepSiblingsTogether: boolean;
  source: 'baseline' | 'manual' | 'assistant';
  status: 'draft' | 'confirmed';
  revision: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export type TransportDirection = '迎え' | '送り';
export type TransportRunStatus =
  | '未出発'
  | '出発済み'
  | '乗車済み'
  | '事業所到着'
  | '降車済み'
  | '帰着';

export interface TransportStop {
  id: string;
  childId?: string;
  childName?: string;
  siblingGroup?: string;
  locationProfileId?: string;
  locationName?: string;
  locationType: TransportLocationType;
  location: string;
  /** Exact map pin (lat,lng) used for navigation when available. */
  navigationLocation?: string;
  timeMode?: TransportTimeMode;
  timeAnchorTime?: string;
  plannedTime?: string;
  area?: string;
  stopDurationMinutes?: number;
  sequenceLocked?: boolean;
  order: number;
  note?: string;
}

export interface TransportRun {
  id: string;
  date: string;
  name: string;
  direction: TransportDirection;
  startTime: string;
  endTime: string;
  driverRecorderProfileId?: string;
  driverName?: string;
  assistantRecorderProfileIds: string[];
  vehicleId?: string;
  vehicleName?: string;
  stops: TransportStop[];
  guardianNote?: string;
  operationNote?: string;
  routeOrigin?: string;
  routeDestination?: string;
  routeOptimizedAt?: string;
  status: TransportRunStatus;
  statusUpdatedAt?: string;
  statusUpdatedByRecorderId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransportAssignmentChangeInput {
  runId: string;
  actorRecorderProfileId: string;
  actorPin: string;
  driverRecorderProfileId?: string;
  assistantRecorderProfileIds: string[];
  reason: string;
}

export type TransportFieldAction =
  | 'departed'
  | 'arrived'
  | 'boarded'
  | 'dropped_off'
  | 'facility_arrived'
  | 'returned'
  | 'delay'
  | 'help_requested';

export interface TransportFieldEvent {
  id: string;
  eventType: TransportFieldAction;
  eventAt: string;
  recorderProfileId: string;
  recorderName?: string;
  cancelledAt?: string;
}

export interface TransportFieldStop extends TransportStop {
  events: TransportFieldEvent[];
}

export interface TransportFieldRun {
  id: string;
  date: string;
  name: string;
  direction: TransportDirection;
  startTime: string;
  endTime: string;
  driverRecorderProfileId?: string;
  driverName?: string;
  assistantRecorderProfileIds: string[];
  assistantNames: string[];
  vehicleId?: string;
  vehicleName?: string;
  status: TransportRunStatus;
  statusUpdatedAt?: string;
  passengerCount: number;
  isAssigned: boolean;
  isCovering: boolean;
  hasHelpRequest: boolean;
  hasDelay: boolean;
  stops: TransportFieldStop[];
  runEvents: TransportFieldEvent[];
}

export interface TransportFieldDashboard {
  serviceDate: string;
  recorderProfileId: string;
  myRuns: TransportFieldRun[];
  allRuns: TransportFieldRun[];
}

export interface TransportRouteSettings {
  facilityAddress: string;
  stopDurationMinutes: number;
  sameLocationTimeWindowMinutes: number;
  facilityPinColor: string;
  residentialPinColor: string;
  educationPinColor: string;
  otherPinColor: string;
  holidayOpeningTime: string;
  holidayArrivalTime: string;
  weekdayElementaryDepartureTime: string;
  weekdayCareersDepartureTime: string;
  holidayDepartureTime: string;
  schoolWaitToleranceMinutes: number;
  minimumFacilityStaff: number;
  avoidTolls: boolean;
  avoidHighways: boolean;
  updatedAt?: string;
}

export const DEFAULT_TRANSPORT_ROUTE_SETTINGS: TransportRouteSettings = {
  facilityAddress: '',
  stopDurationMinutes: 5,
  sameLocationTimeWindowMinutes: 15,
  facilityPinColor: '#7c3aed',
  residentialPinColor: '#059669',
  educationPinColor: '#0284c7',
  otherPinColor: '#d97706',
  holidayOpeningTime: '09:00',
  holidayArrivalTime: '10:00',
  weekdayElementaryDepartureTime: '17:45',
  weekdayCareersDepartureTime: '19:20',
  holidayDepartureTime: '16:00',
  schoolWaitToleranceMinutes: 10,
  minimumFacilityStaff: 2,
  avoidTolls: false,
  avoidHighways: false,
};

export interface TransportRouteLeg {
  fromLabel: string;
  toLabel: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface TransportRouteOptimizationResult {
  provider: 'google_routes';
  optimizedStopIds: string[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  legs: TransportRouteLeg[];
  encodedPolyline?: string;
  trafficApplied?: boolean;
  departureTimeUsed?: string;
  warnings: string[];
}

export interface TransportRouteOptimizationRequest {
  transportRunId: string;
  serviceDate: string;
  departureTime: string;
  origin: string;
  destination: string;
  stops: Array<{ id: string; label: string; location: string }>;
  avoidTolls: boolean;
  avoidHighways: boolean;
  /** Keep the manually arranged stop order and calculate times only. */
  preserveOrder?: boolean;
}

export interface TransportMatrixLocation {
  id: string;
  label: string;
  address: string;
}

export interface TransportMatrixEntry {
  fromId: string;
  toId: string;
  distanceMeters: number;
  durationSeconds: number;
  reachable: boolean;
}

export interface TransportMatrixResult {
  provider: 'google_route_matrix';
  locations: TransportMatrixLocation[];
  entries: TransportMatrixEntry[];
  warnings: string[];
}

export interface TransportMatrixRequest {
  locations: TransportMatrixLocation[];
  avoidTolls: boolean;
  avoidHighways: boolean;
}

export interface RecordDraftSummary {
  draftKey: string;
  revision: number;
  userId?: string;
  deviceId?: string;
  recorderId?: string;
  recorderName?: string;
  selectedChildIds: string[];
  selectedTemplateId?: string;
  takenOverFromDraftKeys?: string[];
  takenOverAt?: string;
  date?: string;
  currentStepIndex: number;
  updatedAt: string;
}

export interface ReviewIssue {
  id: string;
  label: string;
  comment: string;
  stepId?: string;
  resolved: boolean;
  createdAt: string;
}

export interface RecordRevision {
  id: string;
  recordId: string;
  version: number;
  changedAt: string;
  changedBy?: string;
  snapshot: Record<string, unknown>;
}

export type HandoverCategory = '申し送り' | '保護者連絡' | 'けが・事故' | '次回確認' | 'その他';
export type HandoverPriority = '通常' | '重要' | '緊急';
export type HandoverStatus = '未対応' | '対応中' | '完了';

export interface HandoverItem {
  id: string;
  childId?: string;
  transportRunId?: string;
  category: HandoverCategory;
  content: string;
  priority: HandoverPriority;
  status: HandoverStatus;
  dueDate?: string;
  assignee?: string;
  createdByRecorderId?: string;
  createdByRecorderName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConfirmationReceipt {
  confirmerKey: string;
  recorderProfileId?: string;
  userId?: string;
  confirmerName: string;
  confirmedAt: string;
}

export interface HandoverConfirmation extends ConfirmationReceipt {
  handoverItemId: string;
}

export interface MorningMeetingRecord {
  date: string;
  content: string;
  updatedByName?: string;
  updatedByRecorderId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MorningMeetingTemplate {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface MorningMeetingConfirmation extends ConfirmationReceipt {
  date: string;
}

export interface SupportPlan {
  id: string;
  childId: string;
  title: string;
  longTermGoal: string;
  shortTermGoal: string;
  domainGoals: Partial<Record<FiveDomain, string>>;
  validFrom: string;
  validTo?: string;
  status: '下書き' | '有効' | '終了';
  createdAt: string;
  updatedAt: string;
}

export interface GoalProgress {
  domain: FiveDomain;
  status: GoalProgressStatus;
  note?: string;
}

export interface FieldAnswer {
  fieldId: string;
  fieldLabel: string;
  value: string;
  note?: string;
}

export interface HomeworkFieldDetails {
  subjects: string[];
  materials: Record<string, string[]>;
  notes: Record<string, string>;
}

export interface SectionFieldAnswer {
  value: string;
  note?: string;
  homeworkDetails?: HomeworkFieldDetails;
  nestedDetails?: Record<string, string | string[]>;
}

export interface SectionAnswer {
  sectionId: string;
  sectionTitle: string;
  subTitleValue?: string; // e.g. 宿題の内容、PCの取組内容、活動名
  answers: Record<string, SectionFieldAnswer>;
  detailText?: string; // 【様子】/ 【特記】 free text
  abcAnalysis?: ABCAnalysis;
}

export interface ABCAnalysis {
  inputMode?: 'abc' | 'free';
  behavior: string;
  consequence: string;
  antecedent: string;
  summary?: string;
  freeText?: string;
}

export type AnnouncementPriority = 'normal' | 'important' | 'urgent';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  sourceType?: 'manual' | 'record_correction';
  relatedRecordId?: string;
  publishedAt: string;
  expiresAt?: string;
  createdByRecorderId?: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementConfirmation {
  announcementId: string;
  confirmerKey: string;
  recorderProfileId?: string;
  userId?: string;
  confirmerName: string;
  readAt: string;
  confirmedAt?: string;
}

export type AiTone = 'assertive' | 'polite' | 'custom';

export interface AiWritingSettings {
  tone: AiTone;
  customTone: string;
  customInstructions: string;
  targetLength: number;
}

export interface MonthlyScheduleDeleteResult {
  dailyPlanCount: number;
  requirementCount: number;
  affectedDateCount: number;
}

export const DEFAULT_AI_WRITING_SETTINGS: AiWritingSettings = {
  tone: 'assertive',
  customTone: '',
  customInstructions: '客観的な事実を中心に、支援者の関わりと児童の反応が分かる文章にする。',
  targetLength: 180,
};

export interface SupportRecord {
  id: string;
  templateId: string;
  templateName: string;
  templateType: '平日' | '休日' | 'カスタム';
  templateSectionsSnapshot?: TemplateSection[];
  childId: string;
  childName: string;
  date: string; // YYYY-MM-DD
  attendance: AttendanceType | '';
  attendanceNote?: string;
  expressions: ExpressionType[];
  expressionNote?: string;
  snack: SnackType | '';
  snackNote?: string;
  recorderId?: string;
  recorderName: string; // 記録者

  // Service delivery details
  serviceStartTime?: string;
  serviceEndTime?: string;
  transportation?: '送迎なし' | '迎えのみ' | '送りのみ' | '往復';

  // Link to the individual support plan and the five development domains
  supportPlanId?: string;
  fiveDomains?: FiveDomain[];
  goalProgress?: GoalProgress[];
  
  // Section responses
  sectionAnswers: Record<string, SectionAnswer>;
  skippedQuestionIds?: string[];
  
  // Synthesized AI / Rule-based summary for Jihatsukan
  synthesizedSummary?: string;
  
  // Jihatsukan Review
  approvalStatus: ApprovalStatus;
  jihatsukanComment?: string;
  reviewIssues?: ReviewIssue[];
  reviewedBy?: string;
  reviewedAt?: string;
  version?: number;
  
  createdAt: string;
  updatedAt: string;
}
