import { parseHistory, parseIdentity, type LessonEvent, type LessonIdentity, type LessonLink } from './contracts.ts';

export interface ProgressStage {
  id: string; title: string; status: 'cleared' | 'current' | 'pending' | 'unknown'; bestSeconds: number | null;
}
export interface ProgressCourse {
  id: 'mouse' | 'keyboard' | 'vision' | 'word'; title: string; completed: number | null; total: number;
  next: ProgressStage | null; stages: ProgressStage[];
}
export interface LessonProgress {
  schemaVersion: 1; identity: LessonIdentity; childId: string; linkId: string; fetchedAt: string;
  courses: ProgressCourse[]; weakKeys: { key: string; count: number }[]; recentEvents: LessonEvent[];
  account: { authIdSaved: boolean; loginNumber: string | null; passcodeIssuedAt: string | null; loginVerified: false };
}
type ProgressLink = Pick<LessonLink, 'id' | 'child_id' | 'source_project_ref' | 'source_table' | 'source_student_id' | 'source_campus_id'>;
const fail = () => { throw Error('児童別進捗の取得結果を確認できません。更新して確認してください。'); };
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail();
const integer = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
const timestamp = (value: unknown): value is string => typeof value === 'string' && value.length <= 50 && Number.isFinite(Date.parse(value));

export function parseLessonProgress(value: unknown, link: ProgressLink): Omit<LessonProgress, 'fetchedAt'> {
  const payload = record(value);
  if (payload.schemaVersion !== 1 || payload.childId !== link.child_id || payload.linkId !== link.id) return fail();
  const identity = parseIdentity(payload.identity, link.source_project_ref);
  if (identity.studentId !== link.source_student_id || identity.dataTable !== link.source_table || identity.campusId !== link.source_campus_id) return fail();
  if (!Array.isArray(payload.courses) || payload.courses.length !== 4) return fail();
  const courseIds = new Set<string>();
  const courses = payload.courses.map(item => {
    const course = record(item);
    if (typeof course.id !== 'string' || !['mouse', 'keyboard', 'vision', 'word'].includes(course.id) || courseIds.has(course.id)
      || typeof course.title !== 'string' || !course.title || course.title.length > 80
      || !integer(course.total, 500) || course.total === 0 || !Array.isArray(course.stages) || course.stages.length !== course.total
      || (course.completed !== null && !integer(course.completed, course.total))) return fail();
    courseIds.add(course.id);
    const stageIds = new Set<string>();
    const stages: ProgressStage[] = course.stages.map(item => {
      const stage = record(item);
      if (typeof stage.id !== 'string' || !/^[a-z0-9_]{1,40}$/i.test(stage.id) || stageIds.has(stage.id)
        || typeof stage.title !== 'string' || !stage.title || stage.title.length > 160
        || !['cleared', 'current', 'pending', 'unknown'].includes(String(stage.status))
        || (stage.bestSeconds !== null && (typeof stage.bestSeconds !== 'number' || !Number.isFinite(stage.bestSeconds) || stage.bestSeconds <= 0 || stage.bestSeconds > 86400))) return fail();
      stageIds.add(stage.id);
      return { id: stage.id, title: stage.title, status: stage.status as ProgressStage['status'], bestSeconds: stage.bestSeconds as number | null };
    });
    const cleared = stages.filter(stage => stage.status === 'cleared').length;
    const completed = course.completed as number | null;
    if (completed === null ? stages.some(stage => stage.status !== 'unknown')
      : stages.some(stage => stage.status === 'unknown') || completed < cleared || completed > cleared + 1) return fail();
    let next: ProgressStage | null = null;
    if (course.next !== null) {
      next = stages.find(stage => stage.id === record(course.next).id) || null;
      if (!next || next.status !== 'current' || !['mouse', 'keyboard'].includes(course.id)) return fail();
    }
    return { id: course.id as ProgressCourse['id'], title: course.title, total: course.total, completed: course.completed as number | null, stages, next };
  });
  if (!Array.isArray(payload.weakKeys) || payload.weakKeys.length > 10 || !Array.isArray(payload.recentEvents) || payload.recentEvents.length > 30) return fail();
  const keys = new Set<string>();
  const weakKeys = payload.weakKeys.map(item => {
    const row = record(item);
    if (typeof row.key !== 'string' || !/^[A-Z0-9;,./'\[\]\\-]$/.test(row.key) || keys.has(row.key) || !integer(row.count, 1000000000) || row.count === 0) return fail();
    keys.add(row.key); return { key: row.key, count: row.count };
  });
  const seen = new Set<string>();
  const recentEvents = payload.recentEvents.map(item => {
    const event = record(item);
    if (!timestamp(event.at) || typeof event.id !== 'string' || seen.has(event.id)) return fail();
    seen.add(event.id);
    const date = new Date(Date.parse(event.at) + 9 * 3600000).toISOString().slice(0, 10);
    return parseHistory({ schemaVersion: 1, identity, date, historyComplete: false, events: [event] }, link, date).events[0];
  });
  const account = record(payload.account);
  if (typeof account.authIdSaved !== 'boolean' || account.loginVerified !== false
    || (account.loginNumber !== null && (typeof account.loginNumber !== 'string' || !/^\d{1,12}$/.test(account.loginNumber)))
    || (account.passcodeIssuedAt !== null && !timestamp(account.passcodeIssuedAt))) return fail();
  return { schemaVersion: 1, identity, childId: link.child_id, linkId: link.id, courses, weakKeys, recentEvents,
    account: { authIdSaved: account.authIdSaved, loginNumber: account.loginNumber as string | null, passcodeIssuedAt: account.passcodeIssuedAt as string | null, loginVerified: false } };
}

export function parseFetchedLessonProgress(value: unknown, link: ProgressLink): LessonProgress {
  const result = parseLessonProgress(value, link);
  const fetchedAt = record(value).fetchedAt;
  if (!timestamp(fetchedAt)) return fail();
  return { ...result, fetchedAt };
}
