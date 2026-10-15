// Local synthetic screens only. Never signs in or reads/writes production data.
import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];
if(!args.includes('--cli')||!cli)throw Error('--cli required');
const session='contextual-manual-'+Date.now(),base='http://127.0.0.1:3014/';
mkdirSync('output/playwright',{recursive:true});
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s='+session,...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page,base){
 page.setDefaultTimeout(10000);
 let checks=0;const assert=(ok,label)=>{checks++;if(!ok)throw Error(label);},errors=[],writes=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.context().route('https://**',route=>{if(!['GET','HEAD'].includes(route.request().method()))writes.push(route.request().url());return route.abort();});
 const fixture=base+'tests/fixtures/manual-workspace.html?screen=',nav=()=>page.getByRole('navigation',{name:'この画面のマニュアル',exact:true}).first();
 const topic=async(expected)=>{await nav().waitFor();assert(await nav().getAttribute('data-manual-topic')===expected,'topic '+expected);};
 const screens={menu:'home',dailyChanges:'daily-change',todayWork:'today',attendance:'attendance',calendar:'calendar',monthlySchedule:'monthly',dispatch:'dispatch',operations:'record-status',communication:'announcements',assistant:'assistant',form:'record-select',records:'record-list',children:'children',activityPlans:'activity',trafficCost:'traffic',facilityWork:'inspection',learning:'learning',templates:'record-settings',team:'staff',auth:'login',meetings:'meeting'};
 for(const [screen,expected] of Object.entries(screens)){
  await page.setViewportSize({width:1366,height:768});await page.goto(fixture+screen);await topic(expected);
  assert(await nav().getByRole('link',{name:/^操作マニュアル：/}).getAttribute('href')==='/manuals/d-support/index.html#'+expected,'exact chapter '+screen);
  assert(await nav().getByRole('link').evaluateAll(links=>links.every(link=>link.target==='_blank'&&link.rel.includes('noopener')&&link.rel.includes('noreferrer')&&!link.href.includes('?'))),'safe new tabs '+screen);
  await page.setViewportSize({width:390,height:844});await nav().scrollIntoViewIfNeeded();
  assert(await nav().evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}),'help fits mobile '+screen);
 }
 await page.setViewportSize({width:1366,height:768});await page.goto(fixture+'communication');await page.getByRole('button',{name:/^朝礼/}).click();await topic('morning');await page.getByRole('button',{name:/^申し送り/}).click();await topic('handover');
 await page.goto(fixture+'attendance&part=1');await page.getByRole('button',{name:'希望提出',exact:true}).click();await topic('shift-request');await page.getByRole('button',{name:/シフト作成/}).click();await topic('shift-create');await page.getByRole('button',{name:'打刻・実績',exact:true}).click();await topic('attendance-correct');
 await page.goto(fixture+'facilityWork');await page.getByRole('tab',{name:'備品・補充',exact:true}).click();await topic('supplies');await page.getByRole('tab',{name:'おたより',exact:true}).click();await topic('newsletter');
 await page.goto(fixture+'learning');await page.getByRole('tab',{name:'児童別進捗',exact:true}).click();await topic('lesson-progress');await page.getByRole('tab',{name:'課題の指定',exact:true}).click();await topic('lesson-task');await page.getByRole('tab',{name:'Word確認',exact:true}).click();await topic('lesson-word');await page.getByRole('tab',{name:'アカウント連携',exact:true}).click();await topic('lesson-account');
 await page.goto(fixture+'templates');await page.getByRole('button',{name:/学校台帳/}).click();await topic('schools');await page.getByRole('button',{name:'設定一覧に戻る',exact:true}).click();await page.getByRole('button',{name:/車両台帳/}).click();await topic('vehicles');
 await page.goto(fixture+'team');await page.getByRole('tab',{name:/端末・アクセス/}).click();await topic('devices');await page.getByRole('tab',{name:/メール招待/}).click();await topic('invitation-audit');
 await page.goto(fixture+'qr');await page.getByRole('button',{name:'事業所で本人用QRを読み取る',exact:true}).click();await topic('qr-punch');
 await page.goto(fixture+'training');await topic('legal-training');await page.getByRole('button',{name:'この職員で受講する',exact:true}).click();await topic('legal-training');
 await page.goto(fixture+'personalActual');await topic('field');await page.getByRole('button',{name:'本人用QRを表示',exact:true}).click();await page.getByRole('dialog',{name:'本人用QRコード',exact:true}).getByRole('navigation',{name:'この画面のマニュアル',exact:true}).waitFor();assert(await page.getByRole('dialog',{name:'本人用QRコード',exact:true}).locator('[data-manual-topic="qr-punch"]').isVisible(),'personal QR dialog includes guide');
 await page.goto(base+'tests/fixtures/operations-workspace.html');await topic('dispatch');assert(await nav().getByRole('link',{name:/^操作マニュアル：/}).isVisible(),'guide is visible inside fullscreen dispatch modal');
 await page.goto(fixture+'activityPlans');const title=page.getByLabel('活動名（必須）',{exact:true});await title.fill('入力保持の確認（架空データ）');const beforeUrl=page.url();
 const popupPromise=page.waitForEvent('popup');await nav().getByRole('link',{name:/^操作マニュアル：/}).click();const popup=await popupPromise;await popup.waitForLoadState('domcontentloaded');assert(popup.url().endsWith('index.html#activity'),'opens exact manual in another tab');assert(await popup.locator('#activity').isVisible(),'manual chapter exists');await popup.close();assert(page.url()===beforeUrl&&await title.inputValue()==='入力保持の確認（架空データ）','editing screen and draft stay unchanged');
 await page.screenshot({path:'output/playwright/contextual-manual-laptop.png'});
 await page.setViewportSize({width:390,height:844});await nav().scrollIntoViewIfNeeded();await nav().locator('summary').click();assert(await nav().locator('details').getAttribute('open')!==null,'related menu opens');const menu=await nav().locator('details > div').boundingBox();assert(menu.x>=0&&menu.x+menu.width<=390,'related menu stays in mobile viewport');await page.screenshot({path:'output/playwright/contextual-manual-mobile.png'});await page.keyboard.press('Escape');assert(await nav().locator('details').getAttribute('open')===null,'Escape closes menu');
 await page.emulateMedia({media:'print'});assert(!await nav().isVisible(),'manual controls are omitted from printed output');await page.emulateMedia({media:'screen'});
 assert(!errors.length,'browser exceptions '+errors.join(','));
 return {passed:true,checks,screens:Object.keys(screens).length,productionAccess:false,blockedExternalRequests:writes.length};
}
try{command('open',base+'tests/fixtures/manual-workspace.html?screen=menu');command('snapshot');const output=command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(base)})`);const match=output.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!match||!JSON.parse(match[1]).passed)throw Error(output);console.log(match[1]);}finally{command('close');}
