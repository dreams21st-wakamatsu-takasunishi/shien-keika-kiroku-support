// Public assets only. Never signs in, reads records, or runs a merge.
const expected=process.argv[2];
if(!/^[a-f0-9]{7}$/.test(expected||''))throw Error('Expected short commit required');
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
async function read(path){const result=await fetch(new URL(path,base),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});if(!result.ok)throw Error(path+': '+result.status);return result;}
const stamp=Date.now(),version=await(await read('version.json?verify='+stamp)).json(),manifest=await(await read('asset-manifest.json?verify='+stamp)).json();
if(!version.version.startsWith(expected+'.')||manifest.version!==version.version)throw Error('Mixed or old release');
const html=await(await read('?verify='+stamp)).text(),entry=html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
if(!entry||!manifest.assets.includes(entry))throw Error('Missing entry');
const script=await(await read(entry)).text();
for(const marker of ['この画面に児童を追加','自分の記録をまとめる','入力画面をひとつにまとめる','内容を保持してまとめる','merge_own_record_drafts','この端末に共有保存前の入力があります'])if(!script.includes(marker))throw Error('Missing marker '+marker);
const manual=await(await read('manuals/d-support/index.html?verify='+stamp)).text();
for(const marker of ['この画面に児童を追加','内容を保持してまとめる','未同期の入力','images/record-entry.png'])if(!manual.includes(marker))throw Error('Missing guide update '+marker);
const assets=manifest.assets.filter(path=>/\.(js|css|mjs)$/.test(path));
await Promise.all(assets.map(async path=>{if(!/^\.\/assets\/[A-Za-z0-9_.-]+$/.test(path))throw Error('Unexpected asset');await(await read(path)).arrayBuffer();}));
console.log(JSON.stringify({passed:true,version:version.version,runtimeAssetsResponding:assets.length,recordEntryPublished:true,manualUpdated:true,readsPrivateData:false,writesDatabase:false,realStaffOperationVerified:false}));
