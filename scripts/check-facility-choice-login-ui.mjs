import {spawnSync} from 'node:child_process';import {mkdirSync} from 'node:fs';import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1],url=new URL(args.includes('--url')?args[args.indexOf('--url')+1]:'http://localhost:3014/tests/fixtures/facility-login.html');
if(!args.includes('--cli')||!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/tests/fixtures/facility-login.html')throw Error('Local fixture and --cli required');
mkdirSync('output/playwright',{recursive:true});
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s=facility-choice-login',...args],{encoding:'utf8',timeout:120000,maxBuffer:4194304});if(r.status||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page,url){
 const assert=(ok,label)=>{if(!ok)throw Error(label);},recorder='11111111-1111-4111-8111-111111111111',calls=[],errors=[];let deny=true,selectDeny=false,revision=0,configured=false,enabled=false;
 page.on('pageerror',e=>errors.push(e.message));await page.context().route('https://*.supabase.co/**',route=>route.abort());
 await page.context().route('**/functions/v1/facility-login',async route=>{
  const body=route.request().postDataJSON();calls.push(body);
  if(body.action==='begin')await route.fulfill(deny?{status:403,json:{error:'承認済みの施設共用端末を確認してください。'}}:{json:{schemaVersion:1,ticket:'b'.repeat(64),expiresAt:new Date(Date.now()+300000).toISOString(),staff:[{recorderId:recorder,displayName:'架空職員 あおい'},{recorderId:'22222222-2222-4222-8222-222222222222',displayName:'架空職員 ひなた'}]}});
  else await route.fulfill(selectDeny?{status:403,json:{error:'施設ログインからやり直してください。'}}:{json:{session:{access_token:'fixture-access',refresh_token:'fixture-refresh'}}});
 });
 const config=()=>({schemaVersion:1,organizationCode:'TEST123456',loginId:configured?'facility':'',enabled,configured,revision,deviceApprovalEnabled:true,eligibleCount:2,privilegedEmailPending:0});
 await page.context().route('**/rest/v1/rpc/*facility_login_configuration',async route=>{
  if(route.request().url().includes('/set_')){const body=route.request().postDataJSON();calls.push(body);assert(body.p_revision===revision,'settings optimistic revision');revision++;configured=true;enabled=body.p_enabled;}
  await route.fulfill({json:config()});
 });
 const fill=async()=>{await page.getByRole('textbox',{name:'施設ログインの事業所コード',exact:true}).fill('TEST123456');await page.getByRole('textbox',{name:'施設ID',exact:true}).fill('facility');await page.getByRole('textbox',{name:'共通パスワード',exact:true}).fill('fixture-common-password');};
 await page.goto(url);assert(await page.getByLabel(/PIN/).count()===0,'no PIN');await fill();await page.getByRole('button',{name:'職員選択へ',exact:true}).click();await page.getByText('承認済みの施設共用端末を確認してください。',{exact:true}).waitFor();assert(await page.getByRole('button',{name:'架空職員 あおい',exact:true}).count()===0,'no roster before facility gate');
 deny=false;await fill();await page.getByRole('button',{name:'職員選択へ',exact:true}).click();await page.getByRole('button',{name:'架空職員 あおい',exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile selection overflow');await page.screenshot({path:'output/playwright/facility-login-selection-mobile.png',fullPage:true});
 assert(await page.getByLabel(/PIN/).count()===0,'selection has no PIN');assert(await page.getByRole('textbox',{name:'共通パスワード',exact:true}).count()===0,'password form removed after gate');
 const storage=await page.evaluate(()=>JSON.stringify({...localStorage}));assert(!storage.includes('fixture-common-password')&&!storage.includes('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),'credentials/challenge not persisted');
 selectDeny=true;await page.getByRole('button',{name:'架空職員 あおい',exact:true}).click();await page.getByText('施設ログインからやり直してください。',{exact:true}).waitFor();assert(await page.getByRole('button',{name:'架空職員 あおい',exact:true}).count()===0,'failed selection clears roster');
 selectDeny=false;await fill();await page.getByRole('button',{name:'職員選択へ',exact:true}).click();await page.getByRole('button',{name:'架空職員 あおい',exact:true}).click();await page.getByText('選択した職員でログインしました',{exact:true}).waitFor();assert(calls.filter(c=>c.action==='select').every(c=>!Object.hasOwn(c,'pin')&&!Object.hasOwn(c,'userId')&&!Object.hasOwn(c,'role')),'selection sends no PIN/Auth ID/role');
 await page.goto(url);await page.getByRole('button',{name:'管理者・教室長・児発管のメールログイン',exact:true}).click();await page.getByLabel('メールアドレス',{exact:true}).fill('admin@example.invalid');await page.getByLabel('パスワード',{exact:true}).fill('fixture-password');await page.getByRole('button',{name:'ログイン',exact:true}).click();await page.getByText('メールログインを確認しました',{exact:true}).waitFor();
 await page.goto(url);await page.getByRole('button',{name:'試験用：画面切替',exact:true}).click();await page.getByRole('form',{name:'施設共通ログイン設定',exact:true}).waitFor();
 await page.getByRole('textbox',{name:'設定する施設ID',exact:true}).fill('facility');await page.getByLabel('設定する共通パスワード',{exact:true}).fill('fixture-new-password');await page.getByLabel('共通パスワードの確認',{exact:true}).fill('fixture-new-password');await page.getByRole('checkbox',{name:'施設共通ログインを有効にする',exact:true}).check();
 assert(await page.getByRole('button',{name:'施設ログイン設定を保存',exact:true}).isDisabled(),'risk confirmation required');await page.getByRole('checkbox',{name:'職員選択の運用リスクを確認',exact:true}).check();
 page.on('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'施設ログイン設定を保存',exact:true}).click();await page.getByText('施設ログイン設定を保存しました。',{exact:true}).waitFor();assert(await page.getByLabel('設定する共通パスワード',{exact:true}).inputValue()==='','settings password cleared');
 await page.setViewportSize({width:1280,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'settings desktop overflow');await page.screenshot({path:'output/playwright/facility-login-settings-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'settings mobile overflow');await page.screenshot({path:'output/playwright/facility-login-settings-mobile.png',fullPage:true});assert(errors.length===0,errors.join('\n'));
 await page.evaluate(()=>{window.__facilityChoiceComplete=true;});
 return {passed:true,readsPrivateData:false,cases:['no PIN','approved gate denial','no roster before gate','no browser credential storage','failure clears roster','user selection','email login','admin config confirmation','1280px','390px']};
}
try{command('open',url.toString(),'--browser','chrome');command('run-code',`async page => (${check.toString()})(page, ${JSON.stringify(url.toString())})`);if(!/^true$/m.test(command('eval','window.__facilityChoiceComplete')))throw Error('Browser did not confirm completion');console.log('PASS: no-PIN facility gate/selection, private storage, email login, confirmed admin settings and 1280px/390px layout');}finally{command('close');}
