// Public build verification only. No Auth, private data, or database writes.
const expected = process.argv[2];
if (!/^[a-f0-9]{7}$/.test(expected || '')) throw Error('Expected short commit is required');
const base = 'https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
async function read(path) {
  const response = await fetch(new URL(path, base), { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`Public resource failed: ${response.status} ${path}`);
  return response;
}
const stamp = Date.now(), version = await (await read(`version.json?verify=${stamp}`)).json();
if (!version.version.startsWith(`${expected}.`)) throw Error(`Different release: ${version.version}`);
const manifest = await (await read(`asset-manifest.json?verify=${stamp}`)).json();
if (manifest.version !== version.version) throw Error('Mixed release');
const html = await (await read(`?verify=${stamp}`)).text();
const entry = html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
if (!entry || !manifest.assets.includes(entry)) throw Error('Entry not in release manifest');
let assets = 0;
const sources = await Promise.all(manifest.assets.filter(path => /\.(js|css|mjs)$/.test(path)).map(async path => {
  if (!/^\.\/assets\/[A-Za-z0-9_.-]+$/.test(path)) throw Error('Unexpected asset path');
  const source = await (await read(path)).text(); assets++;
  return /\.(js|mjs)$/.test(path) ? source : '';
}));
const source = sources.join('\n');
for (const marker of ['Word申請の通知を確認できていません。', '失敗理由を確認', 'Word通知の警告を一時的に閉じる',
  'このアカウント・端末の学習管理権限を確認してください。', 'ログインの有効期限を確認し、再ログインしてください。',
  'Word申請の取得形式を確認できません。学習連携の公開状況を管理者に確認してください。']) {
  if (!source.includes(marker)) throw Error(`Missing notice fix: ${marker}`);
}
if (source.includes('Word申請の通知を取得できませんでした。')) throw Error('Old opaque notice remains');
console.log(JSON.stringify({ version: version.version, actionableWordNotice: true, oldOpaqueNoticeAbsent: true,
  runtimeAssetsResponding: assets, readsPrivateData: false, writesDatabase: false, realDeviceIssueConfirmedResolved: false }));
