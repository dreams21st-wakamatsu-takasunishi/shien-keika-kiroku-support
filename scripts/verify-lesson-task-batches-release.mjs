import './verify-lesson-task-stages-release.mjs';
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
const read=async url=>{const response=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`Batch asset failed: ${response.status}`);return response.text();};
const html=await read(base+'?verifyTaskBatches='+Date.now()),entry=html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
if(!entry)throw Error('Public entry not found');const js=await read(new URL(entry,base));
for(const text of ['lesson-task-batches','まとめて指定','一括指定のグループ','指定内容を確認','一括指定の内容確認','未完了の児童を再確認','過去の一括指定','処理を止める'])if(!js.includes(text))throw Error(`Published batch feature missing: ${text}`);
console.log('PASS: published bulk selection, complete preview, confirmation, per-child results, own history/resume and stop controls; no private data read');
