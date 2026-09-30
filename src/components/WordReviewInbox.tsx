import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Check,Eye,FileCheck2,LoaderCircle,RefreshCw,RotateCcw} from 'lucide-react';
import type {ChildProfile} from '../types';
import {type WordReviewRequest,wordStageNames} from '../learning/wordReviews';
import {decideWordRequest,loadWordArtifact,loadWordReviewInbox,type WordArtifact} from '../services/lessonLearningService';
import {WordArtifactPreview} from './WordArtifactPreview';

export function WordReviewInbox({childrenList,childId,remoteMode,scopeKey}:{childrenList:ChildProfile[];childId:string;remoteMode:boolean;scopeKey:string}){
  const [requests,setRequests]=useState<WordReviewRequest[]>([]),[canReview,setCanReview]=useState(false);
  const [selectedId,setSelectedId]=useState(''),[filter,setFilter]=useState<'pending'|'done'>('pending');
  const [artifact,setArtifact]=useState<WordArtifact|null>(null),[checked,setChecked]=useState(false),[reason,setReason]=useState('');
  const [artifactReady,setArtifactReady]=useState(false);
  const previewReady=useCallback((value:boolean)=>{setArtifactReady(value);if(!value)setChecked(false);},[]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const epoch=useRef(0),operationEpoch=useRef(0),inflight=useRef<number|null>(null);
  const selected=requests.find(row=>row.id===selectedId);
  const name=(id:string)=>childrenList.find(child=>child.id===id)?.name||'対象児童';
  const load=useCallback(async()=>{
    if(!remoteMode||inflight.current===epoch.current)return;
    const version=epoch.current;inflight.current=version;
    try{const result=await loadWordReviewInbox();if(version!==epoch.current)return;setRequests(result.requests);setCanReview(result.canReviewWord);setError('');}
    catch(error){if(version===epoch.current){setRequests([]);setCanReview(false);setArtifact(null);setChecked(false);setError(error instanceof Error?error.message:'Word申請を取得できませんでした。');}}
    finally{if(inflight.current===version)inflight.current=null;}
  },[remoteMode]);
  useEffect(()=>{
    epoch.current++;setRequests([]);setSelectedId('');setArtifact(null);setChecked(false);setCanReview(false);setError('');setReason('');setMessage('');
    void load();return()=>{epoch.current++;};
  },[load,scopeKey]);
  useEffect(()=>{operationEpoch.current++;setSelectedId('');},[childId,scopeKey]);
  useEffect(()=>{operationEpoch.current++;setArtifact(null);setChecked(false);setReason('');},[selectedId,selected?.revision,childId]);
  useEffect(()=>{setMessage('');},[selectedId,childId]);
  const run=async(action:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');setMessage('');try{await action();}catch(error){setError(error instanceof Error?error.message:'確認結果を保存できませんでした。');}finally{setBusy(false);}};
  const openArtifact=async()=>{
    if(!selected)return;setArtifact(null);setChecked(false);const version=epoch.current,operation=operationEpoch.current;
    const result=await loadWordArtifact(selected);if(version!==epoch.current||operation!==operationEpoch.current)return;
    if(result.requestId!==selected.id||result.revision!==selected.revision)throw Error('申請の版が変わりました。更新してください。');
    setArtifact(result);
  };
  const decide=async(decision:'approved'|'returned')=>{
    if(!selected||!artifact||!artifactReady||!checked||!canReview)return;
    const version=epoch.current,operation=operationEpoch.current;
    const result=await decideWordRequest(selected,artifact,decision,reason.trim());if(version!==epoch.current||operation!==operationEpoch.current)return;
    setRequests(rows=>rows.map(row=>row.id===result.request.id?result.request:row));setArtifact(null);setChecked(false);
    setMessage(decision==='approved'?'承認しました。児童のクリアと報酬に反映済みです。':'差し戻しました。児童画面に理由が表示されます。');
    window.dispatchEvent(new Event('d-support-word-reviews-updated'));
  };
  const visible=requests.filter(row=>(!childId||row.childId===childId)&&(filter==='pending'?row.status==='pending':row.status!=='pending'));
  return <div className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-base font-bold text-slate-950"><FileCheck2 className="h-5 w-5 text-teal-700"/>Word確認</h3><button type="button" disabled={busy||!remoteMode} onClick={()=>void run(load)} title="Word申請を更新" className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50"><RefreshCw className="h-4 w-4"/>更新</button></div>
    {error&&<p role="alert" className="border-l-4 border-rose-500 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
    {message&&<p role="status" className="bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
    <div className="flex gap-1 border-b border-slate-200" role="tablist" aria-label="Word申請の状態">{([['pending','未確認'],['done','確認履歴']] as const).map(([value,label])=><button key={value} type="button" role="tab" aria-selected={filter===value} disabled={busy} onClick={()=>{setFilter(value);setSelectedId('');}} className={`min-h-10 border-b-2 px-3 text-sm font-bold ${filter===value?'border-teal-700 text-teal-800':'border-transparent text-slate-600'}`}>{label}</button>)}</div>
    <div className="divide-y divide-slate-200 border-y border-slate-200">{visible.map(row=><button key={row.id} type="button" disabled={busy} aria-pressed={selectedId===row.id} onClick={()=>setSelectedId(row.id)} className={`flex min-h-16 w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm ${selectedId===row.id?'bg-teal-50':'hover:bg-slate-50'}`}><span className="min-w-0 break-words"><strong>{name(row.childId)}</strong><span className="ml-3">Word {wordStageNames[row.stageId]}</span><span className="block text-xs text-slate-600">{new Date(row.submittedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}・{row.page?`${row.page}ページまで`:'ページ指定なし'}</span></span><span className="shrink-0 text-xs font-bold text-slate-700">{({pending:'未確認',approved:'承認済み',returned:'差し戻し',expired:'連携解除・期限終了'} as const)[row.status]}</span></button>)}{visible.length===0&&<p className="py-6 text-center text-sm text-slate-600">{remoteMode?'取得できた申請はありません。':'職員ログインとクラウド接続が必要です。'}</p>}</div>
    {selected&&<section aria-label="提出作品の確認" className="min-w-0 space-y-4 border-t border-slate-300 pt-4">
      <h4 className="break-words text-base font-bold">{name(selected.childId)}・Word {wordStageNames[selected.stageId]}</h4>
      <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={busy||!selected.artifactAvailable} onClick={()=>void run(openArtifact)} className="flex min-h-10 items-center gap-2 rounded-lg border border-teal-600 px-3 text-sm font-bold text-teal-800 disabled:opacity-50"><Eye className="h-4 w-4"/>作品を表示</button><span className="text-xs text-slate-600">{selected.fileType==='application/pdf'?'PDF':'画像'}・{Math.ceil(selected.fileSize/1024)} KB・版 {selected.revision}</span></div>
      {artifact&&<WordArtifactPreview key={`${artifact.requestId}:${artifact.revision}:${artifact.url}`} url={artifact.url} fileType={artifact.fileType} onReady={previewReady}/>}
      {selected.status==='pending'&&canReview?<>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={checked} disabled={!artifact||!artifactReady||busy} onChange={event=>setChecked(event.target.checked)} className="mt-1 h-4 w-4 accent-teal-700"/>この版の作品と取り組んだ内容を確認しました</label>
        <label className="block text-sm font-bold text-slate-700">児童へのコメント・差し戻し理由<textarea value={reason} disabled={busy} maxLength={600} onChange={event=>setReason(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm font-normal"/></label>
        <div className="flex flex-wrap gap-3"><button type="button" disabled={busy||!artifact||!artifactReady||!checked} onClick={()=>void run(()=>decide('approved'))} className="flex min-h-11 items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-bold text-white disabled:opacity-50">{busy?<LoaderCircle className="h-4 w-4 animate-spin"/>:<Check className="h-4 w-4"/>}承認</button><button type="button" disabled={busy||!artifact||!artifactReady||!checked||!reason.trim()} onClick={()=>void run(()=>decide('returned'))} className="flex min-h-11 items-center gap-2 rounded-lg border border-rose-300 px-4 text-sm font-bold text-rose-800 disabled:opacity-50"><RotateCcw className="h-4 w-4"/>差し戻す</button></div>
      </>:selected.status==='pending'?<p className="text-sm text-slate-600">作品の確認・承認権限が必要です。</p>:<div className="space-y-1 text-sm"><p>{selected.reviewerName||'職員'}・{selected.reviewedAt?new Date(selected.reviewedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'確認日時なし'}</p><p className="whitespace-pre-wrap break-words">{selected.reason||'コメントなし'}</p></div>}
    </section>}
  </div>;
}
