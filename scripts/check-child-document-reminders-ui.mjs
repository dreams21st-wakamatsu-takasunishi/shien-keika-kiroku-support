// Fictional records and a virtual JST clock. No production access or mutations.
import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];
if(!args.includes('--cli')||!cli)throw Error('--cli required');
const session='document-reminders-'+Date.now(),url='http://127.0.0.1:3014/tests/fixtures/child-documents.html';
mkdirSync('output/playwright',{recursive:true});
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s='+session,...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page,url){
 page.setDefaultTimeout(12000);
 let checks=0;const assert=(ok,label)=>{checks++;if(!ok)throw Error(label);},errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:3014')&&!r.url().startsWith('data:'))external.push(r.url());});
 await page.context().route('https://**',route=>route.abort());
 await page.clock.install({time:new Date('2026-10-29T14:59:45Z')});
 await page.setViewportSize({width:1366,height:900});
 await page.goto(url+'?mode=usage-renewal');
 await page.getByRole('button',{name:/^架空児童A /}).click();
 const panel=()=>page.getByRole('region',{name:'書類の更新・追加の確認案内',exact:true});
 const renewal=()=>page.getByRole('article',{name:'利用計画 受給者証更新に伴う利用計画（前回期限 2026-11-30）',exact:true});
 const store=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('fixture-child-documents-v1')));
 const dirty=()=>page.getByTestId('dirty').filter({hasText:'未保存の入力なし'}).waitFor();
 await panel().waitFor();
 await page.getByRole('button',{name:'利用計画を入力・確認',exact:true}).click();
 assert(!await renewal().count(),'no usage-plan renewal before threshold');
 await page.clock.fastForward(30000);await renewal().waitFor();
 assert(await page.evaluate(()=>window.__documentFixture.writes)===0,'automatic renewal display never writes documents');
 assert(await renewal().getByLabel('作成日',{exact:true}).inputValue()==='','no copied or inferred plan date');
 // Register the certificate first: the pending usage-plan entry must remain.
 await page.getByRole('button',{name:'受給者証を入力・確認',exact:true}).click();
 const certificate=page.getByRole('article',{name:'受給者証のコピー 更新分（前回期限 2026-11-30）',exact:true});
 await certificate.getByLabel('作成日',{exact:true}).fill('2026-10-30');
 await certificate.getByLabel('受給者証の有効期限',{exact:true}).fill('2027-11-30');
 await certificate.getByLabel('実物の保管を確認',{exact:true}).check();
 await certificate.getByRole('button',{name:'書類を登録',exact:true}).click();await dirty();
 assert(await renewal().count()===1,'new certificate does not hide pending plan');
 const pending=panel().locator('[data-document-issue="usage_plan|extra:usage-plan-renewal-2026-11-30"]');
 if(!await pending.isVisible())await panel().locator('summary').filter({hasText:'残りの確認案内を表示'}).click();
 await pending.getByRole('button',{name:'この欄へ移動',exact:true}).click();
 assert(await renewal().isVisible(),'reminder opens relevant plan input');
 await renewal().getByLabel('作成日',{exact:true}).fill('2026-10-30');
 assert(await page.getByRole('button',{name:'受給者証を入力・確認',exact:true}).isDisabled(),'cannot navigate away from unsaved renewal');
 await renewal().getByLabel('実物の保管を確認',{exact:true}).check();
 await page.evaluate(()=>window.__documentFixture.failSave=true);
 await renewal().getByRole('button',{name:'書類を登録',exact:true}).click();
 await renewal().getByRole('alert').filter({hasText:'入力は残しています'}).waitFor();
 assert(await renewal().getByLabel('作成日',{exact:true}).inputValue()==='2026-10-30','network error retains plan date');
 await page.evaluate(()=>window.__documentFixture.failSave=false);
 await renewal().getByRole('button',{name:'書類を登録',exact:true}).click();await dirty();
 let records=await store();
 assert(records.entries.length===4,'certificate and plan append separate records');
 assert(records.entries.find(row=>row.id==='fictional-plan').documentDate==='2026-04-01','previous usage plan unchanged');
 assert(records.entries.find(row=>row.type==='usage_plan'&&row.cycleKey==='extra:usage-plan-renewal-2026-11-30').replacesId===null,'new renewal is not a correction of old plan');
 assert(!await pending.count(),'confirmed renewal clears its reminder');
 await page.getByRole('button',{name:'再読込',exact:true}).click();await renewal().getByText('保管確認済み',{exact:true}).waitFor();
 assert(await renewal().getByLabel('作成日',{exact:true}).inputValue()==='2026-10-30','plan survives fresh read');
 for(const [name,width,height] of [['laptop',1366,900],['phone',390,844]]){
  await page.setViewportSize({width,height});await renewal().scrollIntoViewIfNeeded();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'renewal no horizontal overflow '+name);
  await page.screenshot({path:'output/playwright/usage-plan-renewal-'+name+'.png'});
 }
 await page.goto(url+'?mode=family-reminders');await page.getByRole('button',{name:/^架空児童A /}).click();await panel().waitFor();
 const more=panel().locator('summary').filter({hasText:'残りの確認案内を表示'});if(await more.count())await more.click();
 await panel().locator('summary').filter({hasText:'参考情報（書類不足とは別'}).click();
 assert((await panel().innerText()).includes('登録きょうだい：1名'),'explicit sibling information displayed');
 assert((await panel().innerText()).includes('11月生まれ'),'eldest candidate birth month visible');
 const birthday=panel().getByRole('listitem').filter({has:page.getByText('誕生月を手掛かりに更新時期を確認',{exact:true})});
 assert((await birthday.innerText()).includes('地域の参考')&&!(await birthday.innerText()).includes('確認目安：'),'birthday reference never invents a due date');
 await birthday.locator('summary').click();
 assert(await birthday.getByRole('link').getAttribute('href')==='https://www.city.kitakyushu.lg.jp/files/001089726.pdf','regional source is accessible without child data in URL');
 assert(await page.evaluate(()=>window.__documentFixture.writes)===0,'family prompts never auto-write dates or relations');
 for(const [name,width,height] of [['laptop',1366,900],['phone',390,844]]){
  await page.setViewportSize({width,height});await panel().scrollIntoViewIfNeeded();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'reminders no horizontal overflow '+name);
  await panel().screenshot({path:'output/playwright/document-reminders-'+name+'.png'});
 }
 await page.goto(url+'?mode=legacy-consultation');await page.getByRole('button',{name:/^架空児童A /}).click();
 await page.getByRole('button',{name:'個支本案の書類',exact:true}).click();
 const legacy=page.getByRole('article',{name:'個支本案 追加・旧設定の計画',exact:true});
 await legacy.locator('summary').click();
 assert(await page.getByLabel('相談支援交付日',{exact:true}).count()===0,'consultation date input removed');
 assert(!await panel().locator('[data-document-issue="plan_final|extra:legacy-plan"]').count(),'legacy plan with guardian dates does not prompt consultation date');
 await legacy.getByLabel('保護者交付日',{exact:true}).fill('2026-10-03');
 await legacy.getByRole('button',{name:'訂正を保存',exact:true}).click();await dirty();
 const legacyRows=(await store()).entries;
 assert(legacyRows.length===2&&legacyRows.every(row=>row.consultationDeliveryDate==='2026-10-02'),'editing visible dates preserves original and corrected legacy consultation dates');
 assert(legacyRows.find(row=>row.id==='legacy-plan').guardianDeliveryDate==='2026-10-01','original guardian date remains in history');
 await page.getByRole('button',{name:'再読込',exact:true}).click();await legacy.waitFor();
 await legacy.locator('summary').click();
 assert(await legacy.getByLabel('保護者交付日',{exact:true}).inputValue()==='2026-10-03','visible guardian date change persists after reload');
 assert((await store()).entries.at(-1).consultationDeliveryDate==='2026-10-02','legacy hidden date survives reload');
 await page.goto(url+'?mode=alert-details');await page.getByRole('button',{name:/^架空児童A /}).click();await panel().waitFor();
 const issues=panel().locator('[data-document-issue]');
 assert(await issues.count()===3,'only three actual missing documents, not duplicated initial and annual alerts');
 const keys=await issues.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-document-issue')));
 assert(new Set(keys).size===keys.length,'one issue per document and cycle');
 const initialUsage=panel().locator('[data-document-issue="usage_plan|annual:2026-10-01"]');
 assert((await initialUsage.innerText()).includes('作成日・実物の保管確認'),'initial usage explicitly lists missing fields');
 const assessmentIssue=panel().locator('[data-document-issue="assessment|annual:2026-10-01"]');
 assert((await assessmentIssue.innerText()).includes('未入力・未確認：実物の保管確認')&&!(await assessmentIssue.innerText()).includes('作成日'),'registered creation date is not falsely listed as missing');
 const guardianIssue=panel().locator('[data-document-issue="plan_final|initial:2026-10-01"]');
 assert((await guardianIssue.innerText()).includes('保護者交付日')&&!(await guardianIssue.innerText()).includes('保護者同意日'),'only missing guardian date is listed');
 await initialUsage.getByRole('button',{name:'この欄へ移動',exact:true}).click();
 const initialForm=page.getByRole('article',{name:'利用計画 初回 2026-10-01',exact:true});
 await initialForm.getByLabel('作成日',{exact:true}).fill('2026-10-01');await initialForm.getByLabel('実物の保管を確認',{exact:true}).check();
 assert(await guardianIssue.getByRole('button',{name:'この欄へ移動',exact:true}).isDisabled(),'direct issue links protect dirty input');
 await initialForm.getByRole('button',{name:'書類を登録',exact:true}).click();await dirty();
 assert(await initialUsage.count()===0&&await issues.count()===2,'saving usage clears only its issue immediately');
 for(const [name,width,height] of [['laptop',1366,900],['phone',390,844]]){
  await page.setViewportSize({width,height});await panel().scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'specific issue layout no overflow '+name);await panel().screenshot({path:'output/playwright/document-specific-alerts-'+name+'.png'});
 }
 assert(!errors.length,'no browser exceptions '+errors.join(','));
 assert(!external.length,'no external or production requests');
 return {passed:true,checks,productionAccess:false,realChildDataWritten:false,virtualJstThreshold:true};
}
try{command('open',url);command('snapshot');const out=command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(url)})`),match=out.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!match||!JSON.parse(match[1]).passed)throw Error(out);console.log(match[1]);}finally{command('close');}
