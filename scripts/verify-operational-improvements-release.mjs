// Read public static assets only; no login, record access, or QR issuance.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const expected=process.argv[2];
if(!/^[a-f0-9]{7}$/.test(expected||''))throw Error('Expected short commit is required');
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
async function read(path){
 const response=await fetch(new URL(path,base),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error(`Public resource failed: ${response.status} ${path}`);
 return response;
}
const version=await(await read(`version.json?verify=${Date.now()}`)).json();
if(!version.version.startsWith(`${expected}.`))throw Error(`Different release: ${version.version}`);
const manifest=await(await read(`asset-manifest.json?verify=${Date.now()}`)).json();
if(manifest.version!==version.version)throw Error('Mixed release');
const html=await(await read(`?verify=${Date.now()}`)).text();
const entry=html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
if(!entry)throw Error('Entry module not found');
const js=await(await read(entry)).text();
for(const marker of ['この児童を再取得','確認時刻（端末時計）','実績を全件選択','実績の選択を解除','全件選択は']){
 if(!js.includes(marker))throw Error(`Improvement absent: ${marker}`);
}
const pdfAsset=manifest.assets.find(path=>/^\.\/assets\/pdf-[A-Za-z0-9_-]+\.js$/.test(path));
if(!pdfAsset)throw Error('Deferred PDF engine asset absent');
const pdfFile=pdfAsset.split('/').pop();
if(!js.includes(`import("./${pdfFile}")`)&&!js.includes(`import('./${pdfFile}')`))throw Error('PDF engine is not dynamically loaded');
await(await read(pdfAsset)).arrayBuffer();
const paths=['index.html','Dサポート_図解操作マニュアル.pdf','images/lesson-auto.png','images/lesson-details.png','images/personal-qr-register.png','images/legal-training.png','images/activityPlans.png'];
for(const path of paths){
 const asset=`manuals/d-support/${path}`;
 const remote=Buffer.from(await(await read(`${asset}?verify=${Date.now()}`)).arrayBuffer());
 const local=readFileSync(fileURLToPath(new URL(`../public/${asset}`,import.meta.url)));
 const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
 if(hash(remote)!==hash(local))throw Error(`Manual differs: ${path}`);
}
console.log(JSON.stringify({version:version.version,childRetryIncluded:true,bulkSelectionIncluded:true,pdfRendererDeferred:true,manualAssetsMatched:paths.length,readsPrivateData:false}));
