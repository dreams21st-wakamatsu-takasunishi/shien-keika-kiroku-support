import type { TransportAreaZone, TransportMapLocation } from '../types';

const EARTH_RADIUS_KM = 6371;

export function distanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findTransportZone(
  location: Pick<TransportMapLocation, 'latitude' | 'longitude'> | undefined,
  zones: TransportAreaZone[],
) {
  if (!location) return undefined;
  return zones
    .filter((zone) => zone.active && distanceKm(
      location.latitude,
      location.longitude,
      zone.centerLatitude,
      zone.centerLongitude,
    ) <= zone.radiusKm)
    .sort((left, right) => left.priority - right.priority
      || distanceKm(location.latitude, location.longitude, left.centerLatitude, left.centerLongitude) / left.radiusKm
        - distanceKm(location.latitude, location.longitude, right.centerLatitude, right.centerLongitude) / right.radiusKm)[0];
}

export function normalizeMapAddress(value?: string) {
  return (value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('ja-JP')
    .replace(/[\s\u3000]/g, '')
    .replace(/[‐‑‒–—―−ーｰ]/g, '-');
}

export function findTransportMapLocation(
  locations: TransportMapLocation[],
  childId: string | undefined,
  locationProfileId: string | undefined,
  address: string | undefined,
) {
  const normalizedAddress = normalizeMapAddress(address);
  return locations.find((location) => childId && location.childId === childId
    && locationProfileId && location.locationProfileId === locationProfileId
    && (!normalizedAddress || normalizeMapAddress(location.address) === normalizedAddress))
    || locations.find((location) => childId && location.childId === childId
      && normalizedAddress && normalizeMapAddress(location.address) === normalizedAddress);
}
