import { supabase } from '../lib/supabase';
import { emptyMeetingContent, emptyOutcome, type MeetingCase, type MeetingContent, type MeetingProgressRecord, type MeetingTranscript } from './types';

// Existing local trial mode uses sample data. Meeting trial data stays in memory only.
const demoCases: MeetingCase[] = [];
const demoTranscripts: MeetingTranscript[] = [];
const demoProgress: MeetingProgressRecord[] = [];
const isDemo = (organizationId: string) => !supabase && organizationId === 'local';

export async function listMeetingEditors(organizationId: string): Promise<Array<{ id: string; name: string }>> {
  if (isDemo(organizationId)) return [];
  const { data, error } = await client().from('profiles').select('id, display_name')
    .eq('organization_id', organizationId).eq('active', true).order('display_name');
  if (error) throw error;
  return (data || []).map((row) => ({ id: row.id, name: row.display_name }));
}

function client() {
  if (!supabase) throw new Error('会議支援はログインした運用環境で利用できます。');
  return supabase;
}

function mapCase(row: any): MeetingCase {
  const content = row.content || {};
  return {
    id: row.id, organizationId: row.organization_id, childId: row.child_id,
    calendarEventId: row.calendar_event_id || undefined, title: row.title,
    meetingType: row.meeting_type, meetingDate: row.meeting_date, status: row.status,
    content: { ...emptyMeetingContent(), ...content, outcome: { ...emptyOutcome(), ...(content.outcome || {}) } },
    editorUserIds: row.editor_user_ids || [], revision: row.revision,
    createdBy: row.created_by, updatedAt: row.updated_at,
  };
}

function mapTranscript(row: any): MeetingTranscript {
  return {
    id: row.id, meetingId: row.meeting_id, version: row.version,
    sourceKind: row.source_kind, sourceName: row.source_name || undefined,
    rawText: row.raw_text, correctedText: row.corrected_text || undefined, importedAt: row.imported_at,
  };
}

function mapProgress(row: any): MeetingProgressRecord {
  return {
    id: row.id, meetingId: row.meeting_id, childId: row.child_id, recordDate: row.record_date,
    body: row.body, approvalStatus: row.approval_status, reviewComment: row.review_comment || undefined,
    createdBy: row.created_by, revision: row.revision, updatedAt: row.updated_at,
  };
}

export async function listMeetingCases(organizationId: string): Promise<MeetingCase[]> {
  if (isDemo(organizationId)) return [...demoCases].sort((a, b) => b.meetingDate.localeCompare(a.meetingDate));
  const { data, error } = await client().from('meeting_cases').select('*')
    .eq('organization_id', organizationId).order('meeting_date', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapCase);
}

export async function createMeetingCase(input: {
  organizationId: string; childId: string; title: string; meetingType: MeetingCase['meetingType'];
  meetingDate: string; calendarEventId?: string; content?: MeetingContent;
}): Promise<MeetingCase> {
  if (isDemo(input.organizationId)) {
    const created: MeetingCase = { id: crypto.randomUUID(), organizationId: 'local', childId: input.childId,
      calendarEventId: input.calendarEventId, title: input.title, meetingType: input.meetingType,
      meetingDate: input.meetingDate, status: '準備中', content: input.content || emptyMeetingContent(),
      editorUserIds: [], revision: 1, createdBy: 'local-demo', updatedAt: new Date().toISOString() };
    demoCases.unshift(created);
    return created;
  }
  const { data, error } = await client().from('meeting_cases').insert({
    organization_id: input.organizationId, child_id: input.childId,
    title: input.title, meeting_type: input.meetingType, meeting_date: input.meetingDate,
    calendar_event_id: input.calendarEventId || null, content: input.content || emptyMeetingContent(),
  }).select('*').single();
  if (error) throw error;
  return mapCase(data);
}

export async function updateMeetingCase(meeting: MeetingCase): Promise<MeetingCase> {
  if (isDemo(meeting.organizationId)) {
    const index = demoCases.findIndex((item) => item.id === meeting.id);
    if (index < 0 || demoCases[index].revision !== meeting.revision) throw new Error('MEETING_CONFLICT');
    const updated = { ...meeting, revision: meeting.revision + 1, updatedAt: new Date().toISOString() };
    demoCases[index] = updated;
    return updated;
  }
  const { data, error } = await client().from('meeting_cases').update({
    title: meeting.title, meeting_type: meeting.meetingType, meeting_date: meeting.meetingDate,
    status: meeting.status, content: meeting.content, editor_user_ids: meeting.editorUserIds,
    revision: meeting.revision + 1,
  }).eq('organization_id', meeting.organizationId).eq('id', meeting.id)
    .eq('revision', meeting.revision).select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('MEETING_CONFLICT: 他の職員による変更を確認してから保存してください。');
  return mapCase(data);
}

export async function listMeetingTranscripts(organizationId: string, meetingId: string): Promise<MeetingTranscript[]> {
  if (isDemo(organizationId)) return demoTranscripts.filter((item) => item.meetingId === meetingId).sort((a, b) => b.version - a.version);
  const { data, error } = await client().from('meeting_transcripts').select('*')
    .eq('organization_id', organizationId).eq('meeting_id', meetingId).order('version', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapTranscript);
}

export async function addMeetingTranscript(input: {
  organizationId: string; meetingId: string; version: number;
  sourceKind: MeetingTranscript['sourceKind']; sourceName?: string; rawText: string; correctedText?: string;
}): Promise<MeetingTranscript> {
  if (isDemo(input.organizationId)) {
    const previous = demoTranscripts.filter((item) => item.meetingId === input.meetingId);
    if (input.version !== previous.length + 1) throw new Error('TRANSCRIPT_CONFLICT');
    const created: MeetingTranscript = { id: crypto.randomUUID(), meetingId: input.meetingId, version: input.version,
      sourceKind: input.sourceKind, sourceName: input.sourceName, rawText: input.rawText,
      correctedText: input.correctedText, importedAt: new Date().toISOString() };
    demoTranscripts.push(created);
    return created;
  }
  const { data, error } = await client().from('meeting_transcripts').insert({
    organization_id: input.organizationId, meeting_id: input.meetingId, version: input.version,
    source_kind: input.sourceKind, source_name: input.sourceName || null,
    raw_text: input.rawText, corrected_text: input.correctedText || null,
  }).select('*').single();
  if (error) throw error;
  return mapTranscript(data);
}

export async function getMeetingProgress(organizationId: string, meetingId: string): Promise<MeetingProgressRecord | null> {
  if (isDemo(organizationId)) return demoProgress.find((item) => item.meetingId === meetingId) || null;
  const { data, error } = await client().from('meeting_progress_records').select('*')
    .eq('organization_id', organizationId).eq('meeting_id', meetingId).maybeSingle();
  if (error) throw error;
  return data ? mapProgress(data) : null;
}

export async function listMeetingProgress(organizationId: string): Promise<MeetingProgressRecord[]> {
  if (isDemo(organizationId)) return [...demoProgress].sort((a, b) => b.recordDate.localeCompare(a.recordDate));
  const { data, error } = await client().from('meeting_progress_records').select('*')
    .eq('organization_id', organizationId).order('record_date', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapProgress);
}

export async function saveMeetingProgress(organizationId: string, progress: MeetingProgressRecord): Promise<MeetingProgressRecord> {
  if (isDemo(organizationId)) {
    const index = demoProgress.findIndex((item) => item.id === progress.id);
    if (progress.id && (index < 0 || demoProgress[index].revision !== progress.revision)) throw new Error('MEETING_CONFLICT');
    const saved = { ...progress, reviewComment: ['確認済み', '要修正'].includes(progress.approvalStatus) ? progress.reviewComment : undefined,
      id: progress.id || crypto.randomUUID(), revision: progress.revision + 1,
      updatedAt: new Date().toISOString() };
    if (index < 0) demoProgress.push(saved); else demoProgress[index] = saved;
    return saved;
  }
  if (!progress.id) {
    const { data, error } = await client().from('meeting_progress_records').insert({
      organization_id: organizationId, meeting_id: progress.meetingId, child_id: progress.childId,
      record_date: progress.recordDate, body: progress.body, approval_status: progress.approvalStatus,
    }).select('*').single();
    if (error) throw error;
    return mapProgress(data);
  }
  const { data, error } = await client().from('meeting_progress_records').update({
    body: progress.body, approval_status: progress.approvalStatus,
    review_comment: ['確認済み', '要修正'].includes(progress.approvalStatus) ? progress.reviewComment || null : null,
    revision: progress.revision + 1,
  }).eq('organization_id', organizationId).eq('id', progress.id)
    .eq('revision', progress.revision).select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('MEETING_CONFLICT: 記録が変更されています。読み込み直してください。');
  return mapProgress(data);
}

export async function logMeetingExport(organizationId: string, meetingId: string,
  outputKind: 'context_copy' | 'sheet_copy' | 'sheet_download'): Promise<void> {
  if (isDemo(organizationId)) return;
  const { error } = await client().from('meeting_export_events').insert({
    organization_id: organizationId, meeting_id: meetingId, output_kind: outputKind,
  });
  if (error) throw error;
}
