import './verify-lesson-progress-release.mjs';
const base = 'https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
const read = async path => {
  const response = await fetch(new URL(path, base), { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`Public account resource failed: ${response.status}`);
  return response.text();
};
const html = await read(`?verifyAccounts=${Date.now()}`), entry = html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
if (!entry) throw Error('Public entry not found');
const js = await read(entry);
for (const text of ['manage_learning_accounts', 'アカウント設定を確認', '合言葉を確認してカード表示', '確認済みログインカード', 'カードを閉じて合言葉を消去', '氏名を印刷しない', 'lesson-accounts', 'visibilitychange']) {
  if (!js.includes(text)) throw Error(`Public account feature missing: ${text}`);
}
if (!js.includes('https://dreams21st-wakamatsu-takasunishi.github.io') || !js.includes('/d-lesson-v4/')) throw Error('Card destination guard missing');
console.log('PASS: published dedicated permission, account diagnosis, verified in-app card and secret deletion controls; no private data read');
