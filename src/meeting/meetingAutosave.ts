import type { MeetingCase } from './types';

export const MEETING_SAVE_IDLE_MS = 2500;
export const MEETING_SAVE_MAX_WAIT_MS = 10000;
export const MEETING_SAVE_WARNING_MS = 15000;

// JSONB does not preserve object key order. Keep array order (agenda/primary child)
// but compare the actual JSON values, including optional fields omitted in transit.
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]));
    }
    return item;
  });
}

export function sameMeetingCase(left: MeetingCase, right: MeetingCase): boolean {
  return left.id === right.id && left.organizationId === right.organizationId
    && left.title === right.title && left.meetingDate === right.meetingDate
    && left.meetingType === right.meetingType && left.status === right.status
    && canonicalJson(left.content) === canonicalJson(right.content)
    && canonicalJson(left.editorUserIds) === canonicalJson(right.editorUserIds)
    && canonicalJson(left.childIds) === canonicalJson(right.childIds);
}

export function meetingSaveDelay(dirtySince: number, now: number): number {
  return Math.min(MEETING_SAVE_IDLE_MS, Math.max(0, MEETING_SAVE_MAX_WAIT_MS - (now - dirtySince)));
}
