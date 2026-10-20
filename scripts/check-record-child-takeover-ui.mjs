// Real RecordForm and RPC client with a strictly local, fictional backend.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];if(!args.includes('--cli')||!cli)throw Error('--cli required');
const url='http://127.0.0.1:3014/tests/fixtures/record-child-takeover.html',session='record-child-takeover-'+Date.now();mkdirSync('output/playwright',{recursive:true});
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s='+session,...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page,url){
  page.setDefaultTimeout(12000);let checks=0;const assert=(ok,label)=>{checks++;if(!ok)throw Error(label);},errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:3014'))external.push(r.url());});await page.context().route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:3014'?route.continue():route.abort());
  const state=()=>page.evaluate(()=>window.__childTakeoverFixture);
  const dialog=()=>page.getByRole('alertdialog',{name:'入力中の児童を引き継ぎますか？',exact:true});
  const confirm=()=>dialog().getByRole('button',{name:'入力済み内容を引き継いで追加',exact:true});
  const target=s=>s.rows['record-add-target'].payload,source=s=>s.rows['record-add-source'].payload;
  await page.setViewportSize({width:1366,height:768});await page.goto(url);await page.getByText('架空児童Aの記録',{exact:true}).waitFor();
  await page.getByRole('button',{name:'この画面に児童を追加',exact:true}).last().click();
  const b=page.getByRole('button',{name:/^架空児童B/});assert(await b.isEnabled(),'busy child is selectable for takeover');
  assert(await page.getByRole('button',{name:/^架空児童F/}).isDisabled(),'incompatible record format cannot transfer into current form');
  await b.click();await dialog().waitFor();
  assert(await dialog().getByText(/架空職員みどり/).count()>0&&await dialog().getByText(/架空職員あおい/).count()>0,'confirmation identifies both operators');
  let s=await state();assert(s.transfers.length===0&&source(s).selectedChildIds.includes('B'),'opening confirmation makes no transfer');
  await dialog().getByRole('button',{name:'キャンセル',exact:true}).click();assert((await state()).transfers.length===0,'cancel does not change ownership');
  await b.click();await page.keyboard.press('Escape');assert(!await dialog().count(),'escape cancels confirmation');
  await b.click();
  for(const [name,width,height] of [['laptop',1366,768],['tablet',744,1133],['phone',390,844]]){
    await page.setViewportSize({width,height});assert(await dialog().evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}),'confirmation fits '+name);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no page overflow '+name);await page.screenshot({path:`output/playwright/record-child-takeover-${name}.png`});
  }
  await page.setViewportSize({width:1366,height:768});await page.evaluate(()=>window.__childTakeoverFixture.delay=600);await confirm().dblclick();
  await dialog().waitFor({state:'hidden'});s=await state();assert(s.transfers.length===1,'double tap sends one takeover');
  assert(target(s).selectedChildIds.join(',')==='A,B','same existing form receives just B');assert(target(s).childDrafts.A.attendanceNote==='Aの入力済み内容','existing A input preserved');assert(target(s).childDrafts.B.attendanceNote==='Bの入力済み内容'&&target(s).childDrafts.B.recordId==='kept-record-B','source B content and identity preserved');assert(source(s).selectedChildIds.join(',')==='C,D,E'&&!source(s).childDrafts.B,'unselected source children remain');
  assert(s.saves.length>=1&&s.transfers[0].p_target_draft_key==='record-add-target','current draft flushed before atomic transfer');
  await page.getByRole('button',{name:/追加を完了して入力へ戻る/}).click();assert(await page.locator('[data-child-tab-id]').count()===2,'no new form created');
  await page.getByRole('button',{name:'この画面に児童を追加',exact:true}).last().click();await page.getByRole('button',{name:'児童を追加',exact:true}).last().click();
  await page.getByPlaceholder('児童名・フリガナで検索').fill('架空児童D');await page.getByRole('button',{name:/^架空児童D/}).click();await dialog().waitFor();
  await page.evaluate(()=>window.__childTakeoverFixture.failNext=true);await confirm().click();await dialog().getByRole('alert').filter({hasText:'試験用：この端末では引き継げません。'}).waitFor();
  s=await state();assert(source(s).selectedChildIds.includes('D')&&!target(s).selectedChildIds.includes('D'),'denied RPC keeps source and target unchanged');assert(target(s).childDrafts.A.attendanceNote==='Aの入力済み内容','failed transfer preserves current input');
  await page.evaluate(()=>window.__childTakeoverFixture.loseResponse=true);await confirm().click();await dialog().waitFor({state:'hidden'});s=await state();assert(target(s).selectedChildIds.filter(id=>id==='D').length===1&&!source(s).selectedChildIds.includes('D'),'lost response recovers committed target once');assert(s.transfers.length===3,'lost response never repeats takeover');
  await page.getByRole('button',{name:'選択を完了',exact:true}).click();
  await page.getByRole('button',{name:/^架空児童E/}).click();await dialog().waitFor();const before=s.transfers.length;
  await page.evaluate(()=>{const r=window.__childTakeoverFixture.rows['record-add-source'];r.payload.selectedChildIds=r.payload.selectedChildIds.filter(id=>id!=='E');delete r.payload.childDrafts.E;r.revision++;});
  await confirm().click();await dialog().getByRole('alert').filter({hasText:/入力状況が変わりました/}).waitFor();s=await state();assert(s.transfers.length===before&&!target(s).selectedChildIds.includes('E'),'stale source is revalidated before transfer');
  await dialog().getByRole('button',{name:'キャンセル',exact:true}).click();
  await page.getByRole('button',{name:/^架空児童C/}).click();await dialog().waitFor();
  await page.evaluate(()=>{window.__childTakeoverFixture.rows['record-add-target'].revision++;});await confirm().click();await dialog().getByRole('alert').filter({hasText:/別端末で更新/}).waitFor();
  s=await state();assert(s.transfers.length===before&&source(s).selectedChildIds.includes('C'),'stale target revision aborts before moving source child');
  assert(!errors.length,'no uncaught errors '+errors.join(','));assert(!external.length,'no external requests');
  return {passed:true,checks,realRecordForm:true,productionAccess:false};
}
try{command('open',url);command('snapshot');const out=command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(url)})`),match=out.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!match||!JSON.parse(match[1]).passed)throw Error(out);console.log(match[1]);}finally{command('close');}
