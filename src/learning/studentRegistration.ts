import { isServiceDate, parseIdentity, type LessonLink } from './contracts.ts';
import { credentialUuid, parseCredentialResult, type CredentialResult } from './accountCredentials.ts';
import { isAccountTimestamp } from './accounts.ts';
export type RegistrationPhase = 'requested' | 'source-created' | 'linked' | 'completed' | 'denied';
export type RegistrationOperation = { id: string; campusId: string; phase: RegistrationPhase; at: string; canResume: boolean };
export type RegistrationConfig = { sourceProject: string; fingerprint: string; name: string; birthDate: string; allowNew: boolean; campuses: { id: string; name: string }[]; operations: RegistrationOperation[] };
const fail = () => { throw Error('新規登録の応答を照合できません。同じ操作を再確認してください。'); };
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail();
const campusId = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value) && value !== 'public';
export async function registrationFingerprint(childId: string, name: string, birthDate: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([childId, name, birthDate])));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function parseRegistrationConfig(value: unknown): RegistrationConfig {
  const raw = object(value);
  if (typeof raw.sourceProject !== 'string' || !/^[a-z0-9]{20}$/.test(raw.sourceProject) || typeof raw.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(raw.fingerprint) || typeof raw.name !== 'string' || !raw.name || raw.name.length > 160
    || typeof raw.birthDate !== 'string' || (raw.birthDate !== '' && !isServiceDate(raw.birthDate)) || typeof raw.allowNew !== 'boolean'
    || !Array.isArray(raw.campuses) || raw.campuses.length > 100 || !Array.isArray(raw.operations) || raw.operations.length > 20) return fail();
  const seen = new Set<string>();
  const campuses = raw.campuses.map(item => { const row = object(item); if (!campusId(row.id) || seen.has(row.id as string) || typeof row.name !== 'string' || !row.name || row.name.length > 160) return fail(); seen.add(row.id as string); return { id: row.id as string, name: row.name }; });
  const operations = raw.operations.map(item => { const row = object(item);
    if (!credentialUuid(row.id) || !campusId(row.campusId) || !['requested', 'source-created', 'linked', 'completed', 'denied'].includes(String(row.phase))
      || !isAccountTimestamp(row.at) || typeof row.canResume !== 'boolean' || (row.phase === 'denied' && row.canResume)) return fail();
    return { id: row.id, campusId: row.campusId as string, phase: row.phase as RegistrationPhase, at: row.at, canResume: row.canResume };
  });
  if (raw.allowNew && operations.some(row => row.phase !== 'denied')) return fail();
  return { sourceProject: raw.sourceProject, fingerprint: raw.fingerprint, name: raw.name, birthDate: raw.birthDate, allowNew: raw.allowNew, campuses, operations };
}
export function parsePreparedRegistration(value: unknown, expected: { operationId: string; childId: string; linkId: string; studentId: string; campusId: string; sourceProject: string; name: string; birthDate: string }) {
  const raw = object(value), identity = parseIdentity(raw.identity, expected.sourceProject);
  if (raw.schemaVersion !== 1 || raw.operationId !== expected.operationId || raw.childId !== expected.childId || raw.linkId !== expected.linkId
    || identity.studentId !== expected.studentId || identity.campusId !== expected.campusId || identity.displayName !== expected.name || identity.birthDate !== expected.birthDate
    || typeof raw.loginNumber !== 'string' || !/^\d{1,2}$/.test(raw.loginNumber) || Number(raw.loginNumber) < 1 || Number(raw.loginNumber) > 50) return fail();
  return { identity, loginNumber: raw.loginNumber };
}
export function parseRegistrationResult(value: unknown, childId: string, operationId: string, expected: { sourceProject: string; campusId: string; name: string; birthDate: string }): { link: LessonLink; credentials: CredentialResult } {
  const raw = object(value), item = object(raw.link);
  if (!credentialUuid(operationId) || item.id !== operationId || item.child_id !== childId || item.source_student_id !== `student_support_${operationId.replaceAll('-', '')}`
    || item.active !== true || item.revision !== 1 || !credentialUuid(item.organization_id) || typeof item.source_display_name !== 'string'
    || !isAccountTimestamp(item.verified_at)) return fail();
  const identity = parseIdentity({ sourceProjectRef: item.source_project_ref, dataTable: item.source_table, studentId: item.source_student_id, campusId: item.source_campus_id, displayName: item.source_display_name, birthDate: '' }, expected.sourceProject);
  if (identity.campusId !== expected.campusId || identity.displayName !== expected.name) return fail();
  const link: LessonLink = { id: operationId, child_id: childId, organization_id: item.organization_id, source_project_ref: identity.sourceProjectRef, source_table: identity.dataTable,
    source_student_id: identity.studentId, source_campus_id: identity.campusId, source_display_name: identity.displayName, active: true, revision: 1, verified_at: item.verified_at };
  const credentials = parseCredentialResult(raw.credentials, link, operationId, 'issue');
  if (credentials.identity.displayName !== expected.name || credentials.identity.birthDate !== expected.birthDate
    || !credentials.expiresAt || Date.parse(credentials.expiresAt) <= Date.now() || Date.parse(credentials.checkedAt) > Date.now() + 60000) return fail();
  return { link, credentials };
}
