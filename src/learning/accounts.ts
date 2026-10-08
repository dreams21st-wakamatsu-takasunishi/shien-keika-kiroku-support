import { parseIdentity, type LessonIdentity, type LessonLink } from './contracts.ts';
export type LessonAccountStatus = 'ready' | 'missing' | 'email-only' | 'review' | 'disabled' | 'unconfigured';
export interface LessonAccountCheck {
  schemaVersion: 1; childId: string; linkId: string; identity: LessonIdentity;
  account: { status: LessonAccountStatus; authCount: number; loginNumber: string | null };
  card: { loginNumber: string; loginUrl: string; verified: true } | null;
  checkedAt: string; expiresAt: string | null;
}
export interface LessonAccountAudit { id: string; action: 'inspect' | 'verify-card'; outcome: 'started' | 'checked' | 'verified' | 'denied' | 'failed'; at: string }
const fail = () => { throw Error('学習アカウントの確認結果を照合できません。再取得してください。'); };
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail();
export const isAccountTimestamp = (value: unknown): value is string => typeof value === 'string' && value.length <= 50 && Number.isFinite(Date.parse(value));
type Link = Pick<LessonLink, 'id' | 'child_id' | 'source_project_ref' | 'source_table' | 'source_student_id' | 'source_campus_id'>;
export function parseAccountCheck(value: unknown, link: Link): Omit<LessonAccountCheck, 'checkedAt' | 'expiresAt'> {
  const payload = object(value), account = object(payload.account);
  const identity = parseIdentity(payload.identity, link.source_project_ref);
  if (payload.schemaVersion !== 1 || payload.childId !== link.child_id || payload.linkId !== link.id
    || identity.studentId !== link.source_student_id || identity.dataTable !== link.source_table || identity.campusId !== link.source_campus_id
    || !['ready', 'missing', 'email-only', 'review', 'disabled', 'unconfigured'].includes(String(account.status))
    || typeof account.authCount !== 'number' || !Number.isInteger(account.authCount) || account.authCount < 0 || account.authCount > 10
    || (account.loginNumber !== null && (typeof account.loginNumber !== 'string' || !/^\d{1,3}$/.test(account.loginNumber)))
    || (account.status === 'ready' && (account.authCount < 1 || account.loginNumber === null))) return fail();
  let card: LessonAccountCheck['card'] = null;
  if (payload.card !== null) {
    const source = object(payload.card);
    if (account.status !== 'ready' || source.verified !== true || typeof source.loginNumber !== 'string' || source.loginNumber !== account.loginNumber
      || typeof source.loginUrl !== 'string' || source.loginUrl.length > 300) return fail();
    const url = new URL(source.loginUrl);
    if (url.origin !== 'https://dreams21st-wakamatsu-takasunishi.github.io' || url.pathname !== '/d-lesson-v4/' || url.hash || url.username || url.password
      || [...url.searchParams].some(([key, value]) => key !== 'campus' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) || [...url.searchParams].length > 1) return fail();
    card = { verified: true, loginNumber: source.loginNumber, loginUrl: url.href };
  }
  return { schemaVersion: 1, childId: link.child_id, linkId: link.id, identity,
    account: { status: account.status as LessonAccountStatus, authCount: account.authCount, loginNumber: account.loginNumber as string | null }, card };
}
export function parseTimedAccountCheck(value: unknown, link: Link): LessonAccountCheck {
  const parsed = parseAccountCheck(value, link), source = object(value);
  if (!isAccountTimestamp(source.checkedAt) || (parsed.card ? !isAccountTimestamp(source.expiresAt)
    || Date.parse(source.expiresAt) <= Date.parse(source.checkedAt) || Date.parse(source.expiresAt) - Date.parse(source.checkedAt) > 600000 : source.expiresAt !== null)) return fail();
  return { ...parsed, checkedAt: source.checkedAt, expiresAt: source.expiresAt as string | null };
}
export function parseAccountAudits(value: unknown): LessonAccountAudit[] {
  if (!Array.isArray(value) || value.length > 10) return fail();
  return value.map(item => {
    const row = object(item);
    if (typeof row.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(row.id) || !['inspect', 'verify-card'].includes(String(row.action))
      || !['started', 'checked', 'verified', 'denied', 'failed'].includes(String(row.outcome)) || !isAccountTimestamp(row.at)) return fail();
    return { id: row.id, action: row.action as LessonAccountAudit['action'], outcome: row.outcome as LessonAccountAudit['outcome'], at: row.at };
  });
}
