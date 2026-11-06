export interface MockExamProblem {
  id: string; round: number; title: string; reference: string; permissionConfirmed: true; hidden: boolean;
}
export interface MockExamCatalog {
  organizationId: string; sourceProject: string; campusId: string; revision: number;
  fingerprint: string; catalog: MockExamProblem[];
}
export type MockExamAction = 'create' | 'update' | 'delete';
const fail = (): never => { throw Error('模擬試験の問題・配信先を確認してください。'); };
export function parseMockExamProblem(value: unknown): MockExamProblem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const v = value as Record<string, unknown>;
  if (!Number.isInteger(v.round) || Number(v.round) < 1 || Number(v.round) > 999
    || v.id !== `round-${v.round}` || v.title !== `第${v.round}回過去問題`
    || typeof v.reference !== 'string' || !v.reference.trim() || v.reference.length > 6000
    || v.permissionConfirmed !== true || typeof v.hidden !== 'boolean') return fail();
  return { id: v.id as string, round: v.round as number, title: v.title as string,
    reference: v.reference.replace(/\r\n?/g, '\n'), permissionConfirmed: true, hidden: v.hidden };
}
export function parseMockExamCatalog(value: unknown, campusId: string, organizationId: string): MockExamCatalog {
  if (!value || typeof value !== 'object') return fail();
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== 1 || v.dataTable !== 'user_data' || v.campusId !== campusId || campusId === 'public'
    || v.organizationId !== organizationId || !/^[a-f0-9-]{36}$/i.test(organizationId)
    || typeof v.sourceProject !== 'string' || !/^[a-z0-9]{20}$/.test(v.sourceProject)
    || !Number.isSafeInteger(v.revision) || Number(v.revision) < 0
    || typeof v.fingerprint !== 'string' || !/^[a-f0-9]{32}$/.test(v.fingerprint)
    || !Array.isArray(v.catalog) || v.catalog.length > 100) return fail();
  const catalog = v.catalog.map(parseMockExamProblem);
  if (new Set(catalog.map(item => item.id)).size !== catalog.length) return fail();
  return { organizationId, sourceProject: v.sourceProject, campusId, revision: Number(v.revision), fingerprint: v.fingerprint, catalog };
}
