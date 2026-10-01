import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';

// Run against a local Vite server with a Playwright CLI entry point, never production.
const args=process.argv.slice(2);
const cli=args[args.indexOf('--cli')+1];
const url=new URL(args.includes('--url')?args[args.indexOf('--url')+1]:'http://localhost:3014/tests/fixtures/lesson-learning.html');
if(!args.includes('--cli')||!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/tests/fixtures/lesson-learning.html')throw Error('Local fixture URL and --cli entry point are required');
mkdirSync('output/playwright',{recursive:true});
const session='lesson-task-regression';
function command(...args){
 const result=spawnSync(process.execPath,[resolve(cli),`-s=${session}`,...args],{encoding:'utf8',timeout:120000,maxBuffer:4194304});
 if(result.status!==0||result.stdout.includes('### Error'))throw Error(result.stdout+result.stderr);
 return result.stdout;
}
async function check(page,url){
 const assert=(ok,label)=>{if(!ok)throw Error(label);};
 const fixture=new URL(url);
 const tasks=new Map();
 let manage=true,configured=true,listFails=false,taskFails=false,listDelay=500,taskDelay=0;
 const calls=[];
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.context().route('https://*.supabase.co/**',route=>route.abort());
 await page.context().route('**/functions/v1/lesson-learning',async route=>{
  const body=route.request().postDataJSON();calls.push(body);
  let response,status=200;
  if(body.action==='list'){
   const allowed=manage;
   if(listDelay)await new Promise(resolve=>setTimeout(resolve,listDelay));
   if(listFails){status=503;response={error:'試験用：連携一覧の取得失敗'};}
   else response={canManageLinks:allowed,configured,links:['a','b'].map((key,index)=>({
    id:`11111111-1111-4111-8111-11111111111${index}`,child_id:`child-ui-${key}`,revision:1,
    source_display_name:`架空アカウント ${key}`,source_student_id:`student_ui_${key}`,
    source_campus_id:'main',verified_at:'2026-10-01T00:00:00Z',active:true,
   }))};
  }else if(body.action==='tasks-list'){
   const rows=[...(tasks.get(body.childId)||[])];
   if(taskDelay)await new Promise(resolve=>setTimeout(resolve,taskDelay));
   if(taskFails){status=503;response={error:'試験用：課題の取得失敗'};}
   else response={schemaVersion:1,tasks:rows};
  }else if(body.action==='tasks-save'){
   assert(manage,'readonly save');
   const saved={...body.task,revision:body.task.revision+1,updatedAt:'2026-10-01T00:00:00Z'};
   tasks.set(body.childId,[saved,...(tasks.get(body.childId)||[]).filter(t=>t.id!==saved.id)]);
   response={schemaVersion:1,task:saved};
  }else throw Error(`Unexpected fixture action ${body.action}`);
  await route.fulfill({status,json:response});
 });
 await page.goto(fixture.href);
 await page.getByRole('tab',{name:'課題の指定',exact:true}).click();
 const child=page.getByRole('combobox',{name:'課題の対象児童'});
 await child.selectOption('child-ui-a');
 const form=page.getByRole('form',{name:'新しい課題'});
 await form.waitFor();
 assert(calls.some(c=>c.action==='tasks-list'&&c.childId==='child-ui-a'),'select during link load');
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'mobile overflow');
 await page.screenshot({path:'output/playwright/task-full-manager-mobile.png',fullPage:true});
 await page.getByRole('combobox',{name:'課題の分野'}).selectOption('keyboard');
 await page.getByRole('textbox',{name:'課題名',exact:true}).fill('架空課題 あ〜さのことば');
 await page.getByRole('textbox',{name:'取り組む内容'}).fill('覚えた文字でことばを入力する');
 await page.getByLabel('課題の開始日',{exact:true}).fill('2026-10-01');
 await page.getByLabel('課題の終了日',{exact:true}).fill('2026-10-07');
 await page.getByRole('button',{name:'保存',exact:true}).click();
 await page.getByText('課題を保存しました。',{exact:true}).waitFor();
 let saved=tasks.get('child-ui-a')[0];
 assert(saved.category==='keyboard'&&saved.startsOn==='2026-10-01'&&saved.endsOn==='2026-10-07','create fields');
 await page.getByRole('button',{name:'編集',exact:true}).click();
 await page.getByRole('form',{name:'課題の編集'}).waitFor();
 await page.getByLabel('課題の終了日',{exact:true}).fill('2026-10-10');
 await page.getByRole('button',{name:'保存',exact:true}).click();
 await page.getByRole('button',{name:'編集',exact:true}).waitFor();
 assert(tasks.get('child-ui-a')[0].endsOn==='2026-10-10'&&tasks.get('child-ui-a')[0].revision===2,'edit');
 await page.evaluate(()=>{window.confirm=()=>true;});
 await page.getByRole('button',{name:'停止',exact:true}).click();
 await page.getByText('課題を停止しました。',{exact:true}).waitFor();
 assert(tasks.get('child-ui-a')[0].active===false,'stop');
 await page.setViewportSize({width:1280,height:900});
 await page.screenshot({path:'output/playwright/task-full-manager-desktop.png',fullPage:true});
 // A response for the previous child must not replace the newly selected child's form.
 taskDelay=500;
 await child.selectOption('child-ui-b');
 await child.selectOption('child-ui-a');
 await page.getByText('架空課題 あ〜さのことば',{exact:true}).waitFor();
 assert(await page.getByRole('form').count()===0,'stale empty-child form');
 taskDelay=0;
 await child.selectOption('child-ui-unlinked');
 await page.getByText('この児童の学習アカウントは未連携です。',{exact:true}).waitFor();
 assert(await page.getByRole('button',{name:'アカウント連携',exact:true}).count()===1,'unlinked action');
 // A scope change invalidates an in-flight admin response; it must not retain edit access.
 await page.getByRole('button',{name:'更新',exact:true}).click();
 manage=false;
 await page.getByRole('button',{name:'試験用：職員切替'}).click();
 await child.selectOption('child-ui-a');
 await page.getByText(/^閲覧のみ：/).waitFor();
 assert(await page.getByRole('button',{name:'課題を追加',exact:true}).count()===0,'readonly add hidden');
 assert(await page.getByRole('button',{name:'編集',exact:true}).count()===0,'readonly edit hidden');
 assert(await page.getByRole('form').count()===0,'readonly form hidden');
 listDelay=0;listFails=true;manage=true;
 await page.reload();
 await page.getByRole('tab',{name:'課題の指定',exact:true}).click();
 await child.selectOption('child-ui-b');
 await page.getByText('連携情報の取得に失敗しました。',{exact:true}).waitFor();
 listFails=false;
 await page.getByRole('button',{name:'再取得',exact:true}).click();
 await form.waitFor();
 configured=false;
 await page.getByRole('button',{name:'更新',exact:true}).first().click();
 await page.getByText('学習連携のサーバー設定が未完了です。',{exact:true}).first().waitFor();
 assert(await page.getByRole('form').count()===0,'unconfigured form hidden');
 configured=true;taskFails=true;
 await page.getByRole('button',{name:'更新',exact:true}).first().click();
 await page.getByText('試験用：課題の取得失敗',{exact:true}).waitFor();
 assert(await page.getByRole('form').count()===0,'task error cannot show editable form');
 taskFails=false;
 await page.getByRole('button',{name:'更新',exact:true}).last().click();
 await form.waitFor();
 assert(errors.length===0,`page errors ${errors.join(',')}`);
 return {passed:true,cases:['child selection during loading','create category/content/dates','edit','stop','mobile layout','child switch','scope switch','read-only role','unlinked','list retry','unconfigured','task retry'],savedCalls:calls.filter(c=>c.action==='tasks-save').length};
}
try{
 command('open','about:blank');
 const output=command('run-code',`async (page) => { return await (${check.toString()})(page,${JSON.stringify(url.href)}); }`);
 const result=output.match(/### Result\s+([\s\S]*?)\s+### Ran/);
 if(!result||JSON.parse(result[1]).passed!==true)throw Error(`UI regression did not complete: ${output}`);
 console.log(result[1]);
}finally{command('close');}
