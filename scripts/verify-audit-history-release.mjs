// Public asset checks only. No real Auth, record or audit-row requests.
const expected=process.argv[2];if(!/^[a-f0-9]{7}$/.test(expected||''))throw Error('Expected short commit');
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/',stamp=Date.now();
async function read(path){const response=await fetch(new URL(path,base),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(path+': '+response.status);return response;}
const version=await(await read('version.json?verify='+stamp)).json(),manifest=await(await read('asset-manifest.json?verify='+stamp)).json();
if(!version.version.startsWith(expected+'.')||manifest.version!==version.version)throw Error('Mixed or old version');
const html=await(await read('?verify='+stamp)).text(),entry=html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];if(!entry||!manifest.assets.includes(entry))throw Error('Missing entry');
const script=await(await read(entry)).text();for(const marker of ['監査履歴の読み込みを再試行','要求開始画面','エラー検知時の画面','このエラーをコピー','データベース処理の時間制限','直前の操作（上記とは別の要求を含みます）'])if(!script.includes(marker))throw Error('Missing feature '+marker);
console.log(JSON.stringify({passed:true,version:version.version,lazyAuditAndDiagnosticUI:true,readsPrivateData:false,writesDatabase:false,realAccountOperationsVerified:false}));
