// Public static assets only. No private data access or database writes.
import {publishedRuntime} from './published-runtime.mjs';
const expected=process.argv[2];if(!/^[a-f0-9]{7}$/.test(expected||''))throw Error('Expected short commit required');
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/',stamp=Date.now();
async function read(path){const url=new URL(path,base);if(url.origin!==new URL(base).origin||!url.pathname.startsWith(new URL(base).pathname))throw Error('Outside app');const response=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(path+': '+response.status);return response;}
const version=await(await read('version.json?verify='+stamp)).json(),manifest=await(await read('asset-manifest.json?verify='+stamp)).json();
if(!version.version.startsWith(expected+'.')||version.version!==manifest.version)throw Error('Old/mixed release');
const html=await(await read('?verify='+stamp)).text(),entry=html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];if(!entry||!manifest.assets.includes(entry))throw Error('Entry absent');
const runtime=await publishedRuntime(manifest,read);
const markers=['change_workspace_item_lifecycle','list_workspace_trash','withdraw_own_workspace_request','削除（復元可能）','削除済みデータ','取り下げ履歴（最新100件）','この日の朝礼記録は削除済みです。','d-support:workspace-lifecycle'];
for(const marker of markers)if(!runtime.includes(marker))throw Error('Lifecycle feature missing '+marker);
console.log(JSON.stringify({passed:true,version:version.version,featureMarkers:markers.length,readsPrivateData:false,writesDatabase:false,realAccountActionsTested:false}));
