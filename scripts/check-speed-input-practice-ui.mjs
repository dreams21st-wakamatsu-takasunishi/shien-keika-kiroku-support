import {spawnSync} from 'node:child_process';import {copyFileSync,mkdirSync} from 'node:fs';import {resolve} from 'node:path';import {lessonRoot} from './lesson-operation-client.mjs';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];if(!args.includes('--cli')||!cli)throw Error('--cli required');
mkdirSync(resolve(lessonRoot,'output'),{recursive:true});
copyFileSync(new URL('../docs/lesson-content/speed-input-mock-20261019.json',import.meta.url),resolve(lessonRoot,'output/speed-input-questions.json'));
copyFileSync(new URL('../tests/fixtures/speed-input-practice.html',import.meta.url),resolve(lessonRoot,'output/speed-input-fixture.html'));
const session='speed-input-'+Date.now(),url='http://127.0.0.1:5178/output/speed-input-fixture.html';mkdirSync('output/playwright',{recursive:true});
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s='+session,...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page,url){
 let checks=0;const assert=(ok,label)=>{checks++;if(!ok)throw Error(label);},errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:5178')&&!r.url().startsWith('data:'))external.push(r.url());});
 await page.context().route('https://**',r=>r.abort());
 await page.setViewportSize({width:1366,height:900});await page.goto(url);await page.locator('.text-task-card').first().waitFor();const tasks=await page.evaluate(()=>window.__speedInputTasks);
 for(let i=0;i<tasks.length;i++){
  const task=tasks[i];await page.goto(url);await page.locator('.text-task-card').first().waitFor();
  let card=page.locator('.text-task-card').filter({hasText:task.title});if(!await card.count())await page.getByRole('button',{name:'つぎ ▶',exact:true}).click();
  card=page.locator('.text-task-card').filter({hasText:task.title});assert(await card.count()===1,'unique selectable task '+i);assert((await card.innerText()).includes('10分'),'ten-minute task '+i);
  await card.click();await page.getByRole('heading',{name:'課題の確認と設定',exact:true}).waitFor();await page.getByRole('button',{name:'スタート！',exact:true}).click();await page.locator('#text-start-overlay').waitFor();await page.waitForTimeout(350);await page.keyboard.press('Space');await page.locator('#type-text-box').waitFor({state:'visible'});await page.waitForFunction(()=>!document.getElementById('type-text-box').disabled);
  const plain=task.content.replace(/\{([^{}|]+)\|[^{}]+\}/g,'$1');
  assert(await page.locator('#ref-text-box ruby').count()>100,'readings rendered '+i);
  const rendered=await page.locator('#ref-text-box').evaluate(el=>[...el.querySelectorAll('span')].map(s=>s.textContent).join('').replaceAll('↵','\n').replaceAll('\u00a0','　'));
  assert(rendered===plain,'complete original prose rendered '+i);
  await page.locator('#type-text-box').fill(plain.slice(0,100));assert(await page.locator('#ref-text-box .text-done').count()===100,'input navigation follows plain text '+i);
  await page.locator('#btn-toggle-ruby').click();assert(await page.locator('#ref-text-box ruby').count()===0,'reading toggle works '+i);await page.locator('#btn-toggle-ruby').click();
  assert(!/[{}|]/.test(await page.locator('#ref-text-box').textContent()),'no markup leakage '+i);
  if(i===0){await page.screenshot({path:'output/playwright/speed-input-mock-laptop.png'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/playwright/speed-input-mock-phone.png'});await page.setViewportSize({width:1366,height:900});}
 }
 assert(!errors.length,'browser errors '+errors.join(','));assert(!external.length,'no external requests');return {passed:true,checks,tasks:tasks.length,productionAccess:false,resultSaved:false};
}
try{command('open',url);command('snapshot');const out=command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(url)})`),match=out.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!match||!JSON.parse(match[1]).passed)throw Error(out);console.log(match[1]);}finally{command('close');}
