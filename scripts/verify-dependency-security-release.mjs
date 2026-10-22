// Only public application bundles. Never authenticates or accesses records.
const expected = process.argv[2];
if (!/^[a-f0-9]{7}$/.test(expected || '')) throw Error('Expected short commit required');
const base = 'https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
async function read(path) {
  const r = await fetch(new URL(path, base), { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw Error(path + ': ' + r.status);
  return r;
}
const stamp = Date.now();
const version = await (await read('version.json?v=' + stamp)).json();
const manifest = await (await read('asset-manifest.json?v=' + stamp)).json();
if (!version.version.startsWith(expected + '.') || manifest.version !== version.version) throw Error('Old or mixed release');
const html = await (await read('?v=' + stamp)).text();
const entry = html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
if (!entry || !manifest.assets.includes(entry)) throw Error('Entry/manifest mismatch');
const purify = manifest.assets.filter(path => /\/purify\.es-[\w-]+\.js$/.test(path));
if (purify.length !== 1) throw Error('Sanitizer chunk missing or ambiguous');
const sanitizer = await (await read(purify[0])).text();
if (!sanitizer.includes('3.4.17')) throw Error('Patched sanitizer is not published');
console.log(JSON.stringify({ passed: true, version: version.version, dompurify: '3.4.17', privateDataRead: false, databaseWrites: false }));
