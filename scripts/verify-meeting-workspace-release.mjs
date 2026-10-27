// Public release assets only. No login, private data, DB writes, or Tiro requests.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const expected = process.argv[2];
if (!/^[a-f0-9]{7}$/.test(expected || '')) throw Error('Expected short commit is required');
const base = 'https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
const stamp = Date.now();
async function read(path) {
  const response = await fetch(new URL(path, base), {
    headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw Error(`Public resource failed: ${response.status} ${path}`);
  return response;
}
const version = await (await read(`version.json?verify=${stamp}`)).json();
if (!version.version.startsWith(`${expected}.`)) throw Error(`Different release: ${version.version}`);
const manifest = await (await read(`asset-manifest.json?verify=${stamp}`)).json();
if (manifest.version !== version.version) throw Error('Mixed release');
const html = await (await read(`?verify=${stamp}`)).text();
const entry = html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
if (!entry || !manifest.assets.includes(entry)) throw Error('Entry module not found in release');
// Workspace modules are lazy-loaded. Inspect the exact manifest's chunks, not
// only the entry bundle, and verify all runtime assets belong to this release.
let assets = 0;
const runtime = await Promise.all(manifest.assets.filter(path => /\.(js|css|mjs)$/.test(path)).map(async path => {
  if (!/^\.\/assets\/[A-Za-z0-9_.-]+$/.test(path)) throw Error('Unexpected asset path');
  const source = await (await read(path)).text(); assets++;
  return /\.(js|mjs)$/.test(path) ? source : '';
}));
const js = runtime.join('\n');
for (const marker of ['事前情報とTiroへの手動受け渡し・会議中の確認','Tiroへ渡す情報','渡す文章を確認','文章をコピー','事前シートを保存','会議終了にする','閲覧・編集する職員の設定','自動保存：有効','最終保存：','まだ保存が完了していません。この画面を閉じずに通信状態を確認してください。']) {
  if (!js.includes(marker)) throw Error(`Meeting feature absent: ${marker}`);
}
for (const marker of ['Tiroの文字起こしを取り込む', '修正版を新しい版として保存',
  '会議結果から下書きを作る', '会議結果を確認済みにする',
  '会議由来の支援経過記録', '以前の文字起こし版を見る']) {
  if (js.includes(marker)) throw Error(`Retired meeting UI remains: ${marker}`);
}
const manual = await (await read(`manuals/d-support/index.html?verify=${stamp}`)).text();
const section = manual.match(/<section[^>]+id="meeting"[\s\S]*?<\/section>/)?.[0];
if (!section || !section.includes('準備・Tiroへ渡す') || !section.includes('会議中の確認・メモ') || !section.includes('既存の会議・記録・履歴は保持')) throw Error('Meeting manual not updated');
const screenshot = Buffer.from(await (await read(`manuals/d-support/images/meetings.png?verify=${stamp}`)).arrayBuffer());
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
if (hash(screenshot) !== hash(readFileSync(new URL('../public/manuals/d-support/images/meetings.png', import.meta.url)))) {
  throw Error('Published meeting screenshot differs from verified screenshot');
}
console.log(JSON.stringify({ version: version.version, mergedPreparationIncluded: true,
  calmAutosaveIncluded: true,
  retiredMeetingUIAbsent: true, manualUpdated: true, screenshotMatches: true,
  runtimeAssetsResponding: assets, readsPrivateData: false, writesDatabase: false,
  realAccountOperationsVerified: false }));
