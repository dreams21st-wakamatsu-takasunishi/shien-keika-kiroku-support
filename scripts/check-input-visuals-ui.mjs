// Synthetic local UI only. Never signs in or changes production data.
import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];
const url=new URL(args.includes('--url')?args[args.indexOf('--url')+1]:'http://127.0.0.1:3015/tests/fixtures/input-visuals.html');
if(!args.includes('--cli')||!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/tests/fixtures/input-visuals.html')throw Error('Local fixture and --cli required');
mkdirSync('output/playwright',{recursive:true});
const session='input-visuals-'+Date.now();
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s='+session,...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page,url){
 const assert=(ok,label)=>{if(!ok)throw Error(label);};const coverage=[],errors=[];let saved=null,failSave=false,writes=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window),guards=new Set();
  window.addEventListener=(type,listener,options)=>{if(type==='beforeunload')guards.add(listener);add(type,listener,options);};
  window.removeEventListener=(type,listener,options)=>{if(type==='beforeunload')guards.delete(listener);remove(type,listener,options);};
  window.removeFixtureExitGuards=()=>{for(const guard of guards)remove('beforeunload',guard);guards.clear();};
 });
 await page.context().route('https://*.supabase.co/**',route=>route.abort());
 await page.context().route('**/rest/v1/**',async route=>{
  const request=route.request(),uri=new URL(request.url()),table=uri.pathname.split('/').at(-1);
  assert(['activity_plans','facility_documents','supply_items','supply_movements'].includes(table),'only fixture data');
  if(request.method()==='GET')return route.fulfill({json:table==='activity_plans'&&saved?[saved]:[]});
  assert(table==='activity_plans','only activity save permitted');writes++;
  if(failSave)return route.fulfill({status:500,json:{message:'架空の通信エラー'}});
  const data=request.postDataJSON();assert(data.revision===(saved?.revision||0)+1||!saved,'revision increments');
  saved={...saved,...data,id:saved?.id||'55555555-5555-4555-8555-555555555555',revision:saved?saved.revision+1:1,updated_at:'2026-10-06T03:00:00Z'};
  return route.fulfill({json:saved});
 });
 await page.goto(url);await page.getByRole('heading',{name:'活動・指導案',exact:true}).waitFor();await page.setViewportSize({width:1440,height:1000});
 assert(await page.getByRole('button',{name:'保存した案を開く',exact:true}).getAttribute('aria-expanded')==='false','saved library starts closed');
 assert(await page.getByRole('tab').count()===4,'four workflow steps');assert(await page.getByRole('tab',{name:'1 基本情報',exact:true}).getAttribute('aria-selected')==='true','basic step starts selected');
 const blue='rgb(237, 245, 255)',bg=async locator=>locator.evaluate(el=>getComputedStyle(el).backgroundColor);
 assert(await bg(page.getByLabel('活動名（必須）',{exact:true}))===blue,'activity field highlighted');
 const editorWidth=await page.getByLabel('活動名（必須）',{exact:true}).evaluate(el=>el.closest('fieldset').getBoundingClientRect().width);assert(editorWidth>1200,'full-width editor without side library');
 coverage.push('collapsed saved library','four numbered workflow steps','full-width editor','activity input color');
 await page.getByRole('button',{name:'工作のひな形',exact:true}).click();await page.getByLabel('活動名（必須）',{exact:true}).fill('架空の工作活動');await page.getByLabel('活動のねらい',{exact:true}).fill('架空のねらい');await page.getByLabel('職員人数（名）',{exact:true}).fill('2');await page.getByLabel('児童人数（名）',{exact:true}).fill('8');
 const names=await page.getByRole('tabpanel').locator('label').allTextContents();assert(names.findIndex(t=>t.startsWith('活動のねらい'))<names.findIndex(t=>t.startsWith('職員人数')),'goal precedes implementation conditions');
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'output/playwright/activity-workflow-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'次へ：活動の流れ',exact:true}).click();await page.getByRole('tabpanel',{name:'2 活動の流れ',exact:true}).waitFor();await page.getByLabel('1番目の活動内容',{exact:true}).fill('架空の手順');await page.getByLabel('開始時刻',{exact:true}).fill('15:00');await page.getByLabel('所要時間（分）',{exact:true}).first().fill('7');
 await page.getByRole('button',{name:'前の手順',exact:true}).click();assert(await page.getByLabel('活動名（必須）',{exact:true}).inputValue()==='架空の工作活動','basic values preserved across steps');assert(await page.getByLabel('開始時刻',{exact:true}).inputValue()==='15:00','shared start time persists');
 await page.getByRole('tab',{name:'2 活動の流れ',exact:true}).click();assert(await page.getByLabel('1番目の活動内容',{exact:true}).inputValue()==='架空の手順','flow values preserved');
 await page.getByRole('button',{name:'次へ：準備・安全',exact:true}).click();await page.getByRole('checkbox',{name:'1. 準備済み',exact:true}).check();await page.getByLabel('安全確認・緊急時の対応',{exact:true}).fill('架空の安全確認');
 await page.getByRole('button',{name:'次へ：振り返り',exact:true}).click();await page.getByLabel('実施後の振り返り',{exact:true}).fill('架空の振り返り');await page.getByRole('button',{name:'保存',exact:true}).click();await page.getByRole('status').filter({hasText:'事業所の活動・指導案として保存'}).waitFor();
 assert(saved.content.goal==='架空のねらい'&&saved.content.steps[0].title==='架空の手順'&&saved.content.startTime==='15:00'&&saved.content.steps[0].minutes===7&&saved.content.safety==='架空の安全確認'&&saved.content.preparations[0].done&&saved.content.reflection==='架空の振り返り','all steps save unchanged');
 assert(await page.getByLabel('試験：未保存状態',{exact:true}).textContent()==='変更なし','save clears dirty state');coverage.push('template reuse','goal-first field order','next and previous navigation','step values retained','shared start time','preparation check','all sections saved','dirty-state tracking');
 await page.getByRole('button',{name:'全体をプレビューで確認',exact:true}).click();await page.getByRole('button',{name:'印刷・PDF保存',exact:true}).waitFor();assert(await page.locator('.activity-sheet').first().innerText().then(t=>t.includes('架空の工作活動')&&t.includes('架空の手順')),'existing sheet includes new data');coverage.push('unchanged sheet preview');
 await page.getByRole('button',{name:'保存した案を開く',exact:true}).click();await page.getByLabel('案を検索',{exact:true}).fill('架空の工作活動');const library=page.locator('#activity-plan-library');await library.getByRole('button').filter({hasText:'架空の工作活動'}).first().click();assert(await page.getByRole('tab',{name:'1 基本情報',exact:true}).getAttribute('aria-selected')==='true','library returns to first step');assert(await page.getByLabel('活動のねらい',{exact:true}).inputValue()==='架空のねらい','saved plan reopens unchanged');coverage.push('search and reopen saved plan');
 await page.getByRole('tab',{name:'1 基本情報',exact:true}).focus();await page.keyboard.press('ArrowRight');assert(await page.getByRole('tab',{name:'2 活動の流れ',exact:true}).getAttribute('aria-selected')==='true','keyboard step navigation');await page.keyboard.press('Home');coverage.push('keyboard tabs');
 await page.getByLabel('活動名（必須）',{exact:true}).fill('架空の未保存案');await page.evaluate(()=>{window.confirm=()=>false;});await page.getByRole('button',{name:'空白から作成',exact:true}).click();assert(await page.getByLabel('活動名（必須）',{exact:true}).inputValue()==='架空の未保存案','cancel prevents replacement');
 failSave=true;await page.getByRole('button',{name:'保存',exact:true}).click();await page.getByRole('alert').filter({hasText:'架空の通信エラー'}).waitFor();assert(await page.getByLabel('活動名（必須）',{exact:true}).inputValue()==='架空の未保存案','save failure retains input');failSave=false;
 assert(await page.evaluate(()=>{const warning=new Event('beforeunload',{cancelable:true});window.dispatchEvent(warning);return warning.defaultPrevented;}),'dirty draft still protects page exit');
 // The CLI pauses run-code at native dialogs. Verify the real exit guard above,
 // then suppress only this synthetic page's dialog to exercise draft restoration.
 await page.evaluate(()=>window.removeFixtureExitGuards());
 await page.reload();await page.getByLabel('活動名（必須）',{exact:true}).waitFor();assert(await page.getByLabel('活動名（必須）',{exact:true}).inputValue()==='架空の未保存案','session draft survives reload');coverage.push('cancel replacement retains draft','save failure retains draft','dirty exit protection','reload restores existing draft');
 for(const [width,height,name] of [[768,1024,'tablet'],[390,844,'mobile']]){await page.setViewportSize({width,height});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'activity no overflow '+name);await page.screenshot({path:'output/playwright/activity-workflow-'+name+'.png',fullPage:true});}coverage.push('activity tablet/mobile layout');
 await page.getByRole('button',{name:'試験：交通費',exact:true}).click();const distance=page.getByLabel('距離（km）',{exact:true});assert(await bg(distance)===blue,'traffic input highlighted');await distance.fill('8.5');await page.getByLabel('利用児童数（名）').fill('8');
 assert(await page.getByRole('button',{name:'結果をコピー',exact:true}).isEnabled(),'calculator still works');assert(await bg(page.getByLabel('フリードの燃費（km/L）',{exact:true}))===blue,'enabled efficiency field highlighted');assert(await bg(page.getByLabel('ムーヴの燃費（km/L）',{exact:true}))!==blue,'disabled efficiency preserved');
 const positions=await page.locator('.traffic-cost-page').evaluate(el=>{const input=el.querySelector('input'),result=el.querySelector('[aria-live]');return {input:input.getBoundingClientRect().top,result:result.getBoundingClientRect().top};});assert(positions.result>positions.input,'results remain below fields');
 await page.screenshot({path:'output/playwright/traffic-inputs-mobile.png',fullPage:true});coverage.push('traffic field colors','disabled vehicle fields preserved','calculator behavior','result ordering preserved');
 await page.getByRole('button',{name:'試験：施設業務',exact:true}).click();await page.getByRole('heading',{name:'施設業務',exact:true}).waitFor();assert(await bg(page.locator('.facility-workspace input:not([type])').first())===blue,'facility fields share cue');coverage.push('facility field consistency');
 await page.getByRole('button',{name:'試験：各入力部品',exact:true}).click();
 for(const type of ['text','number','date','time','datetime-local','month','week','email','tel','url','password','textarea','select'])assert(await bg(page.getByLabel('試験：'+type,{exact:true}))===blue,'color for '+type);coverage.push('all ordinary field types');
 for(const type of ['readonly','disabled','disabled-fieldset','error','error-border','warning','plain','search','checkbox','radio','range','color','file'])assert(await bg(page.getByLabel('試験：'+type,{exact:true}))!==blue,'preserve '+type);coverage.push('readonly/disabled preservation','semantic warning/error preservation','search and opt-out preservation','non-text controls untouched');
 const textField=page.getByLabel('試験：text',{exact:true});await textField.focus();assert(await textField.evaluate(el=>getComputedStyle(el).outlineWidth)==='2px','strong focus outline');
 const contrast=await textField.evaluate(el=>{const css=getComputedStyle(el),context=document.createElement('canvas').getContext('2d'),rgb=s=>{context.fillStyle=s;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data].slice(0,3);},l=s=>rgb(s).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0),ratio=(a,b)=>(Math.max(l(a),l(b))+.05)/(Math.min(l(a),l(b))+.05);return {text:ratio(css.color,css.backgroundColor),border:ratio(css.borderColor,css.backgroundColor),placeholder:ratio(getComputedStyle(el,'::placeholder').color,css.backgroundColor)};});assert(contrast.text>=4.5&&contrast.placeholder>=4.5&&contrast.border>=3,'readable contrast');coverage.push('focus visibility','text/placeholder/border contrast');
 await page.emulateMedia({media:'print'});assert(await bg(textField)!==blue,'no print input tint');await page.emulateMedia({media:'screen',forcedColors:'active'});assert(await bg(textField)!==blue,'forced color settings respected');await page.emulateMedia({media:'screen',forcedColors:'none'});coverage.push('print unaffected','system high contrast respected');
 await page.setViewportSize({width:768,height:1024});await page.screenshot({path:'output/playwright/input-controls-tablet.png',fullPage:true});assert(errors.length===0,errors.join('\n'));
 return {passed:true,cases:coverage.length,coverage,syntheticDataOnly:true,activityWrites:writes,contrast};
}
try{command('open',url.href);command('snapshot');const output=command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(url.href)})`);const result=output.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!result||!JSON.parse(result[1]).passed)throw Error('Regression incomplete: '+output);console.log(result[1]);}finally{command('close');}
