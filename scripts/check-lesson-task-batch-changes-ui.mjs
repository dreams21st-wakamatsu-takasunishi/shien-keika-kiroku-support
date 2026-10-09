import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];
const url=new URL(args.includes('--url')?args[args.indexOf('--url')+1]:'http://localhost:3014/tests/fixtures/lesson-learning.html');
if(!args.includes('--cli')||!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/tests/fixtures/lesson-learning.html')throw Error('Local fixture URL and --cli are required');
mkdirSync('output/playwright',{recursive:true});
function command(...args){const result=spawnSync(process.execPath,[resolve(cli),'-s=lesson-task-batch-change-regression',...args],{encoding:'utf8',timeout:120000,maxBuffer:4194304});if(result.status!==0||result.stdout.includes('### Error'))throw Error(result.stdout+result.stderr);return result.stdout;}
async function check(page,url){
 const assert=(ok,label)=>{if(!ok)throw Error(label);};
 const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
 const links=['a','b'].map((key,i)=>({id:ids[i],child_id:`child-ui-${key}`,revision:1,source_campus_id:'main',source_display_name:'架空アカウント',source_student_id:`student_ui_${key}`,active:true,verified_at:'2026-10-09T00:00:00Z'}));
 const template={category:'mouse',stageId:'1',title:'元のM-1',instructions:'クリックを練習',startsOn:'2026-10-09',endsOn:'2026-10-12'};
 const items=links.map((link,i)=>({childId:link.child_id,linkId:link.id,revision:1,campusId:'main',group:i?'B':'A',available:true,taskId:ids[i+2],status:'saved',errorCode:'',savedAt:'2026-10-09T00:00:00Z'}));
 const base={operationId:ids[0],createdAt:'2026-10-09T00:00:00Z',template,items};
 const tasks=new Map(items.map(row=>[row.childId,{...template,id:row.taskId,revision:1,active:true,updatedAt:base.createdAt}])),managed=new Map(items.map(row=>[row.childId,1]));
 const catalog=[{category:'mouse',stageId:'1',title:'M-1'},{category:'keyboard',stageId:'4301',title:'あ〜さのことば'}];
 const operations=new Map([[base.operationId,base]]),calls=[],errors=[];let wrongResponse=true,stopFailure=true,manage=true,delay=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.context().route('https://*.supabase.co/**',route=>route.abort());
 await page.context().route('**/functions/v1/lesson-learning',route=>route.fulfill({json:{links,canManageLinks:manage,configured:true}}));
 await page.context().route('**/functions/v1/lesson-task-batches',async route=>{
  const body=route.request().postDataJSON();calls.push(body);let response;
  if(body.action==='configuration')response={schemaVersion:1,targets:items.map(({taskId,status,savedAt,...target})=>target),catalog,history:[...operations.values()].map(batch=>({operationId:batch.operationId,title:batch.template.title,createdAt:batch.createdAt,total:batch.items.length,saved:batch.items.filter(row=>row.status==='saved').length,...(batch.kind?{kind:batch.kind,parentId:batch.parentId}:{})}))};
  else if(body.action==='load')response={batch:operations.get(body.operationId)};
  else if(body.action==='change-targets'){
   if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
   response={schemaVersion:1,parentId:base.operationId,catalog,candidates:items.map(({status,savedAt,...target})=>{const task=tasks.get(target.childId);return {...target,task,reason:!task.active?'stopped':task.revision!==managed.get(target.childId)?'conflict':'ready'};})};
  }else if(body.action==='prepare-change'){
   if(!operations.has(body.operationId))operations.set(body.operationId,{operationId:body.operationId,kind:body.kind,parentId:body.parentId,template:body.kind==='stop'?template:body.template,createdAt:base.createdAt,items:body.targets.map(({task,reason,...target})=>({...target,before:task,status:'pending',errorCode:'',savedAt:null}))});
   response={batch:structuredClone(operations.get(body.operationId))};if(wrongResponse)response.batch.parentId=ids[1];
  }else if(body.action==='apply'){
   const batch=operations.get(body.operationId),item=batch.items.find(row=>row.childId===body.childId),current=tasks.get(item.childId);
   assert(body.kind===batch.kind,'explicit edit/stop kind');
   if(batch.kind==='stop'&&stopFailure)item.errorCode='connection';
   else if(current.revision!==item.before.revision)item.errorCode='conflict';
   else{
    const desired=batch.kind==='stop'?item.before:batch.template;
    tasks.set(item.childId,{...desired,id:item.taskId,revision:current.revision+1,active:batch.kind!=='stop',updatedAt:base.createdAt});managed.set(item.childId,current.revision+1);
    item.status='saved';item.savedAt=base.createdAt;item.errorCode='';
   }
   response={batch};
  }else throw Error('Unexpected fixture action '+body.action);
  await route.fulfill({json:response});
 });
 const openHistory=async id=>{await page.getByRole('combobox',{name:'過去の一括指定'}).selectOption(id);await page.getByRole('button',{name:'履歴を開く',exact:true}).click();await page.getByRole('region',{name:'一括指定の確認と結果'}).waitFor();};
 const openManager=async()=>{await page.getByRole('tab',{name:'課題の指定',exact:true}).click();await page.getByRole('button',{name:'まとめて指定',exact:true}).click();};
 await page.goto(url);await openManager();await openHistory(base.operationId);
 await page.getByRole('button',{name:'一括編集',exact:true}).click();await page.getByRole('form',{name:'一括編集の対象と内容'}).waitFor();
 await page.getByRole('button',{name:'変更可能な児童を選択',exact:true}).click();
 await page.getByRole('combobox',{name:'変更後の分野'}).selectOption('keyboard');await page.getByRole('combobox',{name:'変更後のステージ'}).selectOption('4301');
 await page.getByRole('textbox',{name:'変更後の課題名'}).fill('変更後・ことば入力');await page.getByRole('textbox',{name:'変更後の内容'}).fill('覚えた文字でことばを入力');
 await page.getByLabel('変更後の開始日',{exact:true}).fill('2026-10-10');await page.getByLabel('変更後の終了日',{exact:true}).fill('2026-10-15');
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'edit mobile overflow');await page.screenshot({path:'output/playwright/task-batch-edit-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'変更内容を確認',exact:true}).click();await page.getByText('変更内容が一致しません。履歴を再取得してください。',{exact:true}).waitFor();
 assert(calls.filter(row=>row.action==='apply').length===0,'mismatched preview cannot execute');wrongResponse=false;
 await page.getByRole('button',{name:'変更内容を確認',exact:true}).click();await page.getByRole('button',{name:'変更を実行',exact:true}).waitFor();
 assert(calls.filter(row=>row.action==='prepare-change').map(row=>row.operationId).every(id=>id===calls.find(row=>row.action==='prepare-change').operationId),'prepare retry preserves operation ID');
 assert(await page.getByRole('button',{name:'変更を実行',exact:true}).isDisabled(),'edit explicit confirmation required');
 assert(await page.getByText(/^変更前：元のM-1/).count()===2,'all prior fields in preview');
 tasks.set(items[1].childId,{...tasks.get(items[1].childId),revision:2,title:'個別編集済み'});
 await page.getByRole('checkbox',{name:'一括指定の内容確認'}).check();await page.getByRole('button',{name:'変更を実行',exact:true}).click();await page.getByText('処理済み 1/2名',{exact:true}).waitFor();
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'output/playwright/task-batch-edit-partial-desktop.png',fullPage:true});
 const edit=[...operations.values()].find(batch=>batch.kind==='edit');
 await page.reload();await openManager();await openHistory(edit.operationId);await page.getByRole('checkbox',{name:'一括指定の内容確認'}).check();await page.getByRole('button',{name:'未完了の変更を再確認',exact:true}).click();
 await page.getByRole('button',{name:'未完了の変更を再確認',exact:true}).waitFor();assert(calls.filter(row=>row.action==='apply'&&row.kind==='edit'&&row.childId===items[0].childId).length===1,'saved edit not replayed');
 await page.getByRole('button',{name:'元の一括指定を開く',exact:true}).click();await page.getByRole('button',{name:'一括停止',exact:true}).click();await page.getByRole('form',{name:'一括停止の対象選択'}).waitFor();
 assert(await page.getByRole('checkbox',{name:'変更対象：架空児童 ひなた',exact:true}).isDisabled(),'individually edited child excluded');
 await page.getByRole('button',{name:'変更可能な児童を選択',exact:true}).click();await page.getByRole('button',{name:'停止内容を確認',exact:true}).click();await page.getByRole('button',{name:'停止を実行',exact:true}).waitFor();
 assert(await page.getByText(/^停止対象：変更後・ことば入力/).count()===1,'stop keeps latest task content');
 await page.getByRole('checkbox',{name:'一括指定の内容確認'}).check();await page.getByRole('button',{name:'停止を実行',exact:true}).click();await page.getByRole('button',{name:'未完了の停止を再確認',exact:true}).waitFor();
 stopFailure=false;await page.getByRole('checkbox',{name:'一括指定の内容確認'}).check();await page.getByRole('button',{name:'未完了の停止を再確認',exact:true}).click();await page.getByText('処理済み 1/1名',{exact:true}).waitFor();
 assert(tasks.get(items[0].childId).active===false&&tasks.get(items[0].childId).title==='変更後・ことば入力','stop affects activity only');assert(tasks.get(items[1].childId).title==='個別編集済み'&&tasks.get(items[1].childId).active===true,'excluded task untouched');
 const stopCalls=calls.filter(row=>row.action==='apply'&&row.kind==='stop');assert(stopCalls.length===2&&stopCalls[0].operationId===stopCalls[1].operationId,'stop retry same operation');
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'stop mobile overflow');await page.screenshot({path:'output/playwright/task-batch-stop-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'元の一括指定を開く',exact:true}).click();await page.getByRole('button',{name:'一括編集',exact:true}).click();await page.getByRole('form',{name:'一括編集の対象と内容'}).waitFor();
 assert(await page.getByRole('checkbox',{name:'変更対象：架空児童 あおい',exact:true}).isDisabled(),'stopped child not reactivated');assert(await page.getByRole('button',{name:'変更内容を確認',exact:true}).isDisabled(),'no eligible tasks');
 delay=700;await page.getByRole('button',{name:'現在の課題を再取得',exact:true}).click();manage=false;await page.getByRole('button',{name:'試験用：職員切替'}).click();await page.waitForTimeout(1000);
 assert(await page.getByRole('region',{name:'一括課題の変更・停止'}).count()===0,'stale change candidate response removed after scope change');
 assert(!errors.length,errors.join(','));
 return {passed:true,cases:['current-task lookup','explicit target selection','full before/after preview','wrong-parent response rejection','same-ID prepare retry','partial edit conflict','reload edit history','saved child skipped','stop eligible subset','preserve individually edited task','stop same-ID retry','no reactivation','scope switch','desktop/mobile layout']};
}
try{command('open','about:blank');const output=command('run-code',`async(page)=>(${check.toString()})(page,${JSON.stringify(url.href)})`);const result=output.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!result||!JSON.parse(result[1]).passed)throw Error(output);console.log(result[1]);}finally{command('close');}
