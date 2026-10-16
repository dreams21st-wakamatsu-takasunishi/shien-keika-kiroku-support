import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1],url='http://127.0.0.1:5178/tests/fixtures/managed-content.html';
if(!args.includes('--cli'))throw Error('--cli required');
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s=lesson-content-student',...args],{encoding:'utf8',timeout:120000,maxBuffer:4194304});if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page,url){
 const assert=(v,label)=>{if(!v)throw Error(label);};const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.context().route('https://*.supabase.co/**',route=>route.abort());
 await page.goto(url);await page.getByText('架空校舎Aの課題',{exact:true}).first().waitFor();
 assert(await page.getByText('架空校舎Bの課題',{exact:true}).count()===0,'no other campus task');
 assert(await page.getByText('非表示の課題',{exact:true}).count()===0,'no hidden task');assert(await page.getByText('別グループ',{exact:true}).count()===0,'group restriction');
 const state=await page.evaluate(()=>window.contentFixture.state());assert(state.theme.includes('ct_present')&&!state.draw.includes('ct_present'),'present not in draw');assert(state.draw.includes('ce_gacha')&&!state.draw.includes('ce_hidden'),'gacha/hidden separation');
 assert(await page.locator('img').count()===0,'effect icon escaped');
 await page.locator('.text-task-card').first().click();await page.getByText('課題の確認と設定',{exact:true}).waitFor();assert(await page.locator('#text-prep-modal img').count()===0,'task preview escaped');
 await page.evaluate(()=>{document.getElementById('text-prep-modal').remove();window.contentFixture.select('student_b');});await page.getByText('架空校舎Bの課題',{exact:true}).first().waitFor();
 const next=await page.evaluate(()=>window.contentFixture.state());assert(next.theme.length===0&&next.effects.length===0&&next.draw.length===0,'switch clears custom arrays');assert(await page.getByText('架空校舎Aの課題',{exact:true}).count()===0,'switch clears task');
 await page.evaluate(()=>window.contentFixture.select('student_a'));await page.getByText('架空校舎Aの課題',{exact:true}).first().waitFor();
 const again=await page.evaluate(()=>window.contentFixture.state());assert(again.draw.filter(id=>id==='ce_gacha').length===1,'no duplicate draws');
 assert(errors.length===0,errors.join('\n'));await page.evaluate(()=>{window.__studentContentPassed=true;});return {passed:true,fictional:true};
}
try{command('open',url,'--browser','chrome');command('run-code',`async page => (${check.toString()})(page,${JSON.stringify(url)})`);if(!/### Result\s+true/.test(command('eval','() => window.__studentContentPassed === true')))throw Error('Student verification did not finish');console.log('PASS: real student renderers consume scoped tasks and custom rewards; group/hide/gacha/present, escaping, learner switch and no duplicate draws');}finally{command('close');}
