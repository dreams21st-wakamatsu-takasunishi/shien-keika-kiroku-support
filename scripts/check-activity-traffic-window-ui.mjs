import {spawnSync} from 'node:child_process';import {resolve} from 'node:path';import {mkdirSync} from 'node:fs';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];if(!args.includes('--cli'))throw Error('--cli required');const session='traffic-window-'+Date.now();mkdirSync('output/playwright',{recursive:true});
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s='+session,...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page){let checks=0,writes=0;const errors=[],external=[];const assert=(ok,label)=>{checks++;if(!ok)throw Error(label);};page.on('pageerror',e=>errors.push(e.message));
 await page.context().route('**/*',route=>{const url=new URL(route.request().url());if(url.origin==='http://127.0.0.1:3015')return route.continue();if(url.pathname.endsWith('/rest/v1/activity_plans')&&route.request().method()==='GET')return route.fulfill({json:[]});external.push(url.origin);writes++;return route.abort();});
 await page.setViewportSize({width:1366,height:768});await page.goto('http://127.0.0.1:3015/tests/fixtures/input-visuals.html');
 const title=page.getByLabel('活動名（必須）',{exact:true});await title.fill('架空の外出活動・未保存');
 const open=page.getByRole('button',{name:'交通費を計算',exact:true});await open.click();const panel=page.getByRole('complementary',{name:'交通費計算の小窓',exact:true});await panel.waitFor();
 assert(await title.inputValue()==='架空の外出活動・未保存','opening companion preserves editor');assert(await page.getByRole('heading',{name:'活動・指導案',exact:true}).isVisible(),'does not navigate away');
 const distance=panel.getByLabel('距離（km）',{exact:true});await distance.fill('8.5');await panel.getByLabel('利用児童数（名）',{exact:false}).fill('8');
 assert(await panel.getByRole('button',{name:'結果をコピー',exact:true}).isEnabled(),'same calculator produces valid result');
 assert(await panel.getByRole('button',{name:'印刷',exact:true}).count()===0,'companion cannot print over activity sheet');
 assert(!await panel.getByRole('group',{name:'使用車両と燃費',exact:true}).isVisible(),'advanced settings initially collapsed');
 await panel.getByRole('button',{name:/使用車両.*変更/}).click();assert(await panel.getByRole('checkbox',{name:'フリード',exact:true}).isVisible(),'vehicle settings available');
 await panel.getByRole('button',{name:/使用車両.*収納/}).click();
 const before=await panel.boundingBox();const move=panel.getByRole('button',{name:'交通費計算の小窓を移動',exact:true});await move.focus();await move.press('ArrowLeft');assert((await panel.boundingBox()).x<before.x,'keyboard move available');
 await panel.getByRole('button',{name:'交通費計算を拡大',exact:true}).click();assert((await panel.boundingBox()).width>1200,'expand uses screen');await panel.getByRole('button',{name:'交通費計算を小窓に戻す',exact:true}).click();assert((await panel.boundingBox()).width<500,'restores compact window');
 await title.fill('小窓を開いたまま指導案を編集');assert(await distance.inputValue()==='8.5','editing underlying plan preserves calculator');
 await page.screenshot({path:'output/playwright/activity-traffic-window-desktop.png'});
 await panel.getByRole('button',{name:'交通費計算を閉じる',exact:true}).click();assert(await panel.isHidden(),'close hides companion');await open.click();assert(await distance.inputValue()==='8.5','reopening retains calculation');assert(await title.inputValue()==='小窓を開いたまま指導案を編集','reopening retains plan');
 await panel.getByRole('button',{name:'交通費計算の小窓を移動',exact:true}).press('Escape');assert(await panel.isHidden(),'Escape closes window only');await open.click();
 await page.emulateMedia({media:'print'});assert(await panel.isHidden(),'companion excluded from print');assert(await page.locator('.activity-print-only').isVisible(),'original activity print sheet visible');await page.emulateMedia({media:'screen'});
 for(const width of [768,390]){await page.setViewportSize({width,height:844});await page.waitForTimeout(100);const r=await panel.boundingBox();assert(r.x>=0&&r.x+r.width<=width,'window fits '+width);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page has no horizontal overflow '+width);}
 await page.screenshot({path:'output/playwright/activity-traffic-window-mobile.png'});assert(!errors.length,'no browser errors: '+errors.join(','));assert(!external.length&&!writes,'no production requests or writes');return{passed:true,checks,productionAccess:false,writes};
}
try{command('open','about:blank');command('snapshot');const out=command('run-code',`async(page)=>await (${check.toString()})(page)`),m=out.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!m||!JSON.parse(m[1]).passed)throw Error(out);console.log(m[1]);}finally{command('close');}
