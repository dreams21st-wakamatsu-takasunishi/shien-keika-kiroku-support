import React, { useMemo, useState } from 'react';
import { BusFront, MapPin } from 'lucide-react';
import type { TransportAreaZone, TransportDirection, TransportMapLocation, TransportRouteSettings, TransportRun } from '../types';
import { DailyTransportMiniMap, type DailyTransportMiniMapPoint } from './DailyTransportMiniMap';

export function TodayTransportOverview({ date, runs, locations, zones, routeSettings }: { date: string; runs: TransportRun[]; locations: TransportMapLocation[]; zones: TransportAreaZone[]; routeSettings: TransportRouteSettings }) {
  const [direction, setDirection] = useState<TransportDirection>('迎え');
  const dayRuns = runs.filter((run) => run.date === date && run.direction === direction);
  const zoneByLocation = useMemo(() => {
    const map = new Map<string, TransportAreaZone>();
    zones.filter((zone) => zone.active).forEach((zone) => Object.entries(zone.locationPriorities || {}).forEach(([locationId, rank]) => {
      const current = map.get(locationId);
      if (!current || rank < (current.locationPriorities?.[locationId] || Number.MAX_SAFE_INTEGER)) map.set(locationId, zone);
    }));
    return map;
  }, [zones]);
  const points = useMemo<DailyTransportMiniMapPoint[]>(() => dayRuns.flatMap((run) => run.stops.flatMap((stop) => {
    const location = locations.find((candidate) => candidate.locationProfileId === stop.locationProfileId)
      || locations.find((candidate) => candidate.childId === stop.childId && normalize(candidate.address) === normalize(stop.navigationLocation || stop.location))
      || locations.find((candidate) => normalize(candidate.address) === normalize(stop.navigationLocation || stop.location));
    if (!location || !stop.childId) return [];
    const zone = zoneByLocation.get(location.id);
    const defaultColor = location.sourceType === 'school' ? routeSettings.educationPinColor : location.sourceType === 'facility' ? routeSettings.facilityPinColor : routeSettings.residentialPinColor;
    return [{ childId: stop.childId, childName: stop.childName || '児童', locationName: stop.locationName || location.locationName, address: stop.navigationLocation || stop.location || location.address, latitude: location.latitude, longitude: location.longitude, color: zone?.color || defaultColor, areaName: zone?.name || stop.area, assignedRunId: run.id, assignedRunName: run.name, plannedTime: stop.plannedTime }];
  })), [dayRuns, locations, routeSettings, zoneByLocation]);
  const facility = locations.find((location) => location.sourceType === 'facility');
  const allStops = dayRuns.reduce((sum, run) => sum + run.stops.length, 0);

  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"><button type="button" onClick={() => setDirection('迎え')} className={`min-h-11 rounded-xl text-sm font-black ${direction === '迎え' ? 'bg-sky-600 text-white' : 'text-slate-600'}`}>迎え</button><button type="button" onClick={() => setDirection('送り')} className={`min-h-11 rounded-xl text-sm font-black ${direction === '送り' ? 'bg-violet-600 text-white' : 'text-slate-600'}`}>送り</button></div>
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,.95fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><header className="border-b border-slate-100 p-3"><h3 className="flex items-center gap-2 font-black text-slate-900"><BusFront className="h-5 w-5 text-teal-600" />{date} の{direction}一覧</h3><p className="mt-1 text-xs text-slate-500">確認専用です。配車の編集は「利用予定／送迎管理」から行います。</p></header><div className="divide-y divide-slate-100">{dayRuns.map((run) => <article key={run.id} className="p-3"><div className="flex items-start justify-between gap-2"><span><strong className="block text-sm">{run.name}</strong><span className="text-[10px] text-slate-500">{run.startTime}〜{run.endTime}・{run.vehicleName || '車両未設定'}・運転 {run.driverName || '未設定'}</span></span><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black">{run.status}</span></div><ol className="mt-2 grid gap-1 sm:grid-cols-2">{run.stops.map((stop, index) => <li key={stop.id} className="flex items-start gap-2 rounded-lg bg-slate-50 p-2 text-xs"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-900 text-[9px] font-black text-white">{index + 1}</span><span className="min-w-0"><strong className="block truncate">{stop.plannedTime || '時刻未定'}　{stop.childName || stop.locationName || '乗降地点'}</strong><span className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-slate-500"><MapPin className="h-3 w-3 shrink-0" />{stop.locationName || stop.location || '場所未登録'}</span></span></li>)}</ol></article>)}{dayRuns.length === 0 && <p className="p-8 text-center text-sm text-slate-400">{direction}便はありません。</p>}</div></section>
      <DailyTransportMiniMap direction={direction} points={points} facilityPoint={facility ? { latitude: facility.latitude, longitude: facility.longitude, address: facility.address, color: routeSettings.facilityPinColor } : undefined} expectedCount={allStops} routes={[]} onSelectRoute={() => undefined} />
    </div>
  </div>;
}

function normalize(value?: string) { return String(value || '').replace(/[\s　-]/g, '').toLowerCase(); }
