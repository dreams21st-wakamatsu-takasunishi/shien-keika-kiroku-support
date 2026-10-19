// Synthetic metadata and virtual JST clock only; no production requests.
import {spawnSync} from 'node:child_process';import {mkdirSync} from 'node:fs';import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];if(!args.includes('--cli')||!cli)throw Error('--cli required');
const session='benefit-expiry-'+Date.now(),url='http://127.0.0.1:3014/tests/fixtures/child-documents.html?mode=benefit-expiry';mkdirSync('output/playwright',{recursive:true});
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s='+session,...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page,url){
 let checks=0;const assert=(ok,label)=>{checks++;if(!ok)throw Error(label);},errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:3014')&&!r.url().startsWith('data:'))external.push(r.url());});await page.context().route('https://**',r=>r.abort());
 await page.clock.install({time:new Date('2026-10-29T14:59:45Z')});await page.addInitScript(()=>window.confirm=()=>true);await page.setViewportSize({width:1366,height:900});await page.goto(url);
 await page.getByRole('button',{name:/^架空児童A /}).click();await page.getByRole('region',{name:'受給者証の期限と更新',exact:true}).getByText('受給者証の有効期限：2026-11-30',{exact:true}).waitFor();
 await page.getByRole('button',{name:'受給者証を入力・確認',exact:true}).click();
 const old=page.getByRole('article',{name:'受給者証のコピー 年次更新 2026-04-15',exact:true}),renewal=()=>page.getByRole('article',{name:'受給者証のコピー 更新分（前回期限 2026-11-30）',exact:true});
 assert(await old.getByLabel('受給者証の有効期限',{exact:true}).isVisible(),'expiry input is visible without opening supplemental details');
 assert(await renewal().count()===0,'no renewal row before calendar-month threshold');
 assert((await page.getByRole('region',{name:'受給者証の期限と更新',exact:true}).innerText()).includes('2026-10-30'),'upcoming threshold visible');
 await old.locator('summary').click();await old.getByLabel('保管場所・補足',{exact:true}).fill('日付変更中の未保存メモ');
 await page.clock.fastForward(30000);await renewal().waitFor();
 assert(await old.getByLabel('保管場所・補足',{exact:true}).inputValue()==='日付変更中の未保存メモ','midnight preserves dirty source input');
 assert(await page.evaluate(()=>window.__documentFixture.writes)===0,'automatic row creation writes no metadata');
 assert(await renewal().getByLabel('作成日',{exact:true}).inputValue()==='','creation date is never guessed');
 assert(await renewal().getByLabel('受給者証の有効期限',{exact:true}).inputValue()==='','new validity date is never copied from old certificate');
 await old.getByRole('button',{name:'入力を戻す',exact:true}).click();
 await renewal().getByLabel('作成日',{exact:true}).fill('2026-10-30');await renewal().getByLabel('受給者証の有効期限',{exact:true}).fill('2026-11-30');await renewal().getByLabel('実物の保管を確認',{exact:true}).check();await renewal().getByRole('button',{name:'書類を登録',exact:true}).click();await renewal().getByRole('alert').filter({hasText:'前回の期限より後'}).waitFor();
 assert(await page.evaluate(()=>window.__documentFixture.writes)===0,'invalid renewed expiry blocked');
 await renewal().getByLabel('受給者証の有効期限',{exact:true}).fill('2027-11-30');await page.evaluate(()=>window.__documentFixture.failSave=true);await renewal().getByRole('button',{name:'書類を登録',exact:true}).click();await renewal().getByRole('alert').filter({hasText:'入力は残しています'}).waitFor();
 assert(await renewal().getByLabel('受給者証の有効期限',{exact:true}).inputValue()==='2027-11-30','failed save preserves entered expiry');
 await page.evaluate(()=>window.__documentFixture.failSave=false);await renewal().getByRole('button',{name:'書類を登録',exact:true}).click();await page.getByTestId('dirty').filter({hasText:'未保存の入力なし'}).waitFor();
 let data=await page.evaluate(()=>JSON.parse(localStorage.getItem('fixture-child-documents-v1')));
 assert(data.entries.length===2,'renewal appends a second document');assert(data.entries[0].validUntil==='2026-11-30'&&data.entries[0].documentDate==='2026-04-01','old certificate untouched');assert(data.entries[1].replacesId===null&&data.entries[1].cycleKey==='extra:benefit-renewal-2026-11-30','new period never replaces old history');
 await page.getByRole('button',{name:'再読込',exact:true}).click();await renewal().getByLabel('受給者証の有効期限',{exact:true}).waitFor();assert(await renewal().getByLabel('受給者証の有効期限',{exact:true}).inputValue()==='2027-11-30','expiry survives fresh server read');
 assert((await page.getByRole('region',{name:'受給者証の期限と更新',exact:true}).innerText()).includes('2027-11-30'),'summary advances to latest registered certificate');
 assert(!await page.getByRole('article',{name:'受給者証のコピー 更新分（前回期限 2027-11-30）',exact:true}).count(),'next year does not open early');
 for(const [name,width,height] of [['laptop',1366,900],['phone',390,844]]){await page.setViewportSize({width,height});await renewal().scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow '+name);await page.screenshot({path:'output/playwright/benefit-expiry-'+name+'.png'});}
 assert(!errors.length,'no browser exceptions '+errors.join(','));assert(!external.length,'no external requests');return {passed:true,checks,productionAccess:false,realChildDataWritten:false,virtualJstMidnightVerified:true};
}
try{command('open',url);command('snapshot');const out=command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(url)})`),match=out.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!match||!JSON.parse(match[1]).passed)throw Error(out);console.log(match[1]);}finally{command('close');}
