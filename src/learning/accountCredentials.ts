import { parseAccountCheck, isAccountTimestamp, type LessonAccountCheck } from './accounts.ts';
import type { LessonLink } from './contracts.ts';
export type CredentialAction = 'issue' | 'reset';
export type CredentialOperation = { id: string; action: CredentialAction; status: 'requested' | 'completed' | 'denied'; at: string; finishedAt: string | null; canResume: boolean };
export type CredentialResult = LessonAccountCheck & { operationId: string; action: CredentialAction; passcode: string };
export const credentialUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fail = () => { throw Error('発行結果を照合できません。同じ操作を再確認してください。'); };
export function parseCredentialResult(value: unknown, link: LessonLink, operationId: string, action: CredentialAction, timed = true): CredentialResult {
  if (!value || typeof value !== 'object') return fail();
  const raw = value as Record<string, unknown>, card = raw.card as Record<string, unknown> | null;
  const parsed = parseAccountCheck(raw, link);
  if (!credentialUuid(operationId) || raw.operationId !== operationId || raw.action !== action || !parsed.card || parsed.account.authCount !== 1
    || typeof card?.passcode !== 'string' || !/^\d{10}$/.test(card.passcode)) return fail();
  if (timed && (!isAccountTimestamp(raw.checkedAt) || !isAccountTimestamp(raw.expiresAt)
    || Date.parse(raw.expiresAt) <= Date.parse(raw.checkedAt) || Date.parse(raw.expiresAt) - Date.parse(raw.checkedAt) > 600000)) return fail();
  return { ...parsed, operationId, action, passcode: card.passcode, checkedAt: timed ? raw.checkedAt as string : '', expiresAt: timed ? raw.expiresAt as string : null };
}
export function parseCredentialOperations(value: unknown): CredentialOperation[] {
  if (!Array.isArray(value) || value.length > 20) return fail();
  return value.map(row => {
    if (!row || !credentialUuid(row.id) || !['issue', 'reset'].includes(row.action) || !['requested', 'completed', 'denied'].includes(row.status)
      || !isAccountTimestamp(row.at) || (row.finishedAt !== null && !isAccountTimestamp(row.finishedAt)) || typeof row.canResume !== 'boolean'
      || (row.status === 'denied' && row.canResume)) return fail();
    return { id: row.id, action: row.action, status: row.status, at: row.at, finishedAt: row.finishedAt, canResume: row.canResume };
  });
}
