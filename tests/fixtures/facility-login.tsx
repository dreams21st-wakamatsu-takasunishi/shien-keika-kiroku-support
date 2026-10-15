import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import {AuthScreen} from '../../src/components/AuthScreen';
import {FacilityLoginSettings} from '../../src/components/FacilityLoginSettings';
import {selectFacilityStaff} from '../../src/services/facilityLogin';
function Fixture(){
 const [settings,setSettings]=useState(false),[result,setResult]=useState('');
 return <><button type="button" onClick={()=>{setSettings(!settings);setResult('');}} className="border p-2">試験用：画面切替</button>{result?<p role="status">{result}</p>:settings?<main className="min-h-screen bg-white p-4 text-slate-950"><FacilityLoginSettings organizationId="11111111-1111-4111-8111-111111111111"/></main>:<AuthScreen onSignIn={async()=>{setResult('メールログインを確認しました');return {error:null};}} onStaffIdSignIn={async()=>({error:null})} onQrSignIn={async()=>({error:null})} onFacilitySignIn={async(ticket,id)=>{try{await selectFacilityStaff(ticket,id);setResult('選択した職員でログインしました');return {error:null};}catch(e){return {error:e as Error};}}}/>}</>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture/></React.StrictMode>);
