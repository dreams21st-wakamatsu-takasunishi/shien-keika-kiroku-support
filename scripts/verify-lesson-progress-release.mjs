import './verify-lesson-auto-release.mjs';
const base = 'https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
const read = async path => {
  const response = await fetch(new URL(path, base), { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`Public progress resource failed: ${response.status}`);
  return response.text();
};
const html = await read(`?verifyProgress=${Date.now()}`);
const entry = html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
if (!entry) throw Error('Public entry not found');
const js = await read(entry);
for (const text of ['児童別進捗', '分野別の進捗', '進捗を再取得', 'Auth連携IDの保存', 'ログイン可否', '直近の取り組み']) {
  if (!js.includes(text)) throw Error(`Public progress UI absent: ${text}`);
}
console.log('PASS: published progress UI and previous lesson features included; no private data read');
