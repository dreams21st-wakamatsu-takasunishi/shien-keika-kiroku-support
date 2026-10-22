// Local fixture + fictional data only. Never authenticates or writes live data.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];
if(!args.includes('--cli')||!cli)throw Error('--cli required');
mkdirSync('output/playwright',{recursive:true});
const session='activity-preview-'+Date.now();
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s='+session,...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page){
  let checks=0,saved=null,writes=0;const errors=[],external=[];
  const assert=(ok,label)=>{checks++;if(!ok)throw Error(label);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:1440,height:1000});
  await page.context().route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin==='http://127.0.0.1:3015')return route.continue();
    if(url.pathname.endsWith('/rest/v1/activity_plans')){
      if(route.request().method()==='GET')return route.fulfill({json:saved?[saved]:[]});
      writes++;saved={...route.request().postDataJSON(),id:'55555555-5555-4555-8555-555555555555',updated_at:'2026-10-22T00:00:00Z'};
      return route.fulfill({json:saved});
    }
    external.push(url.origin);return route.abort();
  });
  await page.goto('http://127.0.0.1:3015/tests/fixtures/input-visuals.html');
  const preview=page.getByRole('complementary',{name:'入力内容の仕上がりプレビュー',exact:true});
  await preview.waitFor();
  const input=label=>page.getByLabel(label,{exact:true});
  const tick=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const focus=async(label,key,index=0)=>{
    await input(label).nth(index).focus();await tick();
    const active=preview.locator('[data-active]');
    assert(await active.count()===1,'one highlighted field: '+label);
    assert(await active.getAttribute('data-activity-preview')===key,'correct highlighted field: '+label);
  };
  const editor=page.locator('.activity-input-pane');
  const left=await preview.boundingBox(),right=await editor.boundingBox();
  assert(left.x+left.width<=right.x+1,'preview left and editor right');
  assert(right.width>600&&left.width>600,'both panes usable at desktop width');
  await focus('開始時刻','startTime'); // Even before any steps exist.
  await page.getByRole('button',{name:'工作のひな形',exact:true}).click();
  for(const [label,key] of [['活動名（必須）','title'],['種類','supportItem'],['実施日（必須）','date'],['状態','status'],['活動のねらい','goal'],['支援項目','supportItem'],['内容（概要）','summary'],['対象・人数','targetLocation'],['活動場所','targetLocation'],['主担当','leader'],['開始時刻','startTime'],['職員人数（名）','staffCount'],['児童人数（名）','childCount'],['往復時間（分）','travelMinutes']])await focus(label,key);
  await input('活動名（必須）').fill('架空の活動・入力確認');
  await input('内容（概要）').fill('入力した概要がすぐ左の表に表示されます。');
  assert((await preview.locator('[data-activity-preview="summary"]').textContent()).includes('すぐ左'),'live summary reflection');
  const goal=input('活動のねらい');
  const initialHeight=await goal.evaluate(el=>el.offsetHeight);
  await goal.fill(Array.from({length:18},(_,i)=>`架空のねらい ${i+1}：文章の編集がしやすいことを確認します。`).join('\n'));
  await tick();
  assert(await goal.evaluate(el=>el.scrollHeight<=el.clientHeight+1),'long content fits expanded textarea');
  assert(await goal.evaluate(el=>el.offsetHeight)>initialHeight+100,'textarea expands automatically');
  assert(await goal.evaluate(el=>getComputedStyle(el).resize)==='vertical','manual vertical resizing available');
  const manualHeight=await goal.evaluate(el=>{el.style.height=(el.offsetHeight+100)+'px';return el.offsetHeight;});
  await goal.press('End');await goal.press('X');await tick();
  assert(await goal.evaluate(el=>el.offsetHeight)>=manualHeight,'manual larger size survives typing');
  await goal.fill('自分で選び、工夫を楽しむ。');
  await goal.evaluate(el=>{el.style.height='140px';});await tick();
  await preview.evaluate(el=>el.scrollIntoView({block:'start'}));
  const scrollBefore=await page.evaluate(()=>scrollY);
  await input('活動名（必須）').evaluate(el=>el.focus({preventScroll:true}));await tick();
  assert(await page.evaluate(()=>scrollY)===scrollBefore,'highlight never scrolls the document');
  assert(await input('活動名（必須）').evaluate(el=>el===document.activeElement),'preview does not steal focus');
  await page.getByRole('tab',{name:'2 活動の流れ',exact:true}).click();
  await focus('1番目の活動内容','step:step-0:title');
  assert(await input('1番目の活動内容').evaluate(el=>el.tagName)==='TEXTAREA','step title supports multiline editing');
  await input('1番目の活動内容').fill('見本を見て、今日の活動を確認する。');
  await focus('段階','step:step-0:time');
  await focus('所要時間（分）','step:step-0:time');
  await focus('支援・声かけ・配慮','step:step-0:support');
  await input('支援・声かけ・配慮').first().fill('手順を絵で示し、必要なときに声をかける。');
  await focus('2番目の活動内容','step:step-1:title');
  await page.getByRole('button',{name:'2番目の流れを上へ',exact:true}).click();
  await focus('1番目の活動内容','step:step-1:title');
  assert(await preview.locator('.activity-sheet-flow tbody tr').first().locator('td').nth(1).getAttribute('data-activity-preview')==='step:step-1:title','reordered rows keep correct identity');
  await page.getByRole('tab',{name:'3 準備・安全',exact:true}).click();
  for(const label of ['1. 準備済み','準備物・確認事項','数量','担当'])await focus(label,'prep:prep-0');
  for(const [label,key] of [['職員の役割分担','roles'],['参加しやすくする配慮','considerations'],['安全確認・緊急時の対応','safety']])await focus(label,key);
  assert(await preview.locator('[data-active]').evaluate(el=>{const r=el.getBoundingClientRect(),s=el.closest('.activity-preview-scroll').getBoundingClientRect();return r.top>=s.top&&r.top<s.bottom;}),'preview independently reveals the active lower note');
  await input('安全確認・緊急時の対応').fill('道具の数、活動場所、見守り体制を確認する。');
  await page.getByRole('tab',{name:'4 振り返り',exact:true}).click();
  await focus('実施後の振り返り','reflection');await input('実施後の振り返り').fill('架空の振り返り。');
  await focus('次回に活かすこと','nextTime');await input('次回に活かすこと').fill('次回の準備も確認する。');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await page.getByRole('status').filter({hasText:'事業所の活動・指導案として保存'}).waitFor();
  assert(saved.content.reflection==='架空の振り返り。'&&saved.content.summary.includes('すぐ左'),'saved content unchanged by UI');
  assert(writes===1,'focus and preview do not issue autosave writes');
  await page.getByRole('button',{name:'プレビューを収納',exact:true}).click();
  assert(await preview.count()===0,'preview can be collapsed');
  assert((await editor.boundingBox()).width>1200,'collapsed preview returns full editor width');
  await page.getByRole('button',{name:'プレビュー・印刷',exact:true}).click();
  await page.getByRole('tab',{name:'1 基本情報',exact:true}).click();
  await input('活動のねらい').focus();await tick();
  await preview.evaluate(el=>el.scrollIntoView({block:'start'}));
  await page.screenshot({path:'output/playwright/activity-live-preview-desktop.png'});
  for(const [width,height,name] of [[1024,768,'tablet-landscape'],[768,1024,'tablet'],[390,844,'mobile']]){
    await page.setViewportSize({width,height});await tick();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow: '+name);
    const a=await preview.boundingBox(),b=await editor.boundingBox();
    assert(width>=1024?a.x+a.width<=b.x+1:a.y+a.height<=b.y+1,'responsive panes: '+name);
    await preview.evaluate(el=>el.scrollIntoView({block:'start'}));
    await page.screenshot({path:`output/playwright/activity-live-preview-${name}.png`});
  }
  await page.emulateMedia({media:'print'});
  assert(await preview.isHidden(),'editing preview hidden for print');
  const printSheet=page.locator('.activity-print-only');
  assert(await printSheet.isVisible(),'original print sheet retained');
  assert(await printSheet.locator('[data-active]').count()===0,'focus highlight excluded from print');
  await page.pdf({path:'output/playwright/activity-live-preview-print.pdf',format:'A4',printBackground:true,margin:{top:'8mm',bottom:'8mm',left:'8mm',right:'8mm'}});
  assert(!errors.length,'no browser errors: '+errors.join(','));
  assert(!external.length,'no production requests');
  return {passed:true,checks,productionAccess:false,saveWrites:writes};
}
try{command('open','about:blank');command('snapshot');const out=command('run-code',`async(page)=>await (${check.toString()})(page)`),match=out.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!match||!JSON.parse(match[1]).passed)throw Error(out);console.log(match[1]);}finally{command('close');}
