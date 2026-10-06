import {useEffect,useState} from 'react';
import type {CareType} from '../types';
import {CARE_TYPES} from '../utils/careServices';
import {loadOrganizationServices,saveOrganizationServices,serviceSettingsError,type OrganizationServices} from '../services/organizationServiceTypes';

export function OrganizationServicesSettings({organizationId,onDirtyChange}:{organizationId:string;onDirtyChange?:(dirty:boolean)=>void}){
 const [saved,setSaved]=useState<OrganizationServices>({types:[],revision:0});
 const [draft,setDraft]=useState<CareType[]>([]);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [ready,setReady]=useState(false);
 const [reload,setReload]=useState(0);
 useEffect(()=>{let active=true;setLoading(true);setReady(false);setError('');setMessage('');
  void loadOrganizationServices(organizationId).then(value=>{if(active){setSaved(value);setDraft(value.types);setReady(true);}}).catch(e=>{if(active)setError(serviceSettingsError(e));}).finally(()=>{if(active)setLoading(false);});
  return ()=>{active=false;};
 },[organizationId,reload]);
 const dirty=JSON.stringify(draft)!==JSON.stringify(saved.types);
 useEffect(()=>{onDirtyChange?.(dirty);return()=>onDirtyChange?.(false);},[dirty,onDirtyChange]);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 const save=async()=>{setSaving(true);setError('');setMessage('');try{const result=await saveOrganizationServices(organizationId,saved,draft);setSaved(result);setDraft(result.types);setMessage('事業所種別を保存しました。');}catch(e){setError(serviceSettingsError(e));}finally{setSaving(false);}};
 return <section aria-label="事業所種別の設定" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
  <div><h2 className="text-xl font-black text-slate-900">事業所種別</h2><p className="mt-2 text-sm text-slate-600">事業所で提供しているサービスを複数選択できます。変更しても、既存の児童情報や予定は自動で変更しません。</p></div>
  {loading&&<p role="status">読み込み中…</p>}
  {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
  <fieldset disabled={loading||saving||!ready} className="space-y-3"><legend className="mb-2 text-sm font-bold">提供するサービス（複数選択可）</legend>
   {CARE_TYPES.map(type=><label key={type} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-3 ${draft.includes(type)?'border-teal-400 bg-teal-50':'border-slate-200'}`}><input type="checkbox" className="h-5 w-5 accent-teal-700" checked={draft.includes(type)} onChange={e=>{setMessage('');setDraft(CARE_TYPES.filter(candidate=>candidate===type?e.target.checked:draft.includes(candidate)));}}/><span className="text-sm font-bold">{type}</span></label>)}
  </fieldset>
  {!loading&&saved.revision===0&&<p className="text-xs text-slate-600">未設定です。実際に提供しているサービスを選択して保存してください。</p>}
  <p className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">児童ごとの利用サービスは「児童名簿 → 編集 → 事業種別・サービス」で設定します。今回の種別追加には、訪問予定・訪問記録・請求の機能は含みません。</p>
  <div className="flex flex-wrap gap-2"><button type="button" disabled={loading||saving||!ready||!draft.length||!dirty} onClick={()=>void save()} className="min-h-12 rounded-xl bg-teal-700 px-5 text-sm font-bold text-white disabled:opacity-40">{saving?'保存中…':'事業所種別を保存'}</button><button type="button" disabled={loading||saving} onClick={()=>{if(!dirty||window.confirm('未保存の種別選択を戻して再読込しますか？'))setReload(value=>value+1);}} className="min-h-12 rounded-xl border border-slate-300 px-4 text-sm font-bold">再読込</button></div>
  {message&&<p role="status" className="text-sm font-bold text-teal-800">{message}</p>}
 </section>;
}
