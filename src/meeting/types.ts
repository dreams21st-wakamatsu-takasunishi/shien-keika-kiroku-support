export type MeetingStatus = '準備中' | '開催中' | '文字起こし待ち' | '照合中' | '結果確認済み' | '中止';
export type MeetingType = '担当者会議' | '保護者面談' | 'ケース会議' | 'その他';
export type AgendaStatus = '未確認' | '確認済み' | '保留';
export type ProgressStatus = '下書き' | '未確認' | '要修正' | '確認済み';

export interface MeetingParticipant {
  id: string;
  name: string;
  reading: string;
  organization: string;
  role: string;
  calledAs: string;
  attended: boolean;
}

export interface MeetingTerm {
  id: string;
  spelling: string;
  reading: string;
  hint: string;
  includeInTiro: boolean;
}

export interface MeetingAgenda {
  id: string;
  title: string;
  question: string;
  status: AgendaStatus;
  memo: string;
  decision: string;
  owner: string;
  dueDate: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface MeetingOutcome {
  childWish: string;
  familyWish: string;
  reports: string;
  agreements: string;
  pending: string;
  nextActions: string;
}

export interface MeetingContent {
  purpose: string;
  location: string;
  participants: MeetingParticipant[];
  terms: MeetingTerm[];
  agenda: MeetingAgenda[];
  outcome: MeetingOutcome;
  recordingExplainedAt?: string;
  recordingExplainedBy?: string;
  recordingChecked: boolean;
  exportedAt?: string;
}

export interface MeetingCase {
  id: string;
  organizationId: string;
  childId: string;
  calendarEventId?: string;
  title: string;
  meetingType: MeetingType;
  meetingDate: string;
  status: MeetingStatus;
  content: MeetingContent;
  editorUserIds: string[];
  revision: number;
  createdBy: string;
  updatedAt: string;
}

export interface MeetingTranscript {
  id: string;
  meetingId: string;
  version: number;
  sourceKind: 'スクリプト' | '要約のみ';
  sourceName?: string;
  rawText: string;
  correctedText?: string;
  importedAt: string;
}

export interface MeetingProgressRecord {
  id: string;
  meetingId: string;
  childId: string;
  recordDate: string;
  body: string;
  approvalStatus: ProgressStatus;
  reviewComment?: string;
  createdBy: string;
  revision: number;
  updatedAt: string;
}

export const emptyOutcome = (): MeetingOutcome => ({
  childWish: '', familyWish: '', reports: '', agreements: '', pending: '', nextActions: '',
});

export const emptyMeetingContent = (): MeetingContent => ({
  purpose: '', location: '', participants: [], terms: [], agenda: [], outcome: emptyOutcome(),
  recordingChecked: false,
});
