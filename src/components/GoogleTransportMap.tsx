import React, { useEffect, useRef, useState } from 'react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import type { TransportAreaZone } from '../types';

export interface GoogleTransportMarker {
  id: string;
  latitude: number;
  longitude: number;
  color: string;
  title: string;
  label?: string;
  details?: string[];
  selected?: boolean;
}

export interface GoogleTransportPolyline {
  id: string;
  path: Array<[number, number]>;
  color: string;
  selected?: boolean;
}

interface GoogleTransportMapProps {
  apiKey: string;
  mapId: string;
  center: [number, number];
  fitPoints: Array<[number, number]>;
  markers: GoogleTransportMarker[];
  zones: TransportAreaZone[];
  draftZone?: TransportAreaZone;
  pendingMarker?: GoogleTransportMarker;
  polylines?: GoogleTransportPolyline[];
  simple: boolean;
  heightClassName?: string;
  gestureHandling?: 'auto' | 'cooperative' | 'greedy' | 'none';
  interactiveMapClick: boolean;
  onMapClick: (latitude: number, longitude: number) => void;
  onMarkerClick: (markerId: string) => void;
}

let configuredKey = '';
const EMPTY_POLYLINES: GoogleTransportPolyline[] = [];

function configureLoader(apiKey: string, mapId: string) {
  if (configuredKey) return;
  configuredKey = apiKey;
  setOptions({
    key: apiKey,
    v: 'weekly',
    language: 'ja',
    region: 'JP',
    authReferrerPolicy: 'origin',
    mapIds: [mapId],
  });
}

function markerContent(marker: GoogleTransportMarker, simple: boolean) {
  const root = document.createElement('div');
  root.style.display = 'grid';
  root.style.justifyItems = 'center';
  root.style.gap = '3px';
  root.style.cursor = 'pointer';
  root.style.userSelect = 'none';

  const dot = document.createElement('span');
  const size = simple ? 27 : 21;
  dot.style.display = 'block';
  dot.style.width = `${size}px`;
  dot.style.height = `${size}px`;
  dot.style.borderRadius = '9999px';
  dot.style.background = marker.color;
  dot.style.border = marker.selected ? '5px solid white' : '4px solid white';
  dot.style.boxShadow = marker.selected
    ? `0 0 0 4px ${marker.color}, 0 3px 10px rgba(15,23,42,.35)`
    : '0 3px 10px rgba(15,23,42,.35)';
  dot.style.transform = marker.selected ? 'scale(1.12)' : 'scale(1)';
  root.append(dot);

  if (simple && marker.label) {
    const label = document.createElement('span');
    label.textContent = marker.label;
    label.style.maxWidth = '150px';
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';
    label.style.whiteSpace = 'nowrap';
    label.style.border = '1px solid rgba(148,163,184,.45)';
    label.style.borderRadius = '8px';
    label.style.background = 'rgba(255,255,255,.96)';
    label.style.padding = '3px 7px';
    label.style.boxShadow = '0 2px 7px rgba(15,23,42,.16)';
    label.style.color = '#0f172a';
    label.style.fontSize = '10px';
    label.style.fontWeight = '800';
    root.append(label);
  }
  return root;
}

function infoContent(marker: GoogleTransportMarker) {
  const root = document.createElement('div');
  root.style.minWidth = '170px';
  root.style.maxWidth = '260px';
  root.style.padding = '4px';
  const title = document.createElement('strong');
  title.textContent = marker.title;
  title.style.display = 'block';
  title.style.color = '#0f172a';
  title.style.fontSize = '13px';
  root.append(title);
  marker.details?.forEach((detail) => {
    const line = document.createElement('p');
    line.textContent = detail;
    line.style.margin = '5px 0 0';
    line.style.color = '#475569';
    line.style.fontSize = '11px';
    root.append(line);
  });
  return root;
}

function zoneLabelContent(zone: TransportAreaZone) {
  const label = document.createElement('span');
  label.textContent = zone.name;
  label.style.display = 'block';
  label.style.border = `2px solid ${zone.color}`;
  label.style.borderRadius = '9999px';
  label.style.background = 'rgba(255,255,255,.94)';
  label.style.padding = '3px 8px';
  label.style.color = zone.color;
  label.style.fontSize = '10px';
  label.style.fontWeight = '900';
  label.style.whiteSpace = 'nowrap';
  return label;
}

export const GoogleTransportMap: React.FC<GoogleTransportMapProps> = ({
  apiKey,
  mapId,
  center,
  fitPoints,
  markers,
  zones,
  draftZone,
  pendingMarker,
  polylines = EMPTY_POLYLINES,
  simple,
  heightClassName,
  gestureHandling = 'greedy',
  interactiveMapClick,
  onMapClick,
  onMarkerClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map>();
  const callbacksRef = useRef({ onMapClick, onMarkerClick, interactiveMapClick });
  const overlaysRef = useRef<Array<google.maps.Circle | google.maps.Polyline | google.maps.marker.AdvancedMarkerElement>>([]);
  const infoWindowsRef = useRef<google.maps.InfoWindow[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  callbacksRef.current = { onMapClick, onMarkerClick, interactiveMapClick };

  useEffect(() => {
    let disposed = false;
    configureLoader(apiKey, mapId);
    Promise.all([importLibrary('maps'), importLibrary('marker')])
      .then(([mapsLibrary]) => {
        if (disposed || !containerRef.current) return;
        const map = new mapsLibrary.Map(containerRef.current, {
          center: { lat: center[0], lng: center[1] },
          zoom: 12,
          mapId,
          clickableIcons: false,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          rotateControl: false,
          scaleControl: false,
          zoomControl: !simple,
          gestureHandling,
        });
        map.addListener('click', (event: google.maps.MapMouseEvent) => {
          if (!callbacksRef.current.interactiveMapClick || !event.latLng) return;
          callbacksRef.current.onMapClick(event.latLng.lat(), event.latLng.lng());
        });
        mapRef.current = map;
        setReady(true);
      })
      .catch(() => {
        if (!disposed) setError('Google地図を読み込めませんでした。APIキー、Maps JavaScript API、地図IDの設定を確認してください。');
      });
    return () => {
      disposed = true;
      overlaysRef.current.forEach((overlay) => {
        if ('setMap' in overlay) overlay.setMap(null);
        else overlay.map = null;
      });
      infoWindowsRef.current.forEach((infoWindow) => infoWindow.close());
      overlaysRef.current = [];
      infoWindowsRef.current = [];
      mapRef.current = undefined;
      if (containerRef.current) containerRef.current.replaceChildren();
    };
  }, [apiKey, mapId]); // Map instance must only be created once per mounted panel.

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setOptions({ zoomControl: !simple, gestureHandling });
    overlaysRef.current.forEach((overlay) => {
      if ('setMap' in overlay) overlay.setMap(null);
      else overlay.map = null;
    });
    infoWindowsRef.current.forEach((infoWindow) => infoWindow.close());
    overlaysRef.current = [];
    infoWindowsRef.current = [];

    const addCircle = (zone: TransportAreaZone, draft = false) => {
      const circle = new google.maps.Circle({
        map,
        center: { lat: zone.centerLatitude, lng: zone.centerLongitude },
        radius: zone.radiusKm * 1000,
        strokeColor: zone.color,
        strokeOpacity: 0.95,
        strokeWeight: draft ? 4 : simple ? 4 : 3,
        fillColor: zone.color,
        fillOpacity: draft ? 0.24 : simple ? 0.2 : 0.1,
      });
      overlaysRef.current.push(circle);
      if (simple && !draft) {
        const labelMarker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat: zone.centerLatitude, lng: zone.centerLongitude },
          content: zoneLabelContent(zone),
          title: zone.name,
          zIndex: 2,
        });
        overlaysRef.current.push(labelMarker);
      }
    };
    zones.forEach((zone) => addCircle(zone));
    if (draftZone) addCircle(draftZone, true);

    polylines.forEach((polylineData) => {
      if (polylineData.path.length < 2) return;
      const polyline = new google.maps.Polyline({
        map,
        path: polylineData.path.map(([latitude, longitude]) => ({ lat: latitude, lng: longitude })),
        strokeColor: polylineData.color,
        strokeOpacity: polylineData.selected ? 0.95 : 0.62,
        strokeWeight: polylineData.selected ? 7 : 4,
        zIndex: polylineData.selected ? 8 : 5,
      });
      overlaysRef.current.push(polyline);
    });

    [...markers, ...(pendingMarker ? [pendingMarker] : [])].forEach((markerData) => {
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: markerData.latitude, lng: markerData.longitude },
        title: markerData.title,
        content: markerContent(markerData, simple),
        gmpClickable: true,
        zIndex: markerData.selected ? 20 : 10,
      });
      const infoWindow = new google.maps.InfoWindow({ content: infoContent(markerData) });
      marker.addEventListener('gmp-click', () => {
        callbacksRef.current.onMarkerClick(markerData.id);
        infoWindowsRef.current.forEach((candidate) => candidate.close());
        infoWindow.open({ map, anchor: marker });
      });
      overlaysRef.current.push(marker);
      infoWindowsRef.current.push(infoWindow);
    });

    if (fitPoints.length === 1) {
      map.setCenter({ lat: fitPoints[0][0], lng: fitPoints[0][1] });
      map.setZoom(14);
    } else if (fitPoints.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      fitPoints.forEach(([latitude, longitude]) => bounds.extend({ lat: latitude, lng: longitude }));
      map.fitBounds(bounds, simple ? 42 : 28);
    } else {
      map.setCenter({ lat: center[0], lng: center[1] });
      map.setZoom(12);
    }
  }, [center, draftZone, fitPoints, gestureHandling, markers, pendingMarker, polylines, ready, simple, zones]);

  return (
    <div className="relative">
      <div ref={containerRef} className={`${heightClassName || 'h-[36rem] sm:h-[44rem] xl:h-[calc(100dvh-9rem)] xl:min-h-[46rem] xl:max-h-[68rem]'} w-full ${simple ? 'google-transport-map-simple' : ''}`} aria-label="Google送迎地点マップ" />
      {!ready && !error && <div className="absolute inset-0 grid place-items-center bg-slate-50/90 text-sm font-bold text-slate-600">Google地図を読み込んでいます…</div>}
      {error && <div role="alert" className="absolute inset-0 grid place-items-center bg-rose-50 p-6 text-center text-sm font-bold leading-relaxed text-rose-800">{error}</div>}
    </div>
  );
};
