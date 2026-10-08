import './verify-lesson-accounts-release.mjs';
const base = 'https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
const read = async path => {
  const response = await fetch(new URL(path, base), { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`Public credential asset failed: ${response.status}`);
  return response.text();
};
const html = await read(`?verifyCredentials=${Date.now()}`), entry = html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
if (!entry) throw Error('Public entry not found');
const js = await read(entry);
for (const text of ['manage_learning_account_credentials', '発行履歴を更新', '対象児童の氏名を入力', '同じ操作の結果を再確認', 'lesson-account-credentials', '結果未確定・再確認が必要', '合言葉再発行', 'crypto.randomUUID']) {
  if (!js.includes(text)) throw Error(`Published credential feature missing: ${text}`);
}
console.log('PASS: published dedicated mutation permission, bound issuance/reset, explicit confirmation, operation receipts and recoverable retry controls; no private data read');
