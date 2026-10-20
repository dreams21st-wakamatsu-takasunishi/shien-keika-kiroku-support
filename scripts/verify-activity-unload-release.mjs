// Public bundles only: never authenticates or reads/writes activity records.
import { publishedRuntime } from './published-runtime.mjs';
const expected=process.argv[2];if(!/^[a-f0-9]{7}$/.test(expected||''))throw Error('Expected short commit required');
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
async function read(path){const response=await fetch(new URL(path,base),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(path+': '+response.status);return response;}
const stamp=Date.now(),version=await(await read('version.json?verify='+stamp)).json(),manifest=await(await read('asset-manifest.json?verify='+stamp)).json();
if(!version.version.startsWith(expected+'.')||manifest.version!==version.version)throw Error('Old or mixed release');
const html=await(await read('?verify='+stamp)).text(),entry=html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
if(!entry||!manifest.assets.includes(entry))throw Error('Entry/manifest mismatch');
const runtime=await publishedRuntime(manifest,read);
for(const marker of ['未保存のままタブ・ブラウザを閉じる','ブラウザ標準の確認が表示されます。','d-support-activity-draft-v1:','beforeunload'])if(!runtime.includes(marker))throw Error('Missing marker '+marker);
console.log(JSON.stringify({passed:true,version:version.version,activityUnloadWarningPublished:true,privateDataRead:false,databaseWrites:false,physicalDeviceVerified:false}));
