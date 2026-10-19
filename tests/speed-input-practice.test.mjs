import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('ten original speed-input questions retain validated prose, readings and settings',async()=>{
 await import('../scripts/check-speed-input-practice.mjs');
 const tasks=JSON.parse(read('docs/lesson-content/speed-input-mock-20261019.json'));
 assert.equal(tasks.length,10);
});
test('course import is an explicit, optimistic, additive single-campus transaction',()=>{
 const script=read('scripts/add-speed-input-practice.mjs');
 for(const marker of ['--rollback-test','--apply','pg_advisory_xact_lock','for update','before.fingerprint','before.revision','Existing tasks changed','Other content changed','Global settings changed','Other catalogs changed','alreadyPresent'])assert.ok(script.includes(marker),marker);
 assert.ok(!/\b(delete from|truncate|create table|update public\.user_data|update public\.profiles)\b/i.test(script));
});
