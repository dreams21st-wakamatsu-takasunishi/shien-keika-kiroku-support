import React, { useMemo } from 'react';
import { MapPinned, Route } from 'lucide-react';
import type { TransportDirection, TransportRouteLeg } from '../types';
import { decodeGooglePolyline } from '../utils/googlePolyline';
import {
  GoogleTransportMap,
  type GoogleTransportMarker,
  type GoogleTransportPolyline,
} from './GoogleTransportMap';

export interface DailyTransportMiniMapPoint {
  childId: string;
  childName: string;
  locationName: string;
  address: string;
  latitude: number;
  longitude: number;
  color: string;
  areaName?: string;
  assignedRunId?: string;
  assignedRunName?: string;
  plannedTime?: string;
}

export interface CalculatedTransportRunRoute {
  runId: string;
  runName: string;
  color: string;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  legs: TransportRouteLeg[];
  legMinutesByStopId: Record<string, number>;
  encodedPolyline?: string;
}

interface DailyTransportMiniMapProps {
  direction: TransportDirection;
  points: DailyTransportMiniMapPoint[];
  facilityPoint?: { latitude: number; longitude: number; address: string; color: string };
  expectedCount: number;
  activeChildId?: string;
  routes: CalculatedTransportRunRoute[];
  selectedRouteRunId?: string;
  fillHeight?: boolean;
  onSelectRoute: (runId: string) => void;
}

const GOOGLE_MAPS_BROWSER_KEY = String(import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY || '').trim();
const GOOGLE_MAPS_MAP_ID = String(import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || '').trim();

export const DailyTransportMiniMap: React.FC<DailyTransportMiniMapProps> = ({
  direction,
  points,
  facilityPoint,
  expectedCount,
  activeChildId,
  routes,
  selectedRouteRunId,
  fillHeight = false,
  onSelectRoute,
}) => {
  const markers = useMemo<GoogleTransportMarker[]>(() => {
    const grouped = new Map<string, DailyTransportMiniMapPoint[]>();
    points.forEach((point) => {
      const key = `${point.latitude.toFixed(5)}:${point.longitude.toFixed(5)}`;
      grouped.set(key, [...(grouped.get(key) || []), point]);
    });
    const childMarkers = Array.from(grouped.entries()).map(([id, group]) => {
      const highlighted = group.some((point) => point.childId === activeChildId);
      const names = group.map((point) => point.childName).join('・');
      const first = group[0];
      return {
        id: `daily:${id}`,
        latitude: first.latitude,
        longitude: first.longitude,
        color: first.color,
        title: names,
        label: names,
        selected: highlighted,
        details: [
          first.locationName || `${direction}先`,
          first.areaName ? `送迎エリア：${first.areaName}` : '送迎エリア未設定',
          first.address,
          ...group.map((point) => `${point.childName}${point.assignedRunName ? `・${point.assignedRunName}` : '・未配車'}${point.plannedTime ? `・到着${point.plannedTime}` : ''}`),
          highlighted ? 'ドラッグ中の児童です' : '',
        ].filter(Boolean),
      };
    });
    if (!facilityPoint) return childMarkers;
    return [{
      id: 'daily:facility',
      latitude: facilityPoint.latitude,
      longitude: facilityPoint.longitude,
      color: facilityPoint.color,
      title: '事業所',
      label: '事業所',
      details: [facilityPoint.address, '全便の出発・帰着地点'],
    }, ...childMarkers];
  }, [activeChildId, direction, facilityPoint, points]);
  const polylines = useMemo<GoogleTransportPolyline[]>(() => routes.flatMap((route) => {
    if (!route.encodedPolyline) return [];
    const path = decodeGooglePolyline(route.encodedPolyline);
    return path.length > 1 ? [{ id: route.runId, path, color: route.color, selected: route.runId === selectedRouteRunId }] : [];
  }), [routes, selectedRouteRunId]);
  const fitPoints = useMemo<Array<[number, number]>>(() => {
    const markerPoints = markers.map((marker) => [marker.latitude, marker.longitude] as [number, number]);
    polylines.forEach((polyline) => markerPoints.push(...polyline.path));
    return markerPoints;
  }, [markers, polylines]);
  const center = useMemo<[number, number]>(() => facilityPoint
    ? [facilityPoint.latitude, facilityPoint.longitude]
    : points.length
      ? [points.reduce((sum, point) => sum + point.latitude, 0) / points.length, points.reduce((sum, point) => sum + point.longitude, 0) / points.length]
      : [33.5902, 130.4017], [facilityPoint, points]);
  const missingCount = Math.max(0, expectedCount - points.length);

  return (
    <section className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${fillHeight ? 'flex h-full min-h-0 flex-col' : ''}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-xs font-black text-slate-900"><MapPinned className="h-4 w-4 text-teal-700" />本日の{direction}先ミニマップ</h3>
          <p className="mt-0.5 text-[9px] font-bold text-slate-500">本日の対象児童だけを表示します。児童をドラッグすると該当ピンが強調されます。</p>
        </div>
        <div className="flex gap-1.5 text-[9px] font-black"><span className="rounded-full bg-teal-50 px-2 py-1 text-teal-800">配置済み {points.length}/{expectedCount}件</span>{missingCount > 0 && <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-900">地図未登録 {missingCount}件</span>}</div>
      </header>
      {GOOGLE_MAPS_BROWSER_KEY && GOOGLE_MAPS_MAP_ID ? (
        <GoogleTransportMap
          apiKey={GOOGLE_MAPS_BROWSER_KEY}
          mapId={GOOGLE_MAPS_MAP_ID}
          center={center}
          fitPoints={fitPoints}
          markers={markers}
          zones={[]}
          polylines={polylines}
          simple
          containerClassName={fillHeight ? 'min-h-0 flex-1' : undefined}
          heightClassName={fillHeight ? 'h-full min-h-56' : 'h-56 sm:h-64 lg:h-72'}
          gestureHandling="cooperative"
          interactiveMapClick={false}
          onMapClick={() => undefined}
          onMarkerClick={() => undefined}
        />
      ) : <div className="grid h-40 place-items-center bg-amber-50 p-4 text-center text-xs font-bold text-amber-900">Google地図の公開設定が未完了です。設定画面でAPIキーとMap IDを確認してください。</div>}
      {routes.length > 0 && <div className="flex gap-2 overflow-x-auto border-t border-slate-100 p-2">{routes.map((route) => <button key={route.runId} type="button" onClick={() => onSelectRoute(route.runId)} className={`flex min-h-9 shrink-0 items-center gap-2 rounded-xl border px-3 text-[10px] font-black ${selectedRouteRunId === route.runId ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'}`}><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: route.color }} /><Route className="h-3.5 w-3.5" />{route.runName}・{Math.ceil(route.totalDurationSeconds / 60)}分・{(route.totalDistanceMeters / 1000).toFixed(1)}km</button>)}</div>}
    </section>
  );
};
