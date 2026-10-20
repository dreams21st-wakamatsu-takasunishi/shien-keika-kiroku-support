// Local fictional responses only. Never signs in, opens real artifacts or writes production data.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const args=process.argv.slice(2), cli=args[args.indexOf('--cli')+1];
if (!args.includes('--cli') || !cli) throw Error('--cli required');
const url='http://127.0.0.1:3014/tests/fixtures/word-notice.html', session='word-notice-'+Date.now();
mkdirSync('output/playwright',{recursive:true});
function command(...args) { const r=spawnSync(process.execPath,[resolve(cli),'-s='+session,...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304}); if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout; }
async function check(page,url) {
  let checks=0;const assert=(ok,label)=>{checks++;if(!ok)throw Error(label);},errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:3014'))external.push(r.url());});
  await page.context().route('https://**',route=>route.abort());
  await page.clock.install();await page.goto(url);
  const notice=page.getByRole('status'),retry=page.getByRole('button',{name:'再取得',exact:true});
  const calls=()=>page.evaluate(()=>window.__wordNoticeFixture.calls);
  const mode=async value=>page.evaluate(value=>{window.__wordNoticeFixture.mode=value;},value);
  const refresh=()=>page.evaluate(()=>window.dispatchEvent(new Event('d-support-word-reviews-updated')));
  await notice.filter({hasText:'2 件'}).waitFor();
  await page.getByRole('button',{name:'申請を確認',exact:true}).click();
  assert(await page.evaluate(()=>window.__wordNoticeFixture.opened),'successful notice opens reviews');
  await page.getByLabel('架空の入力欄').fill('保持する架空入力');
  await mode('403');await refresh();await notice.filter({hasText:'HTTP 403'}).waitFor();
  await page.getByText('失敗理由を確認',{exact:true}).click();
  assert(await page.getByText('試験用：学習連携を確認してください。',{exact:true}).isVisible(),'server reason remains available');
  assert(await page.getByText('前回取得時の未確認申請：2件（現在の件数は不明）',{exact:true}).isVisible(),'does not turn failure into zero');
  const forbidden=await calls();await page.clock.runFor(600000);
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  assert(await calls()===forbidden,'permission failures do not poll or retry on focus');
  await page.getByRole('button',{name:'Word通知の警告を一時的に閉じる'}).click();
  assert(!await notice.count(),'warning may be dismissed without losing input');
  assert(await page.getByLabel('架空の入力欄').inputValue()==='保持する架空入力','unrelated input preserved');
  await mode('success');await page.getByRole('button',{name:'職員を切替'}).click();await notice.filter({hasText:'2 件'}).waitFor();
  await mode('503');await refresh();await notice.filter({hasText:'HTTP 503'}).waitFor();
  const firstFailure=await calls();await page.clock.runFor(60000);
  assert(await calls()===firstFailure+1,'first transient retry after a minute');
  await page.clock.runFor(60000);assert(await calls()===firstFailure+1,'second retry backs off rather than repeating every minute');
  await page.clock.runFor(60000);assert(await calls()===firstFailure+2,'second retry after two minutes');
  await mode('success');await retry.click();await notice.filter({hasText:'2 件'}).waitFor();
  await mode('malformed');await refresh();await notice.filter({hasText:'HTTP 422'}).waitFor();
  const malformed=await calls();await page.clock.runFor(300000);assert(await calls()===malformed,'malformed responses stop polling with guidance');
  await mode('success');await retry.click();await notice.filter({hasText:'2 件'}).waitFor();
  await page.getByRole('button',{name:'利用可否を切替'}).click();const disabled=await calls();
  await page.clock.runFor(300000);assert(await calls()===disabled&&!await notice.count(),'ineligible sessions make no requests');
  await page.getByRole('button',{name:'利用可否を切替'}).click();await notice.filter({hasText:'2 件'}).waitFor();
  await mode('401');await refresh();await notice.filter({hasText:'再ログイン'}).waitFor();
  assert((await notice.textContent()).includes('HTTP 401'),'expired login gives correct next step');
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile layout does not overflow');
  await page.screenshot({path:'output/playwright/word-notice-guidance-mobile.png',fullPage:true});
  assert(!errors.length,'no uncaught browser exceptions');assert(!external.length,'no external network requests');
  return {passed:true,checks,productionAccess:false};
}
try { command('open',url);command('snapshot');const out=command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(url)})`),match=out.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!match||!JSON.parse(match[1]).passed)throw Error(out);console.log(match[1]); } finally { command('close'); }
