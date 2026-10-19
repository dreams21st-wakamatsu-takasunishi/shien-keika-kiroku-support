import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {speedInputMockTasks} from '../docs/lesson-content/speed-input-mock-20261019.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--tokenizer')+1];
if(!args.includes('--tokenizer')||!root)throw Error('Use --tokenizer <isolated kuromoji package path>');
const require=createRequire(import.meta.url),kuromoji=require(resolve(root));
const tokenizer=await new Promise((done,reject)=>kuromoji.builder({dicPath:resolve(root,'dict')}).build((error,value)=>error?reject(error):done(value)));
const hiragana=text=>text.replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
// Only reviewed dictionary corrections belong here. Do not guess unknown readings.
const corrections={'品番':'ひんばん','開封':'かいふう','撮影':'さつえい','来館':'らいかん','受け付ける':'うけつける',
 '札':'ふだ','角':'かど','他':'ほか','側が':'がわが','通っ':'とおっ','剥がせ':'はがせ','預ける':'あずける','既存':'きぞん'};
const phrases={'一人':'ひとり','一冊':'いっさつ','一組':'ひとくみ','一か所':'いっかしょ','一枚':'いちまい','一日中':'いちにちじゅう',
 '何人':'なんにん','何重':'なんじゅう','手当たり次第':'てあたりしだい','立ち止まれる':'たちどまれる','重なり':'かさなり',
 '組み立て':'くみたて','作業後':'さぎょうご','変更後':'へんこうご','その間':'そのあいだ'};
const phrasePattern=new RegExp(Object.keys(phrases).sort((a,b)=>b.length-a.length).join('|'),'g');
const unknown=new Set(),readings=new Map();
function annotateSegment(segment){return tokenizer.tokenize(segment).map(token=>{
 const surface=token.surface_form;if(!/[一-龯々]/.test(surface))return surface;
 let reading=corrections[surface]||(token.reading&&token.reading!=='*'?hiragana(token.reading):'');
 if(surface==='後')reading='あと';
 if(surface==='間')reading=segment.slice(token.word_position-1+surface.length).startsWith('を置')?'ま':'あいだ';
 if(!reading||!/^[ぁ-ゖー]+$/.test(reading)){unknown.add(surface);return surface;}
 readings.set(surface,reading);return `{${surface}|${reading}}`;
}).join('');}
const tasks=speedInputMockTasks.map(task=>{
 const plain='　'+task.paragraphs.join('\n　');
 let content='',cursor=0;
 for(const match of plain.matchAll(phrasePattern)){
  content+=annotateSegment(plain.slice(cursor,match.index))+`{${match[0]}|${phrases[match[0]]}}`;
  readings.set(match[0],phrases[match[0]]);cursor=match.index+match[0].length;
 }
 content+=annotateSegment(plain.slice(cursor));
 if(content.replace(/\{([^{}|]+)\|[^{}]+\}/g,'$1')!==plain)throw Error('Tokenizer changed the original prose');
 return {id:task.id,title:task.title,time:10,star:5,hidden:false,targetGroup:'',content};
});
if(unknown.size)throw Error('Unreviewed readings: '+[...unknown].join(', '));
const output=resolve('docs/lesson-content/speed-input-mock-20261019.json');
writeFileSync(output,JSON.stringify(tasks,null,2)+'\n');
writeFileSync(resolve('output/speed-input-reading-review.json'),JSON.stringify([...readings].sort((a,b)=>a[0].localeCompare(b[0],'ja')),null,2)+'\n');
console.log(JSON.stringify({tasks:tasks.length,output,readings:readings.size,unknown:unknown.size,characters:tasks.map(task=>({id:task.id,plain:task.content.replace(/\{([^{}|]+)\|[^{}]+\}/g,'$1').length,stored:task.content.length}))}));
