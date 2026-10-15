import {useEffect,useRef} from 'react';
import {BookOpen,ChevronDown,ExternalLink,LifeBuoy} from 'lucide-react';
import {getManualContext,MANUAL_TITLES,TROUBLE_TITLES,manualHref,troubleHref,type ManualContext,type ManualScreen} from '../utils/manualLinks';

export function ManualLinks({screen,section,context,className=''}:{screen?:ManualScreen;section?:string;context?:ManualContext;className?:string}){
 const help=context||getManualContext(screen||'home',section);
 const details=useRef<HTMLDetailsElement>(null);
 // Context changes must not leave a previous screen's expanded menu visible.
 useEffect(()=>{if(details.current)details.current.open=false;},[screen,section,help.topics[0]]);
 useEffect(()=>{const close=(event:PointerEvent)=>{if(details.current&&!details.current.contains(event.target as Node))details.current.open=false;};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&details.current?.open){details.current.open=false;details.current.querySelector('summary')?.focus();}};document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};},[]);
 const linkClass='inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-teal-200 bg-white px-2.5 py-1 text-xs font-bold text-teal-800 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600';
 const topic=help.topics[0],trouble=help.troubles[0];
 return <nav aria-label="この画面のマニュアル" data-manual-topic={topic} data-trouble-topic={trouble} className={`manual-links flex min-w-0 flex-wrap items-center justify-end gap-1.5 print:hidden ${className}`}>
  <a href={manualHref(topic,import.meta.env.BASE_URL)} target="_blank" rel="noopener noreferrer" className={linkClass} title={MANUAL_TITLES[topic]+'（別タブで開く）'} aria-label={'操作マニュアル：'+MANUAL_TITLES[topic]+'（別タブで開く）'}><BookOpen className="h-4 w-4 shrink-0" aria-hidden="true"/>操作マニュアル<ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true"/></a>
  <a href={troubleHref(trouble,import.meta.env.BASE_URL)} target="_blank" rel="noopener noreferrer" className={linkClass+' border-slate-200 text-slate-700'} title={TROUBLE_TITLES[trouble]+'（別タブで開く）'} aria-label={'困ったとき：'+TROUBLE_TITLES[trouble]+'（別タブで開く）'}><LifeBuoy className="h-4 w-4 shrink-0" aria-hidden="true"/>困ったとき</a>
  {(help.topics.length>1||help.troubles.length>1)&&<details ref={details} className="relative text-xs text-slate-800"><summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 font-bold">関連手順<ChevronDown className="h-3 w-3"/></summary><div className="absolute right-0 top-full z-50 mt-1 max-h-72 w-[min(20rem,calc(100vw-2rem))] space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl"><strong className="block px-2 py-1 text-teal-800">操作の手順</strong>{help.topics.map(id=><a key={id} className="block rounded-lg px-2 py-2 leading-relaxed hover:bg-teal-50" href={manualHref(id,import.meta.env.BASE_URL)} target="_blank" rel="noopener noreferrer">{MANUAL_TITLES[id]}</a>)}<strong className="block border-t px-2 py-1 pt-2 text-amber-800">トラブル対応</strong>{help.troubles.map(id=><a key={id} className="block rounded-lg px-2 py-2 leading-relaxed hover:bg-amber-50" href={troubleHref(id,import.meta.env.BASE_URL)} target="_blank" rel="noopener noreferrer">{TROUBLE_TITLES[id]}</a>)}<p className="px-2 py-1 text-[10px] text-slate-500">すべて別タブで開きます。入力中の画面は残ります。</p></div></details>}
 </nav>;
}
