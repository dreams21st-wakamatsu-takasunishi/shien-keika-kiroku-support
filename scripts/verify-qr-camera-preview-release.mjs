// Public app assets only: never login, issue a QR, or read/write staff data.
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
if (!entry) throw Error('Entry module not found');
const js = await (await read(entry)).text();
for (const marker of ['映像の左右反転', '鏡の表示（左右反転中）', '通常の表示',
  'QR読み取り用のカメラ映像', 'd-support:qr-preview-mirror:v1', 'scaleX(-1)',
  '表示の向きだけが変わります。']) {
  if (!js.includes(marker)) throw Error(`QR preview feature absent: ${marker}`);
}
let assets = 0;
for (const path of manifest.assets.filter(path => /\.(js|css|mjs)$/.test(path))) {
  if (!/^\.\/assets\/[A-Za-z0-9_.-]+$/.test(path)) throw Error('Unexpected asset path');
  await (await read(path)).arrayBuffer(); assets++;
}
console.log(JSON.stringify({version:version.version,qrPreviewMirrorIncluded:true,
  displayPreferenceIncluded:true,runtimeAssetsResponding:assets,readsPrivateData:false,
  writesDatabase:false,realCameraVerified:false}));
