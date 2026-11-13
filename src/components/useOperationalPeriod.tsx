import {useEffect,useState} from 'react';
import type {OperationalPeriod,OperationalSlice} from '../services/operationalPeriod';
export type OperationalLoader=(period:OperationalPeriod,slice:OperationalSlice)=>Promise<void>;
export function useOperationalPeriod(load:OperationalLoader|undefined,period:OperationalPeriod|null,slice:OperationalSlice) {
  const [attempt,retry]=useState(0);
  const from=period?.from,to=period?.to;
  const key=JSON.stringify([from,to,slice,attempt]);
  const [status,setStatus]=useState<{key:string;failed:boolean}>();
  useEffect(()=>{
    if(!load||!from||!to)return;
    let current=true;
    void load({from,to},slice).then(()=>{if(current)setStatus({key,failed:false});},()=>{if(current)setStatus({key,failed:true});});
    return()=>{current=false;};
  },[load,from,to,slice,key]);
  return {ready:!load||!period||(status?.key===key&&!status.failed),
    failed:status?.key===key&&status.failed,retry:()=>retry(x=>x+1)};
}
export function OperationalPeriodStatus({failed,retry}:{failed?:boolean;retry:()=>void}){
  return <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-800" role={failed?'alert':'status'}>
    {failed?<><span>指定期間のデータを取得できませんでした。</span> <button type="button" className="min-h-10 rounded-lg border bg-white px-3 font-bold" onClick={retry}>再読み込み</button></>:<>指定期間のデータを読み込んでいます。</>}
  </div>;
}
