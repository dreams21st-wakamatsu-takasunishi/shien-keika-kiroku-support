// Local synthetic data, no production Auth, reads or writes.
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];if(!args.includes('--cli')||!cli)throw Error('--cli required');
const session='audit-history-'+Date.now(),url='http://127.0.0.1:3014/tests/fixtures/audit-history.html';
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s='+session,...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page,url){
 page.setDefaultTimeout(15000);let checks=0;const assert=(ok,label)=>{checks++;if(!ok)throw Error(label);},errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:3014')&&!r.url().startsWith('data:'))external.push(r.url());});await page.context().route('https://**',r=>r.abort());
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedDiagnostic=text;}}}));
 await page.setViewportSize({width:1366,height:900});await page.goto(url);await page.getByRole('tab',{name:'監査履歴',exact:false}).waitFor();
 assert(await page.evaluate(()=>window.__auditFixture.auditRequests)===0,'no eager audit request on team entry');
 await page.getByRole('tab',{name:'監査履歴',exact:false}).click();await page.getByRole('alert').filter({hasText:'時間制限'}).waitFor();
 assert(!await page.getByText('表示できる履歴はありません。',{exact:true}).count(),'failure never masquerades as an empty history');
 const request=await page.evaluate(()=>window.__auditFixture.requests.find(r=>r.resource==='audit_logs'));
 assert(request.org==='eq.22222222-2222-4222-8222-222222222222','explicit organization filter');assert(request.order==='occurred_at.desc,id.desc','index-compatible stable order');assert(!request.select.includes('old_data')&&!request.select.includes('new_data'),'no audit payload read');
 const event=page.locator('details').filter({has:page.locator('summary').filter({hasText:'api.audit_logs'})});await event.locator('summary').click();
 assert(await event.getByText('失敗した操作：api.audit_logs',{exact:true}).isVisible(),'failure operation is in expanded content');assert((await event.innerText()).includes('要求開始画面：team'),'request origin displayed');assert((await event.innerText()).includes('57014'),'safe timeout code visible');
 await event.getByRole('button',{name:'このエラーをコピー',exact:true}).click();const copied=await page.evaluate(()=>window.__copiedDiagnostic);
 for(const marker of ['発生日時：','失敗した操作：api.audit_logs','要求開始画面：team','HTTP 500','通信方式：GET','57014'])assert(copied.includes(marker),'copy includes '+marker);
 assert(!copied.includes('synthetic-row')&&!copied.includes('canceling statement'),'copy excludes payload and raw error');
 await page.evaluate(()=>window.__auditFixture.mode='success');await page.getByRole('button',{name:'監査履歴の読み込みを再試行',exact:true}).click();await page.getByText('synthetic-row',{exact:true}).waitFor();assert(!await page.getByRole('alert').count(),'retry recovers visibly');
 await page.evaluate(()=>window.__auditFixture.delay=1500);await page.getByRole('button',{name:'再読み込み',exact:true}).first().click();await page.getByRole('tab',{name:'メール招待',exact:true}).click();await page.waitForTimeout(1700);assert(!await page.getByText('synthetic-row',{exact:true}).count(),'leaving tab stops stale rendering');
 assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('d-support:diagnostics:v1')).filter(e=>e.operation==='api.audit_logs').length)===1,'intentional cancellation adds no false error');
 for(const [width,height] of [[1366,900],[390,844]]){await page.setViewportSize({width,height});await event.locator('summary').scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no overflow '+width);await page.screenshot({path:'output/playwright/audit-diagnostics-'+width+'.png'});}
 await page.setViewportSize({width:1366,height:900});await page.getByRole('heading',{name:'エラー・操作履歴',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'output/playwright/guide-2026-10-15-diagnostics.png'});
 assert(!errors.length,'no browser errors '+errors.join(','));assert(!external.length,'no external requests');assert(await page.evaluate(()=>window.__auditFixture.requests.every(r=>r.method==='GET')),'no account or record mutation');return {passed:true,checks,productionAccess:false};
}
try{command('open',url);command('snapshot');const output=command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(url)})`),match=output.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!match||!JSON.parse(match[1]).passed)throw Error(output);console.log(match[1]);}finally{command('close');}
