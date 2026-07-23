import { supabase } from '../lib/supabase';
import { ChildProfile, SupportPlan, SupportRecord, Template } from '../types';

export interface WorkspaceData {
  children: ChildProfile[];
  templates: Template[];
  records: SupportRecord[];
  supportPlans: SupportPlan[];
}

function assertSupabase() {
  if (!supabase) throw new Error('Supabaseが設定されていません。');
  return supabase;
}

function mapChild(row: any): ChildProfile {
  return {
    id: row.id,
    name: row.name,
    kana: row.kana || undefined,
    grade: row.grade || undefined,
    careType: row.care_type || undefined,
    notes: row.notes || undefined,
  };
}

function mapTemplate(row: any): Template {
  return {
    id: row.id,
    name: row.name,
    type: row.template_type,
    isDefault: row.is_default,
    description: row.description || undefined,
    sections: row.sections || [],
  };
}

function mapSupportPlan(row: any): SupportPlan {
  return {
    id: row.id,
    childId: row.child_id,
    title: row.title,
    longTermGoal: row.long_term_goal || '',
    shortTermGoal: row.short_term_goal || '',
    domainGoals: row.domain_goals || {},
    validFrom: row.valid_from,
    validTo: row.valid_to || undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRecord(row: any): SupportRecord {
  return {
    id: row.id,
    templateId: row.template_id,
    templateName: row.template_name,
    templateType: row.template_type,
    templateSectionsSnapshot: row.template_snapshot?.sections || undefined,
    childId: row.child_id,
    childName: row.child_name,
    date: row.record_date,
    attendance: row.attendance,
    expression: row.expression,
    snack: row.snack,
    recorderName: row.recorder_name,
    serviceStartTime: row.service_start_time || undefined,
    serviceEndTime: row.service_end_time || undefined,
    transportation: row.transportation || undefined,
    supportPlanId: row.support_plan_id || undefined,
    fiveDomains: row.five_domains || [],
    goalProgress: row.goal_progress || [],
    sectionAnswers: row.section_answers || {},
    synthesizedSummary: row.synthesized_summary || undefined,
    approvalStatus: row.approval_status,
    jihatsukanComment: row.review_comment || undefined,
    reviewedBy: row.reviewer_name || undefined,
    reviewedAt: row.reviewed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadWorkspaceData(organizationId: string): Promise<WorkspaceData> {
  const client = assertSupabase();
  const [childrenResult, templatesResult, recordsResult, plansResult] = await Promise.all([
    client.from('children').select('*').eq('organization_id', organizationId).is('deleted_at', null).order('name'),
    client.from('record_templates').select('*').eq('organization_id', organizationId).is('archived_at', null).order('created_at'),
    client.from('support_records').select('*').eq('organization_id', organizationId).is('deleted_at', null).order('record_date', { ascending: false }),
    client.from('support_plans').select('*').eq('organization_id', organizationId).order('valid_from', { ascending: false }),
  ]);

  for (const result of [childrenResult, templatesResult, recordsResult, plansResult]) {
    if (result.error) throw result.error;
  }

  return {
    children: (childrenResult.data || []).map(mapChild),
    templates: (templatesResult.data || []).map(mapTemplate),
    records: (recordsResult.data || []).map(mapRecord),
    supportPlans: (plansResult.data || []).map(mapSupportPlan),
  };
}

export async function saveChild(organizationId: string, child: ChildProfile) {
  const { error } = await assertSupabase().from('children').upsert(
    {
      organization_id: organizationId,
      id: child.id,
      name: child.name,
      kana: child.kana || null,
      grade: child.grade || null,
      care_type: child.careType || null,
      notes: child.notes || null,
      deleted_at: null,
    },
    { onConflict: 'organization_id,id' }
  );
  if (error) throw error;
}

export async function softDeleteChild(organizationId: string, childId: string) {
  const { error } = await assertSupabase()
    .from('children')
    .update({ deleted_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('id', childId);
  if (error) throw error;
}

export async function saveTemplate(organizationId: string, template: Template) {
  const { error } = await assertSupabase().from('record_templates').upsert(
    {
      organization_id: organizationId,
      id: template.id,
      name: template.name,
      template_type: template.type,
      is_default: Boolean(template.isDefault),
      description: template.description || null,
      sections: template.sections,
      archived_at: null,
    },
    { onConflict: 'organization_id,id' }
  );
  if (error) throw error;
}

export async function archiveTemplate(organizationId: string, templateId: string) {
  const { error } = await assertSupabase()
    .from('record_templates')
    .update({ archived_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('id', templateId);
  if (error) throw error;
}

export async function saveSupportPlan(organizationId: string, plan: SupportPlan) {
  const { error } = await assertSupabase().from('support_plans').upsert(
    {
      organization_id: organizationId,
      id: plan.id,
      child_id: plan.childId,
      title: plan.title,
      long_term_goal: plan.longTermGoal,
      short_term_goal: plan.shortTermGoal,
      domain_goals: plan.domainGoals,
      valid_from: plan.validFrom,
      valid_to: plan.validTo || null,
      status: plan.status,
    },
    { onConflict: 'organization_id,id' }
  );
  if (error) throw error;
}

export async function closeSupportPlan(organizationId: string, planId: string) {
  const { error } = await assertSupabase()
    .from('support_plans')
    .update({ status: '終了' })
    .eq('organization_id', organizationId)
    .eq('id', planId);
  if (error) throw error;
}

export async function saveRecord(organizationId: string, record: SupportRecord) {
  const { error } = await assertSupabase().from('support_records').upsert(
    {
      organization_id: organizationId,
      id: record.id,
      template_id: record.templateId,
      template_name: record.templateName,
      template_type: record.templateType,
      child_id: record.childId,
      child_name: record.childName,
      record_date: record.date,
      attendance: record.attendance,
      expression: record.expression,
      snack: record.snack,
      recorder_name: record.recorderName,
      service_start_time: record.serviceStartTime || null,
      service_end_time: record.serviceEndTime || null,
      transportation: record.transportation || null,
      support_plan_id: record.supportPlanId || null,
      five_domains: record.fiveDomains || [],
      goal_progress: record.goalProgress || [],
      section_answers: record.sectionAnswers,
      template_snapshot: {
        id: record.templateId,
        name: record.templateName,
        type: record.templateType,
        sections: record.templateSectionsSnapshot || [],
      },
      synthesized_summary: record.synthesizedSummary || null,
      approval_status: record.approvalStatus,
      review_comment: record.jihatsukanComment || null,
      reviewer_name: record.reviewedBy || null,
      reviewed_at: record.reviewedAt || null,
      deleted_at: null,
    },
    { onConflict: 'organization_id,id' }
  );
  if (error) throw error;
}

export async function softDeleteRecord(organizationId: string, recordId: string) {
  const { error } = await assertSupabase()
    .from('support_records')
    .update({ deleted_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('id', recordId);
  if (error) throw error;
}

export async function seedDefaultTemplates(organizationId: string, templates: Template[]) {
  for (const template of templates) {
    await saveTemplate(organizationId, template);
  }
}
