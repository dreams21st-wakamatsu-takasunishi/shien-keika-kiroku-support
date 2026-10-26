import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import type {SupportRecord} from '../types';
import {loadSupportRecordPeriod} from '../services/dataService';
import {inRecordPeriod,periodKey,validateRecordPeriod,type RecordChanges,type RecordPeriod,type RecordPeriodResult} from '../services/recordPeriods';
interface Lease {promise:Promise<void>;release:()=>void}
interface HistoryContext {scope:string;enabled:boolean;covered:(period:RecordPeriod)=>boolean;acquire:(period:RecordPeriod)=>Lease}
const Context=createContext<HistoryContext|null>(null);
interface Entry {promise:Promise<void>;controller:AbortController;refs:number;done:boolean}
export function RecordHistoryProvider({organizationId,scopeKey,revision,initialFrom,records,onLoaded,children,changes}:{organizationId?:string;scopeKey:string;revision:number;initialFrom?:string;records:SupportRecord[];onLoaded:(period:RecordPeriod,result:RecordPeriodResult,baseline:SupportRecord[])=>void;children:ReactNode;changes?:RecordChanges}){
 const scope=scopeKey+':'+revision,live=useRef({scope,entries:new Map<string,Entry>()}),source=useRef(records),publish=useRef(onLoaded),mounted=useRef(true);
 source.current=records;publish.current=onLoaded;
 if(live.current.scope!==scope){for(const e of live.current.entries.values())e.controller.abort();live.current={scope,entries:new Map()};}
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;for(const e of live.current.entries.values())e.controller.abort();live.current.entries.clear();};},[]);
 const covered=useCallback((p:RecordPeriod)=>Boolean(initialFrom&&p.from&&p.from>=initialFrom)||live.current.entries.get(periodKey(p))?.done===true,[initialFrom,scope]);
 const acquire=useCallback((raw:RecordPeriod):Lease=>{
  const period=validateRecordPeriod(raw),key=periodKey(period);
  if(!organizationId||covered(period))return {promise:Promise.resolve(),release:()=>{}};
  const state=live.current;let entry=state.entries.get(key);
  if(!entry){
   const controller=new AbortController(),baseline=source.current.filter(r=>inRecordPeriod(r,period));
   entry={controller,refs:0,done:false,promise:Promise.resolve()};const created=entry;
   created.promise=loadSupportRecordPeriod(organizationId,period,controller.signal,changes).then(result=>{
    if(!mounted.current||live.current!==state||controller.signal.aborted)throw new DOMException('Old record scope','AbortError');
    publish.current(period,result,baseline);created.done=true;
    if(state.entries.size>64)for(const [oldKey,e] of state.entries){if(e!==created&&e.done&&e.refs===0){state.entries.delete(oldKey);break;}}
   }).catch(error=>{if(state.entries.get(key)===created)state.entries.delete(key);throw error;});
   state.entries.set(key,created);
  }
  const leased=entry;leased.refs++;
  return {promise:leased.promise,release:()=>{leased.refs--;if(leased.refs===0&&!leased.done){leased.controller.abort();if(state.entries.get(key)===leased)state.entries.delete(key);}}};
 },[organizationId,scope,covered,changes]);
 const value=useMemo(()=>({scope,enabled:Boolean(organizationId),covered,acquire}),[scope,organizationId,covered,acquire]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useRecordPeriod(period:RecordPeriod|null){
 const context=useContext(Context),[attempt,setAttempt]=useState(0),[state,setState]=useState({key:'',done:false,error:''});
 const rangeKey=period?periodKey(period):'',key=(context?.scope||'local')+':'+rangeKey+':'+attempt;
 let invalid='';if(period)try{validateRecordPeriod(period);}catch{invalid='開始日・終了日を正しく指定してください。';}
 const needed=Boolean(context?.enabled&&period),covered=Boolean(period&&!invalid&&context?.covered(period));
 const ready=!needed||(!invalid&&(covered||(state.key===key&&state.done)));
 useEffect(()=>{
  if(!needed||!period||!context||covered||invalid)return;
  let current=true;setState({key,done:false,error:''});const lease=context.acquire(period);
  lease.promise.then(()=>{if(current)setState({key,done:true,error:''});},error=>{if(current&&error?.name!=='AbortError')setState({key,done:false,error:'支援記録を取得できませんでした。通信状態を確認し、再読み込みしてください。'});});
  return()=>{current=false;lease.release();};
 },[context?.acquire,key,needed,covered,invalid]);
 return {ready,error:invalid||(state.key===key?state.error:''),retry:()=>setAttempt(n=>n+1),remote:context?.enabled===true};
}
export function RecordPeriodNotice({state}:{state:ReturnType<typeof useRecordPeriod>}){
 if(state.ready)return null;
 return <div role={state.error?'alert':'status'} className={`my-3 rounded-xl border p-3 text-sm ${state.error?'border-amber-300 bg-amber-50 text-amber-950':'border-sky-200 bg-sky-50 text-sky-950'}`}>
  {state.error||'選択した期間の支援記録を読み込んでいます。まだ「記録なし」とは確定していません。'}
  {state.error&&<button type="button" className="ml-3 min-h-11 rounded-lg border bg-white px-3 font-bold" onClick={state.retry}>記録を再読み込み</button>}
 </div>;
}
