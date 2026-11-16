// Public assets only: never uses staff accounts or production records.
import assert from 'node:assert/strict';
import { publishedRuntime } from './published-runtime.mjs';

const expected=process.argv[2];
assert.match(expected||'',/^[a-f0-9]{7}$/,'Expected short commit');
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
const stamp=Date.now();
async function read(path) {
  const result=await fetch(new URL(path,base),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
  if(!result.ok)throw Error(`Asset request failed: ${path} (${result.status})`);
  return result;
}
const version=await(await read('version.json?verify='+stamp)).json();
const manifest=await(await read('asset-manifest.json?verify='+stamp)).json();
assert.ok(version.version.startsWith(expected+'.'),'Unexpected public build: '+version.version);
assert.equal(manifest.version,version.version,'Mixed release');
const html=await(await read('?verify='+stamp)).text();
const entry=html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
assert.ok(entry&&manifest.assets.includes(entry),'Missing public entry');
const js=await publishedRuntime(manifest,read);
for(const marker of [
  '記録作成済み','入力中に記録が保存されました','保存済み記録を再編集','already-created',
  '足が揃っている','学校から宿題は出ていますか？','取り組みはどうでしたか？','すべて終わった',
  '宿題以外の勉強は取り組んでいますか？','学習中の集中はどうでしたか？',
  '【パソコンの取り組み（Dレッスン）】','ブラインドでは',
]) assert.ok(js.includes(marker),'Missing feature: '+marker);
const css=manifest.assets.filter(path=>/^\.\/assets\/[A-Za-z0-9_.-]+\.css$/.test(path));
assert.ok(css.length,'Missing public styles');
const styles=(await Promise.all(css.map(async path=>(await read(path)).text()))).join('\n');
assert.match(styles,/school-homework-enter/,'Homework animation missing');
console.log(JSON.stringify({version:version.version,recordWorkflowPublished:true,productionRecordsRead:false,productionRecordsWritten:false}));
