import React, {useLayoutEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,Users} from 'lucide-react';
import type {ChildProfile,RecorderProfile,TransportDirection,TransportRun,TransportStop,Vehicle} from '../types';
import {getVehicleChildCapacity} from '../utils/vehicleCapacity';
import {getTransportProgram} from '../utils/transportDeparture';

export interface AssignmentDayChild {
  child:ChildProfile;stop:TransportStop;run?:TransportRun;pickupName:string;dismissal?:string;unavailable?:string;
}
export interface AssignmentChoice {
  vehicleId:string;targetRunId?:string;childIds:string[];driverId:string;assistantIds:string[];
}
interface Props {
  child:ChildProfile;direction:TransportDirection;stop:TransportStop;vehicles:Vehicle[];profiles:RecorderProfile[];
  currentRun?:TransportRun;candidates:Array<{child:ChildProfile;stop:TransportStop;run?:TransportRun}>;
  dayChildren:AssignmentDayChild[];onConfirm:(choice:AssignmentChoice)=>void;
}
export const TransportAssignmentWizard:React.FC<Props>=({child,direction,stop,vehicles,profiles,currentRun,candidates,dayChildren,onConfirm})=> {
  const [step,setStep]=useState(0),[vehicleId,setVehicleId]=useState(currentRun?.vehicleId||'');
  const [sameRun,setSameRun]=useState(true);
  const [targetRunId,setTargetRunId]=useState<string>();
  const [childIds,setChildIds]=useState<string[]>([child.id]);
  const [driverId,setDriverId]=useState(currentRun?.driverRecorderProfileId||'');
  const [assistantIds,setAssistantIds]=useState(currentRun?.assistantRecorderProfileIds||[]);
  const [error,setError]=useState('');
  const sectionRef=useRef<HTMLElement>(null);
  useLayoutEffect(()=>{const parent=sectionRef.current?.parentElement;if(parent)parent.scrollTop=0;},[step]);
  const available=candidates.filter(item=>!item.run||(item.run.vehicleId===vehicleId&&item.run.id!==currentRun?.id));
  const selectedRun=currentRun?.vehicleId===vehicleId&&sameRun?currentRun:candidates.find(item=>item.run?.id===targetRunId)?.run;
  const count=new Set([...(selectedRun?.stops.map(s=>s.childId)||[]),...childIds]).size;
  const vehicle=vehicles.find(v=>v.id===vehicleId);
  const capacity=getVehicleChildCapacity(vehicle,{driverRecorderProfileId:driverId,assistantRecorderProfileIds:assistantIds});
  const labels=['車両','同便の確認','担当職員','確定'];
  const additionalChildren=dayChildren.filter(item=>item.child.id!==child.id);
  const movedChildren=dayChildren.filter(item=>childIds.includes(item.child.id)&&item.run&&item.run.id!==selectedRun?.id);
  const recommendationVisible=additionalChildren.length>0||available.length>0||(currentRun?.vehicleId===vehicleId&&(currentRun?.stops.length||0)>1);
  const next=()=>{setError('');if(step===0&&!vehicleId){setError('車両を選んでください。');return;}if(step===2&&!driverId){setError('運転者を選んでください。');return;}setStep(step===0&&!recommendationVisible?2:step+1);};
  const chooseVehicle=(id:string)=>{setVehicleId(id);setChildIds([child.id]);setTargetRunId(undefined);setSameRun(true);setError('');};
  return <section ref={sectionRef} aria-label="児童の配車手順" className="space-y-3">
    <div className={`rounded-xl border p-3 ${getTransportProgram(child)==='キャリアズ'?'border-violet-200 bg-violet-50':'border-sky-200 bg-sky-50'}`}><strong className="text-base text-slate-950">{child.name}</strong><span className="ml-2 rounded bg-white px-2 py-1 text-xs font-bold">{direction}・{getTransportProgram(child)}</span><p className="mt-1 text-sm">{stop.locationName||stop.locationType}・{stop.timeAnchorTime||stop.plannedTime||'時刻未確定'}</p><p className="mt-1 text-xs text-slate-600">{stop.location}</p>{child.transportPermanentNote&&<p className="mt-2 rounded bg-amber-100 p-2 text-xs text-amber-950">{child.transportPermanentNote}</p>}</div>
    <ol className="flex gap-1" aria-label="編集の進み具合">{labels.map((label,index)=><li key={label} aria-current={step===index?'step':undefined} className={`flex-1 rounded px-1 py-2 text-center text-xs font-bold ${index===step?'bg-teal-700 text-white':'bg-slate-100 text-slate-600'}`}>{index+1} {label}</li>)}</ol>
    {step===0&&<div className="space-y-2"><h3 className="text-sm font-bold">使用する車両</h3>{vehicles.filter(v=>v.available||v.id===currentRun?.vehicleId).map(v=><button type="button" key={v.id} aria-pressed={vehicleId===v.id} onClick={()=>chooseVehicle(v.id)} className={`flex min-h-12 w-full items-center justify-between rounded-xl border p-3 text-left text-sm font-bold ${vehicleId===v.id?'border-teal-600 bg-teal-50':'border-slate-300 bg-white'}`}><span>{v.name}</span><span className="text-xs text-slate-600">総定員 {v.capacity}名</span></button>)}{vehicles.length===0&&<p className="text-sm text-rose-700">車両台帳への登録が必要です。</p>}</div>}
    {step===1&&<div className="space-y-2"><h3 className="flex items-center gap-2 text-sm font-bold"><Users size={16}/>同じ場所・近い時刻の児童</h3>{currentRun?.vehicleId===vehicleId&&currentRun.stops.length>1&&<label className="flex min-h-11 items-center gap-2 rounded-xl border border-teal-200 p-3 text-sm"><input type="checkbox" checked={sameRun} onChange={e=>{setSameRun(e.target.checked);setChildIds([child.id]);setTargetRunId(undefined);}}/>現在の児童と同便を維持</label>}
      {available.map(item=><label key={item.child.id} className="flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" aria-label={`${item.child.name}と同便にする`} checked={childIds.includes(item.child.id)||Boolean(selectedRun?.stops.some(s=>s.childId===item.child.id))} disabled={Boolean(selectedRun?.stops.some(s=>s.childId===item.child.id))} onChange={e=>{const checked=e.target.checked;setChildIds(current=>checked?[...current,item.child.id]:current.filter(id=>id!==item.child.id));if(item.run&&checked){setTargetRunId(item.run.id);setSameRun(false);setDriverId(item.run.driverRecorderProfileId||'');setAssistantIds(item.run.assistantRecorderProfileIds);}else if(item.run&&!checked){setTargetRunId(undefined);}}}/><span><strong>{item.child.name}</strong><span className="block text-xs text-slate-600">{item.stop.timeAnchorTime||item.stop.plannedTime}・{item.stop.locationName||item.stop.locationType}{item.run?'（配車済みの便に合流）':''}</span></span></label>)}
      {available.length===0&&<p className="text-xs text-slate-500">同じ場所・近い時刻の候補はありません。</p>}
      <div className="space-y-2 border-t border-slate-200 pt-3">
        <h3 className="flex items-center gap-2 text-sm font-bold"><Users size={16}/>同便児童を追加</h3>
        <p className="text-xs text-slate-600">当日の利用予定・下校／迎え時間順。別便の児童を選択すると、確定時にこの便へ移動します。</p>
        <div className="grid grid-cols-[1fr_1fr_4.5rem] gap-2 px-2 text-[11px] font-bold text-slate-600"><span>児童名</span><span>迎え先</span><span>下校／迎え</span></div>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
          {additionalChildren.map(item=>{
            const retained=Boolean(selectedRun?.stops.some(s=>s.childId===item.child.id));
            const checked=childIds.includes(item.child.id)||retained;
            return <label key={item.child.id} className={`block border-b border-slate-100 px-2 py-2 text-xs last:border-0 ${checked?'bg-teal-50':'bg-white'} ${item.unavailable?'opacity-60':''}`}>
              <span className="grid grid-cols-[1fr_1fr_4.5rem] items-center gap-2">
                <span className="flex items-center gap-1"><input type="checkbox" aria-label={`${item.child.name}をこの便に追加`} checked={checked} disabled={retained||Boolean(item.unavailable)} onChange={e=>setChildIds(current=>e.target.checked?[...new Set([...current,item.child.id])]:current.filter(id=>id!==item.child.id))}/><strong>{item.child.name}</strong></span>
                <span className="break-words text-slate-700">{item.pickupName}</span><span className="tabular-nums">{item.dismissal||'未確定'}</span>
              </span>
              <span className={`mt-1 block pl-4 text-[11px] ${checked&&item.run&&!retained?'text-amber-800':'text-slate-500'}`}>{item.unavailable||(retained?'同便に含まれています':item.run?`${item.run.name}${checked?' → この便へ移動':'（配車済み）'}`:'未配車')}</span>
            </label>;
          })}
          {additionalChildren.length===0&&<p className="p-2 text-xs text-slate-500">追加できる利用予定児童はいません。</p>}
        </div>
      </div>
      <button type="button" onClick={()=>{setSameRun(false);setTargetRunId(undefined);setChildIds([child.id]);}} className="min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm">この児童は別便にする</button><p className="text-xs text-slate-600">候補は任意です。選択していない児童はほかの便から移動しません。</p></div>}
    {step===2&&<div className="space-y-3"><label className="block text-sm font-bold">運転者<select aria-label="配車手順の運転者" value={driverId} onChange={e=>{setDriverId(e.target.value);setAssistantIds(current=>current.filter(id=>id!==e.target.value));}} className="mt-2 min-h-12 w-full rounded-xl border-2 border-slate-400 bg-teal-50 px-3 text-base text-slate-950"><option value="">選択してください</option>{profiles.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.displayName}</option>)}</select></label><details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-bold">添乗員を追加（必要時のみ）{assistantIds.length>0?`・${assistantIds.length}名`:''}</summary><div className="mt-2 space-y-1">{profiles.filter(p=>p.active&&p.id!==driverId).map(p=><label key={p.id} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={assistantIds.includes(p.id)} onChange={e=>setAssistantIds(current=>e.target.checked?[...current,p.id]:current.filter(id=>id!==p.id))}/>{p.displayName}</label>)}</div></details></div>}
    {step===3&&<div className="rounded-xl border border-teal-300 bg-teal-50 p-3 text-sm"><h3 className="mb-2 font-bold">配車内容を確認</h3><p>車両：{vehicle?.name}</p><p>児童：{count}名／乗車枠 {capacity}名</p><p className="mt-1 break-words text-xs">児童名：{[...new Set([...(selectedRun?.stops.map(s=>s.childId)||[]),...childIds])].map(id=>id===child.id?child.name:dayChildren.find(item=>item.child.id===id)?.child.name||selectedRun?.stops.find(s=>s.childId===id)?.childName||'児童').join('・')}</p><p>運転者：{profiles.find(p=>p.id===driverId)?.displayName}</p><p>添乗員：{assistantIds.map(id=>profiles.find(p=>p.id===id)?.displayName).join('・')||'なし'}</p>{movedChildren.length>0&&<div className="mt-2 rounded-lg bg-amber-100 p-2 text-xs text-amber-950"><strong>別便から移動</strong>{movedChildren.map(item=><p key={item.child.id}>{item.child.name}：{item.run?.name} → この便</p>)}</div>}<p className="mt-2 text-xs">{selectedRun?'既存の便へ反映':'別便として配車'}。道路時間は確定後に「時間計算」で確認します。</p></div>}
    {count>capacity&&<p role="alert" className="rounded-lg bg-rose-50 p-2 text-sm font-bold text-rose-700">乗車枠を超えています。車両・同便児童・添乗員を変更してください。</p>}{error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
    <div className="sticky -bottom-3 -mx-1 rounded-t-xl border-t border-slate-200 bg-white p-2 shadow-[0_-4px_12px_#0f172a12]"><div className="flex gap-2">{step>0&&<button type="button" onClick={()=>setStep(step===2&&!recommendationVisible?0:step-1)} className="flex min-h-11 items-center gap-1 rounded-xl border border-slate-300 px-3 text-sm"><ArrowLeft size={16}/>戻る</button>}{step<3?<button type="button" onClick={next} className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-teal-700 px-3 text-sm font-bold text-white">次へ<ArrowRight size={16}/></button>:<button type="button" disabled={count>capacity||!driverId||!vehicleId} onClick={()=>onConfirm({vehicleId,targetRunId:selectedRun?.id,childIds,driverId,assistantIds})} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-teal-700 px-3 text-sm font-bold text-white disabled:opacity-40"><Check size={16}/>この内容で確定</button>}</div><p className="mt-1 text-xs text-slate-500">確定後、全体の「配車を保存」で保存します。</p></div>
  </section>;
};
