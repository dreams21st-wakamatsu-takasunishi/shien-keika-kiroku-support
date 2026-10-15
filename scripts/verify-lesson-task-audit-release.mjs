import './verify-lesson-task-batch-changes-release.mjs';
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
const read=async url=>{const response=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`Audit asset failed: ${response.status}`);return response.text();};
const html=await read(base+'?verifyTaskAudit='+Date.now()),entry=html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
if(!entry)throw Error('Public entry not found');const js=await read(new URL(entry,base));
for(const text of ['事業所の一括課題履歴','一括課題履歴（閲覧専用）','履歴の担当職員','未完了あり','全員処理済み','前の20件','次の20件','一括課題履歴の詳細','lesson-task-audit'])if(!js.includes(text))throw Error(`Published admin task audit missing: ${text}`);
console.log('PASS: published read-only admin task history, staff/kind/state filters, pagination and per-child receipts; no private data read');
