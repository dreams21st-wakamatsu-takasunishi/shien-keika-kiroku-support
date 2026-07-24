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

export type HomeAssistantActionType =
  | 'schedule_regular_days'
  | 'update_child_profile'
  | 'update_child_notes'
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
}

export interface HomeAssistantExecutionResult {
  message: string;
  schedule?: RegularDaySchedule;
  updatedChild?: Partial<ChildProfile>;
  output?: string;
  clientAction?: {
    type: 'start_support_record' | 'open_child_records';
    childId: string;
    date?: string;
  };
}

export type FieldType = 'radio' | 'checkbox' | 'text' | 'number' | 'textarea' | 'time_select' | 'hand_count';

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
  notePlaceholder?: string;
  helpText?: string;
  required?: boolean;
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
  notes?: string;
}

export interface UserProfile {
  id: string;
  organizationId: string;
  organizationName?: string;
  displayName: string;
  role: UserRole;
  email?: string;
}

export interface RecorderProfile {
  id: string;
  displayName: string;
  active: boolean;
  createdAt?: string;
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

export interface SectionAnswer {
  sectionId: string;
  sectionTitle: string;
  subTitleValue?: string; // e.g. 宿題の内容、PCの取組内容、活動名
  answers: Record<string, { value: string; note?: string }>;
  detailText?: string; // 【様子】/ 【特記】 free text
  abcAnalysis?: ABCAnalysis;
}

export interface ABCAnalysis {
  behavior: string;
  consequence: string;
  antecedent: string;
  summary?: string;
}

export type AiTone = 'assertive' | 'polite' | 'custom';

export interface AiWritingSettings {
  tone: AiTone;
  customTone: string;
  customInstructions: string;
  targetLength: number;
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
  reviewedBy?: string;
  reviewedAt?: string;
  
  createdAt: string;
  updatedAt: string;
}
