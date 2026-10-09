import './verify-lesson-registration-release.mjs';
const base = 'https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
const read = async path => { const response = await fetch(new URL(path, base), { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) }); if (!response.ok) throw Error(`Published recovery asset failed: ${response.status}`); return response.text(); };
const html = await read(`?verifyRecovery=${Date.now()}`), entry = html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
if (!entry) throw Error('Public entry not found');
const js = await read(entry);
for (const text of ['この登録を引き継ぐ', '同じ引き継ぎを再確認', '登録の引き継ぎ理由', 'permission-change', 'handoffRevision', 'canTakeOver', '同じ学習IDの登録を再開']) if (!js.includes(text)) throw Error(`Published recovery feature missing: ${text}`);
console.log('PASS: published admin handoff, reason/confirmation, same-request retry and unchanged-operation resume controls; no private data read');
