// Public assets only; never reads or modifies support or morning records.
import {publishedRuntime} from './published-runtime.mjs';
const expected=process.argv[2];
if(!/^[a-f0-9]{7}$/.test(expected||''))throw Error('Expected short commit required');
const base=new URL('https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/');
async function read(path){
 const url=new URL(path,base);
 if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))throw Error('Outside app');
 const response=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error(`${path}: ${response.status}`);
 return response;
}
const stamp=Date.now();
const version=await(await read(`version.json?verify=${stamp}`)).json();
const manifest=await(await read(`asset-manifest.json?verify=${stamp}`)).json();
if(!version.version.startsWith(expected+'.')||version.version!==manifest.version)throw Error('Old/mixed release');
const runtime=await publishedRuntime(manifest,read);
for(const marker of ['前回の支援の振り返り','支援記録のある児童のみ表示します。内容は要点の抜粋です。','この日の支援記録はありません。','該当する児童はいません。']){
 if(!runtime.includes(marker))throw Error(`Recap marker missing: ${marker}`);
}
console.log(JSON.stringify({passed:true,version:version.version,recapDisplayIncluded:true,readsPrivateData:false,writesDatabase:false}));
