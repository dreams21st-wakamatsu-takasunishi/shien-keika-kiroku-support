// Synthetic local metadata only. Does not delete any real record or file.
import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];
if(!args.includes('--cli')||!cli)throw Error('--cli required');
const session='document-deletion-'+Date.now(),url='http://127.0.0.1:3014/tests/fixtures/child-documents.html?mode=document-deletion';
mkdirSync('output/playwright',{recursive:true});
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s='+session,...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page,url){
 page.setDefaultTimeout(12000);let checks=0;
 const assert=(ok,label)=>{checks++;if(!ok)throw Error(label);},errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:3014')&&!r.url().startsWith('data:'))external.push(r.url());});
 await page.context().route('https://**',route=>route.abort());
 await page.addInitScript(()=>{window.__acceptDocumentDeletion=false;window.__documentDeletionPrompt='';window.confirm=message=>{window.__documentDeletionPrompt=message;return window.__acceptDocumentDeletion;};});
 await page.setViewportSize({width:1366,height:900});await page.goto(url);
 await page.getByRole('button',{name:/^架空児童A /}).click();
 const data=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('fixture-child-documents-v1')));
 const dirty=()=>page.getByTestId('dirty').filter({hasText:'未保存の入力なし'}).waitFor();
 const row=name=>page.getByRole('article',{name,exact:true});
 const mistake=row('証明書等 誤追加の証明書'),keep=row('証明書等 残す証明書');
 await page.getByRole('button',{name:'証明書等の書類',exact:true}).click();
 assert(await mistake.getByRole('button',{name:'この書類を削除',exact:true}).isVisible(),'delete is visible without supplemental details');
 await mistake.getByRole('button',{name:'この書類を削除',exact:true}).click();
 const dialogText=await page.evaluate(()=>window.__documentDeletionPrompt);
 assert(dialogText.includes('誤追加の証明書')&&dialogText.includes('履歴は残します'),'confirmation identifies target and explains history');
 assert((await data()).entries.length===5,'canceling confirmation writes nothing');
 await page.evaluate(()=>window.__acceptDocumentDeletion=true);
 await page.getByRole('button',{name:'アセスメントシートの書類',exact:true}).click();
 const assessment=row('アセスメントシート 年次更新 2026-04-15');
 await assessment.getByLabel('作成日',{exact:true}).fill('2026-04-16');
 assert(await mistake.getByRole('button',{name:'この書類を削除',exact:true}).isDisabled(),'another dirty document prevents deletion');
 await assessment.locator('summary').click();await assessment.getByRole('button',{name:'入力を戻す',exact:true}).click();await dirty();
 await page.evaluate(()=>window.__documentFixture.failSave=true);
 await mistake.getByRole('button',{name:'この書類を削除',exact:true}).click();await mistake.getByRole('alert').waitFor();
 assert(await mistake.isVisible()&&(await data()).entries.length===5,'failed deletion retains registration and history');
 await page.evaluate(()=>{window.__documentFixture.failSave=false;window.__documentFixture.delay=500;});
 await mistake.getByRole('button',{name:'この書類を削除',exact:true}).click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('fixture-child-documents-v1')).entries.some(row=>row.replacesId==='mistake'));
 await page.evaluate(()=>window.__documentFixture.delay=0);
 assert(await mistake.count()===0,'manual extra disappears from normal list');
 let records=await data();
 assert(records.entries.some(row=>row.id==='mistake')&&records.entries.filter(row=>row.replacesId==='mistake'&&row.operation==='void').length===1,'original retained with exactly one deletion');
 assert(await keep.isVisible(),'other same-category registration remains');
 assert(records.entries.find(row=>row.id==='other-child').title==='別児童の証明書','other child untouched');
 const history=page.locator('details').filter({has:page.locator('summary').filter({hasText:'登録・訂正・削除履歴（元の情報を保持）'})});
 await history.locator('summary').click();
 assert((await history.innerText()).includes('誤追加の証明書')&&(await history.innerText()).includes('削除（登録取消）'),'history exposes deleted registration and operation');
 await page.getByRole('button',{name:'再読込',exact:true}).click();await keep.waitFor();
 assert(await mistake.count()===0,'deleted extra remains hidden after server reload');
 await assessment.getByRole('button',{name:'この書類を削除',exact:true}).click();
 await assessment.getByText('未入力',{exact:true}).waitFor();
 assert(await assessment.getByLabel('作成日',{exact:true}).inputValue()==='','automatic required slot becomes blank');
 assert(await assessment.getByRole('button',{name:'この書類を削除',exact:true}).count()===0,'empty slot has no delete action');
 records=await data();assert(records.entries.some(row=>row.id==='annual')&&records.entries.some(row=>row.replacesId==='annual'),'automatic slot original and deletion both retained');
 for(const type of ['個支原案','個支会議','個支本案'])await page.getByRole('button',{name:type+'の書類',exact:true}).click();
 const draft=row('個支原案 追加・旧設定の計画'),meeting=row('個支会議 追加・旧設定の計画'),final=row('個支本案 追加・旧設定の計画');
 await draft.getByLabel('作成日',{exact:true}).fill('2026-10-01');
 assert(await final.getByRole('button',{name:'この書類を削除',exact:true}).isDisabled(),'cannot remove generated companions while their input is unsaved');
 await draft.locator('summary').click();await draft.getByRole('button',{name:'入力を戻す',exact:true}).click();await dirty();
 await final.getByRole('button',{name:'この書類を削除',exact:true}).click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('fixture-child-documents-v1')).entries.some(row=>row.replacesId==='extra-plan'));
 assert(await final.count()===0&&await draft.count()===0&&await meeting.count()===0,'mistaken extra plan and unsaved companion placeholders disappear');
 assert((await data()).entries.filter(row=>row.operation==='void').length===3,'only three explicitly selected registrations were deleted');
 for(const [name,width,height] of [['laptop',1366,900],['phone',390,844]]){
  await page.setViewportSize({width,height});await keep.scrollIntoViewIfNeeded();
  assert(await keep.getByRole('button',{name:'この書類を削除',exact:true}).isVisible(),'visible delete action '+name);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow '+name);
  await keep.screenshot({path:'output/playwright/child-document-deletion-'+name+'.png'});
 }
 assert(!errors.length,'no browser exceptions '+errors.join(','));assert(!external.length,'no production or external requests');
 return {passed:true,checks,realDataDeleted:false,productionAccess:false,appendOnlyHistory:true};
}
try{command('open',url);command('snapshot');const out=command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(url)})`),match=out.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!match||!JSON.parse(match[1]).passed)throw Error(out);console.log(match[1]);}finally{command('close');}
