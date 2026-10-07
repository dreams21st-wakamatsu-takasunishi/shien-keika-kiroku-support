import {useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {markerPopoverPosition} from '../utils/markerPopover';
interface Props {
  anchor:HTMLButtonElement;
  childrenList:Array<{id:string;name:string;time?:string;career:boolean}>;
  onSelect:(id:string)=>void;
  onClose:()=>void;
}
export function MarkerChildPopover({anchor,childrenList,onSelect,onClose}:Props) {
  const popup=useRef<HTMLDivElement>(null);
  const [position,setPosition]=useState<ReturnType<typeof markerPopoverPosition>>();
  useLayoutEffect(()=>{
    const update=()=>{
      const rect=anchor.getBoundingClientRect(),scroll=anchor.closest('.operations-timeline-grid')?.parentElement?.getBoundingClientRect();
      let clipped=false;
      for(let parent=anchor.parentElement;parent;parent=parent.parentElement){
        const css=getComputedStyle(parent),bounds=parent.getBoundingClientRect();
        if((/(auto|scroll|hidden|clip)/.test(css.overflowY)&&(rect.bottom<=bounds.top||rect.top>=bounds.bottom))||(/(auto|scroll|hidden|clip)/.test(css.overflowX)&&(rect.right<=bounds.left||rect.left>=bounds.right))){clipped=true;break;}
      }
      if(clipped||!anchor.isConnected||rect.bottom<0||rect.top>innerHeight||rect.right<0||rect.left>innerWidth||(scroll&&(rect.bottom<scroll.top||rect.top>scroll.bottom||rect.right<scroll.left||rect.left>scroll.right))){onClose();return;}
      setPosition(markerPopoverPosition(rect,{width:innerWidth,height:innerHeight},Math.min(380,64+childrenList.length*48)));
    };
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!popup.current?.contains(event.target)&&!anchor.contains(event.target))onClose();};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();anchor.focus({preventScroll:true});}};
    update();
    window.addEventListener('scroll',update,true);window.addEventListener('resize',update);
    document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape,true);
    return ()=>{window.removeEventListener('scroll',update,true);window.removeEventListener('resize',update);document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape,true);};
  },[anchor,childrenList.length,onClose]);
  useLayoutEffect(()=>{if(position)popup.current?.querySelector<HTMLButtonElement>('[data-child-choice]')?.focus({preventScroll:true});},[Boolean(position)]);
  if(!position)return null;
  const {side,arrowLeft,...style}=position;
  return createPortal(<div ref={popup} role="group" aria-label="時刻マーカーの児童を選択" className="fixed z-[110] flex flex-col rounded-xl border-2 border-teal-500 bg-white shadow-xl" style={style}>
    <span aria-hidden="true" className={`absolute h-3 w-3 rotate-45 border-teal-500 bg-white ${side==='below'?'-top-2 border-l-2 border-t-2':'-bottom-2 border-b-2 border-r-2'}`} style={{left:arrowLeft-6}}/>
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 py-2"><strong className="text-sm text-teal-950">送迎を組む児童</strong><button type="button" onClick={()=>{onClose();anchor.focus({preventScroll:true});}} aria-label="児童選択を閉じる" className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100"><X size={17}/></button></div>
    <div className="min-h-0 space-y-1 overflow-auto p-2">{childrenList.map(child=><button type="button" data-child-choice key={child.id} onClick={()=>onSelect(child.id)} className={`block min-h-11 w-full rounded-lg border p-2 text-left text-sm ${child.career?'border-violet-200 bg-violet-50':'border-sky-200 bg-sky-50'}`}>{child.name}・{child.time||'時刻未確定'}</button>)}</div>
  </div>,anchor.closest('[role="dialog"]')||document.body);
}
