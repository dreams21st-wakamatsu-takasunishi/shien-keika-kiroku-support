import React,{useEffect,useState} from 'react';
import {Bell,ChevronRight,RefreshCw} from 'lucide-react';
import {loadWordReviewInbox} from '../services/lessonLearningService';
export function LessonReviewNotice({enabled,scopeKey,onOpen}:{enabled:boolean;scopeKey:string;onOpen:()=>void}){
  const [count,setCount]=useState<number|null>(null),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{
    setCount(null);setFailed(false);if(!enabled)return;
    let disposed=false,busy=false;
    const refresh=async()=>{if(busy||document.visibilityState==='hidden')return;busy=true;
      try{const result=await loadWordReviewInbox();if(!disposed){setCount(result.requests.filter(row=>row.status==='pending').length);setFailed(false);}}
      catch{if(!disposed){setCount(null);setFailed(true);}}finally{busy=false;}};
    void refresh();const timer=window.setInterval(()=>void refresh(),60000);
    const changed=()=>void refresh();window.addEventListener('d-support-word-reviews-updated',changed);document.addEventListener('visibilitychange',changed);
    return()=>{disposed=true;window.clearInterval(timer);window.removeEventListener('d-support-word-reviews-updated',changed);document.removeEventListener('visibilitychange',changed);};
  },[enabled,scopeKey,retry]);
  if(!enabled||(!failed&&!count))return null;
  return <aside role="status" className={`mb-4 flex flex-wrap items-center justify-between gap-3 border-l-4 p-3 text-sm ${failed?'border-amber-500 bg-amber-50 text-amber-950':'border-teal-600 bg-teal-50 text-teal-950'}`}>
    <span className="flex items-center gap-2"><Bell className="h-4 w-4"/>{failed?'Word申請の通知を取得できませんでした。':`Wordの確認申請が ${count} 件届いています。`}</span>
    <button type="button" onClick={failed?()=>setRetry(value=>value+1):onOpen} className="flex min-h-10 items-center gap-1 font-bold">{failed?<><RefreshCw className="h-4 w-4"/>再取得</>:<>申請を確認<ChevronRight className="h-4 w-4"/></>}</button>
  </aside>;
}
