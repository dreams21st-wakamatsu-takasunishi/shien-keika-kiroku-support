import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ActivityPlanWorkspace} from '../../src/components/ActivityPlanWorkspace';
import {TrafficCostCalculator} from '../../src/components/TrafficCostCalculator';
import {FacilityWorkspace} from '../../src/components/FacilityWorkspace';
import '../../src/index.css';
const noop=()=>{};
const basic='min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-950';
function Fixture(){
 const [page,setPage]=useState('activity'),[dirty,setDirty]=useState(false);
 return <main className="app-background min-h-screen space-y-4 p-4 sm:p-6"><nav className="flex flex-wrap gap-2">{[['activity','活動案'],['traffic','交通費'],['facility','施設業務'],['controls','各入力部品']] .map(([id,name])=><button key={id} className="min-h-11 rounded-lg border bg-white px-3" onClick={()=>setPage(id)}>試験：{name}</button>)}</nav><p aria-label="試験：未保存状態">{dirty?'未保存':'変更なし'}</p>
  {page==='activity'?<ActivityPlanWorkspace organizationId="22222222-2222-4222-8222-222222222222" userId="11111111-1111-4111-8111-111111111111" onDirtyChange={setDirty} onOpenTrafficCost={()=>setPage('traffic')} onOpenCalendar={noop}/>:page==='traffic'?<TrafficCostCalculator scopeKey="visual-test"/>:page==='facility'?<FacilityWorkspace organizationId="22222222-2222-4222-8222-222222222222" userId="11111111-1111-4111-8111-111111111111" onDirtyChange={setDirty}/>:<section className="grid gap-4 rounded-xl bg-white p-4 sm:grid-cols-3" aria-label="入力部品の試験">
   {['text','number','date','time','datetime-local','month','week','email','tel','url','password'].map(type=><label key={type}>{type}<input type={type} aria-label={`試験：${type}`} className={basic} placeholder="入力例"/></label>)}
   <label>複数行<textarea aria-label="試験：textarea" className={basic} placeholder="入力例"/></label><label>選択<select aria-label="試験：select" className={basic}><option>項目A</option><option>項目B</option></select></label>
   <input aria-label="試験：readonly" readOnly defaultValue="閲覧のみ" className={basic}/><input aria-label="試験：disabled" disabled defaultValue="編集不可" className={basic+' disabled:bg-slate-100'}/>
   <fieldset disabled><input aria-label="試験：disabled-fieldset" defaultValue="保存中" className={basic}/></fieldset>
   <input aria-label="試験：error" aria-invalid="true" defaultValue="入力エラー" className="border border-rose-600 bg-rose-50 p-3"/>
   <input aria-label="試験：error-border" defaultValue="入力エラー" className="border border-red-600 bg-white p-3"/>
   <input aria-label="試験：warning" defaultValue="時刻変更あり" className="border border-amber-400 bg-amber-50 p-3"/>
   <input aria-label="試験：plain" data-input-appearance="plain" className={basic}/><input type="search" aria-label="試験：search" className={basic}/>
   <input type="checkbox" aria-label="試験：checkbox"/><input type="radio" aria-label="試験：radio"/>
   <input type="range" aria-label="試験：range"/><input type="color" aria-label="試験：color" defaultValue="#ff0000"/><input type="file" aria-label="試験：file"/>
   <button className="min-h-11 rounded-lg bg-teal-700 p-3 font-bold text-white">試験：操作ボタン</button>
  </section>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
