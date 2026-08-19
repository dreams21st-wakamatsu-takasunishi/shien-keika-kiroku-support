import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { CheckCircle2, Crosshair, LoaderCircle, MapPinned, PencilLine, Plus, Search, ShieldAlert, Sparkles, Trash2, X } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import type { ChildProfile, SchoolProfile, TransportAreaZone, TransportLocationType, TransportMapLocation } from '../types';
import { geocodeTransportLocations } from '../services/dataService';
import { supabase } from '../lib/supabase';
import { getCanonicalTransportLocations } from '../utils/transportLocations';
import { findTransportZone, normalizeMapAddress } from '../utils/transportMap';
import { GoogleTransportMap, type GoogleTransportMarker } from './GoogleTransportMap';

export interface TransportPinColors { facility: string; residential: string; education: string; other: string }

interface TransportMapPanelProps {
  childrenList: ChildProfile[];
  schools: SchoolProfile[];
  facilityAddress: string;
  locations: TransportMapLocation[];
  zones: TransportAreaZone[];
  pinColors: TransportPinColors;
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
interface PendingManualLocation { source: SourceLocation; latitude: number; longitude: number }
interface MarkerGroup { id: string; latitude: number; longitude: number; entries: Array<{ source: SourceLocation; location: TransportMapLocation }> }
interface PinAreaDraft { groupId: string; sourceIds: string[]; title: string; zoneId: string }
type MapLocationFilter = 'facility' | 'residential' | 'education' | 'other';

const MAP_LOCATION_FILTERS: Array<{ id: MapLocationFilter; label: string }> = [
  { id: 'facility', label: '事業所' }, { id: 'residential', label: '自宅・親族宅' }, { id: 'education', label: '学校・学童' }, { id: 'other', label: 'その他' },
];
const ALL_MAP_LOCATION_FILTERS = MAP_LOCATION_FILTERS.map(({ id }) => id);
const DEFAULT_CENTER: [number, number] = [33.883, 130.875];
const ZONE_COLORS = ['#0f766e', '#0284c7', '#7c3aed', '#d97706', '#dc2626', '#475569'];
const createUuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const GOOGLE_MAPS_BROWSER_KEY = String(import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY || '').trim();
const GOOGLE_MAPS_MAP_ID = String(import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || '').trim();
const GOOGLE_MAP_CONFIGURED = Boolean(GOOGLE_MAPS_BROWSER_KEY && GOOGLE_MAPS_MAP_ID);

function sourceLocations(childrenList: ChildProfile[], schools: SchoolProfile[], facilityAddress: string): SourceLocation[] {
  const facility: SourceLocation[] = facilityAddress.trim() ? [{ id: 'facility', sourceType: 'facility', locationName: '事業所', locationType: '事業所', address: facilityAddress.trim() }] : [];
  const activeSchools = schools.filter((school) => school.active && school.address.trim());
  const schoolAddresses = new Set(activeSchools.map((school) => normalizeMapAddress(school.address)));
  const schoolLocations: SourceLocation[] = activeSchools.map((school) => ({ id: `school:${school.id}`, sourceType: 'school', schoolId: school.id, locationName: school.name, locationType: '学校', address: school.address.trim() }));
  const childLocations: SourceLocation[] = childrenList.flatMap((child) => getCanonicalTransportLocations(child)
    .filter((location) => location.address.trim())
    .filter((location) => location.type !== '学校' || (!location.schoolId && !schoolAddresses.has(normalizeMapAddress(location.address))))
    .map((location) => ({ id: `child:${child.id}:${location.id}`, sourceType: 'child' as const, childId: child.id, childName: child.name, locationProfileId: location.id, locationName: location.name, locationType: location.type, address: location.address.trim() })));
  return [...facility, ...schoolLocations, ...childLocations];
}
function matchingLocation(source: SourceLocation, locations: TransportMapLocation[]) {
  return locations.find((location) => location.id === source.id && normalizeMapAddress(location.address) === normalizeMapAddress(source.address));
}
function mapLocationCategory(source: SourceLocation): MapLocationFilter {
  if (source.sourceType === 'facility') return 'facility';
  if (source.locationType === '自宅' || source.locationType === '親族宅') return 'residential';
  if (source.locationType === '学校' || source.locationType === '学童') return 'education';
  return 'other';
}
function defaultMarkerColor(source: SourceLocation, colors: TransportPinColors) { return colors[mapLocationCategory(source)]; }
function markerGroupLabel(group: MarkerGroup) {
  const first = group.entries[0].source;
  if (first.sourceType === 'facility') return '事業所';
  if (first.sourceType === 'school') return first.locationName;
  return group.entries.length === 1 ? first.childName || first.locationName : `${first.childName || first.locationName}ほか${group.entries.length - 1}名`;
}
function markerIcon(color: string, selected = false) {
  const size = 28;
  return L.divIcon({ className: '', html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:4px solid white;box-shadow:0 0 0 ${selected ? 4 : 0}px ${selected ? color : 'transparent'},0 3px 10px rgba(15,23,42,.32)"></span>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}
function FitMap({ points }: { points: Array<[number, number]> }) {
  const map = useMap(); const key = points.map((point) => point.join(',')).join('|');
  useEffect(() => { if (!points.length) return; if (points.length === 1) map.setView(points[0], 14); else map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 15 }); }, [key, map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
function MapClickHandler({ enabled, onClick }: { enabled: boolean; onClick: (latitude: number, longitude: number) => void }) {
  useMapEvents({ click(event) { if (enabled) onClick(event.latlng.lat, event.latlng.lng); } }); return null;
}

export const TransportMapPanel: React.FC<TransportMapPanelProps> = ({ childrenList, schools, facilityAddress, locations, zones, pinColors, canManage, onSaveLocation, onSaveZone, onDeleteZone }) => {
  const sources = useMemo(() => sourceLocations(childrenList, schools, facilityAddress), [childrenList, facilityAddress, schools]);
  const displayLocations = useMemo(() => GOOGLE_MAP_CONFIGURED ? locations : locations.filter((location) => location.geocodeSource !== 'google'), [locations]);
  const placed = useMemo(() => sources.flatMap((source) => { const location = matchingLocation(source, displayLocations); return location ? [{ source, location }] : []; }), [displayLocations, sources]);
  const unresolved = useMemo(() => sources.filter((source) => !matchingLocation(source, displayLocations)), [displayLocations, sources]);
  const activeZones = useMemo(() => [...zones].filter((zone) => zone.active).sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name, 'ja')), [zones]);
  const [filters, setFilters] = useState<MapLocationFilter[]>(ALL_MAP_LOCATION_FILTERS);
  const [search, setSearch] = useState(''); const [showSettings, setShowSettings] = useState(false);
  const [geocoding, setGeocoding] = useState(false); const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const [manualSourceId, setManualSourceId] = useState(''); const [pendingManual, setPendingManual] = useState<PendingManualLocation>();
  const [zoneDraft, setZoneDraft] = useState<TransportAreaZone>(); const [pinAreaDraft, setPinAreaDraft] = useState<PinAreaDraft>();
  const autoGeocodeAttemptRef = useRef('');
  const visiblePlaced = useMemo(() => placed.filter(({ source }) => filters.includes(mapLocationCategory(source))), [filters, placed]);
  const markerGroups = useMemo(() => {
    const groups = new Map<string, MarkerGroup>(); visiblePlaced.forEach((entry) => { const key = `${entry.location.latitude.toFixed(5)}:${entry.location.longitude.toFixed(5)}`; const current = groups.get(key); if (current) current.entries.push(entry); else groups.set(key, { id: key, latitude: entry.location.latitude, longitude: entry.location.longitude, entries: [entry] }); }); return Array.from(groups.values());
  }, [visiblePlaced]);
  const center = useMemo<[number, number]>(() => { const facility = placed.find((entry) => entry.source.sourceType === 'facility')?.location; if (facility) return [facility.latitude, facility.longitude]; if (!placed.length) return DEFAULT_CENTER; return [placed.reduce((sum, entry) => sum + entry.location.latitude, 0) / placed.length, placed.reduce((sum, entry) => sum + entry.location.longitude, 0) / placed.length]; }, [placed]);
  const fitPoints = useMemo<Array<[number, number]>>(() => visiblePlaced.map(({ location }) => [location.latitude, location.longitude]), [visiblePlaced]);
  const filterCounts = useMemo(() => Object.fromEntries(MAP_LOCATION_FILTERS.map((filter) => [filter.id, placed.filter(({ source }) => mapLocationCategory(source) === filter.id).length])) as Record<MapLocationFilter, number>, [placed]);
  const filteredSources = useMemo(() => { const query = search.trim().toLocaleLowerCase('ja'); return sources.filter((source) => filters.includes(mapLocationCategory(source))).filter((source) => !query || `${source.childName || ''} ${source.locationName} ${source.address}`.toLocaleLowerCase('ja').includes(query)); }, [filters, search, sources]);
  const assignedZoneForIds = useCallback((sourceIds: string[]) => zones.filter((zone) => sourceIds.some((sourceId) => zone.locationIds?.includes(sourceId))).sort((left, right) => left.priority - right.priority)[0], [zones]);

  const openPinAreaEditor = useCallback((group: MarkerGroup) => { const sourceIds = group.entries.map(({ source }) => source.id); setPinAreaDraft({ groupId: group.id, sourceIds, title: markerGroupLabel(group), zoneId: assignedZoneForIds(sourceIds)?.id || '' }); setZoneDraft(undefined); setShowSettings(true); setMessage('この地点をまとめる送迎エリアを1つ選択してください。'); }, [assignedZoneForIds]);
  const savePinArea = async () => {
    if (!pinAreaDraft) return; setSaving(true); setError('');
    try {
      const now = new Date().toISOString();
      const updates = zones.flatMap((zone) => { const locationIds = (zone.locationIds || []).filter((id) => !pinAreaDraft.sourceIds.includes(id)); if (zone.id === pinAreaDraft.zoneId) locationIds.push(...pinAreaDraft.sourceIds); const nextPriorities = { ...(zone.locationPriorities || {}) }; pinAreaDraft.sourceIds.forEach((id) => { delete nextPriorities[id]; }); const nextIds = Array.from(new Set(locationIds)); if (JSON.stringify(nextIds) === JSON.stringify(zone.locationIds || []) && JSON.stringify(nextPriorities) === JSON.stringify(zone.locationPriorities || {})) return []; return [Promise.resolve(onSaveZone({ ...zone, locationIds: nextIds, locationPriorities: nextPriorities, showBoundary: false, updatedAt: now }))]; });
      await Promise.all(updates); setMessage(`${pinAreaDraft.title}の送迎エリアを${pinAreaDraft.zoneId ? '保存' : '解除'}しました。`); setPinAreaDraft(undefined);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : '送迎エリアを保存できませんでした。'); } finally { setSaving(false); }
  };
  const beginNewZone = () => { const now = new Date().toISOString(); setZoneDraft({ id: createUuid(), name: `送迎エリア ${zones.length + 1}`, color: ZONE_COLORS[zones.length % ZONE_COLORS.length], centerLatitude: center[0], centerLongitude: center[1], radiusKm: 1, priority: Math.max(0, ...zones.map((zone) => zone.priority)) + 10, active: true, note: '', locationIds: [], locationPriorities: {}, showBoundary: false, createdAt: now, updatedAt: now }); setPinAreaDraft(undefined); setShowSettings(true); setError(''); };
  const saveZone = async () => { if (!zoneDraft?.name.trim()) return setError('送迎エリア名を入力してください。'); setSaving(true); setError(''); try { await onSaveZone({ ...zoneDraft, name: zoneDraft.name.trim(), showBoundary: false, updatedAt: new Date().toISOString() }); setMessage(`送迎エリア「${zoneDraft.name.trim()}」を保存しました。`); setZoneDraft(undefined); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : '送迎エリアを保存できませんでした。'); } finally { setSaving(false); } };
  const removeZone = async (zone: TransportAreaZone) => { if (!window.confirm(`「${zone.name}」を削除しますか？\n登録地点の位置情報は削除されません。`)) return; setSaving(true); try { await onDeleteZone(zone.id); setZoneDraft(undefined); setPinAreaDraft(undefined); setMessage(`「${zone.name}」を削除しました。`); } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : '送迎エリアを削除できませんでした。'); } finally { setSaving(false); } };

  const geocodeSources = useCallback(async (targets: SourceLocation[], askConfirmation: boolean) => {
    if (!GOOGLE_MAP_CONFIGURED) return setError('Google地図の公開設定が未完了です。手動配置を利用してください。');
    if (!targets.length) return setMessage('住所登録済みの地点はすべて配置されています。');
    const addressGroups = new Map<string, SourceLocation[]>(); targets.forEach((source) => { const key = normalizeMapAddress(source.address); addressGroups.set(key, [...(addressGroups.get(key) || []), source]); }); const representatives = Array.from(addressGroups.values()).map((group) => group[0]);
    if (askConfirmation && !window.confirm(`${representatives.length}件の住所をGoogle Geocoding APIへ送信して地図へ配置します。実行しますか？`)) return;
    setGeocoding(true); setMessage(''); setError('');
    try {
      let resolvedCount = 0; const failureCodes = new Set<string>();
      for (let index = 0; index < representatives.length; index += 50) {
        const batch = representatives.slice(index, index + 50); const results = await geocodeTransportLocations(batch.map((source) => ({ id: source.id, address: source.address, label: `${source.childName || ''} ${source.locationName}`.trim() }))); const now = new Date().toISOString(); results.forEach((result) => { if (result.code) failureCodes.add(result.code); });
        const saves = results.flatMap((result) => { const representative = batch.find((source) => source.id === result.id); if (!representative || result.status !== 'resolved' || result.latitude === undefined || result.longitude === undefined) return []; const sameAddress = addressGroups.get(normalizeMapAddress(representative.address)) || [representative]; resolvedCount += sameAddress.length; return sameAddress.map((source) => Promise.resolve(onSaveLocation({ id: source.id, sourceType: source.sourceType, childId: source.childId, schoolId: source.schoolId, locationProfileId: source.locationProfileId, locationName: source.locationName, locationType: source.locationType, address: source.address, latitude: result.latitude!, longitude: result.longitude!, geocodeSource: 'google', googlePlaceId: result.placeId, geocodedAt: now, updatedAt: now }))); }); await Promise.all(saves);
      }
      if (!resolvedCount && (failureCodes.has('REQUEST_DENIED') || failureCodes.has('PERMISSION_DENIED'))) throw new Error('住所の自動配置がGoogle側で拒否されました。Geocoding APIとAPIキー制限を確認してください。'); setMessage(`${resolvedCount}地点を登録住所から地図へ反映しました。`);
    } catch (geocodeError) { setError(geocodeError instanceof Error ? geocodeError.message : '住所から位置を取得できませんでした。'); } finally { setGeocoding(false); }
  }, [onSaveLocation]);
  useEffect(() => { if (!GOOGLE_MAP_CONFIGURED || !supabase || !canManage || geocoding || !unresolved.length) return; const key = unresolved.map((source) => `${source.id}:${normalizeMapAddress(source.address)}`).sort().join('|'); if (!key || autoGeocodeAttemptRef.current === key) return; autoGeocodeAttemptRef.current = key; void geocodeSources(unresolved, false); }, [canManage, geocodeSources, geocoding, unresolved]);
  const handleMapClick = (latitude: number, longitude: number) => { if (!manualSourceId) return; const source = sources.find((candidate) => candidate.id === manualSourceId); if (source) setPendingManual({ source, latitude, longitude }); };
  const saveManualLocation = async () => { if (!pendingManual) return; setSaving(true); try { const now = new Date().toISOString(); await onSaveLocation({ id: pendingManual.source.id, sourceType: pendingManual.source.sourceType, childId: pendingManual.source.childId, schoolId: pendingManual.source.schoolId, locationProfileId: pendingManual.source.locationProfileId, locationName: pendingManual.source.locationName, locationType: pendingManual.source.locationType, address: pendingManual.source.address, latitude: pendingManual.latitude, longitude: pendingManual.longitude, geocodeSource: 'manual', geocodedAt: now, updatedAt: now }); setMessage(`${pendingManual.source.childName ? `${pendingManual.source.childName}・` : ''}${pendingManual.source.locationName}の位置を保存しました。`); setPendingManual(undefined); setManualSourceId(''); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : '位置を保存できませんでした。'); } finally { setSaving(false); } };

  const googleMarkers = useMemo<GoogleTransportMarker[]>(() => markerGroups.map((group) => { const first = group.entries[0]; const zone = assignedZoneForIds(group.entries.map(({ source }) => source.id)); return { id: group.id, latitude: group.latitude, longitude: group.longitude, color: zone?.color || defaultMarkerColor(first.source, pinColors), title: markerGroupLabel(group), label: markerGroupLabel(group), selected: pinAreaDraft?.groupId === group.id, details: [zone ? `送迎エリア：${zone.name}` : '送迎エリア未設定', ...group.entries.map(({ source }) => `${source.childName ? `${source.childName}・` : ''}${source.locationName}`)] }; }), [assignedZoneForIds, markerGroups, pinAreaDraft?.groupId, pinColors]);
  const pendingGoogleMarker = pendingManual ? { id: `pending:${pendingManual.source.id}`, latitude: pendingManual.latitude, longitude: pendingManual.longitude, color: defaultMarkerColor(pendingManual.source, pinColors), title: '保存前の位置', selected: true } satisfies GoogleTransportMarker : undefined;

  return <section className="space-y-3">
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex items-center gap-2"><MapPinned className="h-5 w-5 text-teal-700" /><h3 className="font-black text-slate-950">送迎地点とエリア</h3></div><p className="mt-1 text-xs text-slate-500">住所から各地点を配置し、同じ車両にまとめたい地域のエリアを地点ごとに登録します。</p></div><button type="button" onClick={() => setShowSettings((current) => !current)} className={`min-h-11 rounded-xl border px-3 text-xs font-black ${showSettings ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{showSettings ? '設定を閉じる' : canManage ? '地点・エリアを設定' : '地点一覧を表示'}</button></div>
      <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black"><span className="rounded-full bg-teal-50 px-3 py-1.5 text-teal-800">地図配置 {placed.length}/{sources.length}件</span><span className="rounded-full bg-violet-50 px-3 py-1.5 text-violet-800">エリア {activeZones.length}件</span>{unresolved.length > 0 && <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-800">未配置 {unresolved.length}件</span>}{activeZones.map((zone) => <span key={zone.id} className="rounded-full border bg-white px-3 py-1.5" style={{ borderColor: zone.color }}><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: zone.color }} />{zone.name}</span>)}</div>
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2"><p className="px-1 pb-2 text-[10px] font-black text-slate-600">表示地点（複数選択可）</p><div className="ui-scrollbar flex gap-1.5 overflow-x-auto"><button type="button" onClick={() => setFilters(ALL_MAP_LOCATION_FILTERS)} className={`min-h-10 shrink-0 rounded-lg border px-3 text-xs font-black ${filters.length === ALL_MAP_LOCATION_FILTERS.length ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}>すべて</button>{MAP_LOCATION_FILTERS.map((filter) => <button key={filter.id} type="button" onClick={() => setFilters((current) => { const next = current.includes(filter.id) ? current.filter((item) => item !== filter.id) : [...current, filter.id]; return next.length ? next : current; })} className={`min-h-10 shrink-0 rounded-lg border px-3 text-xs font-black ${filters.includes(filter.id) ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-500'}`}>{filter.label} {filterCounts[filter.id]}</button>)}</div></div>
      <p className="mt-3 text-[10px] font-bold text-amber-800"><ShieldAlert className="mr-1 inline h-3.5 w-3.5" />児童宅・学校の位置は個人情報です。業務上必要な範囲でのみ閲覧してください。</p>{message && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" />{message}</p>}{error && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</p>}
    </div>
    <div className={`grid min-w-0 gap-3 ${showSettings ? 'xl:grid-cols-[minmax(0,1fr)_22rem]' : ''}`}>
      <div className="relative min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
        {manualSourceId && <div className="absolute left-3 right-3 top-3 z-[500] rounded-xl bg-slate-950/95 px-4 py-3 text-sm font-black text-white shadow-xl"><Crosshair className="mr-2 inline h-5 w-5 text-teal-300" />地図をタップして位置を指定してください<button type="button" onClick={() => { setManualSourceId(''); setPendingManual(undefined); }} className="float-right" aria-label="位置指定を中止"><X className="h-4 w-4" /></button></div>}
        {!manualSourceId && <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-xl bg-white/95 px-3 py-2 text-[10px] font-black text-slate-700 shadow">ピンを選ぶと送迎エリアを設定できます</div>}
        {GOOGLE_MAP_CONFIGURED ? <GoogleTransportMap apiKey={GOOGLE_MAPS_BROWSER_KEY} mapId={GOOGLE_MAPS_MAP_ID} center={center} fitPoints={fitPoints} markers={googleMarkers} zones={[]} pendingMarker={pendingGoogleMarker} simple heightClassName="h-[38rem] sm:h-[44rem] xl:h-[48rem]" gestureHandling="cooperative" interactiveMapClick={Boolean(manualSourceId)} onMapClick={handleMapClick} onMarkerClick={(markerId) => { const group = markerGroups.find((candidate) => candidate.id === markerId); if (group && canManage) openPinAreaEditor(group); }} /> : <MapContainer center={center} zoom={12} scrollWheelZoom className="h-[38rem] w-full sm:h-[44rem] xl:h-[48rem]"><TileLayer opacity={0.58} attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><FitMap points={fitPoints} /><MapClickHandler enabled={Boolean(manualSourceId)} onClick={handleMapClick} />{markerGroups.map((group) => { const first = group.entries[0]; const zone = assignedZoneForIds(group.entries.map(({ source }) => source.id)); return <Marker key={group.id} position={[group.latitude, group.longitude]} icon={markerIcon(zone?.color || defaultMarkerColor(first.source, pinColors), pinAreaDraft?.groupId === group.id)} eventHandlers={{ click: () => { if (canManage) openPinAreaEditor(group); } }}><Popup><strong>{markerGroupLabel(group)}</strong><br />{zone ? `送迎エリア：${zone.name}` : '送迎エリア未設定'}</Popup></Marker>; })}{pendingManual && <Marker position={[pendingManual.latitude, pendingManual.longitude]} icon={markerIcon(defaultMarkerColor(pendingManual.source, pinColors), true)} />}</MapContainer>}
        {pendingManual && <div className="absolute bottom-3 left-3 right-3 z-[500] rounded-xl bg-white p-3 shadow-xl"><p className="text-xs font-black">{pendingManual.source.childName ? `${pendingManual.source.childName}・` : ''}{pendingManual.source.locationName}</p><div className="mt-2 flex gap-2"><button type="button" onClick={() => setPendingManual(undefined)} className="min-h-10 flex-1 rounded-lg border text-xs font-black">選び直す</button><button type="button" disabled={saving} onClick={() => void saveManualLocation()} className="min-h-10 flex-1 rounded-lg bg-teal-700 text-xs font-black text-white">この位置を保存</button></div></div>}
      </div>
      {showSettings && <aside className="space-y-3">
        {canManage && <section className="rounded-2xl border border-teal-200 bg-teal-50 p-4 shadow-sm"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-teal-700" /><h4 className="font-black text-teal-950">住所から自動配置</h4></div><p className="mt-1 text-[10px] text-teal-800">未配置 {unresolved.length}件</p><button type="button" disabled={geocoding || !unresolved.length} onClick={() => void geocodeSources(unresolved, true)} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 text-xs font-black text-white disabled:opacity-40">{geocoding && <LoaderCircle className="h-4 w-4 animate-spin" />}{geocoding ? '配置中…' : '未配置地点を反映'}</button></section>}
        {pinAreaDraft && <section className="rounded-2xl border border-teal-300 bg-white p-4 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-[10px] font-black text-teal-700">地点のエリア設定</p><h4 className="mt-1 font-black">{pinAreaDraft.title}</h4></div><button type="button" onClick={() => setPinAreaDraft(undefined)}><X className="h-4 w-4" /></button></div><label className="mt-3 block text-xs font-black">送迎エリア<select value={pinAreaDraft.zoneId} disabled={!canManage} onChange={(event) => setPinAreaDraft({ ...pinAreaDraft, zoneId: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"><option value="">エリア設定なし</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}{zone.active ? '' : '（停止中）'}</option>)}</select></label>{canManage && <button type="button" disabled={saving} onClick={() => void savePinArea()} className="mt-3 min-h-11 w-full rounded-xl bg-teal-700 text-xs font-black text-white">エリア設定を保存</button>}</section>}
        {zoneDraft && <section className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><h4 className="font-black">送迎エリアを編集</h4><button type="button" onClick={() => setZoneDraft(undefined)}><X className="h-4 w-4" /></button></div><div className="mt-3 space-y-3"><label className="block text-xs font-black">エリア名<input value={zoneDraft.name} onChange={(event) => setZoneDraft({ ...zoneDraft, name: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base" /></label><label className="flex items-center justify-between text-xs font-black">表示色<input type="color" value={zoneDraft.color} onChange={(event) => setZoneDraft({ ...zoneDraft, color: event.target.value })} className="h-11 w-20 rounded-xl border p-1" /></label><label className="block text-xs font-black">補足<textarea rows={2} value={zoneDraft.note || ''} onChange={(event) => setZoneDraft({ ...zoneDraft, note: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 p-3" /></label><label className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-50 px-3 text-sm font-bold"><input type="checkbox" checked={zoneDraft.active} onChange={(event) => setZoneDraft({ ...zoneDraft, active: event.target.checked })} />使用する</label><button type="button" disabled={saving} onClick={() => void saveZone()} className="min-h-11 w-full rounded-xl bg-violet-700 text-xs font-black text-white">送迎エリアを保存</button></div></section>}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><h4 className="font-black">登録済み送迎エリア</h4>{canManage && <button type="button" onClick={beginNewZone} className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100" aria-label="送迎エリアを追加"><Plus className="h-4 w-4" /></button>}</div><div className="mt-3 space-y-2">{[...zones].sort((left, right) => left.priority - right.priority).map((zone) => <article key={zone.id} className={`rounded-xl border p-3 ${zone.active ? 'border-slate-200' : 'border-dashed opacity-60'}`}><div className="flex items-start gap-2"><span className="mt-1 h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: zone.color }} /><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{zone.name}</strong><span className="text-[10px] text-slate-500">登録 {zone.locationIds?.length || 0}地点{zone.active ? '' : '・停止中'}</span></div>{canManage && <><button type="button" onClick={() => { setZoneDraft({ ...zone, showBoundary: false }); setPinAreaDraft(undefined); }} className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100" aria-label={`${zone.name}を編集`}><PencilLine className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void removeZone(zone)} className="grid h-8 w-8 place-items-center rounded-lg bg-rose-50 text-rose-700" aria-label={`${zone.name}を削除`}><Trash2 className="h-3.5 w-3.5" /></button></>}</div></article>)}{!zones.length && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">まだエリアがありません。</p>}</div></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h4 className="font-black">登録地点</h4><label className="relative mt-3 block"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="児童名・学校名・住所で検索" className="min-h-11 w-full rounded-xl border border-slate-300 pl-10 pr-3" /></label><div className="ui-scrollbar mt-3 max-h-[28rem] space-y-2 overflow-y-auto">{filteredSources.map((source) => { const location = matchingLocation(source, displayLocations); const group = markerGroups.find((candidate) => candidate.entries.some((entry) => entry.source.id === source.id)); const zone = location ? findTransportZone(location, zones) : undefined; return <article key={source.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start gap-2"><span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: location ? zone?.color || defaultMarkerColor(source, pinColors) : '#cbd5e1' }} /><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{source.childName ? `${source.childName}・` : ''}{source.locationName}</strong><span className="block truncate text-[10px] text-slate-500">{source.address}</span><span className="block text-[10px] font-black" style={{ color: zone?.color || '#94a3b8' }}>{location ? zone ? `エリア：${zone.name}` : 'エリア未設定' : '位置未配置'}</span></div>{canManage && <div className="flex shrink-0 flex-col gap-1">{location && group && <button type="button" onClick={() => openPinAreaEditor(group)} className="rounded-lg bg-teal-50 px-2 py-1.5 text-[10px] font-black text-teal-800">エリア</button>}<button type="button" onClick={() => { setManualSourceId(source.id); setPendingManual(undefined); setMessage('地図をタップして位置を指定してください。'); }} className="rounded-lg border px-2 py-1.5 text-[10px] font-black">{location ? '位置修正' : '手動配置'}</button></div>}</div></article>; })}</div></section>
      </aside>}
    </div>
  </section>;
};
