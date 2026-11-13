// Synthetic fixture only. Browser requests are intercepted before any external service.
import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];
if(!args.includes('--cli')||!cli)throw Error('--cli required');
const session='transfer-usage-'+Date.now(),url='http://127.0.0.1:3014/tests/fixtures/transfer-usage.html';
mkdirSync('output/playwright',{recursive:true});
function command(...args){
 const r=spawnSync(process.execPath,[resolve(cli),'-s='+session,...args],{encoding:'utf8',timeout:90000,maxBuffer:4194304});
 if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);
 return r.stdout;
}
async function check(page,url){
 let checks=0,fixtureCalls=0;const outside=[],errors=[];
 const assert=(ok,label)=>{checks++;if(!ok)throw Error(label);};
 page.on('pageerror',error=>errors.push(error.message));
 await page.clock.install({time:new Date('2026-11-13T03:00:00Z')});
 await page.context().route('**/*',route=>{
  const target=new URL(route.request().url());
  if(target.origin!==new URL(url).origin){outside.push(target.origin);return route.abort();}
  if(target.pathname.startsWith('/rest/v1/')){fixtureCalls++;return route.fulfill({status:204});}
  if(target.pathname.startsWith('/functions/v1/')){fixtureCalls++;return route.fulfill({status:200,headers:{'Content-Type':'application/json','Content-Length':'2'},body:'{}'});}
  return route.continue();
 });
 const open=()=>page.getByRole('button',{name:'データ転送量',exact:true}).click();
 const input=name=>page.getByLabel(name,{exact:true});
 const save=()=>page.getByRole('button',{name:'この端末に記録',exact:true}).click();
 const card=name=>page.getByRole('region',{name,exact:true});
 await page.goto(url);await open();
 assert(await page.getByText('未計測：公式の利用量を記録してください。',{exact:true}).count()===2,'unknown values not shown as zero');
 await input('請求期間の開始日').fill('2026-11-01');
 await input('次の請求期間の開始日').fill('2026-12-01');
 await input('キャッシュなし（GB）').fill('4.25');
 await input('キャッシュあり（GB）').fill('0');await save();
 await page.getByText('この端末に記録しました。',{exact:true}).waitFor();
 assert((await card('キャッシュなし（Egress）').innerText()).includes('85％')&&(await card('キャッシュあり（Cached Egress）').innerText()).includes('0％'),'independent budgets and zero recorded');
 assert((await card('キャッシュなし（Egress）').innerText()).includes('無料枠以上'),'forecast warning');
 await page.screenshot({path:'output/playwright/transfer-usage-preview.png',fullPage:true});
 await input('キャッシュなし（GB）').fill('-1');await save();
 assert(await page.getByRole('alert').getByText(/キャッシュなし・あり両方/).isVisible(),'bad numbers blocked');
 await input('キャッシュなし（GB）').fill('10.928');await save();
 assert((await card('キャッシュなし（Egress）').innerText()).includes('無料枠に到達・超過'),'over-limit is explicit');
 await page.getByText('入力履歴（1件）',{exact:true}).click();
 assert(await page.getByText('なし 10.928 GB ／ あり 0 GB',{exact:true}).isVisible(),'same-day correction is not duplicated');
 await page.getByText('このタブの通信内訳（診断用）',{exact:true}).click();
 assert(await page.getByText(/完了 2回/).isVisible()&&await page.getByText('api.lesson-learning',{exact:true}).isVisible(),'real fetch wrapper provides the local diagnostic counts');
 assert(fixtureCalls===2,'viewing and saving the meter creates no requests');
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'layout fits a phone');
 await page.reload();await open();
 assert((await card('キャッシュなし（Egress）').innerText()).includes('10.928'),'manual value survives reload');
 await page.goto(url+'?org=another');await open();
 assert(await page.getByText('未計測：公式の利用量を記録してください。',{exact:true}).count()===2,'other office cannot read the stored value');
 await page.goto(url+'?role=manager');await page.getByRole('heading',{name:'事業所の設定',exact:true}).waitFor();
 assert(!await page.getByRole('button',{name:'データ転送量',exact:true}).count(),'non-admin cannot open the meter');
 assert(!outside.length&&!errors.length,'no external requests or browser errors');
 return {passed:true,checks,productionAccess:false};
}
try{command('open',url);command('snapshot');const out=command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(url)})`);const result=out.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!result||!JSON.parse(result[1]).passed)throw Error(out);console.log(result[1]);}finally{command('close');}
