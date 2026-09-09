import { DEFAULT_TRANSPORT_ROUTE_SETTINGS } from '../types';
import type { TransportDirection, TransportRun, TransportStop } from '../types';
import { normalizeMapAddress } from './transportMap';

export interface DraftTimeBoardItem {
  key: string;
  stop: TransportStop;
  runId: string;
  runName: string;
  minute?: number;
  time?: string;
}

export interface DraftTimeBoardGroup {
  key: string;
  locationName: string;
  address: string;
  items: DraftTimeBoardItem[];
  firstMinute?: number;
  firstTime?: string;
  lastTime?: string;
}

function timeMinute(value?: string): number | undefined {
  const match = value?.trim().match(/^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match || Number(match[1]) > 23) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatMinute(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export function timeBoardWindowMinutes(value?: number) {
  return value !== undefined && Number.isFinite(value)
    ? Math.min(120, Math.max(0, value))
    : DEFAULT_TRANSPORT_ROUTE_SETTINGS.sameLocationTimeWindowMinutes;
}

/** Presentation only: never changes the run, stop order, or calculated arrival times. */
export function groupDraftTimeBoardStops(runs: TransportRun[], direction: TransportDirection, windowMinutes?: number): DraftTimeBoardGroup[] {
  const window = timeBoardWindowMinutes(windowMinutes);
  const locations = new Map<string, { locationName: string; address: string; items: DraftTimeBoardItem[] }>();
  for (const run of runs.filter((candidate) => candidate.direction === direction)) {
    for (const stop of run.stops) {
      const address = stop.navigationLocation?.trim() || stop.location?.trim() || '';
      const locationName = stop.locationName?.trim() || stop.locationType || '送迎先未設定';
      // Do not merge unrelated homes when only the generic location type is known.
      // Retain hyphens: e.g. 1-23 and 12-3 are different addresses.
      const key = address
        ? JSON.stringify([normalizeMapAddress(locationName), normalizeMapAddress(address)])
        : JSON.stringify(['unresolved', run.id, stop.id]);
      const location = locations.get(key) || { locationName, address, items: [] };
      const minute = timeMinute(stop.plannedTime);
      location.items.push({ key: JSON.stringify([run.id, stop.id]), stop, runId: run.id, runName: run.name, minute, time: minute === undefined ? undefined : formatMinute(minute) });
      locations.set(key, location);
    }
  }

  const result: DraftTimeBoardGroup[] = [];
  for (const [locationKey, location] of locations) {
    const sorted = [...location.items].sort((a, b) => (a.minute ?? Infinity) - (b.minute ?? Infinity)
      || (a.stop.childName || '').localeCompare(b.stop.childName || '', 'ja') || a.key.localeCompare(b.key));
    let group: DraftTimeBoardGroup | undefined;
    for (const item of sorted) {
      // Compare with the EARLIEST time, not the previous child: 14:00/14:15/14:30 must not chain together.
      // Unknown times cannot establish proximity and stay separate from scheduled cards and each other.
      if (!group || item.minute === undefined || group.firstMinute === undefined || item.minute - group.firstMinute > window) {
        group = { key: JSON.stringify([direction, locationKey, item.key]), locationName: location.locationName, address: location.address,
          items: [], firstMinute: item.minute, firstTime: item.time, lastTime: item.time };
        result.push(group);
      }
      group.items.push(item);
      group.lastTime = item.time;
    }
  }
  return result.sort((a, b) => (a.firstMinute ?? Infinity) - (b.firstMinute ?? Infinity)
    || a.locationName.localeCompare(b.locationName, 'ja') || a.key.localeCompare(b.key));
}

/** Keep half-hour guide rows, but place a card at its actual time, including outside 08:00–21:00. */
export function draftTimeBoardRows(groups: DraftTimeBoardGroup[]) {
  if (!groups.some((group) => group.firstMinute !== undefined)) return [];
  const minutes = new Set(Array.from({ length: 27 }, (_, index) => 8 * 60 + index * 30));
  for (const group of groups) if (group.firstMinute !== undefined) minutes.add(group.firstMinute);
  return [...minutes].sort((a, b) => a - b).map((minute) => ({
    time: formatMinute(minute), groups: groups.filter((group) => group.firstMinute === minute),
  }));
}
