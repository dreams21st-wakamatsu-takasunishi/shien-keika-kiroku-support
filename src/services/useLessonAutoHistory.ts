import {useEffect,useRef,useState} from 'react';
import {parseHistory,type LessonHistory,type LessonLink} from '../learning/contracts';
import {loadLessonHistory,loadLessonLinks} from './lessonLearningService';

export interface AutomaticLessonResult {
 childId:string;date:string;organizationId:string;actorId:string;requestId:number;
 status:'loading'|'ready'|'empty'|'unlinked'|'error';message:string;
 history?:LessonHistory;link?:LessonLink;
 checkedAt?:string;
}
export function useLessonAutoHistory({childIds,date,organizationId,actorId,enabled}:{
 childIds:string[];date:string;organizationId:string;actorId:string;enabled:boolean;
}):{results:Record<string,AutomaticLessonResult>;refresh:(childId?:string)=>void}{
 const [results,setResults]=useState<Record<string,AutomaticLessonResult>>({});
 const [refreshToken,setRefreshToken]=useState(0);
 const [childRetryToken,setChildRetryToken]=useState(0);
 const generation=useRef(0),cache=useRef(new Map<string,AutomaticLessonResult>());
 const scope=JSON.stringify([organizationId,actorId,date,refreshToken]);
 const childSignature=JSON.stringify([...childIds].sort());
 useEffect(()=>{
  const requestId=++generation.current;
  if(!enabled||!organizationId||!actorId||!date){setResults({});return;}
  const ids=JSON.parse(childSignature) as string[];
  const rows=Object.fromEntries(ids.map(childId=>[childId,cache.current.get(`${scope}:${childId}`)||{
   childId,date,organizationId,actorId,requestId,status:'loading' as const,message:'Dレッスンの実績を取得しています。',
  }]));
  setResults(rows);
  const pending=ids.filter(id=>!cache.current.has(`${scope}:${id}`));
  if(!pending.length)return;
  const publish=(result:AutomaticLessonResult)=>{
   if(requestId!==generation.current)return;
   const checked={...result,checkedAt:new Date().toISOString()};
   cache.current.set(`${scope}:${result.childId}`,checked);
   setResults(previous=>({...previous,[result.childId]:checked}));
  };
  void (async()=>{
   try{
    const context=await loadLessonLinks();if(requestId!==generation.current)return;
    if(!context.configured)throw Error('Dレッスン連携のサーバー設定が未完了です。');
    // Sequential reads limit server load when many children are selected.
    for(const childId of pending){
     if(requestId!==generation.current)return;
     const base={childId,date,organizationId,actorId,requestId};
     const link=context.links.find(row=>row.child_id===childId&&row.organization_id===organizationId&&row.active);
     if(!link){publish({...base,status:'unlinked',message:'学習アカウントが未連携です。'});continue;}
     try{
      const raw=await loadLessonHistory(childId,date);
      const history={...parseHistory(raw,link,date),fetchedAt:raw.fetchedAt};
      const fresh=await loadLessonLinks();if(requestId!==generation.current)return;
      const current=fresh.links.find(row=>row.child_id===childId&&row.organization_id===organizationId&&row.active);
      if(!fresh.configured||!current||current.id!==link.id||current.revision!==link.revision
       ||current.source_project_ref!==link.source_project_ref||current.source_table!==link.source_table
       ||current.source_student_id!==link.source_student_id||current.source_campus_id!==link.source_campus_id){
       throw Error('学習連携が変更されました。再取得してください。');
      }
      publish({...base,status:history.events.length?'ready':'empty',message:history.events.length?`${history.events.length}件の実績を取得しました。`:'取得できた履歴はありません。未実施とは判断できません。',history,link:current});
     }catch(error){publish({...base,status:'error',message:error instanceof Error?error.message:'実績を取得できませんでした。'});}
    }
   }catch(error){for(const childId of pending)publish({childId,date,organizationId,actorId,requestId,status:'error',message:error instanceof Error?error.message:'実績を取得できませんでした。'});}
  })();
  return()=>{generation.current++;};
 },[scope,childSignature,childRetryToken,enabled,organizationId,actorId,date]);
 // A new date/account or an explicit retry gets fresh data, never a cross-scope cache.
 useEffect(()=>{cache.current.clear();},[scope]);
 return {results,refresh:(childId?:string)=>{
  if(childId){
   if(!childIds.includes(childId))return;
   cache.current.delete(`${scope}:${childId}`);
   setChildRetryToken(value=>value+1);
  }else setRefreshToken(value=>value+1);
 }};
}
