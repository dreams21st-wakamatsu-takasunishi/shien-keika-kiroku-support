// Public assets only. Never opens configured training URLs or authenticates.
import {publishedRuntime} from './published-runtime.mjs';
const expected=process.argv[2];if(!/^[a-f0-9]{7}$/.test(expected||''))throw Error('Expected short commit required');
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
async function read(path){const r=await fetch(new URL(path,base),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(path+': '+r.status);return r;}
const stamp=Date.now(),version=await(await read('version.json?verify='+stamp)).json(),manifest=await(await read('asset-manifest.json?verify='+stamp)).json();
if(!version.version.startsWith(expected+'.')||version.version!==manifest.version)throw Error('Old or mixed release');
const runtime=await publishedRuntime(manifest,read);
for(const marker of ['交通費計算の小窓','交通費計算を閉じる','traffic-cost-compact','受講確認フォームを開き直す','受講確認フォームは未登録です。','noopener,noreferrer'])if(!runtime.includes(marker))throw Error('Missing '+marker);
if(runtime.includes('受講確認フォームへのリンク'))throw Error('Old fixed confirmation form still included');
const manual=await(await read('manuals/d-support/index.html?verify='+stamp)).text();
for(const marker of ['各動画の「完了」を押すと','固定ボタンはなく'])if(!manual.includes(marker))throw Error('Manual not updated '+marker);
console.log(JSON.stringify({passed:true,version:version.version,companionWindowPublished:true,completionOpensFormPublished:true,fixedButtonRemoved:true,readsPrivateData:false,writesDatabase:false,physicalDeviceVerified:false}));
