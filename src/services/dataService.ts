import { supabase } from '../lib/supabase';
import {
  AiWritingSettings,
  ChildProfile,
  DEFAULT_AI_WRITING_SETTINGS,
  ExpressionType,
  SnackType,
  SupportPlan,
  SupportRecord,
  Template,
} from '../types';
import { normalizeTemplateFatigueScale } from '../utils/templateNormalizer';

export interface WorkspaceData {
  children: ChildProfile[];
  templates: Template[];
  records: SupportRecord[];
  supportPlans: SupportPlan[];
  aiWritingSettings: AiWritingSettings;
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
  return normalizeTemplateFatigueScale({
    id: row.id,
    name: row.name,
    type: row.template_type,
    isDefault: row.is_default,
    description: row.description || undefined,
    sections: row.sections || [],
  });
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
  const rawExpressions = Array.isArray(row.expression)
    ? row.expression
    : String(row.expression || '').split(/[、,]/).map((value) => value.trim()).filter(Boolean);
  return {
    id: row.id,
    templateId: row.template_id,
    templateName: row.template_name,
    templateType: row.template_type,
    templateSectionsSnapshot: row.template_snapshot?.sections || undefined,
    childId: row.child_id,
    childName: row.child_name,
    date: row.record_date,
    attendance: row.attendance || '',
    attendanceNote: row.attendance_note || undefined,
    expressions: rawExpressions as ExpressionType[],
    expressionNote: row.expression_note || undefined,
    snack: normalizeSnack(row.snack),
    snackNote: row.snack_note || undefined,
    recorderName: row.recorder_name,
    serviceStartTime: row.service_start_time || undefined,
    serviceEndTime: row.service_end_time || undefined,
    transportation: row.transportation || undefined,
    supportPlanId: row.support_plan_id || undefined,
    fiveDomains: row.five_domains || [],
    goalProgress: row.goal_progress || [],
    sectionAnswers: row.section_answers || {},
    skippedQuestionIds: row.skipped_question_ids || [],
    synthesizedSummary: row.synthesized_summary || undefined,
    approvalStatus: row.approval_status,
    jihatsukanComment: row.review_comment || undefined,
    reviewedBy: row.reviewer_name || undefined,
    reviewedAt: row.reviewed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeSnack(value: unknown): SnackType | '' {
  const raw = String(value || '');
  if (raw === '食べた' || raw === '持ち帰り' || raw === '食べていない' || raw === '持ち込み') return raw;
  if (raw === '完食' || raw === '半量食べた') return '食べた';
  if (raw === '残した') return '持ち帰り';
  if (raw === '不食' || raw === 'なし') return '食べていない';
  return '';
}

function mapAiWritingSettings(row: any): AiWritingSettings {
  if (!row) return DEFAULT_AI_WRITING_SETTINGS;
  return {
    tone: row.tone || DEFAULT_AI_WRITING_SETTINGS.tone,
    customTone: row.custom_tone || '',
    customInstructions: row.custom_instructions || '',
    targetLength: row.target_length || DEFAULT_AI_WRITING_SETTINGS.targetLength,
  };
}

export async function loadWorkspaceData(organizationId: string): Promise<WorkspaceData> {
  const client = assertSupabase();
  const [childrenResult, templatesResult, recordsResult, plansResult, aiSettingsResult] = await Promise.all([
    client.from('children').select('*').eq('organization_id', organizationId).is('deleted_at', null).order('name'),
    client.from('record_templates').select('*').eq('organization_id', organizationId).is('archived_at', null).order('created_at'),
    client.from('support_records').select('*').eq('organization_id', organizationId).is('deleted_at', null).order('record_date', { ascending: false }),
    client.from('support_plans').select('*').eq('organization_id', organizationId).order('valid_from', { ascending: false }),
    client.from('organization_ai_settings').select('*').eq('organization_id', organizationId).maybeSingle(),
  ]);

  for (const result of [childrenResult, templatesResult, recordsResult, plansResult, aiSettingsResult]) {
    if (result.error) throw result.error;
  }

  return {
    children: (childrenResult.data || []).map(mapChild),
    templates: (templatesResult.data || []).map(mapTemplate),
    records: (recordsResult.data || []).map(mapRecord),
    supportPlans: (plansResult.data || []).map(mapSupportPlan),
    aiWritingSettings: mapAiWritingSettings(aiSettingsResult.data),
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
  const normalizedTemplate = normalizeTemplateFatigueScale(template);
  const { error } = await assertSupabase().from('record_templates').upsert(
    {
      organization_id: organizationId,
      id: normalizedTemplate.id,
      name: normalizedTemplate.name,
      template_type: normalizedTemplate.type,
      is_default: Boolean(normalizedTemplate.isDefault),
      description: normalizedTemplate.description || null,
      sections: normalizedTemplate.sections,
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

function mapRecordForSave(organizationId: string, record: SupportRecord) {
  return {
      organization_id: organizationId,
      id: record.id,
      template_id: record.templateId,
      template_name: record.templateName,
      template_type: record.templateType,
      child_id: record.childId,
      child_name: record.childName,
      record_date: record.date,
      attendance: record.attendance,
      attendance_note: record.attendanceNote || null,
      expression: record.expressions.join('、'),
      expression_note: record.expressionNote || null,
      snack: record.snack,
      snack_note: record.snackNote || null,
      recorder_name: record.recorderName,
      service_start_time: record.serviceStartTime || null,
      service_end_time: record.serviceEndTime || null,
      transportation: record.transportation || null,
      support_plan_id: record.supportPlanId || null,
      five_domains: record.fiveDomains || [],
      goal_progress: record.goalProgress || [],
      section_answers: record.sectionAnswers,
      skipped_question_ids: record.skippedQuestionIds || [],
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
    };
}

export async function saveRecords(organizationId: string, records: SupportRecord[]) {
  if (records.length === 0) return;
  const { error } = await assertSupabase().from('support_records').upsert(
    records.map((record) => mapRecordForSave(organizationId, record)),
    { onConflict: 'organization_id,id' }
  );
  if (error) throw error;
}

export async function saveRecord(organizationId: string, record: SupportRecord) {
  await saveRecords(organizationId, [record]);
}

export async function saveAiWritingSettings(organizationId: string, settings: AiWritingSettings) {
  const { error } = await assertSupabase().from('organization_ai_settings').upsert(
    {
      organization_id: organizationId,
      tone: settings.tone,
      custom_tone: settings.customTone.trim(),
      custom_instructions: settings.customInstructions.trim(),
      target_length: Math.max(80, Math.min(800, settings.targetLength)),
    },
    { onConflict: 'organization_id' }
  );
  if (error) throw error;
}

export async function loadRecordDraft(organizationId: string, draftKey: string) {
  const { data, error } = await assertSupabase()
    .from('record_drafts')
    .select('payload, updated_at')
    .eq('organization_id', organizationId)
    .eq('draft_key', draftKey)
    .maybeSingle();
  if (error) throw error;
  return data ? { payload: data.payload as unknown, updatedAt: data.updated_at as string } : null;
}

export async function saveRecordDraft(organizationId: string, userId: string, draftKey: string, payload: unknown) {
  const { error } = await assertSupabase().from('record_drafts').upsert(
    {
      organization_id: organizationId,
      user_id: userId,
      draft_key: draftKey,
      payload,
    },
    { onConflict: 'organization_id,user_id,draft_key' }
  );
  if (error) throw error;
}

export async function deleteRecordDraft(organizationId: string, draftKey: string) {
  const { error } = await assertSupabase()
    .from('record_drafts')
    .delete()
    .eq('organization_id', organizationId)
    .eq('draft_key', draftKey);
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
