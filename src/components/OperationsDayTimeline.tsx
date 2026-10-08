import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {AttendanceRecord,CalendarEvent,ChildProfile,DailyChildPlan,DailyTransportRequirement,RecorderProfile,StaffShiftRequest,TransportDirection,TransportRun} from '../types';
import {DAY_START,DAY_END,dayChildren,dayMinute,dayRange,eventDayTimes,isWorking} from '../utils/operationsTimeline';

import {MarkerChildPopover} from './MarkerChildPopover';
import {getTransportProgram} from '../utils/transportDeparture';

interface Props {
  date:string;records:AttendanceRecord[];profiles:RecorderProfile[];events:CalendarEvent[];
  childrenList:ChildProfile[];plans:DailyChildPlan[];requirements:DailyTransportRequirement[];runs:TransportRun[];
  requests?:StaffShiftRequest[];selectedRunId?:string;draft?:boolean;fillHeight?:boolean;
  onSelectChild?:(childId:string,direction:TransportDirection)=>void;markerDirection?:TransportDirection;
  onSelectRun?:(id:string)=>void;onEditStaff?:(profile:RecorderProfile)=>void;
}
const grid={backgroundImage:'repeating-linear-gradient(to right, transparent 0, transparent calc(100% / 14 - 1px), #e2e8f0 calc(100% / 14 - 1px), #e2e8f0 calc(100% / 14))'};
const bar=(start?:string,end?:string)=>{const range=dayRange(start,end);return range?{left:`${range.left}%`,width:`${range.width}%`}:undefined;};
export function OperationsDayTimeline({date,records,profiles,events,childrenList,plans,requirements,runs,requests=[],selectedRunId,draft=false,fillHeight=false,onSelectChild,markerDirection='迎え',onSelectRun,onEditStaff}:Props) {
  const [markerPicker,setMarkerPicker]=useState<{ids:string[];anchor:HTMLButtonElement}>();
  const closeMarkerPicker=useCallback(()=>setMarkerPicker(undefined),[]);
  useEffect(()=>setMarkerPicker(undefined),[date,markerDirection]);
  const [zoom,setZoom]=useState(100);
  const [frame,setFrame]=useState<{width:number;height:number}>();
  const frameRef=useRef<HTMLElement>(null);
  const resize=useRef<{x:number;y:number;width:number;height:number}>();
  const markerTime=(row:typeof rows[number])=>markerDirection==='迎え'?row.dismissal:(requirements.find(r=>r.date===date&&r.childId===row.child.id)?.dropoffTargetTime||row.departure);
  const transportEligible=(row:typeof rows[number])=>{const requirement=requirements.find(r=>r.date===date&&r.childId===row.child.id);return !requirement||(markerDirection==='迎え'?requirement.pickupEnabled:requirement.dropoffEnabled);};
  const [childrenExpanded,setChildrenExpanded]=useState(false);
  const [focusSelected,setFocusSelected]=useState(false);
  const dayRuns=runs.filter(run=>run.date===date);
  const selected=dayRuns.find(run=>run.id===selectedRunId);
  const selectedStaff=new Set(selected?[selected.driverRecorderProfileId,...selected.assistantRecorderProfileIds]:[]);
  const selectedChildren=new Set(selected?.stops.map(stop=>stop.childId)||[]);
  const rows=useMemo(()=>dayChildren(date,childrenList,plans,requirements,runs),[date,childrenList,plans,requirements,runs]);
  const dayEvents=events.filter(event=>eventDayTimes(event,date));
  const staff=profiles.filter(profile=>profile.active&&(!focusSelected||!selected||selectedStaff.has(profile.id)))
    .sort((a,b)=>Number(a.employmentType==='part_time')-Number(b.employmentType==='part_time')||a.displayName.localeCompare(b.displayName,'ja'));
  const hours=Array.from({length:14},(_,i)=>7+i);
  const points=new Map<number,typeof rows>();
  rows.forEach(row=>{const minute=transportEligible(row)?dayMinute(markerTime(row)):undefined;if(minute!==undefined&&minute>=DAY_START&&minute<=DAY_END){const group=points.get(minute)||[];points.set(minute,[...group,row]);}});
  const summary=hours.map(hour=>{
    const minute=hour*60;
    const count=rows.filter(row=>{const a=dayMinute(row.arrival),b=dayMinute(row.departure);return a!==undefined&&b!==undefined&&a<=minute&&minute<b;}).length;
    const staffCount=profiles.filter(profile=>{
      const record=records.find(r=>r.date===date&&r.recorderProfileId===profile.id);
      const a=dayMinute(record?.scheduledStartTime),b=dayMinute(record?.scheduledEndTime);
      return profile.active&&isWorking(record)&&a!==undefined&&b!==undefined&&a<=minute&&minute<b
        &&!dayEvents.some(e=>{const times=eventDayTimes(e,date)!;const x=dayMinute(times.start),y=dayMinute(times.end);return e.recorderProfileIds.includes(profile.id)&&x!==undefined&&y!==undefined&&x<=minute&&minute<y;})
        &&!dayRuns.some(r=>{const x=dayMinute(r.startTime),y=dayMinute(r.endTime);return r.stops.length>0&&(r.driverRecorderProfileId===profile.id||r.assistantRecorderProfileIds.includes(profile.id))&&x!==undefined&&y!==undefined&&x<=minute&&minute<y;});
    }).length;
    return {hour,count,staffCount};
  });
  const unknown=rows.filter(row=>dayMinute(row.arrival)===undefined||dayMinute(row.departure)===undefined).length;
  return <section ref={frameRef} style={frame?{width:frame.width,height:frame.height,maxWidth:'100%',maxHeight:'100%',flex:'none'}:undefined} className={`operations-timeline relative flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white ${fillHeight?'flex-1':''}`} aria-label="勤務・児童・送迎の一日ガント">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
      <div><h3 className="text-sm font-black text-slate-950">{date} の全体の動き</h3><p className="text-xs text-slate-600">7:00〜21:00・{draft?'保存前の配車を表示':'登録済みの予定を表示'}・利用予定 {rows.length}名</p></div>
      <div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-xs font-bold">ガント倍率<input aria-label="ガントの表示倍率" type="range" min="75" max="200" step="25" value={zoom} onChange={e=>setZoom(Number(e.target.value))} className="w-24"/><span className="min-w-10">{zoom}%</span></label><button type="button" onClick={()=>{setZoom(100);setFrame(undefined);}} className="min-h-9 rounded border border-slate-200 px-2 text-xs">サイズを戻す</button></div>
      {selected&&<label className="flex items-center gap-2 text-xs font-bold text-teal-800"><input type="checkbox" checked={focusSelected} onChange={e=>setFocusSelected(e.target.checked)}/>選択便の関係者に絞る</label>}
    </header>
    <div className={`min-h-0 overflow-auto ${fillHeight?'flex-1':'max-h-[70dvh]'}`} style={{scrollPaddingTop:40}}>
      <div className="operations-timeline-grid" style={{width:`max(720px, ${zoom}%)`,minWidth:720}}>
        <div className="operations-timeline-row sticky top-0 z-10 bg-slate-100"><div className="p-2 text-xs font-bold">職員・児童・便</div><div className="relative h-9" style={grid}>{Array.from({length:15},(_,i)=><span key={i} className="absolute top-2 text-xs tabular-nums text-slate-700" style={{left:`${i/14*100}%`,transform:i===14?'translateX(-100%)':i===0?undefined:'translateX(-50%)'}}>{7+i}:00</span>)}</div></div>
        {(['在所予定人数','施設内予定職員'] as const).map((label,index)=><div key={label} className="operations-timeline-row border-b border-slate-100 bg-teal-50/60"><strong className="p-2 text-xs text-teal-950">{label}</strong><div className="grid grid-cols-14" style={{gridTemplateColumns:'repeat(14,minmax(0,1fr))'}}>{summary.map(item=><span key={item.hour} className="border-l border-teal-100 py-2 text-center text-xs font-bold text-teal-900" title={`${item.hour}:00時点の${label}`}>{index===0?item.count:item.staffCount}</span>)}</div></div>)}
        <div className="operations-timeline-row border-b border-slate-200"><span className="p-2 text-xs font-bold text-sky-800">{markerDirection==='迎え'?'下校／迎え時刻':'送り時刻'}</span><div className="relative h-10" style={grid}>{[...points].map(([minute,group])=><button type="button" key={minute} aria-label={`${markerTime(group[0])} ${group.map(row=>row.child.name).join('・')}`} title={`${markerTime(group[0])}：${group.map(row=>row.child.name).join('・')}`} onClick={event=>{if(onSelectChild){if(group.length===1){setMarkerPicker(undefined);onSelectChild(group[0].child.id,markerDirection);}else setMarkerPicker({ids:group.map(row=>row.child.id),anchor:event.currentTarget});}else setChildrenExpanded(true);}} className="absolute top-2 h-6 min-w-2 scroll-mt-10 rounded bg-sky-600 px-1 text-xs font-bold text-white" style={{left:`${(minute-DAY_START)/(DAY_END-DAY_START)*100}%`,transform:'translateX(-50%)'}}>{group.length>1?group.length:'·'}</button>)}</div></div>
        {onSelectChild&&<div className="flex flex-wrap gap-1 border-b border-slate-200 px-2 py-1">{rows.filter(row=>transportEligible(row)&&dayMinute(markerTime(row))===undefined).map(row=><button type="button" key={row.child.id} onClick={()=>onSelectChild(row.child.id,markerDirection)} className="min-h-9 rounded border border-amber-200 bg-amber-50 px-2 text-xs text-amber-950">{row.child.name}・{markerDirection}時刻未確定</button>)}</div>}
        {markerPicker&&<MarkerChildPopover anchor={markerPicker.anchor} onClose={closeMarkerPicker} onSelect={id=>{setMarkerPicker(undefined);onSelectChild?.(id,markerDirection);}} childrenList={markerPicker.ids.flatMap(id=>{const row=rows.find(item=>item.child.id===id);return row?[{id,name:row.child.name,time:markerTime(row),career:getTransportProgram(row.child)==='キャリアズ'}]:[];})}/>}
        {staff.map(profile=>{
          const record=records.find(r=>r.date===date&&r.recorderProfileId===profile.id);
          const assigned=dayRuns.filter(run=>run.stops.length>0&&(run.driverRecorderProfileId===profile.id||run.assistantRecorderProfileIds.includes(profile.id)));
          const busy=dayEvents.filter(e=>e.recorderProfileIds.includes(profile.id));
          const leave=busy.find(e=>e.eventType==='職員休み'&&e.allDay);
          const request=requests.find(r=>r.recorderProfileId===profile.id&&r.requestedDate===date);
          const working=!leave&&isWorking(record)?bar(record?.scheduledStartTime,record?.scheduledEndTime):undefined;
          return <div key={profile.id} className={`operations-timeline-row border-b border-slate-100 ${selectedStaff.has(profile.id)?'bg-teal-50':'bg-white'}`}>
            <button type="button" onClick={()=>onEditStaff?.(profile)} disabled={!onEditStaff} className="min-w-0 p-2 text-left disabled:opacity-100"><strong className="block truncate text-xs text-slate-950">{profile.displayName}</strong><span className="block text-[11px] text-slate-500">{profile.employmentType==='part_time'?'パート':'正職'}{record?.clockInAt?'・打刻済み':''}</span></button>
            <div className="relative" style={{...grid,minHeight:Math.round(60*zoom/100)}}>
              {working?<span className="absolute top-1 flex h-6 items-center overflow-hidden rounded bg-emerald-100 px-2 text-xs font-bold text-emerald-950" style={working} title={`勤務 ${record?.scheduledStartTime}〜${record?.scheduledEndTime}`}>{record?.scheduledStartTime}〜{record?.scheduledEndTime}</span>:<span className="absolute left-2 top-2 text-xs text-slate-500">{leave?'休み':record?.status||'勤務予定未登録'}</span>}
              {busy.map(event=>{const times=eventDayTimes(event,date)!;const position=bar(times.start,times.end);return position&&<span key={event.id} className="absolute bottom-1 h-5 overflow-hidden rounded bg-amber-200 px-1 text-[11px] text-amber-950" title={`${event.title} ${times.start}〜${times.end}`} style={position}>{event.title}</span>;})}
              {assigned.map(run=>{const position=bar(run.startTime,run.endTime);return position&&<button type="button" key={run.id} disabled={!onSelectRun} onClick={()=>onSelectRun?.(run.id)} style={position} title={`${run.name} ${run.startTime}〜${run.endTime}`} className={`absolute top-1 flex h-6 items-center overflow-hidden rounded px-1 text-xs font-bold text-white ${run.id===selectedRunId?'bg-teal-700 ring-2 ring-teal-400':'bg-sky-600'}`}>{run.direction} {run.startTime}〜{run.endTime}</button>;})}
              {request&&bar(request.requestedStartTime,request.requestedEndTime)&&<span className="absolute bottom-0 h-1 bg-violet-500" style={bar(request.requestedStartTime,request.requestedEndTime)} title={`希望 ${request.status} ${request.requestedStartTime}〜${request.requestedEndTime}`}/>}
            </div></div>;
        })}
        {dayRuns.filter(r=>r.stops.length>0&&(!focusSelected||!selected||r.id===selected.id)).map(run=><div key={run.id} className={`operations-timeline-row border-b border-sky-100 ${run.id===selectedRunId?'bg-sky-50':'bg-white'}`}><button type="button" aria-label={`${onSelectRun?'便を編集':'送迎便'}：${run.name}`} disabled={!onSelectRun} onClick={()=>onSelectRun?.(run.id)} className="min-w-0 p-2 text-left"><strong className="block truncate text-xs">{run.name}</strong><span className="text-[11px] text-slate-500">{run.stops.length}名</span></button><div className="relative min-h-10" style={grid}>{bar(run.startTime,run.endTime)&&<button type="button" disabled={!onSelectRun} onClick={()=>onSelectRun?.(run.id)} className={`absolute top-1 h-7 overflow-hidden rounded px-2 text-xs font-bold text-white ${run.direction==='迎え'?'bg-sky-600':'bg-violet-600'}`} style={bar(run.startTime,run.endTime)} title={`${run.name} ${run.startTime}〜${run.endTime}`}>{run.startTime}〜{run.endTime}</button>}</div></div>)}
        <button type="button" onClick={()=>setChildrenExpanded(v=>!v)} aria-expanded={childrenExpanded} className="flex min-h-10 w-full items-center justify-between bg-teal-50 px-3 text-xs font-bold text-teal-900"><span>児童別の在所見込み {rows.length}名{unknown>0?`・在所時刻未確定 ${unknown}名`:''}</span><span>{childrenExpanded?'児童別を収納':'児童別を表示'}</span></button>
        {childrenExpanded&&<div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-teal-100 px-3 py-1 text-[11px] text-slate-700"><span><i aria-hidden="true" className="mr-1 inline-block h-2 w-3 rounded-sm bg-sky-200"/>送迎：下校〜事業所到着</span><span><i aria-hidden="true" className="mr-1 inline-block h-2 w-3 rounded-sm bg-teal-200"/>在所：事業所到着〜送り開始（保護者送りは退所予定）</span></div>}
        {childrenExpanded&&rows.filter(row=>!focusSelected||!selected||selectedChildren.has(row.child.id)).map(row=><div key={row.child.id} aria-label={`${row.child.name}の送迎・在所見込み`} className={`operations-timeline-row border-b border-teal-100 ${selectedChildren.has(row.child.id)?'bg-teal-50':'bg-white'}`}>
          <div className="min-w-0 p-2"><strong className="block truncate text-xs">{row.child.name}</strong><span className="text-[11px] text-slate-500">下校 {row.dismissal||'未確定'}</span></div>
          <div className="relative min-h-[52px]" style={grid}>
            {row.transportRange&&<span aria-label={`送迎時間 ${row.dismissal}〜${row.arrival}`} className="absolute top-1 flex h-6 items-center overflow-hidden rounded-l bg-sky-200 px-2 text-xs font-bold text-sky-950" style={bar(row.dismissal,row.arrival)} title={`送迎時間 ${row.dismissal}〜${row.arrival}（下校〜事業所到着）`}>送迎</span>}
            {row.range&&<span aria-label={`在所時間 ${row.arrival}〜${row.departure}`} className="absolute top-1 flex h-6 items-center overflow-hidden rounded-r bg-teal-200 px-2 text-xs font-bold text-teal-950" style={bar(row.arrival,row.departure)} title={`在所時間 ${row.arrival}〜${row.departure}（事業所到着〜送り開始・退所）`}>在所</span>}
            <span className={`absolute bottom-1 left-2 whitespace-nowrap text-[11px] ${row.timeOrderInvalid?'font-bold text-rose-700':'text-slate-600'}`}>{row.pickupEnabled?`送迎 ${row.dismissal||'未確定'}〜${row.arrival||'未確定'}`:'迎え：保護者'}　／　在所 {row.arrival||'未確定'}〜{row.departure||'未確定'}{row.timeOrderInvalid?'・時刻の前後を確認':''}</span>
            {dayMinute(row.dismissal)!==undefined&&dayMinute(row.dismissal)!>=DAY_START&&dayMinute(row.dismissal)!<=DAY_END&&<span className="absolute top-0 h-8 w-0.5 bg-sky-700" style={{left:`${(dayMinute(row.dismissal)!-DAY_START)/(DAY_END-DAY_START)*100}%`}} title={`下校／迎え ${row.dismissal}`}/>}</div></div>)}
      </div>
    </div>
    <p className="shrink-0 px-3 py-2 text-[11px] text-slate-600">緑：勤務／青：迎え・児童の送迎時間／青緑：児童の在所時間／紫：送り／黄：業務予定。人数は各時刻ちょうどの予定値です。未確定時刻の児童は在所人数に含めません。施設内予定職員は業務予定・送迎中を除いた概算で、配置基準の判定ではありません。</p>
    <button type="button" aria-label="ガントの表示枠をリサイズ" title="ドラッグでガントだけをリサイズ。矢印キーでも変更できます" className="absolute bottom-0 right-0 h-8 w-8 cursor-se-resize touch-none rounded-tl-lg bg-slate-200 text-slate-700"
      onPointerDown={e=>{if(e.button!==0||!frameRef.current)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);const rect=frameRef.current.getBoundingClientRect();resize.current={x:e.clientX,y:e.clientY,width:rect.width,height:rect.height};}}
      onPointerMove={e=>{const current=resize.current,parent=frameRef.current?.parentElement;if(!current||!parent)return;setFrame({width:Math.max(280,Math.min(parent.clientWidth,current.width+e.clientX-current.x)),height:Math.max(220,Math.min(parent.clientHeight,current.height+e.clientY-current.y))});}}
      onPointerUp={()=>{resize.current=undefined;}} onPointerCancel={()=>{resize.current=undefined;}}
      onKeyDown={e=>{const delta={ArrowLeft:[-40,0],ArrowRight:[40,0],ArrowUp:[0,-40],ArrowDown:[0,40]}[e.key],node=frameRef.current,parent=node?.parentElement;if(!delta||!node||!parent)return;e.preventDefault();setFrame({width:Math.max(280,Math.min(parent.clientWidth,node.clientWidth+delta[0])),height:Math.max(220,Math.min(parent.clientHeight,node.clientHeight+delta[1]))});}}>◢</button>
  </section>;
}
