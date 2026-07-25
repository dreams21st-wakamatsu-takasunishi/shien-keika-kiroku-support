export const DRAFT_RESET_HOUR = 3;

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentDraftCycleKey(now = new Date()) {
  const boundary = new Date(now);
  boundary.setHours(DRAFT_RESET_HOUR, 0, 0, 0);
  if (now.getTime() < boundary.getTime()) boundary.setDate(boundary.getDate() - 1);
  return formatLocalDate(boundary);
}

export function getNextDraftResetAt(now = new Date()) {
  const resetAt = new Date(now);
  resetAt.setHours(DRAFT_RESET_HOUR, 0, 0, 0);
  if (resetAt.getTime() <= now.getTime()) resetAt.setDate(resetAt.getDate() + 1);
  return resetAt;
}

export function isDraftCurrent(cycleKey?: string, updatedAt?: string, now = new Date()) {
  if (cycleKey) return cycleKey === getCurrentDraftCycleKey(now);
  if (!updatedAt) return false;
  const timestamp = new Date(updatedAt);
  if (Number.isNaN(timestamp.getTime())) return false;

  const boundary = new Date(now);
  boundary.setHours(DRAFT_RESET_HOUR, 0, 0, 0);
  if (now.getTime() < boundary.getTime()) boundary.setDate(boundary.getDate() - 1);
  return timestamp.getTime() >= boundary.getTime();
}
