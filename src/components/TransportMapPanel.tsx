import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Crosshair,
  LocateFixed,
  LoaderCircle,
  MapPinned,
  PencilLine,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import type {
  ChildProfile,
  SchoolProfile,
  TransportAreaZone,
  TransportMapLocation,
  TransportLocationType,
} from '../types';
import { geocodeTransportLocations } from '../services/dataService';
import { supabase } from '../lib/supabase';
import { getCanonicalTransportLocations } from '../utils/transportLocations';
import { findTransportZone, findTransportZones, normalizeMapAddress } from '../utils/transportMap';
import { GoogleTransportMap, type GoogleTransportMarker } from './GoogleTransportMap';

interface TransportMapPanelProps {
  childrenList: ChildProfile[];
  schools: SchoolProfile[];
  facilityAddress: string;
  locations: TransportMapLocation[];
  zones: TransportAreaZone[];
  canManage: boolean;
  onSaveLocation: (location: TransportMapLocation) => Promise<void> | void;
  onSaveZone: (zone: TransportAreaZone) => Promise<void> | void;
  onDeleteZone: (zoneId: string) => Promise<void> | void;
}

interface SourceLocation {
  id: string;
  sourceType: 'facility' | 'child' | 'school';
  childId?: string;
  schoolId?: string;
  childName?: string;
  locationProfileId?: string;
  locationName: string;
  locationType: TransportLocationType | '事業所';
  address: string;
}

interface PendingManualLocation {
  source: SourceLocation;
  latitude: number;
  longitude: number;
}

interface SimpleMarkerGroup {
  id: string;
  latitude: number;
  longitude: number;
  entries: Array<{ source: SourceLocation; location: TransportMapLocation }>;
}

interface PinAreaDraft {
  groupId: string;
  sourceIds: string[];
  title: string;
  zoneIds: string[];
}

type MapLocationFilter = 'facility' | 'residential' | 'education' | 'other';

const MAP_LOCATION_FILTERS: Array<{ id: MapLocationFilter; label: string }> = [
  { id: 'facility', label: '事業所' },
  { id: 'residential', label: '自宅・親族宅' },
  { id: 'education', label: '学校・学童' },
  { id: 'other', label: 'その他' },
];
const ALL_MAP_LOCATION_FILTERS = MAP_LOCATION_FILTERS.map(({ id }) => id);

const DEFAULT_CENTER: [number, number] = [33.883, 130.875];
const ZONE_COLORS = ['#0f766e', '#0284c7', '#7c3aed', '#d97706', '#dc2626', '#475569'];
const createUuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const GOOGLE_MAPS_BROWSER_KEY = String(import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY || '').trim();
const GOOGLE_MAPS_MAP_ID = String(import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || '').trim();
const GOOGLE_MAP_CONFIGURED = Boolean(GOOGLE_MAPS_BROWSER_KEY && GOOGLE_MAPS_MAP_ID);

function sourceLocations(childrenList: ChildProfile[], schools: SchoolProfile[], facilityAddress: string): SourceLocation[] {
  const facility = facilityAddress.trim()
    ? [{
        id: 'facility',
        sourceType: 'facility' as const,
        locationName: '事業所',
        locationType: '事業所' as const,
        address: facilityAddress.trim(),
      }]
    : [];
  const activeSchools = schools.filter((school) => school.active && school.address.trim());
  const schoolAddresses = new Set(activeSchools.map((school) => normalizeMapAddress(school.address)));
  const schoolLocations = activeSchools.map((school) => ({
    id: `school:${school.id}`,
    sourceType: 'school' as const,
    schoolId: school.id,
    locationName: school.name,
    locationType: '学校' as const,
    address: school.address.trim(),
  }));
  const childLocations = childrenList.flatMap((child) => getCanonicalTransportLocations(child)
    .filter((location) => location.address.trim())
    .filter((location) => location.type !== '学校' || (!location.schoolId && !schoolAddresses.has(normalizeMapAddress(location.address))))
    .map((location) => ({
      id: `child:${child.id}:${location.id}`,
      sourceType: 'child' as const,
      childId: child.id,
      childName: child.name,
      locationProfileId: location.id,
      locationName: location.name,
      locationType: location.type,
      address: location.address.trim(),
    })));
  return [...facility, ...schoolLocations, ...childLocations];
}

function matchingLocation(source: SourceLocation, locations: TransportMapLocation[]) {
  return locations.find((location) => location.id === source.id
    && normalizeMapAddress(location.address) === normalizeMapAddress(source.address));
}

function markerColor(type: SourceLocation['locationType']) {
  if (type === '事業所') return '#7c3aed';
  if (type === '自宅' || type === '親族宅') return '#059669';
  if (type === '学校' || type === '学童') return '#0284c7';
  return '#d97706';
}

function mapLocationCategory(source: SourceLocation): MapLocationFilter {
  const residential = source.locationType === '自宅' || source.locationType === '親族宅';
  const education = source.locationType === '学校' || source.locationType === '学童';
  if (source.sourceType === 'facility') return 'facility';
  if (residential) return 'residential';
  if (education) return 'education';
  return 'other';
}

function matchesMapLocationFilters(source: SourceLocation, filters: MapLocationFilter[]) {
  return filters.includes(mapLocationCategory(source));
}

function markerIcon(type: SourceLocation['locationType'], simple = false, assignedColor?: string, selected = false) {
  const color = assignedColor || markerColor(type);
  const size = simple ? 28 : 20;
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:${selected ? 5 : 4}px solid white;box-shadow:0 0 0 ${selected ? 4 : 0}px ${selected ? color : 'transparent'},0 3px 10px rgba(15,23,42,.32);transition:transform .15s ease;transform:${selected ? 'scale(1.12)' : 'scale(1)'}"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2)],
  });
}

function simpleGroupLabel(group: SimpleMarkerGroup) {
  const first = group.entries[0].source;
  if (first.sourceType === 'facility') return '事業所';
  if (first.sourceType === 'school') return first.locationName;
  const institutional = group.entries.every(({ source }) => source.locationType === '学校' || source.locationType === '学童');
  if (institutional) return `${first.locationName}${group.entries.length > 1 ? `（${group.entries.length}名）` : ''}`;
  if (group.entries.length === 1) return first.childName || first.locationName;
  return `${first.childName || first.locationName}ほか${group.entries.length - 1}名`;
}

function FitMap({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  const key = points.map((point) => point.join(',')).join('|');
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView(points[0], 14);
    else map.fitBounds(L.latLngBounds(points), { padding: [34, 34], maxZoom: 15 });
  }, [key, map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function MapClickHandler({ enabled, onClick }: { enabled: boolean; onClick: (latitude: number, longitude: number) => void }) {
  useMapEvents({
    click(event) {
      if (enabled) onClick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

export const TransportMapPanel: React.FC<TransportMapPanelProps> = ({
  childrenList,
  schools,
  facilityAddress,
  locations,
  zones,
  canManage,
  onSaveLocation,
  onSaveZone,
  onDeleteZone,
}) => {
  const sources = useMemo(() => sourceLocations(childrenList, schools, facilityAddress), [childrenList, facilityAddress, schools]);
  const displayLocations = useMemo(() => GOOGLE_MAP_CONFIGURED
    ? locations
    : locations.filter((location) => location.geocodeSource !== 'google'), [locations]);
  const placed = useMemo(() => sources.flatMap((source) => {
    const location = matchingLocation(source, displayLocations);
    return location ? [{ source, location }] : [];
  }), [displayLocations, sources]);
  const unresolved = useMemo(() => sources.filter((source) => !matchingLocation(source, displayLocations)), [displayLocations, sources]);
  const [search, setSearch] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [manualSourceId, setManualSourceId] = useState('');
  const [pendingManual, setPendingManual] = useState<PendingManualLocation>();
  const [zoneDraft, setZoneDraft] = useState<TransportAreaZone>();
  const [pinAreaDraft, setPinAreaDraft] = useState<PinAreaDraft>();
  const [placingZoneCenter, setPlacingZoneCenter] = useState(false);
  const [mapMode, setMapMode] = useState<'simple' | 'detail'>('simple');
  const [mapLocationFilters, setMapLocationFilters] = useState<MapLocationFilter[]>(ALL_MAP_LOCATION_FILTERS);
  const [showSettings, setShowSettings] = useState(false);
  const autoGeocodeAttemptRef = useRef('');
  const activeZones = useMemo(() => [...zones].filter((zone) => zone.active).sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, 'ja')), [zones]);
  const visiblePlaced = useMemo(() => placed.filter(({ source }) => matchesMapLocationFilters(source, mapLocationFilters)), [mapLocationFilters, placed]);
  const onlyFacilityVisible = mapLocationFilters.length === 1 && mapLocationFilters[0] === 'facility';
  const visibleActiveZones = useMemo(() => onlyFacilityVisible ? [] : activeZones.filter((zone) => zone.showBoundary !== false), [activeZones, onlyFacilityVisible]);
  const filterCounts = useMemo(() => Object.fromEntries(MAP_LOCATION_FILTERS.map((filter) => [
    filter.id,
    placed.filter(({ source }) => mapLocationCategory(source) === filter.id).length,
  ])) as Record<MapLocationFilter, number>, [placed]);
  const center = useMemo<[number, number]>(() => {
    const facility = placed.find((entry) => entry.source.sourceType === 'facility')?.location;
    if (facility) return [facility.latitude, facility.longitude];
    if (placed.length) {
      return [
        placed.reduce((sum, entry) => sum + entry.location.latitude, 0) / placed.length,
        placed.reduce((sum, entry) => sum + entry.location.longitude, 0) / placed.length,
      ];
    }
    return DEFAULT_CENTER;
  }, [placed]);
  const simpleMarkerGroups = useMemo<SimpleMarkerGroup[]>(() => {
    const groups = new Map<string, SimpleMarkerGroup>();
    visiblePlaced.forEach((entry) => {
      const key = `${entry.location.latitude.toFixed(4)}:${entry.location.longitude.toFixed(4)}`;
      const current = groups.get(key);
      if (current) current.entries.push(entry);
      else groups.set(key, {
        id: key,
        latitude: entry.location.latitude,
        longitude: entry.location.longitude,
        entries: [entry],
      });
    });
    return [...groups.values()];
  }, [visiblePlaced]);
  const fitPoints = useMemo<Array<[number, number]>>(() => {
    const points = visiblePlaced.map((entry) => [entry.location.latitude, entry.location.longitude] as [number, number]);
    visibleActiveZones.forEach((zone) => {
      const latitudeRadius = zone.radiusKm / 111;
      const longitudeRadius = zone.radiusKm / Math.max(30, 111 * Math.cos(zone.centerLatitude * Math.PI / 180));
      points.push(
        [zone.centerLatitude + latitudeRadius, zone.centerLongitude],
        [zone.centerLatitude - latitudeRadius, zone.centerLongitude],
        [zone.centerLatitude, zone.centerLongitude + longitudeRadius],
        [zone.centerLatitude, zone.centerLongitude - longitudeRadius],
      );
    });
    return points;
  }, [visibleActiveZones, visiblePlaced]);
  const filteredSources = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ja-JP');
    return sources
      .filter((source) => matchesMapLocationFilters(source, mapLocationFilters))
      .filter((source) => !query || `${source.childName || ''} ${source.locationName} ${source.locationType} ${source.address}`.toLocaleLowerCase('ja-JP').includes(query));
  }, [mapLocationFilters, search, sources]);

  const toggleMapLocationFilter = (filter: MapLocationFilter) => {
    setMapLocationFilters((current) => {
      const next = current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter];
      return next.length ? next : current;
    });
  };

  const preferredZonesForGroup = useCallback((group: SimpleMarkerGroup) => {
    const sourceIds = group.entries.map(({ source }) => source.id);
    return zones
      .flatMap((zone) => {
        const ranks = sourceIds.map((id) => Number(zone.locationPriorities?.[id])).filter((rank) => Number.isFinite(rank) && rank > 0);
        if (ranks.length) return [{ zone, rank: Math.min(...ranks) }];
        if (sourceIds.some((id) => zone.locationIds?.includes(id))) return [{ zone, rank: 1000 + zone.priority }];
        return [];
      })
      .sort((left, right) => left.rank - right.rank || left.zone.priority - right.zone.priority)
      .map(({ zone }) => zone);
  }, [zones]);

  const openPinAreaEditor = useCallback((group: SimpleMarkerGroup) => {
    setPinAreaDraft({
      groupId: group.id,
      sourceIds: group.entries.map(({ source }) => source.id),
      title: simpleGroupLabel(group),
      zoneIds: preferredZonesForGroup(group).map((zone) => zone.id),
    });
    setZoneDraft(undefined);
    setPlacingZoneCenter(false);
    setShowSettings(true);
    setMessage('送迎エリアを複数選択し、上から優先順に並べて保存してください。');
  }, [preferredZonesForGroup]);

  const movePinArea = (zoneId: string, direction: -1 | 1) => {
    if (!pinAreaDraft) return;
    const currentIndex = pinAreaDraft.zoneIds.indexOf(zoneId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= pinAreaDraft.zoneIds.length) return;
    const next = [...pinAreaDraft.zoneIds];
    [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
    setPinAreaDraft({ ...pinAreaDraft, zoneIds: next });
  };

  const savePinAreaPreferences = async () => {
    if (!pinAreaDraft) return;
    setSaving(true);
    setError('');
    try {
      const now = new Date().toISOString();
      const updates = zones.flatMap((zone) => {
        const nextPriorities = { ...(zone.locationPriorities || {}) };
        pinAreaDraft.sourceIds.forEach((sourceId) => { delete nextPriorities[sourceId]; });
        const rank = pinAreaDraft.zoneIds.indexOf(zone.id) + 1;
        if (rank > 0) pinAreaDraft.sourceIds.forEach((sourceId) => { nextPriorities[sourceId] = rank; });
        const remainingIds = (zone.locationIds || []).filter((sourceId) => !pinAreaDraft.sourceIds.includes(sourceId));
        const nextLocationIds = rank > 0 ? Array.from(new Set([...remainingIds, ...pinAreaDraft.sourceIds])) : remainingIds;
        if (JSON.stringify(nextPriorities) === JSON.stringify(zone.locationPriorities || {})
          && JSON.stringify(nextLocationIds) === JSON.stringify(zone.locationIds || [])) return [];
        return [Promise.resolve(onSaveZone({ ...zone, locationIds: nextLocationIds, locationPriorities: nextPriorities, updatedAt: now }))];
      });
      await Promise.all(updates);
      setMessage(`${pinAreaDraft.title}の送迎エリア優先順を保存しました。`);
      setPinAreaDraft(undefined);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '送迎エリアの優先順を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const beginNewZone = () => {
    const now = new Date().toISOString();
    setZoneDraft({
      id: createUuid(),
      name: `送迎エリア ${zones.length + 1}`,
      color: ZONE_COLORS[zones.length % ZONE_COLORS.length],
      centerLatitude: center[0],
      centerLongitude: center[1],
      radiusKm: 2,
      priority: Math.max(0, ...zones.map((zone) => zone.priority)) + 10,
      active: true,
      locationIds: [],
      locationPriorities: {},
      showBoundary: false,
      createdAt: now,
      updatedAt: now,
    });
    setPlacingZoneCenter(false);
    setPinAreaDraft(undefined);
    setShowSettings(true);
    setMapMode('simple');
    setMapLocationFilters(['residential', 'education']);
    setManualSourceId('');
    setPendingManual(undefined);
    setMessage('送迎エリア名を登録してください。登録後、地図のピンから優先エリアを設定できます。');
    setError('');
  };

  const geocodeSources = useCallback(async (targets: SourceLocation[], askConfirmation: boolean) => {
    if (!GOOGLE_MAP_CONFIGURED) {
      setError('Google地図の公開設定が未完了のため、住所の自動配置は停止しています。設定完了までは手動配置を利用してください。');
      return;
    }
    if (!targets.length) return setMessage('住所登録済みの地点はすべて配置されています。');
    const addressGroups = new Map<string, SourceLocation[]>();
    targets.forEach((source) => {
      const key = normalizeMapAddress(source.address);
      addressGroups.set(key, [...(addressGroups.get(key) || []), source]);
    });
    const representatives = [...addressGroups.values()].map((group) => group[0]);
    if (askConfirmation && !window.confirm(`${representatives.length}件の住所をGoogle Geocoding APIへ送信し、緯度・経度へ変換します。実行しますか？`)) return;
    setGeocoding(true);
    setMessage('');
    setError('');
    try {
      let resolvedCount = 0;
      const failureCodes = new Set<string>();
      for (let index = 0; index < representatives.length; index += 50) {
        const batch = representatives.slice(index, index + 50);
        const results = await geocodeTransportLocations(batch.map((source) => ({
          id: source.id,
          address: source.address,
          label: `${source.childName || ''} ${source.locationName}`.trim(),
        })));
        const now = new Date().toISOString();
        results.forEach((result) => { if (result.code) failureCodes.add(result.code); });
        const saves = results.flatMap((result) => {
          const representative = batch.find((candidate) => candidate.id === result.id);
          if (!representative || result.status !== 'resolved' || result.latitude === undefined || result.longitude === undefined) return [];
          const sameAddress = addressGroups.get(normalizeMapAddress(representative.address)) || [representative];
          resolvedCount += sameAddress.length;
          return sameAddress.map((source) => Promise.resolve(onSaveLocation({
              id: source.id,
              sourceType: source.sourceType,
              childId: source.childId,
              schoolId: source.schoolId,
              locationProfileId: source.locationProfileId,
              locationName: source.locationName,
              locationType: source.locationType,
              address: source.address,
              latitude: result.latitude,
              longitude: result.longitude,
              geocodeSource: 'google',
              googlePlaceId: result.placeId,
              geocodedAt: now,
              updatedAt: now,
            })));
        });
        await Promise.all(saves);
      }
      if (resolvedCount === 0 && (failureCodes.has('REQUEST_DENIED') || failureCodes.has('PERMISSION_DENIED'))) {
        throw new Error('住所の自動配置がGoogle側で拒否されました。Google CloudでGeocoding APIを有効にし、APIキーの制限対象へ追加してください。手動配置はそのまま利用できます。');
      }
      setMessage(`${resolvedCount}地点を登録住所から地図へ反映しました。${targets.length - resolvedCount > 0 ? ` 配置できなかった${targets.length - resolvedCount}地点は住所確認または手動配置が必要です。` : ''}`);
    } catch (geocodeError) {
      setError(geocodeError instanceof Error ? geocodeError.message : '住所から位置を取得できませんでした。');
    } finally {
      setGeocoding(false);
    }
  }, [onSaveLocation]);

  const geocodeUnresolved = () => void geocodeSources(unresolved, true);

  useEffect(() => {
    if (!GOOGLE_MAP_CONFIGURED || !supabase || !canManage || geocoding || unresolved.length === 0) return;
    const attemptKey = unresolved.map((source) => `${source.id}:${normalizeMapAddress(source.address)}`).sort().join('|');
    if (!attemptKey || autoGeocodeAttemptRef.current === attemptKey) return;
    autoGeocodeAttemptRef.current = attemptKey;
    void geocodeSources(unresolved, false);
  }, [canManage, geocodeSources, geocoding, unresolved]);

  const saveManualLocation = async () => {
    if (!pendingManual) return;
    setSaving(true);
    setError('');
    try {
      const now = new Date().toISOString();
      await onSaveLocation({
        id: pendingManual.source.id,
        sourceType: pendingManual.source.sourceType,
        childId: pendingManual.source.childId,
        schoolId: pendingManual.source.schoolId,
        locationProfileId: pendingManual.source.locationProfileId,
        locationName: pendingManual.source.locationName,
        locationType: pendingManual.source.locationType,
        address: pendingManual.source.address,
        latitude: pendingManual.latitude,
        longitude: pendingManual.longitude,
        geocodeSource: 'manual',
        geocodedAt: now,
        updatedAt: now,
      });
      setMessage(`${pendingManual.source.childName ? `${pendingManual.source.childName}・` : ''}${pendingManual.source.locationName}の位置を保存しました。`);
      setPendingManual(undefined);
      setManualSourceId('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '位置を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const saveZone = async () => {
    if (!zoneDraft) return;
    if (!zoneDraft.name.trim()) return setError('送迎エリア名を入力してください。');
    setSaving(true);
    setError('');
    try {
      await onSaveZone({ ...zoneDraft, radiusKm: Number(zoneDraft.radiusKm), priority: Number(zoneDraft.priority), updatedAt: new Date().toISOString() });
      setMessage(`送迎エリア「${zoneDraft.name}」を保存しました。地図のピンを選ぶと、このエリアを優先候補に登録できます。`);
      setZoneDraft(undefined);
      setPlacingZoneCenter(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '送迎エリアを保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const removeZone = async (zone: TransportAreaZone) => {
    if (!window.confirm(`「${zone.name}」を削除しますか？`)) return;
    setSaving(true);
    setError('');
    try {
      await onDeleteZone(zone.id);
      if (zoneDraft?.id === zone.id) setZoneDraft(undefined);
      if (pinAreaDraft?.zoneIds.includes(zone.id)) setPinAreaDraft({ ...pinAreaDraft, zoneIds: pinAreaDraft.zoneIds.filter((id) => id !== zone.id) });
      setMessage(`「${zone.name}」を削除しました。`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '送迎エリアを削除できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const handleMapClick = (latitude: number, longitude: number) => {
    if (manualSourceId) {
      const source = sources.find((candidate) => candidate.id === manualSourceId);
      if (source) setPendingManual({ source, latitude, longitude });
      return;
    }
    if (placingZoneCenter && zoneDraft) {
      setZoneDraft({ ...zoneDraft, centerLatitude: latitude, centerLongitude: longitude });
      setPlacingZoneCenter(false);
      setMessage('範囲の中心を変更しました。半径を調整して保存してください。');
    }
  };

  const googleMarkers = useMemo<GoogleTransportMarker[]>(() => {
    if (mapMode === 'simple') {
      return simpleMarkerGroups.map((group) => {
        const first = group.entries[0];
        const preferredZones = preferredZonesForGroup(group).filter((candidate) => candidate.active);
        const zone = preferredZones[0] || findTransportZone(first.location, activeZones);
        const selected = pinAreaDraft?.groupId === group.id;
        return {
          id: group.id,
          latitude: group.latitude,
          longitude: group.longitude,
          color: zone?.color || markerColor(first.source.locationType),
          title: simpleGroupLabel(group),
          label: simpleGroupLabel(group),
          selected,
          details: [
            preferredZones.length
              ? `優先エリア：${preferredZones.map((candidate, index) => `${index + 1}.${candidate.name}`).join(' / ')}`
              : zone ? `円範囲の候補：${zone.name}` : '優先エリア未設定',
            'ピンを選ぶと優先順を編集できます',
            ...group.entries.map(({ source }) => `${source.childName ? `${source.childName}・` : ''}${source.locationName}`),
          ],
        };
      });
    }
    return visiblePlaced.map(({ source, location }) => {
      const preferredZones = findTransportZones(location, activeZones);
      const zone = preferredZones[0];
      return {
        id: source.id,
        latitude: location.latitude,
        longitude: location.longitude,
        color: markerColor(source.locationType),
        title: `${source.childName ? `${source.childName}・` : ''}${source.locationName}`,
        selected: simpleMarkerGroups.some((group) => group.id === pinAreaDraft?.groupId && group.entries.some((entry) => entry.source.id === source.id)),
        details: [source.locationType, source.address, zone ? `優先エリア：${preferredZones.map((candidate, index) => `${index + 1}.${candidate.name}`).join(' / ')}` : '優先エリア未設定', 'ピンを選ぶと優先順を編集できます'],
      };
    });
  }, [activeZones, mapMode, pinAreaDraft?.groupId, preferredZonesForGroup, simpleMarkerGroups, visiblePlaced]);
  const pendingGoogleMarker = pendingManual ? {
    id: `pending:${pendingManual.source.id}`,
    latitude: pendingManual.latitude,
    longitude: pendingManual.longitude,
    color: markerColor(pendingManual.source.locationType),
    title: '保存前の位置',
    details: [`${pendingManual.source.childName ? `${pendingManual.source.childName}・` : ''}${pendingManual.source.locationName}`],
  } satisfies GoogleTransportMarker : undefined;
  const handleGoogleMarkerClick = (markerId: string) => {
    const group = simpleMarkerGroups.find((candidate) => candidate.id === markerId
      || candidate.entries.some(({ source }) => source.id === markerId));
    if (group) openPinAreaEditor(group);
  };

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><MapPinned className="h-5 w-5 text-teal-700" /><h3 className="font-black text-slate-950">送迎地点と優先エリア</h3></div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">表示する地点を組み合わせて位置関係を確認し、各ピンへ第1・第2候補の送迎エリアを登録します。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="grid min-h-11 grid-cols-2 rounded-xl bg-slate-100 p-1" aria-label="地図表示切替">
              <button type="button" disabled={Boolean(manualSourceId || placingZoneCenter)} onClick={() => setMapMode('simple')} className={`rounded-lg px-3 text-xs font-black disabled:opacity-40 ${mapMode === 'simple' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500'}`}>簡易表示</button>
              <button type="button" onClick={() => setMapMode('detail')} className={`rounded-lg px-3 text-xs font-black ${mapMode === 'detail' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>詳細地図</button>
            </div>
            <button type="button" onClick={() => setShowSettings((current) => !current)} aria-expanded={showSettings} className={`min-h-11 rounded-xl border px-3 text-xs font-black ${showSettings ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{showSettings ? '設定を閉じる' : canManage ? '地点・範囲を設定' : '地点一覧を表示'}</button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-black">
          <span className="rounded-full bg-teal-50 px-3 py-1.5 text-teal-800">地図配置 {placed.length}/{sources.length}件</span>
          <span className="rounded-full bg-violet-50 px-3 py-1.5 text-violet-800">送迎エリア {activeZones.length}件</span>
          {unresolved.length > 0 && <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-800">未配置 {unresolved.length}件</span>}
          {activeZones.map((zone) => <span key={zone.id} className="rounded-full border bg-white px-3 py-1.5 text-slate-700" style={{ borderColor: zone.color }}><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: zone.color }} />{zone.name}</span>)}
        </div>
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
          <div className="flex items-center justify-between gap-3 px-1 pb-2">
            <p className="text-[10px] font-black text-slate-600">地図に表示する地点（複数選択可）</p>
            <span className="text-[10px] font-bold text-slate-400">表示 {visiblePlaced.length}地点</span>
          </div>
          <div className="ui-scrollbar flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="地図に表示する地点の複数選択">
            <button
              type="button"
              aria-pressed={mapLocationFilters.length === ALL_MAP_LOCATION_FILTERS.length}
              onClick={() => setMapLocationFilters(ALL_MAP_LOCATION_FILTERS)}
              className={`min-h-10 shrink-0 rounded-lg border px-3 text-xs font-black transition ${mapLocationFilters.length === ALL_MAP_LOCATION_FILTERS.length ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'}`}
            >
              すべて
            </button>
            {MAP_LOCATION_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                aria-pressed={mapLocationFilters.includes(filter.id)}
                onClick={() => toggleMapLocationFilter(filter.id)}
                className={`min-h-10 shrink-0 rounded-lg border px-3 text-xs font-black transition ${mapLocationFilters.includes(filter.id) ? 'border-teal-700 bg-teal-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:border-teal-300 hover:text-teal-800'}`}
              >
                {filter.label}<span className={`ml-1.5 text-[10px] ${mapLocationFilters.includes(filter.id) ? 'text-teal-100' : 'text-slate-400'}`}>{filterCounts[filter.id]}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="mt-3 text-[10px] font-bold leading-relaxed text-amber-800"><ShieldAlert className="mr-1 inline h-3.5 w-3.5" />児童宅・学校の位置は個人情報です。業務上必要な範囲でのみ閲覧してください。住所の自動配置を実行すると、登録住所をGoogle Maps Platformへ送信して位置へ変換します。</p>
        {!GOOGLE_MAP_CONFIGURED && <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-relaxed text-amber-900">Google地図の公開設定が未完了です。現在は手動配置用の代替地図だけを表示し、Googleで取得した位置と住所の自動変換は停止しています。</p>}
        {message && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" />{message}</p>}
        {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</p>}
      </div>

      <div className={`grid min-w-0 gap-3 ${showSettings ? 'xl:grid-cols-[minmax(0,1fr)_22rem]' : ''}`}>
        <div className={`relative min-w-0 overflow-hidden rounded-2xl border border-slate-200 shadow-sm ${mapMode === 'simple' ? 'bg-slate-50' : 'bg-white'}`}>
          {(manualSourceId || placingZoneCenter) && <div className="absolute left-3 right-3 top-3 z-[500] rounded-xl bg-slate-950/95 px-4 py-3 text-sm font-black text-white shadow-xl"><Crosshair className="mr-2 inline h-5 w-5 text-teal-300" />{manualSourceId ? '地図をタップして位置を指定してください' : '地図をタップして範囲の中心を指定してください'}<button type="button" onClick={() => { setManualSourceId(''); setPendingManual(undefined); setPlacingZoneCenter(false); }} className="float-right rounded p-1" aria-label="位置指定を中止"><X className="h-4 w-4" /></button></div>}
          {mapMode === 'simple' && !(manualSourceId || placingZoneCenter) && <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-xl bg-white/95 px-3 py-2 text-[10px] font-black text-slate-700 shadow-sm">ピンを選択すると送迎エリアの優先順を設定</div>}
          {GOOGLE_MAP_CONFIGURED ? <GoogleTransportMap
            apiKey={GOOGLE_MAPS_BROWSER_KEY}
            mapId={GOOGLE_MAPS_MAP_ID}
            center={center}
            fitPoints={fitPoints}
            markers={googleMarkers}
            zones={visibleActiveZones}
            draftZone={zoneDraft?.showBoundary === false ? undefined : zoneDraft}
            pendingMarker={pendingGoogleMarker}
            simple={mapMode === 'simple'}
            interactiveMapClick={Boolean(manualSourceId || (placingZoneCenter && zoneDraft))}
            onMapClick={handleMapClick}
            onMarkerClick={handleGoogleMarkerClick}
          /> : <MapContainer center={center} zoom={12} scrollWheelZoom zoomControl={mapMode === 'detail'} className={`h-[36rem] w-full sm:h-[44rem] xl:h-[calc(100dvh-9rem)] xl:min-h-[46rem] xl:max-h-[68rem] ${mapMode === 'simple' ? 'transport-map-simple' : ''}`} aria-label="送迎地点マップ（手動配置用）">
            <TileLayer className={mapMode === 'simple' ? 'transport-map-muted-tiles' : ''} opacity={mapMode === 'simple' ? 0.52 : 1} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <FitMap points={fitPoints} />
            <MapClickHandler enabled={Boolean(manualSourceId || (placingZoneCenter && zoneDraft))} onClick={handleMapClick} />
            {visibleActiveZones.map((zone) => <Circle key={zone.id} center={[zone.centerLatitude, zone.centerLongitude]} radius={zone.radiusKm * 1000} pathOptions={{ color: zone.color, fillColor: zone.color, fillOpacity: mapMode === 'simple' ? 0.22 : 0.12, weight: mapMode === 'simple' ? 4 : 3 }}><Popup><strong>{zone.name}</strong><br />半径 {zone.radiusKm}km・優先 {zone.priority}</Popup>{mapMode === 'simple' && <Tooltip permanent direction="center" className="transport-zone-label">{zone.name}</Tooltip>}</Circle>)}
            {mapMode === 'simple' ? simpleMarkerGroups.map((group) => {
              const first = group.entries[0];
              const preferredZones = preferredZonesForGroup(group).filter((candidate) => candidate.active);
              const zone = preferredZones[0] || findTransportZone(first.location, activeZones);
              const selected = pinAreaDraft?.groupId === group.id;
              return <Marker key={group.id} position={[group.latitude, group.longitude]} icon={markerIcon(first.source.locationType, true, zone?.color, selected)} eventHandlers={{ click: () => openPinAreaEditor(group) }}><Tooltip permanent direction="top" offset={[0, -13]} className="transport-map-label">{simpleGroupLabel(group)}</Tooltip><Popup><div className="min-w-44"><strong>{simpleGroupLabel(group)}</strong><p className="mt-1 text-xs font-bold" style={{ color: zone?.color || '#64748b' }}>{preferredZones.length ? `優先：${preferredZones.map((candidate, index) => `${index + 1}.${candidate.name}`).join(' / ')}` : zone ? `円範囲の候補：${zone.name}` : '優先エリア未設定'}</p><p className="mt-2 text-xs font-bold text-teal-700">クリックして優先順を編集</p><ul className="mt-2 space-y-1 text-xs">{group.entries.map(({ source }) => <li key={source.id}>{source.childName ? `${source.childName}・` : ''}{source.locationName}</li>)}</ul></div></Popup></Marker>;
            }) : visiblePlaced.map(({ source, location }) => {
              const preferredZones = findTransportZones(location, activeZones);
              const zone = preferredZones[0];
              const group = simpleMarkerGroups.find((candidate) => candidate.entries.some((entry) => entry.source.id === source.id));
              return <Marker key={source.id} position={[location.latitude, location.longitude]} icon={markerIcon(source.locationType, false, zone?.color, group?.id === pinAreaDraft?.groupId)} eventHandlers={group ? { click: () => openPinAreaEditor(group) } : undefined}><Popup><div className="min-w-48"><strong>{source.childName ? `${source.childName}・` : ''}{source.locationName}</strong><p>{source.locationType}</p><p className="mt-1 text-xs">{source.address}</p><p className="mt-2 font-bold" style={{ color: zone?.color || '#64748b' }}>{zone ? `優先：${preferredZones.map((candidate, index) => `${index + 1}.${candidate.name}`).join(' / ')}` : '優先エリア未設定'}</p>{canManage && <button type="button" onClick={() => { setManualSourceId(source.id); setPendingManual(undefined); setPlacingZoneCenter(false); setShowSettings(true); }} className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">位置を修正</button>}</div></Popup></Marker>;
            })}
            {pendingManual && <Marker position={[pendingManual.latitude, pendingManual.longitude]} icon={markerIcon(pendingManual.source.locationType)}><Popup>保存前の位置</Popup></Marker>}
            {zoneDraft?.showBoundary !== false && <Circle center={[zoneDraft.centerLatitude, zoneDraft.centerLongitude]} radius={zoneDraft.radiusKm * 1000} pathOptions={{ color: zoneDraft.color, fillColor: zoneDraft.color, fillOpacity: 0.24, dashArray: '8 6', weight: 4 }} />}
          </MapContainer>}
          <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex flex-wrap gap-1 text-[10px] font-black">
            <Legend color="#7c3aed" label="事業所" /><Legend color="#059669" label="自宅・親族宅" /><Legend color="#0284c7" label="学校・学童" /><Legend color="#d97706" label="その他" />
          </div>
        </div>

        {showSettings && <aside className="ui-panel-enter min-w-0 space-y-3">
          {canManage && (
            <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <button type="button" onClick={geocodeUnresolved} disabled={!GOOGLE_MAP_CONFIGURED || geocoding || unresolved.length === 0} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-black text-teal-800 disabled:opacity-50">{geocoding ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{GOOGLE_MAP_CONFIGURED ? `住所から位置を更新（${unresolved.length}）` : 'Google地図の設定が必要'}</button>
                <button type="button" onClick={beginNewZone} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-black text-white"><Plus className="h-4 w-4" />送迎エリアを登録</button>
              </div>
              <p className="mt-2 text-[9px] leading-relaxed text-slate-500">Google地図設定後は、新しい住所を開いた際に自動反映します。同じ住所は1回だけ照会し、学校や兄弟で位置を共有します。Googleで取得した位置は30日以内に再取得し、手動配置はそのまま保持します。</p>
            </section>
          )}
          {pendingManual && (
            <section className="rounded-2xl border-2 border-teal-300 bg-teal-50 p-4 shadow-sm">
              <h4 className="font-black text-teal-950">この位置で保存しますか？</h4>
              <p className="mt-1 text-xs text-teal-900">{pendingManual.source.childName ? `${pendingManual.source.childName}・` : ''}{pendingManual.source.locationName}</p>
              <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setPendingManual(undefined)} className="min-h-11 rounded-xl border border-teal-300 bg-white text-sm font-bold">選び直す</button><button type="button" onClick={saveManualLocation} disabled={saving} className="min-h-11 rounded-xl bg-teal-700 text-sm font-black text-white disabled:opacity-50">位置を保存</button></div>
            </section>
          )}

          {pinAreaDraft && (
            <section className="rounded-2xl border-2 border-teal-300 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2"><div><h4 className="font-black text-slate-950">地点の優先エリア</h4><p className="mt-1 text-xs font-bold text-teal-800">{pinAreaDraft.title}</p></div><button type="button" onClick={() => setPinAreaDraft(undefined)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100" aria-label="優先エリア編集を閉じる"><X className="h-4 w-4" /></button></div>
              <p className="mt-3 text-[10px] leading-relaxed text-slate-500">複数登録できます。上にあるエリアほど、自動配車で優先してまとめます。</p>
              <div className="mt-3 space-y-2">
                {pinAreaDraft.zoneIds.map((zoneId, index) => {
                  const zone = zones.find((candidate) => candidate.id === zoneId);
                  if (!zone) return null;
                  return <div key={zoneId} className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 p-2"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-teal-700 text-xs font-black text-white">{index + 1}</span><span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: zone.color }} /><strong className="min-w-0 flex-1 truncate text-xs text-slate-900">{zone.name}{zone.active ? '' : '（停止中）'}</strong><button type="button" onClick={() => movePinArea(zoneId, -1)} disabled={index === 0} className="grid h-8 w-8 place-items-center rounded-lg bg-white text-slate-600 disabled:opacity-25" aria-label={`${zone.name}の優先順位を上げる`}><ArrowUp className="h-4 w-4" /></button><button type="button" onClick={() => movePinArea(zoneId, 1)} disabled={index === pinAreaDraft.zoneIds.length - 1} className="grid h-8 w-8 place-items-center rounded-lg bg-white text-slate-600 disabled:opacity-25" aria-label={`${zone.name}の優先順位を下げる`}><ArrowDown className="h-4 w-4" /></button><button type="button" onClick={() => setPinAreaDraft({ ...pinAreaDraft, zoneIds: pinAreaDraft.zoneIds.filter((id) => id !== zoneId) })} className="grid h-8 w-8 place-items-center rounded-lg bg-rose-50 text-rose-700" aria-label={`${zone.name}を候補から外す`}><X className="h-4 w-4" /></button></div>;
                })}
                {pinAreaDraft.zoneIds.length === 0 && <p className="rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-500">優先エリアは未設定です。</p>}
              </div>
              <div className="mt-3 border-t border-slate-100 pt-3"><p className="text-[10px] font-black text-slate-500">候補へ追加</p><div className="mt-2 flex flex-wrap gap-2">{activeZones.filter((zone) => !pinAreaDraft.zoneIds.includes(zone.id)).map((zone) => <button key={zone.id} type="button" onClick={() => setPinAreaDraft({ ...pinAreaDraft, zoneIds: [...pinAreaDraft.zoneIds, zone.id] })} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-black text-slate-700"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: zone.color }} />{zone.name}<Plus className="h-3.5 w-3.5" /></button>)}{activeZones.length === 0 && <p className="text-xs text-amber-700">先に送迎エリアを登録してください。</p>}</div></div>
              {canManage && <button type="button" onClick={savePinAreaPreferences} disabled={saving} className="mt-4 min-h-12 w-full rounded-xl bg-teal-700 text-sm font-black text-white disabled:opacity-50">この優先順で保存</button>}
            </section>
          )}

          {zoneDraft && (
            <section className="rounded-2xl border-2 border-violet-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between"><h4 className="font-black text-slate-950">送迎エリアを編集</h4><button type="button" onClick={() => { setZoneDraft(undefined); setPlacingZoneCenter(false); }} className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100" aria-label="エリア編集を閉じる"><X className="h-4 w-4" /></button></div>
              <div className="mt-3 space-y-3">
                <label className="block text-xs font-black text-slate-700">送迎エリア名<input value={zoneDraft.name} onChange={(event) => setZoneDraft({ ...zoneDraft, name: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base" placeholder="例：高須エリア" /></label>
                <label className="block text-xs font-black text-slate-700">表示色<input type="color" value={zoneDraft.color} onChange={(event) => setZoneDraft({ ...zoneDraft, color: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white p-1" /></label>
                <label className="block text-xs font-black text-slate-700">補足（任意）<textarea rows={2} value={zoneDraft.note || ''} onChange={(event) => setZoneDraft({ ...zoneDraft, note: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-base" /></label>
                <label className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-50 px-3 text-sm font-bold"><input type="checkbox" checked={zoneDraft.active} onChange={(event) => setZoneDraft({ ...zoneDraft, active: event.target.checked })} className="h-5 w-5 accent-violet-600" />自動配車で使用する</label>
                <label className="flex min-h-11 items-center gap-2 rounded-xl border border-violet-100 bg-violet-50 px-3 text-sm font-bold text-violet-900"><input type="checkbox" checked={zoneDraft.showBoundary !== false} onChange={(event) => setZoneDraft({ ...zoneDraft, showBoundary: event.target.checked })} className="h-5 w-5 accent-violet-600" />円範囲も補助表示する</label>
                {zoneDraft.showBoundary !== false && <div className="space-y-3 rounded-xl border border-violet-100 p-3"><label className="block text-xs font-black text-slate-700">半径 {zoneDraft.radiusKm.toFixed(1)} km<input type="range" min="0.1" max="20" step="0.1" value={zoneDraft.radiusKm} onChange={(event) => setZoneDraft({ ...zoneDraft, radiusKm: Number(event.target.value) })} className="mt-2 w-full accent-violet-600" /></label><button type="button" onClick={() => { setPlacingZoneCenter(true); setManualSourceId(''); setPendingManual(undefined); setMapMode('detail'); }} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 text-sm font-black text-violet-800"><LocateFixed className="h-4 w-4" />円の中心を地図で調整</button></div>}
                <button type="button" onClick={saveZone} disabled={saving} className="min-h-12 w-full rounded-xl bg-violet-700 text-sm font-black text-white disabled:opacity-50">送迎エリアを保存</button>
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2"><h4 className="font-black text-slate-950">登録済み送迎エリア</h4>{canManage && <button type="button" onClick={beginNewZone} className="rounded-lg bg-slate-100 p-2" aria-label="送迎エリアを登録"><Plus className="h-4 w-4" /></button>}</div>
            <div className="mt-3 space-y-2">{[...zones].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, 'ja')).map((zone) => { const assignedCount = Object.keys(zone.locationPriorities || {}).length || zone.locationIds?.length || 0; return <article key={zone.id} className={`rounded-xl border p-3 ${zone.active ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-60'}`}><div className="flex items-start gap-2"><span className="mt-1 h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: zone.color }} /><div className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900">{zone.name}</strong><span className="text-[10px] font-bold text-slate-500">登録 {assignedCount}地点・{zone.showBoundary === false ? '円なし' : `補助円 ${zone.radiusKm}km`}{zone.active ? '' : '・停止中'}</span></div>{canManage && <><button type="button" onClick={() => { setZoneDraft({ ...zone, locationIds: zone.locationIds || [], locationPriorities: zone.locationPriorities || {}, showBoundary: zone.showBoundary !== false }); setPinAreaDraft(undefined); setPlacingZoneCenter(false); setManualSourceId(''); }} className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100" aria-label={`${zone.name}を編集`}><PencilLine className="h-3.5 w-3.5" /></button><button type="button" onClick={() => removeZone(zone)} className="grid h-8 w-8 place-items-center rounded-lg bg-rose-50 text-rose-700" aria-label={`${zone.name}を削除`}><Trash2 className="h-3.5 w-3.5" /></button></>}</div></article>; })}{zones.length === 0 && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">まだ送迎エリアがありません。先にエリア名を登録してください。</p>}</div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="font-black text-slate-950">登録地点</h4>
            <label className="relative mt-3 block"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="児童名・学校名・住所で検索" className="min-h-11 w-full rounded-xl border border-slate-300 pl-10 pr-3 text-base" /></label>
            <div className="ui-scrollbar mt-3 max-h-[26rem] space-y-2 overflow-y-auto pr-1">{filteredSources.map((source) => {
              const location = matchingLocation(source, displayLocations);
              const preferredZones = findTransportZones(location, activeZones);
              const zone = preferredZones[0];
              const group = simpleMarkerGroups.find((candidate) => candidate.entries.some((entry) => entry.source.id === source.id));
              return <article key={source.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start gap-2"><span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: location ? zone?.color || markerColor(source.locationType) : '#cbd5e1' }} /><div className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900">{source.childName ? `${source.childName}・` : ''}{source.locationName}</strong><span className="block truncate text-[10px] text-slate-500">{source.address}</span><span className="mt-1 block text-[10px] font-black" style={{ color: zone?.color || '#94a3b8' }}>{location ? preferredZones.length ? preferredZones.map((candidate, index) => `${index + 1}.${candidate.name}`).join(' → ') : '優先エリア未設定' : '位置未配置'}</span></div>{canManage && <div className="flex shrink-0 flex-col gap-1">{location && group && <button type="button" onClick={() => openPinAreaEditor(group)} className="rounded-lg border border-teal-200 bg-teal-50 px-2 py-1.5 text-[10px] font-black text-teal-800">エリア設定</button>}<button type="button" onClick={() => { setManualSourceId(source.id); setPendingManual(undefined); setPlacingZoneCenter(false); setMapMode('detail'); setMessage('地図上で位置を指定してください。'); }} className="rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] font-black text-slate-700">{location ? '位置修正' : '手動配置'}</button></div>}</div></article>;
            })}{filteredSources.length === 0 && <p className="py-6 text-center text-xs text-slate-400">該当する地点がありません。</p>}</div>
          </section>
        </aside>}
      </div>
    </section>
  );
};

const Legend = ({ color, label }: { color: string; label: string }) => <span className="rounded-full bg-white/95 px-2 py-1 text-slate-700 shadow"><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{label}</span>;
