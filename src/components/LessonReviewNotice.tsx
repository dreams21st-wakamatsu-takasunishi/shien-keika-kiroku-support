import React,{useEffect,useRef,useState} from 'react';
import {Bell,ChevronRight,RefreshCw} from 'lucide-react';
import {loadPendingWordReviewCount} from '../services/lessonLearningService';
import {LessonRequestError,wordNoticeErrorGuidance} from '../learning/reviewNotice';

export function LessonReviewNotice({enabled,scopeKey,onOpen}:{enabled:boolean;scopeKey:string;onOpen:()=>void}){
  return enabled ? <ManualWordNotice key={scopeKey} onOpen={onOpen}/> : null;
}

function ManualWordNotice({onOpen}:{key?:string;onOpen:()=>void}){
  const [reading,setReading]=useState<{count:number;at:Date}|null>(null);
  const [failure,setFailure]=useState<Error|null>(null);
  const [busy,setBusy]=useState(false);
  const [stale,setStale]=useState(false);
  const current=useRef<AbortController|null>(null);
  useEffect(()=>{
    const invalidate=()=>{current.current?.abort();current.current=null;setBusy(false);setStale(true);};
    window.addEventListener('d-support-word-reviews-updated',invalidate);
    return ()=>{current.current?.abort();current.current=null;window.removeEventListener('d-support-word-reviews-updated',invalidate);};
  },[]);
  const refresh=async()=>{
    if(current.current)return;
    setFailure(null);
    if(!navigator.onLine){setFailure(new Error('オフラインです。接続後にもう一度更新してください。'));return;}
    const controller=new AbortController();current.current=controller;setBusy(true);
    try{
      const count=await loadPendingWordReviewCount(controller.signal);
      if(current.current===controller){setReading({count,at:new Date()});setStale(false);}
    }catch(error){
      if(current.current===controller)setFailure(error instanceof Error?error:new Error('申請件数を取得できませんでした。'));
    }finally{
      if(current.current===controller){current.current=null;setBusy(false);}
    }
  };
  return <aside aria-label="Word申請" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
    <div className="min-w-0 flex-1">
      <span role="status" className="flex items-center gap-2 font-bold text-slate-800"><Bell aria-hidden="true" className="h-4 w-4 shrink-0"/>
        {busy?'Word申請の件数を確認中…':failure?'Word申請の件数を取得できませんでした。':!reading?'Word申請：未取得':stale?'Word申請：更新が必要です':`Word申請：未確認 ${reading.count} 件`}
      </span>
      {reading&&<p className="mt-1 text-xs text-slate-600">前回の確認：{reading.at.toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}{(stale||failure)&&` ／ 前回 ${reading.count}件（現在の件数は不明）`}</p>}
      {failure&&<details className="mt-1 text-xs text-amber-900"><summary className="cursor-pointer font-bold">{wordNoticeErrorGuidance(failure)}{failure instanceof LessonRequestError&&failure.httpStatus?`（HTTP ${failure.httpStatus}）`:''}</summary><p className="mt-1 break-words">{failure.message}</p></details>}
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={()=>void refresh()} className="flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 px-2 text-xs font-bold text-teal-800 disabled:opacity-50"><RefreshCw aria-hidden="true" className="h-4 w-4"/>未確認件数を更新</button>
      <button type="button" onClick={onOpen} className="flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-bold text-teal-800">申請一覧を開く<ChevronRight aria-hidden="true" className="h-4 w-4"/></button>
    </div>
  </aside>;
}
