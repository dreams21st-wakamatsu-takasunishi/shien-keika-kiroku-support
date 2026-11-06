import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {mkdirSync} from 'node:fs';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1],url='http://127.0.0.1:3026/tests/fixtures/lesson-learning.html';
if(!args.includes('--cli'))throw Error('--cli required');mkdirSync('output/playwright',{recursive:true});
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s=mock-exam-management',...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(r.status||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page,url){
 const assert=(value,label)=>{if(!value)throw Error(label);};
 const org='11111111-1111-4111-8111-111111111111',project='a'.repeat(20),errors=[],calls=[],receipts=new Map();
 let allowed=true,failOnce=false,wrongCampus=false,delay=0,confirm=true;
 const item=round=>({id:`round-${round}`,round,title:`第${round}回過去問題`,reference:'　架空の本文。\n　次の段落。',hidden:false,permissionConfirmed:true});
 const catalogs={main:[item(78)],other:[item(80)]},revisions={main:0,other:0};
 const payload=id=>({schemaVersion:1,dataTable:'user_data',organizationId:org,sourceProject:project,campusId:wrongCampus?'foreign':id,revision:revisions[id],fingerprint:'a'.repeat(32),catalog:JSON.parse(JSON.stringify(catalogs[id]))});
 page.on('pageerror',error=>errors.push(error.message));
 await page.exposeFunction('fixtureConfirm',()=>confirm);
 await page.addInitScript(()=>{window.confirm=()=>window.__allowConfirm!==false;});
 await page.context().route('https://*.supabase.co/**',route=>route.abort());
 await page.context().route('**/functions/v1/lesson-learning',route=>route.fulfill({json:{links:[],configured:true,canManageContent:allowed}}));
 await page.context().route('**/functions/v1/lesson-managed-content',route=>route.fulfill({json:{schemaVersion:1,dataTable:'user_data',organizationId:org,sourceProject:project,campuses:[{id:'main',name:'架空校舎A'},{id:'other',name:'架空校舎B'}]}}));
 await page.context().route('**/functions/v1/lesson-mock-exams',async route=>{
  const b=route.request().postDataJSON();calls.push(b);if(delay)await page.waitForTimeout(delay);
  if(!allowed){await route.fulfill({status:403,json:{error:'試験用：権限なし'}});return;}
  if(b.action==='get'){await route.fulfill({json:payload(b.campusId)});return;}
  let receipt=receipts.get(b.operationId);
  if(!receipt){
   const rows=catalogs[b.campusId],id=b.item?.id||b.id,index=rows.findIndex(row=>row.id===id);
   if(b.revision!==revisions[b.campusId]||(b.action==='create'?index>=0:index<0)){await route.fulfill({status:409,json:{error:'試験用：再取得してください'}});return;}
   if(b.action==='delete')rows.splice(index,1);else if(index>=0)rows[index]=b.item;else rows.push(b.item);
   revisions[b.campusId]++;receipt={...payload(b.campusId),operationId:b.operationId};receipts.set(b.operationId,receipt);
  }
  if(failOnce){failOnce=false;await route.fulfill({status:503,json:{error:'試験用：配信結果未確定'}});return;}
  await route.fulfill({json:receipt});
 });
 await page.goto(url);await page.getByRole('tab',{name:'模擬試験の問題',exact:true}).click();
 const region=page.getByRole('region',{name:'模擬試験の問題管理',exact:true});
 await region.getByText('第78回過去問題',{exact:true}).waitFor();
 await region.getByRole('button',{name:'本文を確認・編集：第78回過去問題',exact:true}).click();
 assert(await region.getByLabel('受検回',{exact:true}).isDisabled(),'stable round identity');
 assert(await region.getByLabel('採点用の正解本文',{exact:true}).inputValue()==='　架空の本文。\n　次の段落。','read registered body');
 assert(await region.getByRole('button',{name:'保存して全端末へ配信',exact:true}).isDisabled(),'permission confirmation required');
 await region.getByLabel('採点用の正解本文',{exact:true}).fill('　変更した架空本文。\n<img src=x onerror=alert(1)>');
 assert(await region.locator('img').count()===0,'preview escapes HTML');
 await page.evaluate(()=>{window.__allowConfirm=false;});await page.getByRole('tab',{name:'文章課題の作成',exact:true}).click();
 assert(await region.isVisible(),'dirty tab exit cancelled');await page.evaluate(()=>{window.__allowConfirm=true;});
 await region.getByLabel('本文のデータ化・児童への配信の利用許諾を確認済み',{exact:true}).check();
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'output/playwright/mock-exam-editor-desktop.png',fullPage:true});
 failOnce=true;await region.getByRole('button',{name:'保存して全端末へ配信',exact:true}).click();await region.getByText('試験用：配信結果未確定',{exact:true}).waitFor();
 await region.getByRole('button',{name:'保存して全端末へ配信',exact:true}).click();await region.getByText('保存して配信しました。',{exact:true}).waitFor();
 const updates=calls.filter(call=>call.action==='update');assert(updates.length===2&&updates[0].operationId===updates[1].operationId,'same request on uncertain retry');
 await region.getByRole('button',{name:'問題を追加',exact:true}).click();await region.getByLabel('受検回',{exact:true}).fill('78');
 await region.getByLabel('採点用の正解本文',{exact:true}).fill('　追加する架空本文。');await region.getByLabel('本文のデータ化・児童への配信の利用許諾を確認済み',{exact:true}).check();
 await region.getByRole('button',{name:'保存して全端末へ配信',exact:true}).click();await region.getByText('試験用：再取得してください',{exact:true}).waitFor();
 await region.getByLabel('受検回',{exact:true}).fill('79');await region.getByRole('button',{name:'保存して全端末へ配信',exact:true}).click();await region.getByText('第79回過去問題',{exact:true}).waitFor();
 await page.evaluate(()=>{window.__allowConfirm=false;});await region.getByRole('button',{name:'削除：第78回過去問題',exact:true}).click();
 assert(catalogs.main.some(row=>row.round===78),'delete cancelled');await page.evaluate(()=>{window.__allowConfirm=true;});
 await region.getByRole('button',{name:'削除：第78回過去問題',exact:true}).click();await region.getByText('削除を配信しました。過去の成績は保持されています。',{exact:true}).waitFor();
 assert(await region.getByText('第78回過去問題',{exact:true}).count()===0,'deleted default removed');
 await region.getByRole('button',{name:'本文を確認・編集：第79回過去問題',exact:true}).click();await region.getByLabel('採点用の正解本文',{exact:true}).fill('　競合確認。');await region.getByLabel('本文のデータ化・児童への配信の利用許諾を確認済み',{exact:true}).check();
 revisions.main++;await region.getByRole('button',{name:'保存して全端末へ配信',exact:true}).click();await region.getByText('試験用：再取得してください',{exact:true}).waitFor();
 await region.getByRole('button',{name:'再取得',exact:true}).click();await region.getByText('第79回過去問題',{exact:true}).waitFor();
 await region.getByLabel('模擬試験の対象校舎',{exact:true}).selectOption('other');await region.getByText('第80回過去問題',{exact:true}).waitFor();
 assert(await region.getByText('第79回過去問題',{exact:true}).count()===0,'campus isolation');
 await region.getByRole('button',{name:'本文を確認・編集：第80回過去問題',exact:true}).click();await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile no overflow');await page.screenshot({path:'output/playwright/mock-exam-editor-mobile.png',fullPage:true});
 await region.getByRole('button',{name:'一覧へ',exact:true}).click();wrongCampus=true;await region.getByRole('button',{name:'再取得',exact:true}).click();await region.getByRole('alert').waitFor();
 assert(await region.getByRole('button',{name:/本文を確認・編集/}).count()===0,'wrong campus response clears UI');
 wrongCampus=false;delay=500;await region.getByRole('button',{name:'再取得',exact:true}).click();allowed=false;await page.getByRole('button',{name:'試験用：職員切替',exact:true}).click();await page.waitForTimeout(800);
 assert(await page.getByRole('tab',{name:'模擬試験の問題',exact:true}).count()===0,'revoked permission hides entry');
 assert(await page.getByText('第80回過去問題',{exact:true}).count()===0,'staff switch suppresses stale response');
 assert(errors.length===0,errors.join('\n'));return {passed:true,realData:false,cases:['registered-body','create-update-delete','uncertain retry','duplicate round','conflict','permission','campus isolation','dirty guard','HTML escaping','desktop/mobile']};
}
try {command('open','about:blank');command('snapshot');const output=command('run-code',`async page=>{try{return await (${check.toString()})(page,${JSON.stringify(url)});}catch(error){await page.screenshot({path:'output/playwright/mock-management-failure.png',fullPage:true});throw error;}}`);const match=output.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!match||!JSON.parse(match[1]).passed)throw Error(output);console.log(match[1]);}finally{command('close');}
