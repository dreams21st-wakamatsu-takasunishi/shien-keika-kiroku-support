import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];
if(!args.includes('--cli'))throw Error('--cli required');
mkdirSync('output/playwright',{recursive:true});
function command(...args){
 const r=spawnSync(process.execPath,[resolve(cli),'-s=lesson-student-admin-regression',...args],{encoding:'utf8',timeout:120000,maxBuffer:4194304});
 if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;
}
async function check(page){
 const assert=(ok,label)=>{if(!ok)throw Error(label);};
 let allowed=true,archived=false,revision=0;const mutations=[],errors=[];
 const link={id:'11111111-1111-4111-8111-111111111110',organization_id:'11111111-1111-4111-8111-111111111111',child_id:'child-ui-a',revision:1,
 source_display_name:'架空児童 あおい',source_project_ref:'abcdefghijklmnopqrst',source_table:'user_data',source_student_id:'student_ui_a',source_campus_id:'wakamatsu-takasunishi',active:true,verified_at:'2026-10-08T00:00:00Z'};
 const state=()=>({childId:link.child_id,linkId:link.id,archived,revision,loginNumber:'19',lastIssuedAt:null});
 page.on('pageerror',e=>errors.push(e.message));
 await page.context().route('https://*.supabase.co/**',route=>route.abort());
 await page.context().route('**/functions/v1/lesson-learning',route=>route.fulfill({json:{links:[link],configured:true,canManageLinks:allowed,canManageAccounts:allowed,canIssueAccounts:allowed}}));
 await page.context().route('**/functions/v1/lesson-student-admin',route=>{
  const b=route.request().postDataJSON();
  if(b.action!=='status'){
   assert(allowed&&b.confirmName==='架空児童 あおい'&&b.expectedRevision===revision&&b.linkRevision===1&&b.confirmed,'bound explicit confirmation');
   mutations.push(b.action);archived=b.action==='archive';revision++;
  }
  return route.fulfill({json:{items:[state()]}});
 });
 await page.context().route('**/functions/v1/lesson-account-credentials',route=>route.fulfill({json:{operations:[]}}));
 await page.context().route('**/functions/v1/lesson-student-registration',route=>route.fulfill({json:{error:'架空試験では新規登録を実行しません'},status:409}));
 await page.goto('http://localhost:3014/tests/fixtures/lesson-learning.html');
 await page.locator('body').ariaSnapshot();
 await page.getByRole('tab',{name:'児童・ログイン管理',exact:true}).click();
 const panel=page.getByRole('region',{name:'児童・ログイン管理の一覧'});await panel.getByText('児童番号：19',{exact:false}).waitFor();
 assert(await panel.getByText('未登録',{exact:false}).count()>0,'unlinked students remain discoverable');
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'output/playwright/lesson-student-admin-desktop.png',fullPage:true});
 const card=panel.getByRole('article').filter({has:page.getByRole('heading',{name:'架空児童 あおい',exact:true})});
 await card.getByRole('button',{name:'削除',exact:true}).click();
 const confirm=page.getByRole('region',{name:'児童の削除・復元の確認'});
 const stop=confirm.getByRole('button',{name:'ログインを停止する',exact:true});assert(await stop.isDisabled(),'name required');
 await confirm.getByLabel('確認する児童名').fill('違う児童');assert(await stop.isDisabled(),'wrong name cannot submit');
 await confirm.getByLabel('確認する児童名').fill('架空児童 あおい');await stop.click();
 await panel.getByText('ログインを停止し、削除済みに移動しました。学習履歴は残しています。',{exact:true}).waitFor();
 assert(await card.count()===0,'archived removed from active list');
 await panel.getByRole('checkbox',{name:'削除済みを表示'}).check();await card.getByRole('button',{name:'復元',exact:true}).waitFor();
 await card.getByRole('button',{name:'復元',exact:true}).click();
 await confirm.getByLabel('確認する児童名').fill('架空児童 あおい');await confirm.getByRole('button',{name:'復元する',exact:true}).click();
 await panel.getByText('児童の利用を再開しました。合言葉・学習履歴は変更していません。',{exact:true}).waitFor();
 await panel.getByRole('checkbox',{name:'削除済みを表示'}).uncheck();
 await panel.getByLabel('児童を検索').fill('ひなた');assert(await card.count()===0,'search filters');
 await panel.getByLabel('児童を検索').fill('');await card.waitFor();
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile overflow');
 await page.screenshot({path:'output/playwright/lesson-student-admin-mobile.png',fullPage:true});
 await card.getByRole('button',{name:'合言葉・ログインを管理',exact:true}).click();
 await page.getByRole('region',{name:'学習アカウント発行・再発行'}).waitFor();
 allowed=false;await page.reload();await page.locator('body').ariaSnapshot();
 await page.getByRole('tab',{name:'当日の取り組み',exact:true}).waitFor();
 assert(await page.getByRole('tab',{name:'児童・ログイン管理',exact:true}).count()===0,'manager-only tab');
 assert(JSON.stringify(mutations)==='["archive","restore"]','only explicit lifecycle changes');
 assert(errors.length===0,'no page errors');
 return {passed:true,archiveRestore:true,explicitNameConfirmation:true,search:true,desktopMobile:true,permissionGuard:true};
}
try{
 command('open','about:blank');
 const output=command('run-code',`async (page)=>(${check.toString()})(page)`),result=output.match(/### Result\s+([\s\S]*?)\s+### Ran/);
 if(!result||JSON.parse(result[1]).passed!==true)throw Error(output);console.log(result[1]);
}finally{command('close');}
