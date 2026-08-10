import type {
  ChildProfile,
  ChildTransportLocation,
  TransportDirection,
  TransportLocationType,
  Weekday,
} from '../types';
import { getWeekdayFromDate } from './weekdays';
import { resolvedTransportArea } from './transportArea';

export interface TransportLocationOption {
  id: string;
  name: string;
  type: TransportLocationType;
  address: string;
  area?: string;
  note?: string;
  activeOnDate: boolean;
  recommended: boolean;
  source: 'standard' | 'registered';
}

const STANDARD_PICKUP_ID = 'standard-pickup';
const STANDARD_DROPOFF_ID = 'standard-dropoff';

function clonedLocation(location: ChildTransportLocation): ChildTransportLocation {
  return {
    ...location,
    area: resolvedTransportArea(location.address, location.area),
    directions: [...location.directions],
    defaultDirections: [...(location.defaultDirections || [])],
    weekdays: [...(location.weekdays || [])],
  };
}

/**
 * Converts the former split fields (schoolName/pickupLocation/dropoffLocation)
 * into the unified location ledger used by the child editor. Nothing is
 * persisted until the user saves the child, so opening an old record is safe.
 */
export function getCanonicalTransportLocations(child: ChildProfile): ChildTransportLocation[] {
  const locations = (child.transportLocations || []).map(clonedLocation);
  const ensureLegacyLocation = (
    direction: TransportDirection,
    address: string | undefined,
    area: string | undefined,
    name: string,
    type: TransportLocationType,
  ) => {
    if (!address?.trim()) return;
    if (locations.some((location) => location.defaultDirections?.includes(direction))) return;
    const matched = locations.find((location) =>
      location.directions.includes(direction)
      && location.address.trim() === address.trim()
    );
    if (matched) {
      matched.defaultDirections = Array.from(new Set([...(matched.defaultDirections || []), direction]));
      matched.area = resolvedTransportArea(matched.address, matched.area || area);
      return;
    }
    locations.push({
      id: `legacy-${direction === '迎え' ? 'pickup' : 'dropoff'}-${child.id}`,
      name,
      type,
      address: address.trim(),
      area: resolvedTransportArea(address, area),
      directions: [direction],
      defaultDirections: [direction],
      weekdays: [],
      autoSelect: true,
    });
  };
  ensureLegacyLocation('迎え', child.pickupLocation, child.pickupArea, child.schoolName || '通常の迎え先', '学校');
  ensureLegacyLocation('送り', child.dropoffLocation, child.dropoffArea, '自宅', '自宅');
  (['迎え', '送り'] as TransportDirection[]).forEach((direction) => {
    const selected = locations.find((location) => location.defaultDirections?.includes(direction));
    if (!selected) return;
    locations.forEach((location) => {
      if (location.id !== selected.id) {
        location.defaultDirections = (location.defaultDirections || []).filter((item) => item !== direction);
      }
    });
  });
  return locations;
}

export function getDefaultTransportLocation(
  locations: ChildTransportLocation[],
  direction: TransportDirection,
) {
  return locations.find((location) => location.defaultDirections?.includes(direction))
    || locations.find((location) => location.directions.includes(direction));
}

function isWithinDateRange(location: ChildTransportLocation, date: string) {
  if (location.validFrom && date < location.validFrom) return false;
  if (location.validTo && date > location.validTo) return false;
  return true;
}

function isOnConfiguredWeekday(location: ChildTransportLocation, weekday: Weekday) {
  return !location.weekdays?.length || location.weekdays.includes(weekday);
}

function specificity(location: ChildTransportLocation) {
  let score = 0;
  if (location.validFrom || location.validTo) score += 4;
  if (location.weekdays?.length) score += 2;
  if (location.directions.length === 1) score += 1;
  return score;
}

export function getTransportLocationOptions(
  child: ChildProfile,
  direction: TransportDirection,
  date: string,
): TransportLocationOption[] {
  const weekday = getWeekdayFromDate(date);
  const registered = (child.transportLocations || [])
    .filter((location) => location.directions.includes(direction))
    .map((location) => ({
      location,
      activeOnDate:
        isWithinDateRange(location, date) &&
        isOnConfiguredWeekday(location, weekday),
    }));

  const recommendedLocation = registered
    .filter(({ location, activeOnDate }) => activeOnDate && (
      location.autoSelect || location.defaultDirections?.includes(direction)
    ))
    .sort(
      (left, right) => {
        const leftDefault = left.location.defaultDirections?.includes(direction) ? 1 : 0;
        const rightDefault = right.location.defaultDirections?.includes(direction) ? 1 : 0;
        return specificity(right.location) - specificity(left.location)
          || rightDefault - leftDefault;
      },
    )[0]?.location;

  const standardAddress =
    direction === '迎え' ? child.pickupLocation : child.dropoffLocation;
  const hasCanonicalDefault = registered.some(({ location }) => location.defaultDirections?.includes(direction));
  const standard: TransportLocationOption[] = standardAddress && !hasCanonicalDefault
    ? [
        {
          id:
            direction === '迎え'
              ? STANDARD_PICKUP_ID
              : STANDARD_DROPOFF_ID,
          name: direction === '迎え' ? '通常の迎え先' : '通常の送り先',
          type: direction === '迎え' ? '学校' : '自宅',
          address: standardAddress,
          area: resolvedTransportArea(
            standardAddress,
            direction === '迎え' ? child.pickupArea : child.dropoffArea,
          ),
          activeOnDate: true,
          recommended: !recommendedLocation,
          source: 'standard',
        },
      ]
    : [];

  const registeredOptions = registered
    .sort((left, right) => {
      if (left.activeOnDate !== right.activeOnDate)
        return left.activeOnDate ? -1 : 1;
      return specificity(right.location) - specificity(left.location);
    })
    .map(({ location, activeOnDate }) => ({
      id: location.id,
      name: location.name,
      type: location.type,
      address: location.address,
      area: resolvedTransportArea(location.address, location.area),
      note: location.note,
      activeOnDate,
      recommended: location.id === recommendedLocation?.id,
      source: 'registered' as const,
    }));

  return [...registeredOptions, ...standard];
}

export function getSuggestedTransportLocation(
  child: ChildProfile,
  direction: TransportDirection,
  date: string,
) {
  const options = getTransportLocationOptions(child, direction, date);
  return (
    options.find((option) => option.recommended) ||
    options.find((option) => option.source === 'standard')
  );
}
