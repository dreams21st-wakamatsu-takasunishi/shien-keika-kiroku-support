// Public app assets only: no login, QR issuance, or staff/device data access.
const expected = process.argv[2];
if (!/^[a-f0-9]{7}$/.test(expected || '')) throw Error('Expected short commit is required');
const base = 'https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
const stamp = Date.now();
async function read(path) {
  const response = await fetch(new URL(path, base), {headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
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
for (const marker of ['get_personal_staff_qr_device','request_personal_staff_qr_device',
  'この端末を自分の個人端末として登録申請','個人端末の承認待ちです','承認状況を再確認',
  '私は','本人で、この端末は自分用の個人端末です。','STAFF_QR_DEVICE_OTHER_OWNER',
  'STAFF_QR_DEVICE_SHARED','STAFF_QR_DEVICE_REVOKED','issue_personal_staff_qr','revoke_personal_staff_qr']) {
  if (!js.includes(marker)) throw Error(`Feature absent: ${marker}`);
}
let assets = 0;
for (const path of manifest.assets.filter(path => /\.(js|css|mjs)$/.test(path))) {
  if (!/^\.\/assets\/[A-Za-z0-9_.-]+$/.test(path)) throw Error('Unexpected asset path');
  await (await read(path)).arrayBuffer(); assets++;
}
console.log(JSON.stringify({version:version.version,personalDeviceEnrollmentIncluded:true,approvalRecheckIncluded:true,deviceOwnershipGuardsIncluded:true,runtimeAssetsResponding:assets,readsPrivateData:false}));
