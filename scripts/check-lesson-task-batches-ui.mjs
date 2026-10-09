import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];
const url=new URL(args.includes('--url')?args[args.indexOf('--url')+1]:'http://localhost:3014/tests/fixtures/lesson-learning.html');
if(!args.includes('--cli')||!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/tests/fixtures/lesson-learning.html')throw Error('Local fixture URL and --cli are required');
mkdirSync('output/playwright',{recursive:true});
function command(...args){const result=spawnSync(process.execPath,[resolve(cli),'-s=lesson-task-batch-regression',...args],{encoding:'utf8',timeout:120000,maxBuffer:4194304});if(result.status!==0||result.stdout.includes('### Error'))throw Error(result.stdout+result.stderr);return result.stdout;}
async function check(page,url){
 const assert=(ok,label)=>{if(!ok)throw Error(label);};
 const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 const links=['a','b'].map((key,i)=>({id:i?other:id,child_id:`child-ui-${key}`,revision:1,source_campus_id:'main',source_display_name:'架空アカウント',source_student_id:`student_ui_${key}`,active:true,verified_at:'2026-10-01T00:00:00Z'}));
 const targets=links.map((link,i)=>({childId:link.child_id,linkId:link.id,revision:1,campusId:'main',group:i?'B':'A',available:true}));
 const catalog=[{category:'mouse',stageId:'1',title:'M-1'},{category:'keyboard',stageId:'4301',title:'あ〜さのことば'}];
 const operations=new Map(),calls=[],errors=[];let failSecond=true,manage=true,delay=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.context().route('https://*.supabase.co/**',route=>route.abort());
 await page.context().route('**/functions/v1/lesson-learning',route=>route.fulfill({json:{links,canManageLinks:manage,configured:true}}));
 await page.context().route('**/functions/v1/lesson-task-batches',async route=>{
  const body=route.request().postDataJSON();calls.push(body);let response;
  if(body.action==='configuration')response={schemaVersion:1,targets,catalog,history:[...operations.values()].map(batch=>({operationId:batch.operationId,title:batch.template.title,createdAt:batch.createdAt,total:batch.items.length,saved:batch.items.filter(row=>row.status==='saved').length}))};
  else if(body.action==='prepare'){
   const items=body.targets.map((row,i)=>({...row,taskId:i?other:id,status:'pending',errorCode:'',savedAt:null}));
   const batch={operationId:body.operationId,template:body.template,createdAt:'2026-10-09T00:00:00Z',items};operations.set(body.operationId,batch);response={batch};
  }else if(body.action==='load')response={batch:operations.get(body.operationId)};
  else if(body.action==='apply'){
   if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
   const batch=operations.get(body.operationId),item=batch.items.find(row=>row.childId===body.childId);
   if(failSecond&&item.childId==='child-ui-b')item.errorCode='connection';else{item.status='saved';item.savedAt=batch.createdAt;item.errorCode='';}
   response={batch};
  }else throw Error('Unexpected action');
  await route.fulfill({json:response});
 });
 await page.goto(url);await page.getByRole('tab',{name:'課題の指定',exact:true}).click();
 const bulk=page.getByRole('button',{name:'まとめて指定',exact:true});await bulk.click();
 const group=page.getByRole('combobox',{name:'一括指定のグループ'});await group.waitFor();
 await group.selectOption('g:A');await page.getByRole('button',{name:'表示中を選択',exact:true}).click();
 await group.selectOption('g:B');await page.getByRole('checkbox',{name:'対象：架空児童 ひなた',exact:true}).check();
 await page.getByText('選択 2名 / 表示 1名',{exact:true}).waitFor();
 await page.getByRole('combobox',{name:'一括課題の分野'}).selectOption('keyboard');
 await page.getByRole('combobox',{name:'一括課題のステージ'}).selectOption('4301');
 await page.getByRole('textbox',{name:'一括課題名',exact:true}).fill('架空・グループ課題');
 await page.getByRole('textbox',{name:'一括課題の内容'}).fill('覚えた文字でことばを入力');
 await page.getByLabel('一括課題の開始日',{exact:true}).fill('2026-10-09');await page.getByLabel('一括課題の終了日',{exact:true}).fill('2026-10-12');
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile draft overflow');
 await page.screenshot({path:'output/playwright/task-batch-draft-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'指定内容を確認',exact:true}).click();
 await page.getByRole('region',{name:'一括指定の確認と結果'}).waitFor();
 assert(calls.filter(row=>row.action==='apply').length===0,'no source writes before confirmation');
 assert(await page.getByText('架空児童 あおい',{exact:true}).count()===1,'filtered-out selected child is in preview');
 assert(await page.getByText('架空児童 ひなた',{exact:true}).count()===1,'second selected child is in preview');
 const submit=page.getByRole('button',{name:'まとめて指定',exact:true}).last();assert(await submit.isDisabled(),'confirmation required');
 await page.getByRole('checkbox',{name:'一括指定の内容確認'}).check();await submit.click();
 await page.getByText('作成済み 1/2名',{exact:true}).waitFor();await page.getByRole('button',{name:'未完了の児童を再確認',exact:true}).waitFor();
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'output/playwright/task-batch-partial-desktop.png',fullPage:true});
 const operation=[...operations.values()][0];
 // Resume a persisted partial operation after a complete page reload.
 await page.reload();await page.getByRole('tab',{name:'課題の指定',exact:true}).click();await page.getByRole('button',{name:'まとめて指定',exact:true}).click();
 await page.getByRole('combobox',{name:'過去の一括指定'}).selectOption(operation.operationId);await page.getByRole('button',{name:'履歴を開く',exact:true}).click();
 await page.getByText('作成済み 1/2名',{exact:true}).waitFor();failSecond=false;
 await page.getByRole('checkbox',{name:'一括指定の内容確認'}).check();await page.getByRole('button',{name:'未完了の児童を再確認',exact:true}).click();
 await page.getByText('作成済み 2/2名',{exact:true}).waitFor();
 assert(calls.filter(row=>row.action==='apply'&&row.childId==='child-ui-a').length===1,'saved child must be skipped on resume');
 assert(calls.filter(row=>row.action==='apply').every(row=>row.operationId===operation.operationId),'resume same operation');
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile results overflow');await page.screenshot({path:'output/playwright/task-batch-result-mobile.png',fullPage:true});
 // In-flight source requests may finish, but leaving the staff scope prevents the next child request.
 operation.items.forEach(row=>{row.status='pending';row.savedAt=null;});
 await page.getByRole('button',{name:'別の課題を指定',exact:true}).click();await page.getByRole('combobox',{name:'過去の一括指定'}).selectOption(operation.operationId);await page.getByRole('button',{name:'履歴を開く',exact:true}).click();
 await page.getByRole('checkbox',{name:'一括指定の内容確認'}).check();delay=700;
 const prior=calls.filter(row=>row.action==='apply').length;await page.getByRole('button',{name:'まとめて指定',exact:true}).last().click();
 await page.getByRole('button',{name:'処理を止める',exact:true}).waitFor();manage=false;
 await page.getByRole('button',{name:'試験用：職員切替'}).click();
 await page.waitForTimeout(1000);
 assert(calls.filter(row=>row.action==='apply').length===prior+1,'scope switch cancels subsequent child writes');
 assert(await page.getByRole('region',{name:'一括指定の確認と結果'}).count()===0,'old preview removed');
 assert(await page.getByRole('button',{name:'まとめて指定',exact:true}).isDisabled(),'readonly bulk disabled');
 assert(!errors.length,errors.join(','));
 return {passed:true,cases:['campus/group filters','selection retained outside filter','all selected children in preview','explicit confirmation','partial result','persisted resume','saved child skipped','same operation','scope cancellation','desktop/mobile no overflow']};
}
try{command('open','about:blank');const output=command('run-code',`async(page)=>(${check.toString()})(page,${JSON.stringify(url.href)})`);const result=output.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!result||!JSON.parse(result[1]).passed)throw Error(output);console.log(result[1]);}finally{command('close');}
