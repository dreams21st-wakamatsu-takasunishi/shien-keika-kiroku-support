import React, {useEffect,useState} from 'react';
import {readDiagnostics,clearDiagnostics,diagnosticsPersisted,diagnosticAction,DIAGNOSTICS_RETENTION_DAYS} from '../services/diagnostics';
const codeLabels:Record<string,string>={NETWORK:'通信不可',CONFLICT:'更新競合',DUPLICATE:'重複',DELETED_RECORD:'削除済み記録',PERMISSION:'権限',VALIDATION:'入力・設定',SERVER:'サーバー',UNEXPECTED:'未分類',RECOVERY:'自動復旧',OK:'通信状態'};
export function DiagnosticsPanel(){
  const [events,setEvents]=useState(readDiagnostics);
  const refresh=()=>setEvents(readDiagnostics());
  useEffect(()=>{window.addEventListener('d-support:diagnostics',refresh);return()=>window.removeEventListener('d-support:diagnostics',refresh);},[]);
  const download=()=>{diagnosticAction('diagnostics.export');const url=URL.createObjectURL(new Blob([JSON.stringify({format:'d-support-diagnostics-v1',exportedAt:new Date().toISOString(),events:readDiagnostics()},null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`Dサポート_エラー履歴_${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 className="text-xl font-black text-slate-950">エラー・操作履歴</h2>
    <p className="text-sm leading-relaxed text-slate-600">この端末で発生した通信エラー・未処理エラー、記録保存の復旧状況と直前の操作を自動保存します。最大200件・{DIAGNOSTICS_RETENTION_DAYS}日間。児童名、職員名、記録本文、入力値、URL、認証情報は保存せず、サーバーやAIにも送信しません。他の端末の履歴は、その端末で書き出してください。</p>
    {!diagnosticsPersisted()&&<p role="alert" className="rounded-xl bg-amber-50 p-3 text-amber-900">端末内に履歴を保存できません。画面を閉じる前に書き出してください。</p>}
    <div className="flex flex-wrap gap-2"><button onClick={download} className="min-h-11 rounded-xl bg-teal-700 px-4 font-bold text-white">履歴を書き出す</button><button onClick={refresh} className="min-h-11 rounded-xl border px-4 font-bold">再読み込み</button><button onClick={()=>{if(window.confirm('この端末のエラー履歴を削除しますか？記録や下書きは削除しません。')){clearDiagnostics();refresh();}}} className="min-h-11 rounded-xl border border-rose-200 px-4 font-bold text-rose-700">履歴を削除</button></div>
    {!events.length&&<p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">履歴はまだありません。導入前のエラーは記録されていません。</p>}
    <div className="space-y-2">{[...events].reverse().map(event=><details key={event.id} className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-bold"><span className={event.kind==='error'?'text-rose-700':'text-teal-700'}>{codeLabels[event.code]}</span> · {new Date(event.at).toLocaleString('ja-JP')} · {event.operation}</summary><p className="mt-2 text-xs text-slate-600">画面：{event.screen} ／ 版：{event.version} ／ 接続：{event.online?'オンライン':'オフライン'}{event.httpStatus?` ／ HTTP ${event.httpStatus}`:''}</p><ol className="mt-2 space-y-1 text-xs text-slate-600">{event.actions.map((action,index)=><li key={index}>{new Date(action.at).toLocaleTimeString('ja-JP')} · {action.operation}</li>)}</ol></details>)}</div>
  </section>;
}
