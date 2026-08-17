import React, { useEffect, useMemo, useState } from 'react';
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import {
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
  TransportAreaZone,
  TransportMapLocation,
  TransportLocationType,
} from '../types';
import { geocodeTransportLocations } from '../services/dataService';
import { getCanonicalTransportLocations } from '../utils/transportLocations';
import { findTransportZone, normalizeMapAddress } from '../utils/transportMap';

interface TransportMapPanelProps {
  childrenList: ChildProfile[];
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
  sourceType: 'facility' | 'child';
  childId?: string;
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

const DEFAULT_CENTER: [number, number] = [33.883, 130.875];
const ZONE_COLORS = ['#0f766e', '#0284c7', '#7c3aed', '#d97706', '#dc2626', '#475569'];
const createUuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function sourceLocations(childrenList: ChildProfile[], facilityAddress: string): SourceLocation[] {
  const facility = facilityAddress.trim()
    ? [{
        id: 'facility',
        sourceType: 'facility' as const,
        locationName: '事業所',
        locationType: '事業所' as const,
        address: facilityAddress.trim(),
      }]
    : [];
  const childLocations = childrenList.flatMap((child) => getCanonicalTransportLocations(child)
    .filter((location) => location.address.trim())
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
  return [...facility, ...childLocations];
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

function markerIcon(type: SourceLocation['locationType']) {
  const color = markerColor(type);
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:20px;height:20px;border-radius:9999px;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(15,23,42,.38)"></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
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
  facilityAddress,
  locations,
  zones,
  canManage,
  onSaveLocation,
  onSaveZone,
  onDeleteZone,
}) => {
  const sources = useMemo(() => sourceLocations(childrenList, facilityAddress), [childrenList, facilityAddress]);
  const placed = useMemo(() => sources.flatMap((source) => {
    const location = matchingLocation(source, locations);
    return location ? [{ source, location }] : [];
  }), [locations, sources]);
  const unresolved = useMemo(() => sources.filter((source) => !matchingLocation(source, locations)), [locations, sources]);
  const [search, setSearch] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [manualSourceId, setManualSourceId] = useState('');
  const [pendingManual, setPendingManual] = useState<PendingManualLocation>();
  const [zoneDraft, setZoneDraft] = useState<TransportAreaZone>();
  const [placingZoneCenter, setPlacingZoneCenter] = useState(false);
  const activeZones = useMemo(() => [...zones].filter((zone) => zone.active).sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, 'ja')), [zones]);
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
  const fitPoints = useMemo<Array<[number, number]>>(() => [
    ...placed.map((entry) => [entry.location.latitude, entry.location.longitude] as [number, number]),
    ...activeZones.map((zone) => [zone.centerLatitude, zone.centerLongitude] as [number, number]),
  ], [activeZones, placed]);
  const filteredSources = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ja-JP');
    if (!query) return sources;
    return sources.filter((source) => `${source.childName || ''} ${source.locationName} ${source.locationType} ${source.address}`.toLocaleLowerCase('ja-JP').includes(query));
  }, [search, sources]);

  const beginNewZone = () => {
    const now = new Date().toISOString();
    setZoneDraft({
      id: createUuid(),
      name: `優先範囲 ${zones.length + 1}`,
      color: ZONE_COLORS[zones.length % ZONE_COLORS.length],
      centerLatitude: center[0],
      centerLongitude: center[1],
      radiusKm: 2,
      priority: Math.max(0, ...zones.map((zone) => zone.priority)) + 10,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    setPlacingZoneCenter(true);
    setManualSourceId('');
    setPendingManual(undefined);
    setMessage('地図上で範囲の中心を選択してください。');
    setError('');
  };

  const geocodeUnresolved = async () => {
    if (!unresolved.length) return setMessage('住所登録済みの地点はすべて配置されています。');
    if (!window.confirm(`${unresolved.length}件の登録住所をGoogle Geocoding APIへ送信し、緯度・経度へ変換します。実行しますか？`)) return;
    setGeocoding(true);
    setMessage('');
    setError('');
    try {
      let resolvedCount = 0;
      const failureCodes = new Set<string>();
      for (let index = 0; index < unresolved.length; index += 50) {
        const batch = unresolved.slice(index, index + 50);
        const results = await geocodeTransportLocations(batch.map((source) => ({
          id: source.id,
          address: source.address,
          label: `${source.childName || ''} ${source.locationName}`.trim(),
        })));
        const now = new Date().toISOString();
        results.forEach((result) => { if (result.code) failureCodes.add(result.code); });
        const saves = results.flatMap((result) => {
          const source = batch.find((candidate) => candidate.id === result.id);
          if (!source || result.status !== 'resolved' || result.latitude === undefined || result.longitude === undefined) return [];
          resolvedCount += 1;
          return [Promise.resolve(onSaveLocation({
            id: source.id,
            sourceType: source.sourceType,
            childId: source.childId,
            locationProfileId: source.locationProfileId,
            locationName: source.locationName,
            locationType: source.locationType,
            address: source.address,
            latitude: result.latitude,
            longitude: result.longitude,
            geocodeSource: 'google',
            geocodedAt: now,
            updatedAt: now,
          }))];
        });
        await Promise.all(saves);
      }
      if (resolvedCount === 0 && (failureCodes.has('REQUEST_DENIED') || failureCodes.has('PERMISSION_DENIED'))) {
        throw new Error('住所の自動配置がGoogle側で拒否されました。Google CloudでGeocoding APIを有効にし、APIキーの制限対象へ追加してください。手動配置はそのまま利用できます。');
      }
      setMessage(`${resolvedCount}件の住所を地図へ配置しました。${unresolved.length - resolvedCount > 0 ? ` 配置できなかった${unresolved.length - resolvedCount}件は手動で位置を指定できます。` : ''}`);
    } catch (geocodeError) {
      setError(geocodeError instanceof Error ? geocodeError.message : '住所から位置を取得できませんでした。');
    } finally {
      setGeocoding(false);
    }
  };

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
    if (!zoneDraft.name.trim()) return setError('範囲名を入力してください。');
    setSaving(true);
    setError('');
    try {
      await onSaveZone({ ...zoneDraft, radiusKm: Number(zoneDraft.radiusKm), priority: Number(zoneDraft.priority), updatedAt: new Date().toISOString() });
      setMessage(`「${zoneDraft.name}」を保存しました。自動配車時に同じ範囲の児童を優先してまとめます。`);
      setZoneDraft(undefined);
      setPlacingZoneCenter(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '優先範囲を保存できませんでした。');
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
      setMessage(`「${zone.name}」を削除しました。`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '優先範囲を削除できませんでした。');
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

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><MapPinned className="h-5 w-5 text-teal-700" /><h3 className="font-black text-slate-950">児童宅・学校と優先配車範囲</h3></div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">登録住所を地図で確認し、同じ送迎便へ優先的にまとめる範囲を色付きの円で設定します。時間・定員・兄弟設定は引き続き優先されます。</p>
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={geocodeUnresolved} disabled={geocoding || unresolved.length === 0} className="flex min-h-11 items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-black text-teal-800 disabled:opacity-50">
                {geocoding ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                未配置住所を地図化（{unresolved.length}）
              </button>
              <button type="button" onClick={beginNewZone} className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-black text-white"><Plus className="h-4 w-4" />優先範囲を追加</button>
            </div>
          )}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Summary label="登録地点" value={`${sources.length}件`} />
          <Summary label="地図配置済み" value={`${placed.length}件`} tone="teal" />
          <Summary label="優先範囲" value={`${activeZones.length}件`} tone="violet" />
        </div>
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-relaxed text-amber-900"><ShieldAlert className="mr-1 inline h-4 w-4" />児童宅・学校の位置は個人情報です。業務上必要な範囲でのみ閲覧してください。「未配置住所を地図化」を実行した場合のみ、登録住所をGoogle Geocoding APIへ送信します。</div>
        {message && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" />{message}</p>}
        {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</p>}
      </div>

      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="relative min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {(manualSourceId || placingZoneCenter) && <div className="absolute left-3 right-3 top-3 z-[500] rounded-xl bg-slate-950/95 px-4 py-3 text-sm font-black text-white shadow-xl"><Crosshair className="mr-2 inline h-5 w-5 text-teal-300" />{manualSourceId ? '地図をタップして位置を指定してください' : '地図をタップして範囲の中心を指定してください'}<button type="button" onClick={() => { setManualSourceId(''); setPendingManual(undefined); setPlacingZoneCenter(false); }} className="float-right rounded p-1" aria-label="位置指定を中止"><X className="h-4 w-4" /></button></div>}
          <MapContainer center={center} zoom={12} scrollWheelZoom className="h-[28rem] w-full sm:h-[34rem] xl:h-[42rem]" aria-label="送迎地点マップ">
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <FitMap points={fitPoints} />
            <MapClickHandler enabled={Boolean(manualSourceId || (placingZoneCenter && zoneDraft))} onClick={handleMapClick} />
            {activeZones.map((zone) => <Circle key={zone.id} center={[zone.centerLatitude, zone.centerLongitude]} radius={zone.radiusKm * 1000} pathOptions={{ color: zone.color, fillColor: zone.color, fillOpacity: 0.16, weight: 3 }}><Popup><strong>{zone.name}</strong><br />半径 {zone.radiusKm}km・優先 {zone.priority}</Popup></Circle>)}
            {placed.map(({ source, location }) => {
              const zone = findTransportZone(location, activeZones);
              return <Marker key={source.id} position={[location.latitude, location.longitude]} icon={markerIcon(source.locationType)}><Popup><div className="min-w-48"><strong>{source.childName ? `${source.childName}・` : ''}{source.locationName}</strong><p>{source.locationType}</p><p className="mt-1 text-xs">{source.address}</p><p className="mt-2 font-bold" style={{ color: zone?.color || '#64748b' }}>{zone ? `優先範囲：${zone.name}` : '優先範囲外'}</p>{canManage && <button type="button" onClick={() => { setManualSourceId(source.id); setPendingManual(undefined); setPlacingZoneCenter(false); }} className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">位置を修正</button>}</div></Popup></Marker>;
            })}
            {pendingManual && <Marker position={[pendingManual.latitude, pendingManual.longitude]} icon={markerIcon(pendingManual.source.locationType)}><Popup>保存前の位置</Popup></Marker>}
            {zoneDraft && <Circle center={[zoneDraft.centerLatitude, zoneDraft.centerLongitude]} radius={zoneDraft.radiusKm * 1000} pathOptions={{ color: zoneDraft.color, fillColor: zoneDraft.color, fillOpacity: 0.24, dashArray: '8 6', weight: 4 }} />}
          </MapContainer>
          <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex flex-wrap gap-1 text-[10px] font-black">
            <Legend color="#7c3aed" label="事業所" /><Legend color="#059669" label="自宅・親族宅" /><Legend color="#0284c7" label="学校・学童" /><Legend color="#d97706" label="その他" />
          </div>
        </div>

        <aside className="min-w-0 space-y-3">
          {pendingManual && (
            <section className="rounded-2xl border-2 border-teal-300 bg-teal-50 p-4 shadow-sm">
              <h4 className="font-black text-teal-950">この位置で保存しますか？</h4>
              <p className="mt-1 text-xs text-teal-900">{pendingManual.source.childName ? `${pendingManual.source.childName}・` : ''}{pendingManual.source.locationName}</p>
              <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setPendingManual(undefined)} className="min-h-11 rounded-xl border border-teal-300 bg-white text-sm font-bold">選び直す</button><button type="button" onClick={saveManualLocation} disabled={saving} className="min-h-11 rounded-xl bg-teal-700 text-sm font-black text-white disabled:opacity-50">位置を保存</button></div>
            </section>
          )}

          {zoneDraft && (
            <section className="rounded-2xl border-2 border-violet-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between"><h4 className="font-black text-slate-950">優先配車範囲を編集</h4><button type="button" onClick={() => { setZoneDraft(undefined); setPlacingZoneCenter(false); }} className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100" aria-label="範囲編集を閉じる"><X className="h-4 w-4" /></button></div>
              <div className="mt-3 space-y-3">
                <label className="block text-xs font-black text-slate-700">範囲名<input value={zoneDraft.name} onChange={(event) => setZoneDraft({ ...zoneDraft, name: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base" placeholder="例：高須・青葉台エリア" /></label>
                <div className="grid grid-cols-2 gap-2"><label className="text-xs font-black text-slate-700">色<input type="color" value={zoneDraft.color} onChange={(event) => setZoneDraft({ ...zoneDraft, color: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white p-1" /></label><label className="text-xs font-black text-slate-700">優先順位<input type="number" min="1" max="999" value={zoneDraft.priority} onChange={(event) => setZoneDraft({ ...zoneDraft, priority: Number(event.target.value) })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base" /></label></div>
                <label className="block text-xs font-black text-slate-700">半径 {zoneDraft.radiusKm.toFixed(1)} km<input type="range" min="0.1" max="20" step="0.1" value={zoneDraft.radiusKm} onChange={(event) => setZoneDraft({ ...zoneDraft, radiusKm: Number(event.target.value) })} className="mt-2 w-full accent-violet-600" /></label>
                <label className="block text-xs font-black text-slate-700">補足（任意）<textarea rows={2} value={zoneDraft.note || ''} onChange={(event) => setZoneDraft({ ...zoneDraft, note: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-base" /></label>
                <label className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-50 px-3 text-sm font-bold"><input type="checkbox" checked={zoneDraft.active} onChange={(event) => setZoneDraft({ ...zoneDraft, active: event.target.checked })} className="h-5 w-5 accent-violet-600" />自動配車で使用する</label>
                <button type="button" onClick={() => { setPlacingZoneCenter(true); setManualSourceId(''); setPendingManual(undefined); }} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 text-sm font-black text-violet-800"><LocateFixed className="h-4 w-4" />中心を地図で選び直す</button>
                <button type="button" onClick={saveZone} disabled={saving} className="min-h-12 w-full rounded-xl bg-violet-700 text-sm font-black text-white disabled:opacity-50">範囲を保存</button>
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2"><h4 className="font-black text-slate-950">優先範囲</h4>{canManage && <button type="button" onClick={beginNewZone} className="rounded-lg bg-slate-100 p-2" aria-label="優先範囲を追加"><Plus className="h-4 w-4" /></button>}</div>
            <div className="mt-3 space-y-2">{[...zones].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, 'ja')).map((zone) => <article key={zone.id} className={`rounded-xl border p-3 ${zone.active ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-60'}`}><div className="flex items-start gap-2"><span className="mt-1 h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: zone.color }} /><div className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900">{zone.name}</strong><span className="text-[10px] font-bold text-slate-500">優先 {zone.priority}・半径 {zone.radiusKm}km{zone.active ? '' : '・停止中'}</span></div>{canManage && <><button type="button" onClick={() => { setZoneDraft({ ...zone }); setPlacingZoneCenter(false); setManualSourceId(''); }} className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100" aria-label={`${zone.name}を編集`}><PencilLine className="h-3.5 w-3.5" /></button><button type="button" onClick={() => removeZone(zone)} className="grid h-8 w-8 place-items-center rounded-lg bg-rose-50 text-rose-700" aria-label={`${zone.name}を削除`}><Trash2 className="h-3.5 w-3.5" /></button></>}</div></article>)}{zones.length === 0 && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">まだ範囲はありません。地図を見ながら追加できます。</p>}</div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="font-black text-slate-950">登録地点</h4>
            <label className="relative mt-3 block"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="児童名・学校名・住所で検索" className="min-h-11 w-full rounded-xl border border-slate-300 pl-10 pr-3 text-base" /></label>
            <div className="ui-scrollbar mt-3 max-h-[26rem] space-y-2 overflow-y-auto pr-1">{filteredSources.map((source) => {
              const location = matchingLocation(source, locations);
              const zone = findTransportZone(location, activeZones);
              return <article key={source.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start gap-2"><span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: location ? markerColor(source.locationType) : '#cbd5e1' }} /><div className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900">{source.childName ? `${source.childName}・` : ''}{source.locationName}</strong><span className="block truncate text-[10px] text-slate-500">{source.address}</span><span className="mt-1 block text-[10px] font-black" style={{ color: zone?.color || '#94a3b8' }}>{location ? zone?.name || '優先範囲外' : '位置未配置'}</span></div>{canManage && <button type="button" onClick={() => { setManualSourceId(source.id); setPendingManual(undefined); setPlacingZoneCenter(false); setMessage('地図上で位置を指定してください。'); }} className="shrink-0 rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] font-black text-slate-700">{location ? '修正' : '手動配置'}</button>}</div></article>;
            })}{filteredSources.length === 0 && <p className="py-6 text-center text-xs text-slate-400">該当する地点がありません。</p>}</div>
          </section>
        </aside>
      </div>
    </section>
  );
};

const Summary = ({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'teal' | 'violet' }) => <div className={`rounded-xl border px-3 py-2 ${tone === 'teal' ? 'border-teal-200 bg-teal-50' : tone === 'violet' ? 'border-violet-200 bg-violet-50' : 'border-slate-200 bg-slate-50'}`}><span className="block text-[10px] font-bold text-slate-500">{label}</span><strong className="text-lg text-slate-950">{value}</strong></div>;
const Legend = ({ color, label }: { color: string; label: string }) => <span className="rounded-full bg-white/95 px-2 py-1 text-slate-700 shadow"><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{label}</span>;
