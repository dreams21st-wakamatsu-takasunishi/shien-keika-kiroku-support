import type {
  ChildProfile,
  ChildTransportLocation,
  TransportDirection,
  TransportLocationType,
  Weekday,
} from '../types';
import { getWeekdayFromDate } from './weekdays';

export interface TransportLocationOption {
  id: string;
  name: string;
  type: TransportLocationType;
  address: string;
  note?: string;
  activeOnDate: boolean;
  recommended: boolean;
  source: 'standard' | 'registered';
}

const STANDARD_PICKUP_ID = 'standard-pickup';
const STANDARD_DROPOFF_ID = 'standard-dropoff';

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
    .filter(({ location, activeOnDate }) => location.autoSelect && activeOnDate)
    .sort(
      (left, right) =>
        specificity(right.location) - specificity(left.location),
    )[0]?.location;

  const standardAddress =
    direction === '迎え' ? child.pickupLocation : child.dropoffLocation;
  const standard: TransportLocationOption[] = standardAddress
    ? [
        {
          id:
            direction === '迎え'
              ? STANDARD_PICKUP_ID
              : STANDARD_DROPOFF_ID,
          name: direction === '迎え' ? '通常の迎え先' : '通常の送り先',
          type: direction === '迎え' ? '学校' : '自宅',
          address: standardAddress,
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
