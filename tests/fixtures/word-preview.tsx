import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {WordArtifactPreview} from '../../src/components/WordArtifactPreview';
import '../../src/index.css';
function Fixture(){
 const [kind,setKind]=useState(''),[ready,setReady]=useState(false);
 return <main className="mx-auto max-w-3xl space-y-4 p-4"><h1>プレビュー読み込みの試験</h1><nav className="flex gap-3">{['画像','PDF','失敗','閉じる'].map(item=><button key={item} onClick={()=>{setReady(false);setKind(item==='閉じる'?'':item);}} className="min-h-11 border bg-white p-2">試験：{item}</button>)}</nav>
 {kind&&<WordArtifactPreview key={kind} url={kind==='PDF'?'/manuals/traffic-cost/traffic-cost-manual.pdf':kind==='失敗'?'/missing-synthetic.pdf':'/manuals/d-support/images/qr.png'} fileType={kind==='画像'?'image/png':'application/pdf'} onReady={setReady}/>}
 <button type="button" disabled={!ready} className="min-h-11 rounded border p-3 disabled:opacity-50">確認して承認（試験用）</button></main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture/></React.StrictMode>);
