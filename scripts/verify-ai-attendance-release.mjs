// Public assets only: no authentication, external AI requests or private record reads.
import {publishedRuntime} from './published-runtime.mjs';
const expected=process.argv[2];if(!/^[a-f0-9]{7}$/.test(expected||''))throw Error('Expected short commit required');
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
const read=async path=>{const r=await fetch(new URL(path,base),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Unavailable public asset: '+path);return r;};
const version=await(await read('version.json?verify='+Date.now())).json(),manifest=await(await read('asset-manifest.json?verify='+Date.now())).json();
if(!version.version.startsWith(expected+'.')||manifest.version!==version.version)throw Error('Old or mixed release');
const runtime=await publishedRuntime(manifest,read);
for(const marker of ['Tiroへ渡す情報','まとめ文（手入力）','confirm_attendance_break','休憩実績を確認','実際の休憩合計（分）','未確定・集計対象外','実働分（確定のみ）','確認根拠・訂正理由'])if(!runtime.includes(marker))throw Error('Missing published feature: '+marker);
for(const retired of ['AI業務アシスタント','AI文章設定','確認して外部AI送信を許可','外部AIへ送る内容の確認','ABC分析を要約する','generativelanguage.googleapis.com'])if(runtime.includes(retired))throw Error('Retired AI feature published: '+retired);
const manual=await(await read('manuals/d-support/index.html')).text();if(manual.includes('id="assistant"')||manual.includes('ホーム → AIアシスタント'))throw Error('Retired guide remains');
if(runtime.includes('data-record-layout'))throw Error('Rejected record redesign was restored');
console.log(JSON.stringify({version:version.version,automaticExternalAiRemoved:true,manualTiroOnly:true,actualAttendanceUiPublished:true,previousRecordUiRetained:true,manualUpdated:true,readsPrivateRecords:false,callsExternalAi:false}));
