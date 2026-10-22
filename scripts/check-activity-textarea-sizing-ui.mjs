// Isolated real editor; only fictional data and a stubbed backend are used.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];
if(!args.includes('--cli')||!cli)throw Error('--cli required');
const session='activity-sizing-'+Date.now(),diagnose=args.includes('--diagnose');
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s='+session,...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page,diagnose){
  const errors=[],external=[],results=[];let checks=0,writes=0;
  const assert=(ok,label)=>{checks++;if(!ok)throw Error(label);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.context().route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin==='http://127.0.0.1:3015')return route.continue();
    if(url.pathname.endsWith('/rest/v1/activity_plans')&&route.request().method()==='GET')return route.fulfill({json:[]});
    external.push(url.origin);writes++;return route.abort();
  });
  await page.goto('http://127.0.0.1:3015/tests/fixtures/input-visuals.html');
  const goal=page.getByLabel('活動のねらい',{exact:true});await goal.waitFor();
  const sample=()=>goal.evaluate(async el=>{
    const heights=[];
    for(let i=0;i<45;i++){await new Promise(resolve=>requestAnimationFrame(resolve));heights.push(el.offsetHeight);}
    return {first:heights[0],last:heights.at(-1),range:Math.max(...heights.slice(8))-Math.min(...heights.slice(8)),scrollHeight:el.scrollHeight,clientHeight:el.clientHeight};
  });
  for(const zoom of [1,0.67,0.75,0.8,0.9,1.1,1.25,1.5]){
    await page.evaluate(zoom=>document.documentElement.style.zoom=String(zoom),zoom);
    await goal.evaluate(el=>el.style.height='112px');
    const result={zoom,...await sample()};results.push(result);
    if(!diagnose){
      assert(result.range<=1,'height stable at zoom '+zoom+': '+JSON.stringify(result));
      await goal.fill(Array.from({length:12},(_,i)=>`架空の長文 ${i+1}：表示倍率が変わっても高さが安定する。`).join('\n'));
      const long=await sample();assert(long.range<=1&&long.scrollHeight<=long.clientHeight+1,'long input stable and visible at zoom '+zoom);
      await goal.fill('短い入力。');
      await goal.evaluate(el=>el.style.height='160px');
      const before=(await sample()).last;
      for(let i=0;i<12;i++)await goal.fill('短い入力。'+(i%2?'a':'b'));
      const repeated=await sample();assert(repeated.range<=1&&Math.abs(repeated.last-before)<=1,'repeated short edits cannot accumulate height at zoom '+zoom);
      await goal.fill('');
    }
  }
  if(!diagnose){
    await page.evaluate(()=>document.documentElement.style.zoom='1.25');
    await goal.fill(Array.from({length:20},(_,i)=>`架空の文章 ${i+1}：長文でも入力内容が隠れないことを確認。`).join('\n'));
    let result=await sample();assert(result.range<=1,'long input stabilizes');assert(result.scrollHeight<=result.clientHeight+1,'long input fits');
    const manual=await goal.evaluate(el=>{el.style.height=(parseFloat(getComputedStyle(el).height)+100)+'px';return el.offsetHeight;});
    await goal.press('End');await goal.press('X');result=await sample();assert(result.range<=1&&result.last>=manual,'larger manual resize preserved without growth loop');
    await goal.fill('短い入力。');
    await goal.evaluate(el=>el.style.height='180px');result=await sample();assert(result.range<=1&&Math.abs(result.last-180)<=1,'manual shrink remains stable');
    for(const width of [768,390,1440]){
      await page.setViewportSize({width,height:1000});result=await sample();assert(result.range<=1,'stable after viewport resize '+width);
    }
    assert(await goal.inputValue()==='短い入力。','sizing preserves input');
    assert(!errors.length,'no browser or resize loop errors: '+errors.join(','));assert(!external.length&&!writes,'no production requests or writes');
  }
  return {passed:diagnose?undefined:true,checks,results,errors,productionAccess:false,writes};
}
try{command('open','about:blank');command('snapshot');const out=command('run-code',`async(page)=>await (${check.toString()})(page,${diagnose})`),match=out.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!match)throw Error(out);console.log(match[1]);}finally{command('close');}
