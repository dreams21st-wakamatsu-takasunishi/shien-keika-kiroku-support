// Check public release artifacts only; no real staff login, logout or record writes.
const expected=process.argv[2];if(!/^[a-f0-9]{7}$/.test(expected||''))throw Error('Expected short commit');
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
async function read(path){const response=await fetch(new URL(path,base),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(path+': '+response.status);return response;}
const stamp=Date.now(),version=await(await read('version.json?verify='+stamp)).json(),manifest=await(await read('asset-manifest.json?verify='+stamp)).json();
if(!version.version.startsWith(expected+'.')||manifest.version!==version.version)throw Error('Old or mixed release');
const index=await(await read('?verify='+stamp)).text(),entry=index.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];if(!entry||!manifest.assets.includes(entry))throw Error('Missing entry');
const script=await(await read(entry)).text();
for(const marker of ['ログイン中の職員・ユーザー切り替え','ユーザーの切り替え','切り替えてログイン画面へ','今のユーザーで続ける','ユーザーは切り替えていません。'])if(!script.includes(marker))throw Error('Missing feature '+marker);
const guide=await(await read('manuals/d-support/index.html?verify='+stamp)).text();if(!guide.includes('id="user-switch"'))throw Error('Missing manual');
const assets=manifest.assets.filter(path=>/\.(js|css|mjs)$/.test(path));await Promise.all(assets.map(async path=>{if(!/^\.\/assets\/[A-Za-z0-9_.-]+$/.test(path))throw Error('Invalid asset');await(await read(path)).arrayBuffer();}));
console.log(JSON.stringify({passed:true,version:version.version,userSwitchPublished:true,manualUpdated:true,runtimeAssetsResponding:assets.length,realStaffLoginsPerformed:false,writesDatabase:false}));
