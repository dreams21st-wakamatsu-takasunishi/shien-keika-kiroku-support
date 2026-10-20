import { restoreActivityDraft } from './activityPlans';

export const activityDraftStorageKey = (organizationId: string, userId: string) =>
  `d-support-activity-draft-v1:${organizationId}:${userId}`;

export function hasPendingActivityDraft(storage: Pick<Storage, 'getItem'>, key: string): boolean {
  try { return restoreActivityDraft(storage.getItem(key)) !== null; }
  catch { return false; }
}

// Native beforeunload dialogs use browser-owned wording. Do not delete or save
// the draft here: the user may cancel closing the page and continue editing.
export function installActivityDraftCloseWarning(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  hasUnsavedChanges: () => boolean,
): () => void {
  const warn = (event: BeforeUnloadEvent) => {
    if (!hasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  target.addEventListener('beforeunload', warn);
  return () => target.removeEventListener('beforeunload', warn);
}
