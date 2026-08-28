import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, MapPinned } from 'lucide-react';
import type { TransportAreaZone, TransportDirection, TransportMapLocation, TransportRouteSettings, TransportRun } from '../types';
import { DailyTransportMiniMap, type DailyTransportMiniMapPoint } from './DailyTransportMiniMap';
import { TransportScheduleBoard } from './TransportScheduleBoard';

export function TodayTransportOverview({ date, runs, locations, zones, routeSettings }: { date: string; runs: TransportRun[]; locations: TransportMapLocation[]; zones: TransportAreaZone[]; routeSettings: TransportRouteSettings }) {
  const [direction, setDirection] = useState<TransportDirection>('迎え');
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const [mapOpen, setMapOpen] = useState(false);
  const dayRuns = runs.filter((run) => run.date === date && run.direction === direction);
  const activeRunId = dayRuns.some((run) => run.id === selectedRunId) ? selectedRunId : dayRuns[0]?.id;
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
    <TransportScheduleBoard runs={dayRuns} selectedRunId={activeRunId} onSelectRun={setSelectedRunId} emptyText={`${direction}便はありません。`} />
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setMapOpen((current) => !current)} aria-expanded={mapOpen} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left">
        <span className="flex items-center gap-2 text-sm font-black text-slate-900"><MapPinned className="h-5 w-5 text-teal-600" />本日の送迎先ミニマップ</span>
        <span className="flex items-center gap-1 text-xs font-black text-teal-700">{mapOpen ? '収納' : '表示'}{mapOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
      </button>
      {mapOpen && <div className="border-t border-slate-200 p-2"><DailyTransportMiniMap direction={direction} points={points} facilityPoint={facility ? { latitude: facility.latitude, longitude: facility.longitude, address: facility.address, color: routeSettings.facilityPinColor } : undefined} expectedCount={allStops} routes={[]} onSelectRoute={() => undefined} /></div>}
    </section>
  </div>;
}

function normalize(value?: string) { return String(value || '').replace(/[\s　-]/g, '').toLowerCase(); }
