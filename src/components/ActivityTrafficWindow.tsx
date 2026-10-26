import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Grip,Maximize2,Minimize2,X} from 'lucide-react';
import {TrafficCostCalculator} from './TrafficCostCalculator';

/** A non-modal companion: the activity editor remains mounted and editable. */
export function ActivityTrafficWindow({scopeKey,visible,onClose}:{scopeKey:string;visible:boolean;onClose:()=>void}){
 const [position,setPosition]=useState(()=>({x:Math.max(8,window.innerWidth-476),y:108}));
 const [maximized,setMaximized]=useState(false);
 const gesture=useRef<{x:number;y:number;left:number;top:number}>();
 const closeRef=useRef<HTMLButtonElement>(null);
 const clamp=(x:number,y:number)=>({x:Math.max(8,Math.min(x,window.innerWidth-Math.min(460,window.innerWidth-16)-8)),y:Math.max(8,Math.min(y,window.innerHeight-100))});
 useEffect(()=>{const resize=()=>setPosition(p=>clamp(p.x,p.y));window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
 useEffect(()=>{if(visible)closeRef.current?.focus({preventScroll:true});},[visible]);
 return createPortal(<aside hidden={!visible} aria-label="交通費計算の小窓" className={`activity-traffic-window activity-no-print ${maximized?'is-maximized':''}`} style={maximized?undefined:{left:position.x,top:position.y}} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
  <header className="flex shrink-0 items-center gap-1 bg-slate-950 p-2 text-white">
   <button type="button" aria-label="交通費計算の小窓を移動" title="ドラッグ、または矢印キーで移動" className="flex min-h-11 flex-1 touch-none items-center gap-2 rounded-lg px-2 text-left text-sm font-bold" onPointerDown={e=>{if(e.button!==0||maximized)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);gesture.current={x:e.clientX,y:e.clientY,left:position.x,top:position.y};}} onPointerMove={e=>{const g=gesture.current;if(g)setPosition(clamp(g.left+e.clientX-g.x,g.top+e.clientY-g.y));}} onPointerUp={()=>{gesture.current=undefined;}} onPointerCancel={()=>{gesture.current=undefined;}} onKeyDown={e=>{const d={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[e.key];if(d&&!maximized){e.preventDefault();setPosition(p=>clamp(p.x+d[0],p.y+d[1]));}}}><Grip size={18}/>交通費計算</button>
   <button type="button" className="grid h-11 w-11 place-items-center rounded-lg bg-slate-800" aria-label={maximized?'交通費計算を小窓に戻す':'交通費計算を拡大'} onClick={()=>setMaximized(v=>!v)}>{maximized?<Minimize2 size={18}/>:<Maximize2 size={18}/>}</button>
   <button ref={closeRef} type="button" className="grid h-11 w-11 place-items-center rounded-lg bg-slate-800" aria-label="交通費計算を閉じる" onClick={onClose}><X size={18}/></button>
  </header>
  <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-3"><TrafficCostCalculator scopeKey={scopeKey} compact/></div>
 </aside>,document.body);
}
