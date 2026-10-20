import React,{useEffect,useState} from 'react';
import {Bell,ChevronRight,RefreshCw,X} from 'lucide-react';
import {loadWordReviewInbox} from '../services/lessonLearningService';
import {LessonRequestError,wordNoticeRetryDelay,wordNoticeErrorGuidance} from '../learning/reviewNotice';
export function LessonReviewNotice({enabled,scopeKey,onOpen}:{enabled:boolean;scopeKey:string;onOpen:()=>void}){
  const [count,setCount]=useState<number|null>(null),[failure,setFailure]=useState<unknown>(null),[retry,setRetry]=useState(0),[dismissed,setDismissed]=useState(false);
  useEffect(()=>{
    setCount(null);setFailure(null);setDismissed(false);if(!enabled)return;
    let disposed=false,busy=false,timer:number|undefined,failures=0,paused=false,nextAt=0;
    const refresh=async(force=false)=>{if(disposed||busy||document.visibilityState==='hidden'||!navigator.onLine||(!force&&(paused||Date.now()<nextAt)))return;
      window.clearTimeout(timer);busy=true;let delay:number|null=60000;
      try{const result=await loadWordReviewInbox();if(!disposed){setCount(result.requests.filter(row=>row.status==='pending').length);setFailure(null);failures=0;paused=false;}}
      catch(error){if(!disposed){setFailure(error);delay=wordNoticeRetryDelay(error,++failures);paused=delay===null;}}
      finally{busy=false;if(!disposed&&delay!==null){nextAt=Date.now()+delay;timer=window.setTimeout(()=>void refresh(),delay);}}};
    void refresh();
    const changed=()=>void refresh();const updated=()=>void refresh(true);
    window.addEventListener('online',changed);window.addEventListener('d-support-word-reviews-updated',updated);document.addEventListener('visibilitychange',changed);
    return()=>{disposed=true;window.clearTimeout(timer);window.removeEventListener('online',changed);window.removeEventListener('d-support-word-reviews-updated',updated);document.removeEventListener('visibilitychange',changed);};
  },[enabled,scopeKey,retry]);
  const failed=Boolean(failure);
  if(dismissed&&failed)return null;
  if(!enabled||(!failed&&!count))return null;
  return <aside role="status" className={`mb-4 flex flex-wrap items-center justify-between gap-3 border-l-4 p-3 text-sm ${failed?'border-amber-500 bg-amber-50 text-amber-950':'border-teal-600 bg-teal-50 text-teal-950'}`}>
    <div className="min-w-0 flex-1"><span className="flex items-center gap-2"><Bell className="h-4 w-4 shrink-0"/>{failed?'Word申請の通知を確認できていません。':`Wordの確認申請が ${count} 件届いています。`}</span>
      {failed&&<><p className="mt-1 text-xs">{wordNoticeErrorGuidance(failure)}{failure instanceof LessonRequestError&&failure.httpStatus?`（HTTP ${failure.httpStatus}）`:''}</p><details className="mt-2 text-xs"><summary className="cursor-pointer">失敗理由を確認</summary><p className="mt-1 break-words">{failure instanceof Error?failure.message:'通知の取得に失敗しました。'}</p>{count!==null&&<p>前回取得時の未確認申請：{count}件（現在の件数は不明）</p>}</details></>}
    </div><div className="flex items-center gap-3"><button type="button" onClick={failed?()=>setRetry(value=>value+1):onOpen} className="flex min-h-10 items-center gap-1 font-bold">{failed?<><RefreshCw className="h-4 w-4"/>再取得</>:<>申請を確認<ChevronRight className="h-4 w-4"/></>}</button>{failed&&<button type="button" aria-label="Word通知の警告を一時的に閉じる" title="警告を閉じます。Word確認画面から再確認できます。" onClick={()=>setDismissed(true)} className="flex min-h-10 min-w-10 items-center justify-center"><X className="h-4 w-4"/></button>}</div>
  </aside>;
}
