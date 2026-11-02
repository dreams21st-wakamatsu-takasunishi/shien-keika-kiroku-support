// Read-only published assets and anonymous denial; never opens actual records.
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const expected=process.argv[2];if(!/^[a-f\d]{7,40}$/.test(expected||''))throw Error('Commit required');
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
const get=async path=>{const r=await fetch(new URL(path,base),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Public asset unavailable: '+r.status);return r;};
const version=await(await get('version.json?parent-morning='+Date.now())).json();if(!version.version.startsWith(expected))throw Error('Published commit mismatch');
const manifest=await(await get('asset-manifest.json')).json(),jsFiles=manifest.assets.filter(x=>/\.js$/.test(x));
const scripts=await Promise.all(jsFiles.map(async file=>(await get(file)).text())),all=scripts.join('\n');
for(const marker of ['保護者への共有文','save_parent_share_draft','save_morning_meeting_section','朝礼の仕上がりプレビュー','同じ項目が更新されました','送信済みにはしていません'])if(!all.includes(marker))throw Error('Missing published feature: '+marker);
const hash=bytes=>createHash('sha256').update(Buffer.from(bytes)).digest('hex');
for(const file of ['index.html','troubleshooting.html','images/parent-share.png','images/morning.png','Dサポート_図解操作マニュアル.pdf','Dサポート_トラブル対応ガイド.pdf']){
 const bytes=await(await get('manuals/d-support/'+file)).arrayBuffer();if(hash(bytes)!==hash(readFileSync('public/manuals/d-support/'+file)))throw Error('Published manual mismatch: '+file);
}
const env=readFileSync('.env.local','utf8'),anon=env.match(/^VITE_SUPABASE_ANON_KEY\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g,'');if(!anon)throw Error('Public key unavailable');
for(const name of ['load_parent_share_draft','load_morning_meeting_sections']){const r=await fetch('https://cyqrxhknpboidvetdfgn.supabase.co/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify(name.includes('parent')?{p_record_id:'unavailable-probe'}:{p_date:'1900-01-01'})});if(![401,403].includes(r.status))throw Error('Anonymous access not denied: '+name);}
console.log(JSON.stringify({passed:true,version:version.version,parentShareAndMorningPublished:true,manualImagesAndPDFsMatch:true,anonymousAccessDenied:true,realRecordsRead:0,realRecordsWritten:0}));
