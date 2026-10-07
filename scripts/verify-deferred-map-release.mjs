// Only public release assets are read. Never authenticate or access records.
const expected=process.argv[2];
if(!/^[a-f0-9]{7}$/.test(expected||''))throw Error('Expected short commit is required');
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
async function read(path){
 const url=new URL(path,base);
 if(url.origin!==new URL(base).origin||!url.pathname.startsWith(new URL(base).pathname))throw Error('Asset outside release');
 const response=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error(`Public resource failed: ${response.status} ${path}`);
 return response;
}
const stamp=Date.now();
const version=await(await read(`version.json?verify=${stamp}`)).json();
if(!version.version.startsWith(`${expected}.`))throw Error(`Different release: ${version.version}`);
const manifest=await(await read(`asset-manifest.json?verify=${stamp}`)).json();
if(manifest.version!==version.version)throw Error('Mixed release');
const html=await(await read(`?verify=${stamp}`)).text();
const entry=html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
if(!entry)throw Error('Entry module absent');
const js=await(await read(entry)).text();
const modules=['DailyTransportMiniMap','TransportMapPanel'];
for(const name of modules){
 const asset=manifest.assets.find(path=>new RegExp(`^\\./assets/${name}-[A-Za-z0-9_-]+\\.js$`).test(path));
 if(!asset)throw Error(`${name} module absent`);
 const file=asset.split('/').pop();
 if(!js.includes(`import("./${file}")`))throw Error(`${name} not dynamically loaded`);
 if(js.includes(`from"./${file}"`)||js.includes(`from'./${file}'`))throw Error(`${name} statically imported`);
 await(await read(asset)).arrayBuffer();
}
const mapCss=manifest.assets.find(path=>/^\.\/assets\/TransportMapPanel-[A-Za-z0-9_-]+\.css$/.test(path));
if(!mapCss||html.includes(mapCss))throw Error('Map CSS must be deferred');
await(await read(mapCss)).arrayBuffer();
for(const marker of ['他の入力はそのまま続けられます','の読み込みを再試行','自動で画面更新は行いません']){
 if(!js.includes(marker))throw Error(`Safe loading marker absent: ${marker}`);
}
console.log(JSON.stringify({version:version.version,deferredMapModules:modules,deferredMapCss:true,safeLoadingUiIncluded:true,readsPrivateData:false}));
