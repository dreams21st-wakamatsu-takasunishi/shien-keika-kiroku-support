export type AttendanceType = '出席' | '欠席' | '遅刻' | '早退' | 'その他';
export type ExpressionType = '笑顔' | '真顔' | '暗め' | '泣き顔' | '不機嫌' | 'その他';
export type SnackType = '完食' | '半量食べた' | '残した' | '不食' | 'なし';
export type ApprovalStatus = '未確認' | '確認済み' | '要修正';
export type UserRole = 'staff' | 'manager' | 'admin';
export type FiveDomain =
  | '健康・生活'
  | '運動・感覚'
  | '認知・行動'
  | '言語・コミュニケーション'
  | '人間関係・社会性';
export type GoalProgressStatus = '未評価' | '達成' | '一部達成' | '継続支援';

export type FieldType = 'radio' | 'checkbox' | 'text' | 'number' | 'textarea' | 'time_select';

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
  required?: boolean;
}

export interface TemplateSection {
  id: string;
  title: string; // e.g., '生活', '学習', 'PC', '活動'
  fields: TemplateField[];
  hasSubTitleField?: boolean; // e.g., 【宿題】 or 取組内容/活動名
  subTitleLabel?: string;
}

export interface Template {
  id: string;
  name: string; // e.g., '支援経過記録 (平日)', '支援経過記録 (休日)'
  isDefault?: boolean;
  type: '平日' | '休日' | 'カスタム';
  description?: string;
  sections: TemplateSection[];
}

export interface ChildProfile {
  id: string;
  name: string; // e.g. 田中 太郎
  kana?: string;
  grade?: string; // e.g. 小学校3年生
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
}

export interface SupportRecord {
  id: string;
  templateId: string;
  templateName: string;
  templateType: '平日' | '休日' | 'カスタム';
  templateSectionsSnapshot?: TemplateSection[];
  childId: string;
  childName: string;
  date: string; // YYYY-MM-DD
  attendance: AttendanceType;
  expression: ExpressionType;
  snack: SnackType;
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
