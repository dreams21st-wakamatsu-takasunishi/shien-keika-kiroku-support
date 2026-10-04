import { supabase } from '../lib/supabase';
import { restoreActivityDraft, validateActivity, type ActivityPlan } from '../utils/activityPlans';

const localKey = 'd-support-activity-plans-local-v1';
function localPlans(): ActivityPlan[] {
  const raw = JSON.parse(localStorage.getItem(localKey) || '[]');
  return Array.isArray(raw) ? raw.map((p) => restoreActivityDraft(JSON.stringify(p))).filter((p): p is ActivityPlan => Boolean(p)) : [];
}
function map(row: any): ActivityPlan { return { id: row.id, organizationId: row.organization_id, title: row.title, kind: row.kind, date: row.activity_date || '', status: row.status, isTemplate: row.is_template, content: row.content, revision: row.revision, updatedAt: row.updated_at }; }
export async function listActivityPlans(organizationId: string): Promise<ActivityPlan[]> {
  if (!supabase && organizationId === 'local') return localPlans().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (!supabase) throw new Error('ログイン状態を確認してください。');
  const { data, error } = await supabase.from('activity_plans').select('*').eq('organization_id', organizationId).order('updated_at', { ascending: false }).limit(500);
  if (error) throw error;
  return (data || []).map(map);
}
export async function saveActivityPlan(plan: ActivityPlan, organizationId: string): Promise<ActivityPlan> {
  const errors = validateActivity(plan);
  if (errors.length) throw new Error(errors.join('\n'));
  if (!supabase && organizationId === 'local') {
    const list = localPlans(); const old = list.find((p) => p.id === plan.id);
    if (plan.id && (!old || old.revision !== plan.revision)) throw new Error('他の変更と競合しました。一覧を更新し、保存済みの案と確認してください。');
    const saved = { ...plan, id: plan.id || crypto.randomUUID(), organizationId, revision: plan.revision + 1, updatedAt: new Date().toISOString() };
    localStorage.setItem(localKey, JSON.stringify([saved, ...list.filter((p) => p.id !== saved.id)]));
    return saved;
  }
  if (!supabase) throw new Error('ログイン状態を確認してください。');
  const payload = { title: plan.title.trim(), kind: plan.kind, activity_date: plan.isTemplate ? null : plan.date, status: plan.status, is_template: plan.isTemplate, content: plan.content };
  const response = plan.id
    ? await supabase.from('activity_plans').update({ ...payload, revision: plan.revision + 1 }).eq('organization_id', organizationId).eq('id', plan.id).eq('revision', plan.revision).select('*').maybeSingle()
    : await supabase.from('activity_plans').insert({ ...payload, organization_id: organizationId }).select('*').single();
  if (response.error) throw response.error;
  if (!response.data) throw new Error('他の職員による変更と競合しました。入力は残っています。一覧を更新し、保存済みの案を確認するか「別の案として複製」してください。');
  return map(response.data);
}
