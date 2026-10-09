// Public static release only. No credentials or private records are read or written.
const expected=process.argv[2];
if(!/^[a-f0-9]{7}$/.test(expected||''))throw Error('Expected short commit required');
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
const stamp=Date.now();
async function read(path) {const response=await fetch(new URL(path,base),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`Resource failed ${response.status}: ${path}`);return response;}
const version=await(await read('version.json?verify='+stamp)).json();
if(!version.version.startsWith(expected+'.'))throw Error('Unexpected release '+version.version);
const manifest=await(await read('asset-manifest.json?verify='+stamp)).json();
if(manifest.version!==version.version)throw Error('Mixed release');
const html=await(await read('?verify='+stamp)).text();
const entry=html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
if(!entry||!manifest.assets.includes(entry))throw Error('Missing entry');
const js=await(await read(entry)).text();
for(const marker of ['d-support:diagnostics:v1','エラー・操作履歴','履歴を書き出す','deleted_id_replaced','same_content_confirmed','save_result_rechecked','保存状態が繰り返し変化しているため停止しました。','編集中の保存済み記録は削除されています。'])if(!js.includes(marker))throw Error('Feature missing: '+marker);
if(js.includes('保存直前に別端末で記録が保存されました。入力内容は残しています。もう一度保存を押し、最新の記録と比較してください。'))throw Error('Old misleading save failure remains');
let assets=0;
await Promise.all(manifest.assets.filter(path=>/\.(js|css|mjs)$/.test(path)).map(async path=>{if(!/^\.\/assets\/[A-Za-z0-9_.-]+$/.test(path))throw Error('Unexpected asset path');await(await read(path)).arrayBuffer();assets++;}));
console.log(JSON.stringify({version:version.version,saveRecoveryIncluded:true,deviceDiagnosticsIncluded:true,oldMisleadingErrorAbsent:true,runtimeAssetsResponding:assets,readsPrivateData:false,writesDatabase:false,realRecordSaveVerified:false}));
