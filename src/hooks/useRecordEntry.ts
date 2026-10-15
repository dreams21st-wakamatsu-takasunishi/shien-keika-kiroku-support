import {useEffect,useRef,useState} from 'react';
import type {RecordDraftSummary} from '../types';
import {createRecordDraftKey} from '../utils/deviceId';
import {ownInputDrafts,resolveRecordEntry,validateOwnDraftMerge,type RecordEntryIdentity,type RecordEntryLaunch,type RecordEntryRequest} from '../utils/recordEntry';

export function useRecordEntry(options:{identity:RecordEntryIdentity;load:()=>Promise<RecordDraftSummary[]>;merge:(drafts:RecordDraftSummary[],target:string)=>Promise<void>;open:(launch:RecordEntryLaunch)=>void}){
 const [dialog,setDialog]=useState<{request:RecordEntryRequest;drafts:RecordDraftSummary[]}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const latest=useRef(options);latest.current=options;
 const operation=useRef(0),inFlight=useRef(false),mounted=useRef(true);
 const identityKey=JSON.stringify(options.identity),currentIdentity=useRef(identityKey);currentIdentity.current=identityKey;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;operation.current++;};},[]);
 useEffect(()=>{operation.current++;inFlight.current=false;setDialog(null);setBusy(false);setError('');},[identityKey]);
 const run=async(action:(valid:()=>boolean)=>Promise<void>)=>{
  if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');const id=++operation.current,scope=currentIdentity.current;
  const valid=()=>mounted.current&&operation.current===id&&scope===currentIdentity.current;
  try{await action(valid);}catch(e){if(valid())setError(e instanceof Error?e.message:'入力中の記録を確認できませんでした。新しい記録は作成していません。');}
  finally{if(valid()){inFlight.current=false;setBusy(false);}}
 };
 const request=(request:RecordEntryRequest)=>run(async valid=>{
  const drafts=await latest.current.load();if(!valid())return;
  const resolution=resolveRecordEntry(drafts,latest.current.identity,request);
  if(resolution.kind==='choose'){setDialog({request,drafts:resolution.candidates});return;}
  setDialog(null);latest.current.open({draftKey:resolution.kind==='resume'?resolution.draft.draftKey:createRecordDraftKey(),date:request.date,childId:request.childId,chooseChildren:!request.childId});
 });
 const choose=(key?:string)=>run(async valid=>{
  if(!dialog)return;const drafts=await latest.current.load();if(!valid())return;
  const own=ownInputDrafts(drafts,latest.current.identity,dialog.request.date);
  const existing=key?own.find(draft=>draft.draftKey===key):undefined;
  if(key&&!existing)throw Error('この記録の担当者や状態が変わっています。もう一度確認してください。');
  if(!key&&own.length){setDialog({request:dialog.request,drafts:own});throw Error('同じ日付の入力中記録があります。別画面を作らず、続ける記録を選んでください。');}
  setDialog(null);latest.current.open({draftKey:existing?.draftKey||createRecordDraftKey(),date:dialog.request.date,childId:dialog.request.childId,chooseChildren:!dialog.request.childId});
 });
 const merge=(keys:string[],target:string)=>run(async valid=>{
  if(!dialog)return;const drafts=await latest.current.load();if(!valid())return;
  const selected=validateOwnDraftMerge(drafts,latest.current.identity,dialog.request.date,keys);
  if(!keys.includes(target))throw Error('まとめ先の記録を選択してください。');
  // The SQL RPC checks these exact revisions again under row locks.
  await latest.current.merge(selected,target);if(!valid())return;
  setDialog(null);latest.current.open({draftKey:target,date:dialog.request.date,childId:dialog.request.childId,chooseChildren:!dialog.request.childId,reloaded:true});
 });
 return {dialog,busy,error,request,choose,merge,close:()=>{if(!inFlight.current){setDialog(null);setError('');}},clearError:()=>setError('')};
}
