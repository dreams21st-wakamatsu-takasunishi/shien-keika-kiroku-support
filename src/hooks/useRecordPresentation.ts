import {useEffect,useState} from 'react';
export type RecordPresentation='pc'|'tablet'|'classic';
export type RecordPresentationChoice='auto'|RecordPresentation;
export function useRecordPresentation(){
 const [choice,setChoice]=useState<RecordPresentationChoice>('auto');
 const [touchLayout,setTouchLayout]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(max-width: 1199px), (pointer: coarse)').matches);
 useEffect(()=>{const query=window.matchMedia('(max-width: 1199px), (pointer: coarse)');const changed=()=>setTouchLayout(query.matches);changed();query.addEventListener('change',changed);return()=>query.removeEventListener('change',changed);},[]);
 return {choice,setChoice,presentation:choice==='auto'?(touchLayout?'tablet':'pc'):choice as RecordPresentation};
}
