import {spawnSync} from 'node:child_process';import {mkdirSync} from 'node:fs';import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];const url=new URL(args.includes('--url')?args[args.indexOf('--url')+1]:'http://127.0.0.1:3015/tests/fixtures/legal-training.html');
if(!args.includes('--cli')||!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/tests/fixtures/legal-training.html')throw Error('Local fixture and --cli required');
mkdirSync('output/playwright',{recursive:true});
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s=legal-training-check',...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page,url){
 const assert=(ok,label)=>{if(!ok)throw Error(label);};const errors=[];let gets=0,unavailable=false,failSave=false;
 const org='22222222-2222-4222-8222-222222222222',a='11111111-1111-4111-8111-111111111111',b='44444444-4444-4444-8444-444444444444';let actor=a;
 const categories=[],videos=[],progress=[];let writes=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.context().route('https://*.supabase.co/**',route=>route.abort());
 await page.context().route('**/rest/v1/**',async route=>{
  const request=route.request(),uri=new URL(request.url()),table=uri.pathname.split('/').at(-1);
  if(request.method()==='GET'){
   assert(table.startsWith('legal_training_'),'no unrelated server receives training metadata');gets++;
   if(unavailable)return route.fulfill({status:400,json:{code:'42P01'}});
   assert(uri.searchParams.get('organization_id')==='eq.'+org,'catalog scoped to organization');
   if(table==='legal_training_progress'){actor=uri.searchParams.get('user_id')?.slice(3);assert([a,b].includes(actor),'progress scoped to login');}
   return route.fulfill({json:table==='legal_training_categories'?categories:table==='legal_training_videos'?videos:progress.filter(row=>row.user_id===actor)});
  }
  const payload=request.postDataJSON();assert(payload.p_organization_id===org,'RPC organization');writes++;
  if(table==='add_legal_training_category'){const id='55555555-5555-4555-8555-555555555555';categories.push({id,organization_id:org,title:payload.p_title,active:true,revision:1});return route.fulfill({json:id});}
  if(table==='add_legal_training_video'){const id=videos.length?'77777777-7777-4777-8777-777777777777':'66666666-6666-4666-8666-666666666666';videos.push({id,organization_id:org,category_id:payload.p_category_id,title:payload.p_title,video_url:payload.p_video_url,material_url:payload.p_material_url,active:true,revision:1});return route.fulfill({json:id});}
  if(table==='set_legal_training_completion'){
   assert(!Object.hasOwn(payload,'p_user_id'),'user identity is never accepted from the client');
   if(failSave)return route.fulfill({status:500,json:{code:'TEST_FAILURE'}});
   let row=progress.find(row=>row.video_id===payload.p_video_id&&row.user_id===actor);
   if((row?.revision||0)!==payload.p_expected_revision)return route.fulfill({status:409,json:{code:'40001'}});
   if(!row){row={organization_id:org,video_id:payload.p_video_id,user_id:actor,completed_at:null,revision:0};progress.push(row);}
   row.completed_at=payload.p_completed?'2026-10-06T03:00:00Z':null;row.revision++;return route.fulfill({json:row});
  }
  if(table==='archive_legal_training_item'){const list=payload.p_kind==='video'?videos:categories;const row=list.find(row=>row.id===payload.p_id);assert(row.revision===payload.p_expected_revision,'archive revision');row.active=false;row.revision++;return route.fulfill({json:null});}
  throw Error('Unexpected training RPC');
 });
 await page.goto(url);await page.getByRole('heading',{name:'受講する職員を確認してください'}).waitFor();assert(gets===0,'no catalog fetched before identity confirmation');
 assert(await page.getByText('架空職員 A',{exact:true}).count()===1,'visible identity');assert(await page.getByRole('button',{name:'完了',exact:true}).count()===0,'actions hidden before confirmation');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/playwright/legal-training-identity.png',fullPage:true});
 await page.getByRole('button',{name:'試験用：設定',exact:true}).click();await page.getByRole('button',{name:'法定研修追加',exact:true}).click();
 await page.getByRole('button',{name:'研修カテゴリを追加',exact:true}).click();await page.getByLabel('研修名',{exact:true}).fill('架空カテゴリ');await page.getByRole('button',{name:'カテゴリを保存',exact:true}).click();
 await page.getByLabel('動画タイトル',{exact:true}).fill('架空動画 1');await page.getByLabel('動画URL',{exact:true}).fill('http://example.invalid/video');const beforeInvalid=writes;await page.getByRole('button',{name:'動画を追加',exact:true}).click();await page.getByRole('alert').filter({hasText:'https://'}).waitFor();assert(writes===beforeInvalid,'unsafe URL never sent');
 await page.getByLabel('動画URL',{exact:true}).fill('https://example.invalid/video');await page.getByLabel('資料URL（任意）',{exact:true}).fill('https://example.invalid/material');await page.getByRole('button',{name:'動画を追加',exact:true}).click();await page.getByRole('article',{name:'架空動画 1',exact:true}).waitFor();
 await page.getByLabel('動画タイトル',{exact:true}).fill('架空動画 2');await page.getByLabel('動画URL',{exact:true}).fill('https://example.invalid/video2');await page.getByRole('button',{name:'動画を追加',exact:true}).click();await page.getByRole('article',{name:'架空動画 2',exact:true}).waitFor();
 assert(videos[1].material_url===null,'optional materials supported');await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'output/playwright/legal-training-manager.png',fullPage:true});
 await page.getByRole('button',{name:'試験用：受講',exact:true}).click();await page.getByRole('heading',{name:'受講する職員を確認してください'}).waitFor();await page.getByRole('button',{name:'この職員で受講する',exact:true}).click();
 await page.getByRole('button',{name:'架空カテゴリ 未受講 2',exact:true}).waitFor();
 await page.evaluate(()=>{window.__trainingOpen=[];window.open=(...args)=>{window.__trainingOpen.push(args);return null;};});
 let first=page.getByRole('article',{name:'架空動画 1',exact:true});await first.getByRole('button',{name:'架空動画 1',exact:true}).click();
 assert((await page.evaluate(()=>window.__trainingOpen)).length===2,'title opens both resources');assert(await first.getByRole('link',{name:'資料を開く'}).getAttribute('rel')==='noopener noreferrer','fallback referrer protection');assert(progress.length===0,'opening links does not mark complete');
 failSave=true;await first.getByRole('button',{name:'完了',exact:true}).click();await page.getByRole('alert').filter({hasText:'失敗'}).waitFor();assert(await first.getByText('未受講',{exact:true}).count()===1,'failed completion remains incomplete');failSave=false;
 await first.getByRole('button',{name:'完了',exact:true}).click();await first.getByRole('button',{name:'取り消し',exact:true}).waitFor();assert(await page.getByRole('button',{name:'架空カテゴリ 未受講 1',exact:true}).count()===1,'remaining count updated');
 await page.getByRole('button',{name:'試験用：職員切替',exact:true}).click();await page.getByRole('heading',{name:'受講する職員を確認してください'}).waitFor();assert(await page.getByText('架空職員 B',{exact:true}).count()===1,'identity reconfirmed for other login');await page.getByRole('button',{name:'この職員で受講する',exact:true}).click();await page.getByRole('button',{name:'架空カテゴリ 未受講 2',exact:true}).waitFor();
 await page.getByRole('article',{name:'架空動画 1',exact:true}).getByRole('button',{name:'完了',exact:true}).click();await page.getByRole('article',{name:'架空動画 1',exact:true}).getByRole('button',{name:'取り消し',exact:true}).waitFor();
 await page.getByRole('button',{name:'試験用：職員切替',exact:true}).click();await page.getByRole('button',{name:'この職員で受講する',exact:true}).click();first=page.getByRole('article',{name:'架空動画 1',exact:true});await first.getByRole('button',{name:'取り消し',exact:true}).click();await first.getByRole('button',{name:'完了',exact:true}).waitFor();assert(progress.find(row=>row.user_id===b).completed_at!==null,'undo does not change other user');
 const row=progress.find(row=>row.user_id===a);row.revision++;await first.getByRole('button',{name:'完了',exact:true}).click();await page.getByRole('alert').filter({hasText:'別の端末'}).waitFor();assert(row.completed_at===null,'conflict never overwrites newer progress');await page.getByRole('button',{name:'再読込',exact:true}).click();await page.getByRole('button',{name:'完了',exact:true}).first().waitFor();
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile no overflow');await page.screenshot({path:'output/playwright/legal-training-mobile.png',fullPage:true});
 assert(await page.getByRole('button',{name:'完了',exact:true}).first().evaluate(button=>{const style=getComputedStyle(button);return style.backgroundColor!==style.color&& !['rgb(255, 255, 255)','oklch(1 0 0)'].includes(style.backgroundColor);}), 'completion button visible contrast');
 await page.getByRole('button',{name:'試験用：設定',exact:true}).click();await page.getByRole('button',{name:'法定研修追加',exact:true}).click();await page.getByRole('article',{name:'架空動画 1',exact:true}).waitFor();await page.evaluate(()=>{window.confirm=()=>true;});await page.getByRole('article',{name:'架空動画 1',exact:true}).getByRole('button',{name:'非表示',exact:true}).click();await page.getByRole('status').filter({hasText:'動画を非表示'}).waitFor();assert(progress.length===2,'archive retains both users histories');
 for(const role of ['staff','classroom_manager']){await page.goto(url+'?role='+role);await page.getByRole('button',{name:'試験用：設定',exact:true}).click();assert(await page.getByRole('button',{name:'法定研修追加',exact:true}).count()===0,'settings hidden from '+role);}
 unavailable=true;await page.goto(url);await page.getByRole('button',{name:'この職員で受講する',exact:true}).click();await page.getByRole('alert').filter({hasText:'DB更新'}).waitFor();
 await page.goto(url);await page.getByRole('button',{name:'別の職員で受講する（ログアウト）',exact:true}).click();await page.getByRole('status').filter({hasText:'ログアウトしました'}).waitFor();
 assert(errors.length===0,errors.join('\n'));
 return {passed:true,cases:18,coverage:['identity gate before fetch','role-specific settings','category and video creation','URL rejection before upload','optional materials','external opening and fallback','no implicit completion','save failure','per-user count','user switch confirmation','independent progress','undo','conflict protection','mobile layout','archive history','staff/leader settings hidden','DB-missing guidance','switch-account logout']};
}
try{command('open',url.href);command('snapshot');const output=command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(url.href)})`);const result=output.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!result||!JSON.parse(result[1]).passed)throw Error('Regression incomplete: '+output);console.log(result[1]);}finally{command('close');}
