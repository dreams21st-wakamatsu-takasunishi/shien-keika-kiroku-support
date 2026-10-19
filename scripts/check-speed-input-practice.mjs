import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {speedInputMockTasks} from '../docs/lesson-content/speed-input-mock-20261019.mjs';
const tasks=JSON.parse(readFileSync(new URL('../docs/lesson-content/speed-input-mock-20261019.json',import.meta.url),'utf8'));
const strip=text=>text.replace(/\{([^{}|]+)\|[^{}]+\}/g,'$1');
assert.equal(tasks.length,10);assert.equal(new Set(tasks.map(t=>t.id)).size,10);assert.equal(new Set(tasks.map(t=>t.title)).size,10);
let ruby=0;const paragraphs=new Set();
for(let i=0;i<tasks.length;i++){
 const task=tasks[i],source=speedInputMockTasks[i],plain=strip(task.content);
 assert.equal(task.id,source.id);assert.equal(task.title,source.title);assert.match(task.title,/模擬問題/);assert.ok(!task.title.includes('過去問'));
 assert.equal(task.time,10);assert.equal(task.star,5);assert.equal(task.hidden,false);assert.equal(task.targetGroup,'');
 assert.ok(plain.length>=2500&&plain.length<=2800,`${task.id}: ${plain.length}`);assert.ok(task.content.length<=20000);
 assert.equal(plain,'　'+source.paragraphs.join('\n　'));
 assert.ok(!/[{}|<>]/.test(plain));assert.ok(!/https?:|\bNaN\b|undefined|\uFFFD|[0-9]/.test(plain));
 assert.equal(source.paragraphs.length,10);assert.equal(plain.split('\n').length,10);
 for(const paragraph of source.paragraphs){assert.ok(!paragraphs.has(paragraph),'Repeated paragraph');paragraphs.add(paragraph);}
 const annotations=[...task.content.matchAll(/\{([^{}|]+)\|([ぁ-ゖー]+)\}/g)];
 assert.ok(annotations.length>100);ruby+=annotations.length;
 assert.equal(task.content.replace(/\{([^{}|]+)\|([ぁ-ゖー]+)\}/g,'$1'),plain,'No malformed ruby');
 assert.ok(!/[一-龯々]/.test(task.content.replace(/\{[^{}]+\}/g,'')),'Every kanji token has a reading');
}
assert.equal(new Set(tasks.map(t=>createHash('sha256').update(t.content).digest('hex'))).size,10);
const all=tasks.map(t=>t.content).join('\n');
for(const annotation of ['{一人|ひとり}','{一冊|いっさつ}','{一組|ひとくみ}','{一か所|いっかしょ}','{手当たり次第|てあたりしだい}','{立ち止まれる|たちどまれる}','{重なり|かさなり}','{札|ふだ}','{角|かど}','{預ける|あずける}','{剥がせ|はがせ}'])assert.ok(all.includes(annotation),'Reviewed context reading: '+annotation);
const characters=tasks.map(t=>strip(t.content).length);
console.log(JSON.stringify({passed:true,tasks:10,characters:{min:Math.min(...characters),max:Math.max(...characters)},paragraphs:paragraphs.size,rubyAnnotations:ruby,sha256:createHash('sha256').update(JSON.stringify(tasks)).digest('hex')}));
