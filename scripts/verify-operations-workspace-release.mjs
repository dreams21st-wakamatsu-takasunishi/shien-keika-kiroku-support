// Public static assets only. No authentication, private records or production writes.
const expected=process.argv[2];
if(!/^[a-f0-9]{7}$/.test(expected||''))throw Error('Expected short commit is required');
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
async function read(path){
  const url=new URL(path,base);
  if(url.origin!==new URL(base).origin||!url.pathname.startsWith(new URL(base).pathname))throw Error('Asset outside release');
  const response=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`Public asset failed: ${response.status} ${path}`);
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
for(const marker of ['送迎を組む児童','同便児童を追加','キャンセルして閉じる','小窓の収納先','勤務・児童・送迎の一日ガント','配車アラート','要対応','要確認','同じ時間帯に担当職員が重複しています','同じ時間帯に車両が重複しています','送迎時間','在所時間','送迎：下校〜事業所到着','在所：事業所到着〜送り開始','時刻の前後を確認']){
  if(!js.includes(marker))throw Error(`Workspace feature absent: ${marker}`);
}
const cssPath=html.match(/<link[^>]+href="(\.\/assets\/index-[^"?#]+\.css)"/)?.[1];
if(!cssPath)throw Error('Entry CSS absent');
const css=await(await read(cssPath)).text();
for(const selector of ['.bg-red-100','.bg-yellow-100','.transport-editor-panel','.operations-overview','.bg-sky-200','.bg-teal-200']){
  if(!css.includes(selector))throw Error(`Workspace styling absent: ${selector}`);
}
let runtimeAssets=0;
for(const path of manifest.assets.filter(path=>/\.(js|css)$/.test(path))){await(await read(path)).arrayBuffer();runtimeAssets++;}
console.log(JSON.stringify({version:version.version,workspaceIncluded:true,anchoredPickerIncluded:true,headerCancelIncluded:true,dayChildAdditionIncluded:true,criticalRedAndCautionYellowIncluded:true,childTransportAndPresenceIntervalsIncluded:true,runtimeAssets,readsPrivateData:false}));
