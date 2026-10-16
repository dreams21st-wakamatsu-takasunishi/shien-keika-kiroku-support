import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1],url=args.includes('--url')?args[args.indexOf('--url')+1]:'http://127.0.0.1:3026/tests/fixtures/lesson-learning.html';
if(!args.includes('--cli')||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Local URL and --cli required');
mkdirSync('output/playwright',{recursive:true});
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s=lesson-content',...args],{encoding:'utf8',timeout:120000,maxBuffer:4194304});if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page,url){
 const assert=(v,label)=>{if(!v)throw Error(label);};
 const org='11111111-1111-4111-8111-111111111111',project='a'.repeat(20),calls=[],errors=[],receipts=new Map();
 let allowed=true,wrongCampus=false,failLoad=false,failSaveOnce=false,delay=0;
 const content={main:{textTasks:[{id:'tt_old',title:'既存の課題',content:'あいうえお',time:3,star:1,targetGroup:'',hidden:false}],customThemes:[],customEffects:[]},other:{textTasks:[],customThemes:[],customEffects:[]}};
 const revisions={main:0,other:0};
 const payload=campusId=>({schemaVersion:1,dataTable:'user_data',organizationId:org,sourceProject:project,campusId,revision:revisions[campusId],fingerprint:'a'.repeat(32),content:structuredClone(content[campusId])});
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{window.confirm=()=>true;});
 await page.context().route('https://*.supabase.co/**',route=>route.abort());
 await page.context().route('**/functions/v1/lesson-learning',route=>route.fulfill({json:{links:[],configured:true,canManageContent:allowed}}));
 await page.context().route('**/functions/v1/lesson-managed-content',async route=>{
  const b=route.request().postDataJSON();calls.push(b);
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  if(!allowed){await route.fulfill({status:403,json:{error:'試験用：権限なし'}});return;}
  if(b.action==='list'){await route.fulfill({json:{schemaVersion:1,dataTable:'user_data',organizationId:org,sourceProject:project,campuses:[{id:'main'},{id:'other'}]}});return;}
  if(failLoad&&b.action==='get'){await route.fulfill({status:503,json:{error:'試験用：取得失敗'}});return;}
  if(b.action==='get'){await route.fulfill({json:{...payload(b.campusId),campusId:wrongCampus?'foreign':b.campusId}});return;}
  if(b.action==='save'){
   let saved=receipts.get(b.operationId);
   if(!saved){
    if(b.revision!==revisions[b.campusId]){await route.fulfill({status:409,json:{error:'試験用：他の変更あり'}});return;}
    const list=content[b.campusId][b.kind],i=list.findIndex(v=>v.id===b.item.id);
    if(i<0)list.push(b.item);else list[i]=b.item;
    revisions[b.campusId]++;saved={...payload(b.campusId),operationId:b.operationId,giftedCount:b.item.distribution==='present'?2:0};receipts.set(b.operationId,saved);
   }
   if(failSaveOnce){failSaveOnce=false;await route.fulfill({status:503,json:{error:'試験用：保存結果が未確定'}});return;}
   await route.fulfill({json:saved});return;
  }
  throw Error('Unexpected action');
 });
 await page.goto(url);await page.getByRole('heading',{name:'Dレッスン管理',exact:true}).waitFor();
 await page.getByRole('tab',{name:'文章課題の作成',exact:true}).click();
 const texts=page.getByRole('region',{name:'文章課題の作成',exact:true});
 await texts.getByText('既存の課題',{exact:true}).waitFor();await texts.getByRole('button',{name:'文章課題を作成',exact:true}).click();
 await texts.getByLabel('タイトル',{exact:true}).fill('架空の新しい文章課題');
 await texts.getByLabel('お手本文章',{exact:true}).fill('{漢字|かんじ}のれんしゅう。\n<img src=x onerror=alert(1)>');
 await texts.getByLabel('対象学習グループ',{exact:true}).fill('A');
 await texts.getByLabel('制限時間（分）',{exact:true}).fill('5');
 assert(await texts.locator('ruby').count()===1,'ruby preview');assert(await texts.locator('img').count()===0,'HTML not executed');
 await page.setViewportSize({width:1280,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'desktop overflow');await page.screenshot({path:'output/playwright/lesson-content-text-desktop.png',fullPage:true});
 failSaveOnce=true;await texts.getByRole('button',{name:'保存',exact:true}).click();await texts.getByText('試験用：保存結果が未確定',{exact:true}).waitFor();
 await texts.getByRole('button',{name:'保存',exact:true}).click();await texts.getByText('保存しました。',{exact:true}).waitFor();
 const saves=calls.filter(v=>v.action==='save');assert(saves.length===2&&saves[0].operationId===saves[1].operationId,'same-operation retry');
 await texts.getByRole('button',{name:'編集：架空の新しい文章課題',exact:true}).click();
 assert(await texts.getByLabel('お手本文章',{exact:true}).inputValue()==='{漢字|かんじ}のれんしゅう。\n<img src=x onerror=alert(1)>','saved ruby retained');
 await texts.getByLabel('タイトル',{exact:true}).fill('編集済み課題');await texts.getByRole('button',{name:'保存',exact:true}).click();await texts.getByText('編集済み課題',{exact:true}).waitFor();
 await texts.getByRole('button',{name:'非表示：編集済み課題',exact:true}).click();await texts.getByText('非表示 ・ 5分 ・ 難度1 ・ A',{exact:true}).waitFor();
 await texts.getByRole('combobox',{name:'教材の対象校舎',exact:true}).selectOption('other');await texts.getByText('まだ作成されていません。',{exact:true}).waitFor();assert(await texts.getByText('編集済み課題',{exact:true}).count()===0,'campus isolation');
 await page.getByRole('tab',{name:'ごほうびの作成',exact:true}).click();
 const rewards=page.getByRole('region',{name:'ごほうびの作成',exact:true});await rewards.getByRole('button',{name:'テーマを作成',exact:true}).click();
 await rewards.getByLabel('名前',{exact:true}).fill('架空のごほうび');await rewards.getByLabel('配布方法',{exact:true}).selectOption('present');
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile reward overflow');await page.screenshot({path:'output/playwright/lesson-content-reward-mobile.png',fullPage:true});
 await rewards.getByRole('button',{name:'保存',exact:true}).click();await rewards.getByText('保存しました。連携児童2名へプレゼントしました。',{exact:true}).waitFor();
 await rewards.getByRole('button',{name:'編集：架空のごほうび',exact:true}).click();assert(await rewards.getByLabel('配布方法',{exact:true}).isDisabled(),'no regifting on edit');await rewards.getByRole('button',{name:'一覧へ',exact:true}).click();
 await rewards.getByRole('button',{name:'演出',exact:true}).click();await rewards.getByRole('button',{name:'演出を作成',exact:true}).click();
 await rewards.getByLabel('名前',{exact:true}).fill('架空のお祝い');await rewards.getByLabel('絵文字2',{exact:true}).fill('🌸');await rewards.getByLabel('絵文字3',{exact:true}).fill('');
 await rewards.getByRole('button',{name:'保存',exact:true}).click();await rewards.getByText('架空のお祝い',{exact:true}).waitFor();
 await page.getByRole('tab',{name:'文章課題の作成',exact:true}).click();await texts.getByText('編集済み課題',{exact:true}).waitFor();
 await texts.getByRole('button',{name:'編集：編集済み課題',exact:true}).click();await texts.getByLabel('お手本文章',{exact:true}).fill('スマートフォンでも改行と\nプレビューを確認します。');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile text overflow');await page.screenshot({path:'output/playwright/lesson-content-text-mobile.png',fullPage:true});
 await texts.getByRole('button',{name:'一覧へ',exact:true}).click();
 wrongCampus=true;await texts.getByRole('button',{name:'再取得',exact:true}).click();await texts.getByRole('alert').waitFor();assert(await texts.getByRole('button',{name:/編集：/}).count()===0,'wrong campus wipes content');
 wrongCampus=false;failLoad=true;await texts.getByRole('button',{name:'再取得',exact:true}).click();await texts.getByText('試験用：取得失敗',{exact:true}).waitFor();
 failLoad=false;await texts.getByRole('button',{name:'再取得',exact:true}).click();await texts.getByText('編集済み課題',{exact:true}).waitFor();
 delay=500;await texts.getByRole('button',{name:'再取得',exact:true}).click();allowed=false;await page.getByRole('button',{name:'試験用：職員切替',exact:true}).click();await page.waitForTimeout(800);
 assert(await page.getByRole('tab',{name:'文章課題の作成',exact:true}).count()===0,'permission change hides entry');assert(await page.getByText('編集済み課題',{exact:true}).count()===0,'late response removed');
 assert(errors.length===0,errors.join('\n'));await page.evaluate(()=>{window.__lessonContentPassed=true;});return {passed:true,readsPrivateData:false,scenarios:['create-edit-hide','ruby-escaping','uncertain-retry','campus-isolation','theme-present','effect-gacha','wrong-response','failure-clears','staff-switch','1280px','390px']};
}
try{command('open',url,'--browser','chrome');const result=command('run-code',`async page => { try {return await (${check.toString()})(page,${JSON.stringify(url)});} catch(error) {throw Error(error.message+'\\nFixture screen: '+await page.locator('body').innerText());} }`);if(!/### Result\s+true/.test(command('eval','() => window.__lessonContentPassed === true')))throw Error('UI verification did not complete');console.log('PASS: managed content creation/edit/hide, ruby, retry, gifts, isolation, failure and responsive UI');}finally{command('close');}
