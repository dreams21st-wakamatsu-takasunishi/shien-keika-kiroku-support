// Public code only: no login, child data, or draft mutations.
import { publishedRuntime } from './published-runtime.mjs';
const expected = process.argv[2];
if (!/^[a-f0-9]{7}$/.test(expected || '')) throw Error('Expected short commit required');
const base = 'https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
async function read(path) {
  const response = await fetch(new URL(path, base), { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(path + ': ' + response.status);
  return response;
}
const stamp = Date.now();
const version = await (await read('version.json?verify=' + stamp)).json();
const manifest = await (await read('asset-manifest.json?verify=' + stamp)).json();
if (!version.version.startsWith(expected + '.') || manifest.version !== version.version) throw Error('Old or mixed release');
const html = await (await read('?verify=' + stamp)).text();
const entry = html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
if (!entry || !manifest.assets.includes(entry)) throw Error('Entry does not match manifest');
const runtime = await publishedRuntime(manifest, read);
for (const marker of ['別端末の最新入力を確認', '__cloudSync', 'unknown-baseline', '共有下書きが見つかりません', '同じ下書きが別端末で更新されています', '入力中の記録を削除（保存済み記録は削除されません）', 'この画面で']) {
  if (!runtime.includes(marker)) throw Error('Missing marker ' + marker);
}
console.log(JSON.stringify({ passed: true, version: version.version, draftSyncPublished: true, tabletUiPublished: true, privateDataRead: false, databaseWrites: false, physicalDeviceVerified: false }));
