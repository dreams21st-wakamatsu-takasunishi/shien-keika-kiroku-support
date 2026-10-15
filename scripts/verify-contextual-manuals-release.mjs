// Public assets only. No real Auth, private data, database or training URL access.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const expected=process.argv[2];
if(!/^[a-f0-9]{7}$/.test(expected||''))throw Error('Expected short commit required');
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/',stamp=Date.now();
async function read(path){const response=await fetch(new URL(path,base),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(path+': '+response.status);return response;}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const version=await(await read('version.json?verify='+stamp)).json();
if(!version.version.startsWith(expected+'.'))throw Error('Different release '+version.version);
const manifest=await(await read('asset-manifest.json?verify='+stamp)).json();if(manifest.version!==version.version)throw Error('Mixed release');
const index=await(await read('?verify='+stamp)).text(),entry=index.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
if(!entry||!manifest.assets.includes(entry))throw Error('Entry not in manifest');
const script=await(await read(entry)).text();
for(const marker of ['この画面のマニュアル','操作マニュアル：','困ったとき：','関連手順','manuals/d-support/index.html#','manuals/d-support/troubleshooting.html#'])if(!script.includes(marker))throw Error('Missing contextual help '+marker);
const images=new Set(),manuals=[];
for(const [file,source,pdf] of [['index.html','sections.json','Dサポート_図解操作マニュアル.pdf'],['troubleshooting.html','troubleshooting.json','Dサポート_トラブル対応ガイド.pdf']]){
 const html=await(await read('manuals/d-support/'+file+'?verify='+stamp)).text(),sections=JSON.parse(readFileSync(new URL('../docs/manuals/'+source,import.meta.url),'utf8'));
 if(hash(html)!==hash(readFileSync(new URL('../public/manuals/d-support/'+file,import.meta.url))))throw Error('Guide HTML differs '+file);
 for(const section of sections){if(!html.includes('id="'+section.id+'"'))throw Error('Chapter missing '+section.id);images.add(section.image+'.png');}
 const bytes=Buffer.from(await(await read('manuals/d-support/'+pdf+'?verify='+stamp)).arrayBuffer());
 if(bytes.subarray(0,5).toString()!=='%PDF-'||hash(bytes)!==hash(readFileSync(new URL('../public/manuals/d-support/'+pdf,import.meta.url))))throw Error('PDF differs '+pdf);
 manuals.push({file,chapters:sections.length,pdfMatches:true});
}
await Promise.all([...images].map(async file=>{const bytes=Buffer.from(await(await read('manuals/d-support/images/'+file)).arrayBuffer());if(hash(bytes)!==hash(readFileSync(new URL('../public/manuals/d-support/images/'+file,import.meta.url))))throw Error('Image differs '+file);}));
for(const file of ['manual.css','manual.js']){const bytes=Buffer.from(await(await read('manuals/d-support/'+file)).arrayBuffer());if(hash(bytes)!==hash(readFileSync(new URL('../public/manuals/d-support/'+file,import.meta.url))))throw Error('Guide asset differs '+file);}
const assets=manifest.assets.filter(path=>/\.(js|css|mjs)$/.test(path));await Promise.all(assets.map(async path=>{if(!/^\.\/assets\/[A-Za-z0-9_.-]+$/.test(path))throw Error('Unexpected asset path');await(await read(path)).arrayBuffer();}));
console.log(JSON.stringify({version:version.version,contextualLinksPublished:true,manuals,matchingImages:images.size,runtimeAssetsResponding:assets.length,readsPrivateData:false,writesDatabase:false,realAccountOperationsVerified:false}));
