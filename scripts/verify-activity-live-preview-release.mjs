// Public assets only. Does not authenticate or read/write stored plans.
import { publishedRuntime } from './published-runtime.mjs';
const expected = process.argv[2];
if (!/^[a-f0-9]{7}$/.test(expected || '')) throw Error('Expected short commit required');
const base = 'https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
async function read(path) {
  const response = await fetch(new URL(path, base), {headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw Error(path + ': ' + response.status);
  return response;
}
const stamp = Date.now();
const version = await (await read('version.json?verify=' + stamp)).json();
const manifest = await (await read('asset-manifest.json?verify=' + stamp)).json();
if (!version.version.startsWith(expected + '.') || manifest.version !== version.version) throw Error('Old or mixed release');
const html = await (await read('?verify=' + stamp)).text();
const entry = html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
if (!entry || !manifest.assets.includes(entry)) throw Error('Entry/manifest mismatch');
const runtime = await publishedRuntime(manifest, read);
for (const marker of ['仕上がりプレビュー', '入力を即時反映', 'data-activity-preview', 'data-preview-step', 'activity-auto-textarea', 'activity-preview-scroll', 'beforeunload']) {
  if (!runtime.includes(marker)) throw Error('Missing runtime marker ' + marker);
}
const css = (await Promise.all(manifest.assets.filter(path => path.endsWith('.css')).map(async path => (await read(path)).text()))).join('\n');
for (const marker of ['.activity-edit-layout.has-preview', '.activity-preview-scroll', '[data-active]', '.activity-auto-textarea']) {
  if (!css.includes(marker)) throw Error('Missing style marker ' + marker);
}
console.log(JSON.stringify({passed:true,version:version.version,livePreviewAssetsPublished:true,privateDataRead:false,databaseWrites:false,physicalDeviceVerified:false}));
