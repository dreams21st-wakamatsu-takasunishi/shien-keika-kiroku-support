export type ManualCategory = 
  | 'emergency'          // 緊急・危機管理
  | 'daily'              // 日常業務・療育
  | 'vehicle'            // 送迎・車内安全
  | 'medical'            // アレルギー・医療的ケア
  | 'abuse_prevention'   // 権利擁護・虐待防止
  | 'compliance'         // 法令順守・運営指導
  | 'visiting_support'   // 保育所等訪問・学校連携
  | 'bcp_infection'      // 感染症・BCP
  | string;              // カスタム追加カテゴリー

export type ManualSeverity = 'critical' | 'warning' | 'normal' | string;

export interface CategoryOption {
  id: string;
  label: string;
  icon?: string;
}

export interface MasterOptions {
  categories: CategoryOption[];
  roles: string[];
  quickLocations: string[];
  incidentTypes: string[];
  incidentStatuses: string[];
  supportCategories: string[];
  childDevTraits: string[];
}

export interface ChecklistItem {
  id: string;
  text: string;
}

export interface EmergencyContact {
  name: string;
  phone: string;
  note: string;
}

export interface Manual {
  id: string;
  title: string;
  category: ManualCategory;
  categoryLabel: string;
  severity: ManualSeverity;
  summary: string;
  updatedAt: string;
  estimatedMinutes: number;
  targetRoles: string[];
  steps: string[];
  checklist: ChecklistItem[];
  emergencyContacts?: EmergencyContact[];
  keyPoints: string[];
  version: string;
  pdfUrl?: string;
  pdfFileName?: string;
  isStatutoryMandatory?: boolean; // 令和6年度改訂等による法令作成義務化フラグ
}

export type StaffRole = 
  | '管理者'
  | '児童発達支援管理責任者'
  | '教室長'
  | '教室長補佐'
  | '児童指導員'
  | '訪問支援員'
  | '保育士'
  | '送迎ドライバー'
  | '看護師・医療スタッフ'
  | string;

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  avatar: string;
  readManualIds: string[];
  lastReadAt?: string;
  employeeCode: string;
}

export interface ReadSignature {
  id: string;
  manualId: string;
  staffId: string;
  staffName: string;
  signedAt: string;
  understandingConfirmed: boolean;
  notes?: string;
}

export interface IncidentReport {
  id: string;
  date: string;
  title: string;
  type: 'ヒヤリハット' | '軽微な事故' | '保護者連絡';
  relatedManualId?: string;
  relatedManualTitle?: string;
  reporterName: string;
  description: string;
  actionTaken: string;
  preventionPlan: string;
  status: '未確認' | '確認済み' | '対策済';
}

export interface FacilityConfig {
  facilityName: string;
  facilityAddress: string;
  emergencyEvacuationSite: string;
  managerName: string;
  mainPhone: string;
  policePhone: string;
  firePhone: string;
  designatedHospital: string;
  epipenStorageLocation: string;
  aedLocation: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  sources?: string[];
  timestamp: string;
  isError?: boolean;
}

export type EmergencySOSPattern = 
  | 'runaway'     // 🏃 飛び出し・行方不明（10分ルール）
  | 'epipen'      // 💉 アナフィラキシー / エピペン要領
  | 'car'         // 🚗 送迎車トラブル / 置きざり疑い
  | 'panic'       // ⚡ パニック・他害・自傷
  | 'disaster'    // 🦺 地震・火災・避難誘導
  | 'other';      // 🆘 その他緊急事態

export interface SupportPhraseItem {
  id: string;
  title: string;
  category: string;
  trait: string;
  situation: string;
  ngPhrase: string;
  ngReason: string;
  okPhrase: string;
  visualAid: string;
  supportTip: string;
  sampleDialog: string;
}

export interface ChildSupportDetail {
  id: string;
  name: string;
  grade: string;
  schoolName: string;
  traits: string;
  supportFocus: string;
  phrases: SupportPhraseItem[];
}

export interface EmergencyAlert {
  id: string;
  senderStaffId: string;
  senderStaffName: string;
  senderRole: string;
  pattern: EmergencySOSPattern;
  patternLabel: string;
  patternIcon: string;
  location: string;
  description: string;
  createdAt: string;
  targetStaffIds: string[]; // 全登録職員のID
  readByStaffIds: string[]; // 確認・既読の職員ID
  status: 'active' | 'resolved';
  resolvedAt?: string;
  resolvedByStaffName?: string;
  actionGuideSummary: string;
}

