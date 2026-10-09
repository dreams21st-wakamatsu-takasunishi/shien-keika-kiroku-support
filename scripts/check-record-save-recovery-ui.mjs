import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];
if(!args.includes('--cli')||!cli)throw Error('--cli required');
const session='save-recovery-'+Date.now(),url='http://127.0.0.1:3014/tests/fixtures/record-save-recovery.html';
mkdirSync('output/playwright',{recursive:true});
function command(...args){const result=spawnSync(process.execPath,[resolve(cli),'-s='+session,...args],{encoding:'utf8',timeout:120000,maxBuffer:4194304});if(result.status!==0||result.stdout.includes('### Error'))throw Error(result.stdout+result.stderr);return result.stdout;}
async function check(page,url){
  let checks=0;const assert=(ok,label)=>{checks++;if(!ok)throw Error(label);};
  const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:3014')&&!r.url().startsWith('data:'))external.push(r.url());});
  await page.context().route('https://**',route=>route.abort());
  await page.addInitScript(()=>{localStorage.clear();window.confirm=()=>true;});
  const save=async()=>{const acknowledgment=page.getByRole('checkbox',{name:'点検結果を確認しました'});if(await acknowledgment.count())await acknowledgment.check();await page.getByRole('button',{name:/・1名分のみ保存$/}).click();};
  await page.goto(url);await page.getByRole('button',{name:/・1名分のみ保存$/}).waitFor();await save();
  await page.getByRole('status').filter({hasText:'保存完了・入力中の児童は0名'}).waitFor();
  let state=await page.evaluate(()=>window.__saveRecoveryFixture);
  assert(state.completed&&state.writes.length===1,'deleted-ID draft saves once and finishes');
  assert(state.active[0].id!=='synthetic-deleted-id','deleted identity is not resurrected');
  assert(!await page.getByRole('dialog').count(),'no overwrite comparison against deleted record');
  let diagnostics=await page.evaluate(()=>localStorage.getItem('d-support:diagnostics:v1'));
  assert(diagnostics.includes('deleted_id_replaced')&&!diagnostics.includes('架空児童')&&!diagnostics.includes('架空の入力内容'),'recovery stored without names/body');
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'履歴を書き出す'}).click();
  const file=await downloaded;await file.saveAs('output/playwright/record-save-diagnostics.json');assert(file.suggestedFilename().endsWith('.json'),'diagnostic export downloads');
  await page.goto(url+'?mode=uncertain');await page.getByRole('button',{name:/・1名分のみ保存$/}).waitFor();await save();
  await page.getByRole('alert').filter({hasText:'通信できないため'}).waitFor();state=await page.evaluate(()=>window.__saveRecoveryFixture);
  assert(!state.completed&&state.writes.length===1,'lost save response keeps draft/form mounted');
  await page.locator('summary').filter({hasText:'入力内容プレビュー'}).click();
  assert(await page.evaluate(()=>Object.entries(localStorage).some(([key,value])=>key.startsWith('support-record-draft')&&value.includes('架空の入力内容。診断履歴には含めない。'))),'input remains in the local draft after lost response');
  await save();await page.getByRole('status').filter({hasText:'保存完了・入力中の児童は0名'}).waitFor();state=await page.evaluate(()=>window.__saveRecoveryFixture);
  assert(state.writes.length===1&&state.completed,'retry confirms existing exact content without a second write');
  diagnostics=await page.evaluate(()=>localStorage.getItem('d-support:diagnostics:v1'));
  assert(diagnostics.includes('NETWORK')&&diagnostics.includes('same_content_confirmed'),'network error and recovery recorded');
  assert(!diagnostics.includes('synthetic')&&!diagnostics.includes('架空')&&!diagnostics.includes('Failed to fetch'),'raw error data/record IDs omitted');
  await page.goto(url+'?mode=different');await page.getByRole('button',{name:/・1名分のみ保存$/}).waitFor();await save();
  await page.getByRole('dialog').waitFor();assert(await page.getByRole('region',{name:'保存済みの記録',exact:true}).getByText(/別の架空保存内容/).count()>0,'late conflicting content opens existing/proposed comparison');
  await page.getByRole('button',{name:'上書きせず入力に戻る',exact:true}).click();state=await page.evaluate(()=>window.__saveRecoveryFixture);
  assert(!state.completed&&state.writes.length===1,'cancel never overwrites peer content');
  await page.route('**/rest/v1/rpc/save_support_records_guarded?*',route=>route.fulfill({status:403,json:{code:'42501',message:'private token NEVER_EXPORT'}}));
  await page.evaluate(()=>window.__triggerDiagnosticHttp());
  diagnostics=await page.evaluate(()=>localStorage.getItem('d-support:diagnostics:v1'));
  assert(diagnostics.includes('PERMISSION')&&diagnostics.includes('api.save_support_records_guarded'),'handled HTTP failure is automatically logged');
  assert(!diagnostics.includes('NEVER_EXPORT')&&!diagnostics.includes('never-stored'),'request URL and error response omitted');
  await page.evaluate(()=>window.dispatchEvent(new Event('offline')));
  assert((await page.evaluate(()=>localStorage.getItem('d-support:diagnostics:v1'))).includes('connection.offline'),'offline transition logged');
  for(const [name,width,height] of [['laptop',1366,768],['phone',390,844]]){await page.setViewportSize({width,height});await page.getByRole('heading',{name:'エラー・操作履歴'}).scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no overflow '+name);await page.screenshot({path:`output/playwright/record-save-recovery-${name}.png`,fullPage:true});}
  await page.getByRole('button',{name:'履歴を削除'}).click();assert((await page.evaluate(()=>localStorage.getItem('d-support:diagnostics:v1')))===null,'history deletion clears only its key');
  assert(await page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('support-record-draft'))),'draft preserved after diagnostic deletion');
  assert(!errors.length,'no uncaught app errors');assert(!external.length,'no private/external network access');
  return {passed:true,checks,readsProduction:false,writesProduction:false};
}
try{command('open',url);command('snapshot');console.log(command('run-code',`async page=>(${check.toString()})(page,${JSON.stringify(url)})`));
  const exported=readFileSync('output/playwright/record-save-diagnostics.json','utf8');if(/架空|synthetic|token|入力内容/.test(exported))throw Error('Private data in exported diagnostics');
}finally{command('close');}
