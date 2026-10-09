import './verify-lesson-task-batches-release.mjs';
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
const read=async url=>{const response=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`Batch change asset failed: ${response.status}`);return response.text();};
const html=await read(base+'?verifyTaskBatchChanges='+Date.now()),entry=html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
if(!entry)throw Error('Public entry not found');const js=await read(new URL(entry,base));
for(const text of ['一括編集','一括停止','変更後のステージ','変更内容を確認','停止内容を確認','一括停止の対象選択','変更前','停止対象','個別に変更された課題（対象外）','prepare-change','元の一括指定を開く'])if(!js.includes(text))throw Error(`Published bulk edit/stop feature missing: ${text}`);
console.log('PASS: published current-task selection, edit/stop preview, before snapshots, conflict exclusion and typed operation history; no private data read');
