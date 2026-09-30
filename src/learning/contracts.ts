export interface LessonIdentity {
  sourceProjectRef: string;
  dataTable: 'user_data' | 'test_user_data';
  studentId: string;
  campusId: string;
  displayName: string;
  birthDate: string;
}
export interface LessonLink {
  id: string; organization_id: string; child_id: string; source_project_ref: string;
  source_table: string; source_student_id: string; source_campus_id: string;
  source_display_name: string; active: boolean; revision: number; verified_at: string;
}
export interface LessonEvent {
  id: string; at: string; category: string; title: string; detail: string; amount: string;
}
export interface LessonHistory {
  schemaVersion: 1; identity: LessonIdentity; date: string; events: LessonEvent[];
  historyComplete: false; historyNotice: string; fetchedAt: string;
}
export const isStudentId = (value: unknown): value is string => typeof value === 'string' && /^student_[A-Za-z0-9_-]{1,140}$/.test(value);
export const isServiceDate = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z'))
  && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;

export function parseIdentity(value: unknown, expectedProject: string): LessonIdentity {
  const identity = value as Partial<LessonIdentity> | null;
  if (!identity || identity.sourceProjectRef !== expectedProject || !/^[a-z0-9]{20}$/.test(expectedProject)
    || !['user_data', 'test_user_data'].includes(identity.dataTable || '') || !isStudentId(identity.studentId)
    || typeof identity.campusId !== 'string' || !identity.campusId || identity.campusId === 'public' || identity.campusId.length > 80
    || typeof identity.displayName !== 'string' || !identity.displayName.trim() || identity.displayName.length > 160
    || typeof identity.birthDate !== 'string' || (identity.birthDate !== '' && !isServiceDate(identity.birthDate))) {
    throw new Error('学習側の本人情報を確認できません。連携設定を確認してください。');
  }
  return { sourceProjectRef: identity.sourceProjectRef, dataTable: identity.dataTable!, studentId: identity.studentId,
    campusId: identity.campusId, displayName: identity.displayName, birthDate: identity.birthDate };
}

export async function identityFingerprint(identity: LessonIdentity): Promise<string> {
  const data = JSON.stringify([identity.sourceProjectRef, identity.dataTable, identity.studentId, identity.campusId, identity.displayName, identity.birthDate]);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function parseHistory(value: unknown, link: Pick<LessonLink, 'source_project_ref' | 'source_table' | 'source_student_id' | 'source_campus_id'>, date: string): Omit<LessonHistory, 'fetchedAt'> {
  const history = value as Partial<LessonHistory> | null;
  if (!history || history.schemaVersion !== 1 || history.date !== date || !isServiceDate(date)
    || history.historyComplete !== false || !Array.isArray(history.events) || history.events.length > 2000) {
    throw new Error('学習履歴の取得結果を確認できません。');
  }
  const identity = parseIdentity(history.identity, link.source_project_ref);
  if (identity.studentId !== link.source_student_id || identity.campusId !== link.source_campus_id || identity.dataTable !== link.source_table) {
    throw new Error('学習アカウントの所属が変わっています。連携を確認してください。');
  }
  const seen = new Set<string>();
  const events = history.events.map(event => {
    if (!event || typeof event.id !== 'string' || !event.id || event.id.length > 200 || seen.has(event.id)
      || typeof event.at !== 'string' || !Number.isFinite(Date.parse(event.at))
      || new Date(Date.parse(event.at) + 9 * 3600000).toISOString().slice(0, 10) !== date
      || typeof event.category !== 'string' || event.category.length > 40
      || typeof event.title !== 'string' || event.title.length > 160
      || typeof event.detail !== 'string' || event.detail.length > 240
      || typeof event.amount !== 'string' || event.amount.length > 160) throw new Error('学習履歴の形式を確認できません。');
    seen.add(event.id);
    return { id: event.id, at: event.at, category: event.category, title: event.title, detail: event.detail, amount: event.amount };
  });
  return { schemaVersion: 1, identity, date, events, historyComplete: false,
    historyNotice: '保存されている履歴のみです。実績がない場合も未実施とは判断できません。' };
}
