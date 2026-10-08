import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import QRCode from 'qrcode';
import {AttendanceQrScanner} from '../../src/components/AttendanceQrScanner';
import {attendanceQrPayload} from '../../src/utils/attendanceQr';
import '../../src/index.css';

// Synthetic video only. Never opens the real camera or invokes a production RPC.
const params=new URLSearchParams(location.search);
const token='0123456789abcdef'.repeat(4);
const state={cameraRequests:0,stoppedTracks:0,scans:0,tokenMatches:false,lastAction:'',mode:'success',qr:'none',release:()=>{}};
const feed=document.createElement('canvas');feed.width=640;feed.height=480;
const ctx=feed.getContext('2d')!;
const code=new Image(),invalidCode=new Image();
code.src=await QRCode.toDataURL(attendanceQrPayload(token),{width:240,margin:4});
invalidCode.src=await QRCode.toDataURL('not-a-staff-qr',{width:240,margin:4});
await Promise.all([code.decode(),invalidCode.decode()]);
function draw(){
  ctx.fillStyle='#e2e8f0';ctx.fillRect(0,0,640,480);
  ctx.fillStyle='#0284c7';ctx.fillRect(20,20,90,90);ctx.fillStyle='#f97316';ctx.fillRect(530,20,90,90);
  ctx.fillStyle='#0f172a';ctx.font='bold 24px sans-serif';ctx.fillText('LEFT',28,72);ctx.fillText('RIGHT',536,72);
  ctx.font='18px sans-serif';ctx.fillText('Synthetic camera - no real person or attendance data',55,455);
  if(state.qr!=='none')ctx.drawImage(state.qr==='valid'?code:invalidCode,200,110,240,240);
}
draw();setInterval(draw,100);
if(params.get('storage')==='blocked')Object.defineProperty(window,'localStorage',{get:()=>{throw new DOMException('Blocked','SecurityError');}});
Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{
  state.cameraRequests++;
  if(params.get('camera')==='error')throw new DOMException('Camera permission denied','NotAllowedError');
  const stream=feed.captureStream(10);
  const track=stream.getVideoTracks()[0],settings=track.getSettings(),stop=track.stop.bind(track);
  Object.defineProperty(track,'getSettings',{value:()=>({...settings,facingMode:params.get('camera')==='front'?'user':params.get('camera')==='back'?'environment':undefined})});
  track.stop=()=>{state.stoppedTracks++;stop();};
  return stream;
}});
(window as any).__qrPreviewTest={state,showCode:(value:string)=>{state.qr=value;draw();}};

function Preview(){
  const [action,setAction]=useState<'出勤'|'退勤'|'ログイン'>();
  const [notice,setNotice]=useState('本番には送信されません。実カメラは使用しません。');
  return <main className="min-h-screen space-y-4 bg-slate-100 p-4 text-slate-950"><h1 className="text-xl font-bold">QR映像の確認・架空データ</h1><p>{notice}</p>
    {(['出勤','退勤','ログイン'] as const).map(value=><button key={value} className="mr-2 min-h-12 rounded-xl bg-teal-700 p-3 font-bold text-white" onClick={()=>setAction(value)}>{value}の読み取りを確認</button>)}
    {action&&<AttendanceQrScanner action={action} onClose={()=>setAction(undefined)} onScanned={async value=>{
      state.scans++;state.tokenMatches=value===token;state.lastAction=action;
      if(state.mode==='error')throw Error('確認用の読み取りエラー');
      if(state.mode==='pending')await new Promise<void>(resolve=>{state.release=resolve;});
      setAction(undefined);setNotice(`${action}の読み取りを確認しました。本番には保存されません。`);
    }}/>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Preview/></React.StrictMode>);
