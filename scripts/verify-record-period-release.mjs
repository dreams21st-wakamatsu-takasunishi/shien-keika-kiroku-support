// Public assets only; no Auth, record read or database mutation.
import {publishedRuntime} from './published-runtime.mjs';
const expected=process.argv[2];if(!/^[a-f0-9]{7}$/.test(expected||''))throw Error('Expected short commit');
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
const read=async p=>{const r=await fetch(new URL(p,base),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Public asset unavailable: '+p);return r;};
const version=await(await read('version.json?verify='+Date.now())).json(),manifest=await(await read('asset-manifest.json?verify='+Date.now())).json();
if(!version.version.startsWith(expected+'.')||manifest.version!==version.version)throw Error('Old/mixed release');
const runtime=await publishedRuntime(manifest,read);
for(const marker of ['選択期間・条件に一致','選択した期間の支援記録を読み込んでいます。まだ「記録なし」とは確定していません。','記録を再読み込み','approval_status.neq.確認済み','record_date.lt.','record.history','選択期間の支援記録取得','保存状態が繰り返し変化しているため停止しました。'])if(!runtime.includes(marker))throw Error('Missing period/protection marker '+marker);
if(runtime.includes('data-record-layout'))throw Error('Replaced input UI unexpectedly returned');
console.log(JSON.stringify({version:version.version,periodReadsPublished:true,initialWindowAndOutstandingIncluded:true,exportGatesPublished:true,previousInputUiRetained:true,readsPrivateData:false,writesDatabase:false,realDeviceLatencyVerified:false}));
