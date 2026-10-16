// Static public assets only. No record, draft, account or database mutation.
import {publishedRuntime} from './published-runtime.mjs';
const expected=process.argv[2];if(!/^[a-f0-9]{7}$/.test(expected||''))throw Error('Expected short commit required');
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/',stamp=Date.now();
async function read(path){const url=new URL(path,base);if(url.origin!==new URL(base).origin||!url.pathname.startsWith(new URL(base).pathname))throw Error('Outside app');const response=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(path+': '+response.status);return response;}
const version=await(await read('version.json?verify='+stamp)).json(),manifest=await(await read('asset-manifest.json?verify='+stamp)).json();
if(!version.version.startsWith(expected+'.')||version.version!==manifest.version)throw Error('Old/mixed release');
const html=await(await read('?verify='+stamp)).text(),entry=html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];if(!entry||!manifest.assets.includes(entry))throw Error('Entry absent');
const entryResponse=await read(entry),entryBytes=Buffer.from(await entryResponse.arrayBuffer()),script=entryBytes.toString(),runtime=await publishedRuntime(manifest,read);
for(const name of ['RecordForm','RecordList','RecordPreview','ChildrenManager','TeamManager','SettingsHub','ActivityPlanWorkspace','LessonLearningManager','LegalTrainingWorkspace']){
  const path=manifest.assets.find(path=>new RegExp(`^\\./assets/${name}-[A-Za-z0-9_-]+\\.js$`).test(path));
  if(!path||!script.includes(`import("./${path.split('/').pop()}")`))throw Error('Screen not deferred '+name);
}
for(const marker of ['処理時間の確認（このログイン中）','record.snapshot','record.draft.flush','selectedChildIds:payload->selectedChildIds','Workspace query plan mismatch','保存状態が繰り返し変化しているため停止しました。','入力中の下書きが別の操作で更新されています。'])if(!runtime.includes(marker))throw Error('Feature/protection missing '+marker);
console.log(JSON.stringify({passed:true,version:version.version,entryBytes:entryBytes.length,screenChunksVerified:9,scopedRefreshAndTimingsIncluded:true,readsPrivateData:false,writesDatabase:false,realDeviceLatencyVerified:false}));
