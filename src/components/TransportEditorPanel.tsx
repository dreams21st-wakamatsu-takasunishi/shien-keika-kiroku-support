import React, {useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {Grip, Maximize2, Minimize2, PanelRight, PictureInPicture2, PanelBottomClose, X} from 'lucide-react';
import {constrainPanel, type PanelGeometry} from '../utils/editorPanelGeometry';
export type EditorPanelMode='floating'|'docked'|'maximized'|'minimized';
interface Props {
  mode:EditorPanelMode;onModeChange:(mode:EditorPanelMode)=>void;children:ReactNode;
  title?:string;panelId?:string;anchorId?:string;initialGeometry?:PanelGeometry;zIndex?:number;onActivate?:()=>void;contentKey?:string;onCancel?:()=>void;
}
export function TransportEditorPanel({mode,onModeChange,children,title='送迎編集',panelId='transport-editor',anchorId='transport-editor-anchor',initialGeometry={x:600,y:12,width:480,height:500},zIndex=20,onActivate,contentKey,onCancel}:Props) {
  const panelRef=useRef<HTMLElement>(null);
  const bodyRef=useRef<HTMLDivElement>(null);
  const lastContent=useRef(children);
  useLayoutEffect(()=>{if(mode!=='minimized')lastContent.current=children;},[children,mode]);
  useLayoutEffect(()=>{if(bodyRef.current)bodyRef.current.scrollTop=0;},[contentKey]);
  const [geometry,setGeometry]=useState(initialGeometry);
  const [displayMode,setDisplayMode]=useState(mode);
  const previousMode=useRef(mode);
  const animation=useRef<Animation>();
  const bounds=()=>{const parent=panelRef.current?.parentElement;return {width:parent?.clientWidth||460,height:Math.max(280,(parent?.clientHeight||564)-64)};};
  useLayoutEffect(()=>{
    const parent=panelRef.current?.parentElement;if(!parent)return;
    const observer=new ResizeObserver(()=>setGeometry(current=>constrainPanel(current,bounds())));
    observer.observe(parent);return ()=>observer.disconnect();
  },[]);
  useLayoutEffect(()=>{
    const node=panelRef.current;if(!node)return;
    animation.current?.cancel();
    const previous=previousMode.current,anchor=document.getElementById(anchorId);
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const transform=()=>{const rect=node.getBoundingClientRect(),target=anchor?.getBoundingClientRect();return target?`translate(${target.x+target.width/2-rect.x-rect.width/2}px,${target.y+target.height/2-rect.y-rect.height/2}px) scale(0.07)`:'scale(0.07)';};
    if(mode==='minimized'&&displayMode!=='minimized'){
      if(reduced||!node.animate){setDisplayMode(mode);previousMode.current=mode;return;}
      const current=node.animate([{transform:'none',opacity:1},{transform:transform(),opacity:0}],{duration:280,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'});
      animation.current=current;current.onfinish=()=>{setDisplayMode('minimized');previousMode.current='minimized';current.cancel();};
    }else if(mode!=='minimized'){
      if(displayMode!==mode){setDisplayMode(mode);return;}
      if(previous==='minimized'&&!reduced&&node.animate)animation.current=node.animate([{transform:transform(),opacity:0},{transform:'none',opacity:1}],{duration:280,easing:'cubic-bezier(.2,.8,.2,1)'});
      previousMode.current=mode;
    }
    return ()=>animation.current?.cancel();
  },[mode,displayMode,anchorId]);
  const gesture=useRef<{kind:'move'|'resize';x:number;y:number;geometry:PanelGeometry}>();
  const start=(event:React.PointerEvent,kind:'move'|'resize')=>{if(mode!=='floating'||event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);gesture.current={kind,x:event.clientX,y:event.clientY,geometry};};
  const move=(event:React.PointerEvent)=>{const active=gesture.current;if(!active)return;const dx=event.clientX-active.x,dy=event.clientY-active.y;setGeometry(constrainPanel(active.kind==='move'?{...active.geometry,x:active.geometry.x+dx,y:active.geometry.y+dy}:{...active.geometry,width:active.geometry.width+dx,height:active.geometry.height+dy},bounds()));};
  const end=()=>{gesture.current=undefined;};
  const keyboard=(event:React.KeyboardEvent,kind:'move'|'resize')=>{const delta={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[event.key];if(mode==='floating'&&delta){event.preventDefault();setGeometry(current=>constrainPanel(kind==='move'?{...current,x:current.x+delta[0],y:current.y+delta[1]}:{...current,width:current.width+delta[0],height:current.height+delta[1]},bounds()));}};
  const modes=[['floating','小窓',PictureInPicture2],['docked','右固定',PanelRight],['maximized',mode==='maximized'?'小窓に戻す':'最大化',mode==='maximized'?Minimize2:Maximize2],['minimized','収納',PanelBottomClose]] as const;
  return <aside id={panelId} ref={panelRef} aria-label={`${title}の小窓`} hidden={displayMode==='minimized'} data-mode={mode} onPointerDownCapture={onActivate} onFocusCapture={onActivate}
    className={`transport-editor-panel ${displayMode==='docked'?'is-docked':displayMode==='maximized'?'is-maximized':'is-floating'}`}
    style={{...(displayMode==='floating'?{left:geometry.x,top:geometry.y,width:geometry.width,height:geometry.height}:{}),zIndex}}>
    <header className="flex items-center gap-1 border-b border-slate-200 bg-slate-950 p-2 text-white">
      <span role="button" tabIndex={0} aria-label={`${title}を移動`} title="ドラッグで移動。矢印キーでも移動できます" className="flex min-h-9 min-w-20 flex-1 cursor-move touch-none select-none items-center gap-2 px-1 text-sm font-bold" onPointerDown={event=>start(event,'move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onKeyDown={event=>keyboard(event,'move')}><Grip size={16} aria-hidden="true"/>{title}</span>
      {modes.map(([value,label,Icon])=><button key={value} type="button" aria-label={label} title={label} onClick={()=>onModeChange(value==='maximized'&&mode==='maximized'?'floating':value)} aria-pressed={mode===value} className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${mode===value?'bg-teal-500 text-slate-950':'bg-slate-800 text-white hover:bg-slate-700'}`}><Icon size={17} aria-hidden="true"/></button>)}
      {onCancel&&<button type="button" aria-label="キャンセルして閉じる" title="確定前の入力をキャンセルして閉じる（確定済みの配車は保持）" onClick={onCancel} className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-slate-800 text-white hover:bg-rose-700"><X size={18} aria-hidden="true"/></button>}
    </header>
    <div ref={bodyRef} className="ui-scrollbar min-h-0 flex-1 overflow-auto p-3">{mode==='minimized'?lastContent.current:children}</div>
    {displayMode==='floating'&&<button type="button" aria-label={`${title}のサイズを変更`} title="ドラッグでサイズ変更。矢印キーでも変更できます" className="absolute bottom-0 right-0 z-10 h-8 w-8 cursor-se-resize touch-none rounded-tl-lg bg-slate-200 text-slate-700" onPointerDown={event=>start(event,'resize')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onKeyDown={event=>keyboard(event,'resize')}>◢</button>}
  </aside>;
}
