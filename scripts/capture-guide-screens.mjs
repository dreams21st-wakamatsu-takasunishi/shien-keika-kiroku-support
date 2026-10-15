// Capture only localhost synthetic fixtures. Never signs in or writes production.
import {spawnSync} from 'node:child_process';
import {mkdirSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];
if(!args.includes('--cli')||!cli)throw Error('--cli required');
mkdirSync('output/playwright',{recursive:true});
const session='guide-capture-'+Date.now();
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s='+session,...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function capture(page){
 const base='http://127.0.0.1:3014',errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.context().route('https://**',route=>route.abort());
 await page.addInitScript(()=>localStorage.clear());
 await page.setViewportSize({width:1366,height:900});
 const shot=async(name,locator)=>{await page.evaluate(()=>document.fonts.ready);await (locator||page).screenshot({path:'output/playwright/guide-2026-10-15-'+name+'.png',animations:'disabled'});};
 for(const screen of ['menu','form','monthlySchedule','attendance','calendar','todayWork','records','children','trafficCost','auth']){
  await page.goto(base+'/tests/fixtures/manual-workspace.html?screen='+screen);await page.waitForFunction(()=>document.body.innerText.length>100);
  if(screen==='form'){await page.getByRole('button',{name:'次の質問',exact:true}).click();await page.getByRole('button',{name:/^サンプル児童Ａ /}).click();await page.getByRole('button',{name:/^サンプル児童Ｂ /}).click();}
  await shot(screen);
 }
 for(const [screen,name] of [['diagnostics','diagnostics'],['training','legal-training-settings'],['services','service-types'],['task','lesson-task'],['account','lesson-account'],['registration','lesson-new']]){
  await page.goto(base+'/tests/fixtures/manual-extra.html?screen='+screen);await page.locator('main h1').waitFor();
  if(screen==='diagnostics'){await page.locator('details').first().click();}
  if(screen==='task'){await page.getByLabel('課題の分野',{exact:true}).selectOption('keyboard');await page.getByLabel('課題のステージ',{exact:true}).selectOption('4301');await page.getByLabel('課題名',{exact:true}).fill('ことば入力に取り組む');await page.getByLabel('取り組む内容',{exact:true}).fill('正確さを意識して、終わったら職員に知らせる。');}
  if(screen==='account'){await page.getByRole('button',{name:'アカウント設定を確認',exact:true}).click();await page.getByRole('form',{name:'ログインカードの確認'}).waitFor();}
  if(screen==='registration')await page.getByLabel('新規登録先校舎',{exact:true}).waitFor();
  if(screen==='training')await page.getByText('サンプル研修動画',{exact:true}).waitFor();
  if(screen==='services')await page.getByRole('checkbox').first().waitFor();
  await shot(name,page.locator('main'));
 }
 await page.goto(base+'/tests/fixtures/operations-workspace.html?timeline=segments');
 const timeline=page.getByRole('region',{name:'勤務・児童・送迎の一日ガント',exact:true});await timeline.waitFor();await shot('dispatch-overview');
 await page.getByRole('button',{name:'便を選択：迎え1便・車両A',exact:true}).click();
 const editor=page.getByRole('complementary',{name:'送迎編集の小窓',exact:true});await editor.waitFor();await page.waitForTimeout(350);await shot('dispatch-time-current',editor);
 await editor.getByRole('button',{name:'収納',exact:true}).click();await page.waitForTimeout(350);
 await timeline.getByRole('button',{name:'14:00 確認児童A・確認児童C',exact:true}).click();await page.getByRole('button',{name:'確認児童A・14:00',exact:true}).click();
 await editor.getByRole('button',{name:/^車両A 総定員/}).click();await editor.getByRole('button',{name:'次へ',exact:true}).click();await page.waitForTimeout(350);await shot('dispatch-wizard',editor);
 await page.goto(base+'/tests/fixtures/record-save-recovery.html?mode=uncertain');const save=page.getByRole('button',{name:/・1名分のみ保存$/});await save.waitFor();
 const ack=page.getByRole('checkbox',{name:'点検結果を確認しました'});if(await ack.count())await ack.check();await save.click();await page.getByRole('alert').filter({hasText:'通信できないため'}).waitFor();await shot('save-error');
 await page.goto(base+'/tests/fixtures/record-save-recovery.html?mode=different');await save.waitFor();if(await ack.count())await ack.check();await save.click();await page.getByRole('dialog').waitFor();await shot('save-compare');
 if(errors.length)throw Error(errors.join('\n'));
 return {passed:true,screenshots:21,syntheticOnly:true,productionReads:false,productionWrites:false};
}
try{command('open','http://127.0.0.1:3014/tests/fixtures/manual-extra.html');command('snapshot');const output=command('run-code',`async(page)=>(${capture.toString()})(page)`);const result=output.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!result||!JSON.parse(result[1]).passed)throw Error(output);console.log(result[1]);
 for(const [name,source] of [['lesson-progress','lesson-progress-desktop.png'],['lesson-batch','task-batch-partial-desktop.png'],['lesson-batch-change','task-batch-edit-partial-desktop.png']])copyFileSync('output/playwright/'+source,'output/playwright/guide-2026-10-15-'+name+'.png');
}finally{command('close');}
