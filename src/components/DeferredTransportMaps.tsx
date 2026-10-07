import type {ComponentProps} from 'react';
import {createDeferredPanel} from './DeferredPanel';

type MiniMapProps=ComponentProps<typeof import('./DailyTransportMiniMap').DailyTransportMiniMap>;
type MapSettingsProps=ComponentProps<typeof import('./TransportMapPanel').TransportMapPanel>;

export const DailyTransportMiniMap=createDeferredPanel<MiniMapProps>(
  async()=>({default:(await import('./DailyTransportMiniMap')).DailyTransportMiniMap}),'ミニマップ');
export const TransportMapPanel=createDeferredPanel<MapSettingsProps>(
  async()=>({default:(await import('./TransportMapPanel')).TransportMapPanel}),'送迎地点の地図');

export type {DailyTransportMiniMapPoint,CalculatedTransportRunRoute} from './DailyTransportMiniMap';
