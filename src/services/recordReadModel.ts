import type { SupportRecord } from '../types';

// PostgREST JSON-path projection avoids transferring every child's draft
// answers when only the input-list summary is needed.
export const RECORD_DRAFT_SUMMARY_SELECT = 'user_id,draft_key,updated_at,revision,device_id,recorder_profile_id,'
  + 'selectedChildIds:payload->selectedChildIds,recorderId:payload->recorderId,recorderName:payload->recorderName,'
  + 'selectedTemplateId:payload->selectedTemplateId,takenOverFromDraftKeys:payload->takenOverFromDraftKeys,'
  + 'takenOverFromDraftKey:payload->takenOverFromDraftKey,takenOverAt:payload->takenOverAt,'
  + 'date:payload->date,currentStepIndex:payload->currentStepIndex';

const quotedList = (values: string[]) => [...new Set(values)].map(value => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',');
/** One RLS-filtered read contains active matches and deleted incoming IDs.
 * Keep full snapshots for the overwrite comparison; the guarded write still
 * checks the exact version that the user reviewed.
 */
export function recordSaveSnapshotFilter(records: SupportRecord[]) {
  if (!records.length) throw new Error('No save candidates');
  return `and(deleted_at.is.null,child_id.in.(${quotedList(records.map(row => row.childId))}),record_date.in.(${quotedList(records.map(row => row.date))})),id.in.(${quotedList(records.map(row => row.id))})`;
}
