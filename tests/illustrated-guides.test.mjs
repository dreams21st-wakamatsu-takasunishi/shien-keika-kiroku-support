import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const json=name=>JSON.parse(readFileSync(new URL('../docs/manuals/'+name,import.meta.url),'utf8'));
const operations=json('sections.json'),troubleshooting=json('troubleshooting.json');
for(const [file,sections] of [['index.html',operations],['troubleshooting.html',troubleshooting]]){
 test('guide source and generated images/anchors match: '+file,()=>{
  const html=readFileSync(new URL('../public/manuals/d-support/'+file,import.meta.url),'utf8');
  const ids=new Set();
  for(const section of sections){
   assert.match(section.id,/^[a-z0-9-]+$/);assert(!ids.has(section.id));ids.add(section.id);
   assert.equal(section.steps.length,3);assert.equal(section.flow.length,3);assert(section.route&&section.note);
   assert(html.includes('id="'+section.id+'"'));assert(html.includes('href="#'+section.id+'"'));
   assert(existsSync(new URL('../public/manuals/d-support/images/'+section.image+'.png',import.meta.url)));
  }
  assert(!/<iframe|<script[^>]+https?:|<img[^>]+https?:/i.test(html),'no remote images/scripts/embeds');
 });
}
test('current guidance preserves safety boundaries and recent fixes',()=>{
 const byId=Object.fromEntries(operations.map(s=>[s.id,s]));
 assert.match(byId.dispatch.steps.join(' '),/時刻マーカー/);assert.match(byId.dispatch.steps.join(' '),/配車を保存/);
 assert.match(byId.diagnostics.note,/200件・30日/);assert.match(byId['service-types'].note,/訪問予定・訪問記録・請求/);
 const problems=Object.fromEntries(troubleshooting.map(s=>[s.id,s]));
 assert.match(problems['save-cleanup'].steps.join(' '),/入力中一覧の更新を再試行/);
 assert.match(problems['protect-input'].note,/サイトデータ削除/);
 assert.match(problems['qr-reading'].note,/最大輝度にすればよいとは限りません/);
 assert.match(problems.forbidden.note,/セキュリティ制限の解除で回避しません/);
});
