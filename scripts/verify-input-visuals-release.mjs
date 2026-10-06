// Public assets only. No login or access to staff, child or training data.
const expected=process.argv[2];
if(!/^[a-f0-9]{7}$/.test(expected||''))throw Error('Expected short commit is required');
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
const stamp=Date.now();
async function read(path){
 const response=await fetch(new URL(path,base),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error(`Public resource failed: ${response.status} ${path}`);
 return response;
}
const version=await (await read(`version.json?verify=${stamp}`)).json();
if(!version.version.startsWith(`${expected}.`))throw Error(`Different release: ${version.version}`);
const manifest=await (await read(`asset-manifest.json?verify=${stamp}`)).json();
if(manifest.version!==version.version)throw Error('Mixed release');
const html=await (await read(`?verify=${stamp}`)).text();
const entry=html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
if(!entry)throw Error('Entry module not found');
const js=await (await read(entry)).text();
for(const marker of ['作成する案を選ぶ','指導案の作成手順','activity-step-','activity-panel-',
 'ねらいと内容','実施条件・担当','前の手順','次へ：','全体をプレビューで確認','保存した案を']){
 if(!js.includes(marker))throw Error(`Workflow absent: ${marker}`);
}
const cssPaths=manifest.assets.filter(path=>path.endsWith('.css'));
const css=(await Promise.all(cssPaths.map(async path=>(await read(path)).text()))).join('\n');
for(const marker of ['#edf5ff','#6484a3','#52657a','data-input-appearance','forced-colors:none']){
 if(!css.includes(marker))throw Error(`Input styling absent: ${marker}`);
}
let assets=0;
for(const path of manifest.assets.filter(path=>/\.(js|css|mjs)$/.test(path))){
 if(!/^\.\/assets\/[A-Za-z0-9_.-]+$/.test(path))throw Error('Unexpected asset path');
 await (await read(path)).arrayBuffer();assets++;
}
console.log(JSON.stringify({version:version.version,inputFieldColorsIncluded:true,activityWorkflowIncluded:true,runtimeAssetsResponding:assets,readsPrivateData:false}));
