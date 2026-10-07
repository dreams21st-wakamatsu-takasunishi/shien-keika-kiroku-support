import type {TransportRun,TransportStop} from '../types';
import {dayMinute} from './operationsTimeline';

const normalize=(value?:string)=>(value||'').normalize('NFKC').replace(/[\s〒]/g,'').toLowerCase();
export function sameStopCandidate(base:TransportStop,other:TransportStop,windowMinutes:number) {
  if(!base.childId||base.childId===other.childId)return false;
  const a=dayMinute(base.timeAnchorTime||base.plannedTime),b=dayMinute(other.timeAnchorTime||other.plannedTime);
  if(a===undefined||b===undefined||Math.abs(a-b)>Math.max(0,windowMinutes))return false;
  if(base.timeMode!==other.timeMode)return false;
  const address=normalize(base.location),otherAddress=normalize(other.location);
  // A generic name such as '自宅' alone must never group unrelated households.
  return Boolean(address&&address===otherAddress&&base.locationType===other.locationType
    &&normalize(base.locationName)===normalize(other.locationName));
}

export function applyTransportAssignment(runs:TransportRun[],target:TransportRun,stops:TransportStop[]):TransportRun[] {
  const ids=new Set(stops.map(stop=>stop.childId).filter(Boolean));
  const existing=runs.find(run=>run.id===target.id);
  const retained=existing?.stops||[];
  const nextStops=[...retained,...stops.filter(stop=>!retained.some(old=>old.childId===stop.childId))].map((stop,index)=>({...stop,order:index+1}));
  const unchanged=existing&&nextStops.length===existing.stops.length&&nextStops.every((stop,index)=>stop.id===existing.stops[index].id);
  const invalidate=(items:TransportStop[])=>items.map((stop,index)=>({...stop,order:index+1,plannedTime:stop.timeMode==='fixed'?stop.timeAnchorTime||stop.plannedTime:undefined}));
  const updated={...target,stops:unchanged?existing.stops:invalidate(nextStops),routeOptimizedAt:unchanged?existing.routeOptimizedAt:undefined};
  const result=runs.map(run=>{
    if(run.id===target.id)return updated;
    if(run.date!==target.date||run.direction!==target.direction||!run.stops.some(stop=>ids.has(stop.childId)))return run;
    return {...run,routeOptimizedAt:undefined,stops:invalidate(run.stops.filter(stop=>!ids.has(stop.childId)))};
  });
  return existing?result:[...result,updated];
}
