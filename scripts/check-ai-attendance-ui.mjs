import {spawnSync} from 'node:child_process';import {mkdirSync} from 'node:fs';import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1],url='http://127.0.0.1:3015/tests/fixtures/ai-attendance.html';if(!args.includes('--cli'))throw Error('--cli required');
mkdirSync('output/playwright',{recursive:true});
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s=ai-attendance',...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page,url){
 let checks=0,revision=0,enabled=false,failSave=false,writes=0;const errors=[];const assert=(v,label)=>{checks++;if(!v)throw Error(label);};page.on('pageerror',e=>errors.push(e.message));
 await page.context().route('https://*.supabase.co/**',route=>route.abort());
 await page.context().route('**/rest/v1/rpc/**',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1),p=route.request().postDataJSON();
  if(name==='get_external_ai_policy')return route.fulfill({json:{enabled,revision,policyVersion:1}});
  if(name==='set_external_ai_policy'){assert(p.p_expected_revision===revision,'stale revision guarded');assert(!p.p_enabled||[p.p_contract_confirmed,p.p_informing_confirmed,p.p_handling_confirmed].every(Boolean),'three explicit confirmations');writes++;enabled=p.p_enabled;revision++;return route.fulfill({json:{enabled,revision,policyVersion:1,reviewedAt:'2026-10-27T01:00:00Z',reviewedByName:'架空管理者'}});}
  if(name==='confirm_attendance_break'){
   writes++;if(failSave)return route.fulfill({status:409,json:{code:'40001'}});
   assert(p.p_minutes===60 && p.p_reason==='本人と実績を確認','actual and reason sent');assert(p.p_expected_updated_at==='2026-10-01T09:00:00Z','concurrency stamp');
   return route.fulfill({json:{id:p.p_record_id,recorder_profile_id:'11111111-1111-4111-8111-111111111111',work_date:'2026-10-01',status:'退勤済み',clock_in_at:'2026-10-01T09:00:00+09:00',clock_out_at:'2026-10-01T18:00:00+09:00',break_periods:[],scheduled_break_minutes:60,confirmed_break_minutes:60,break_confirmed_at:'2026-10-27T01:00:00Z',created_at:'2026-10-01T09:00:00Z',updated_at:'2026-10-27T01:00:00Z'}});
  }
  throw Error('Unexpected RPC '+name);
 });
 await page.goto(url);await page.getByText('外部AIの送信許可：停止中',{exact:true}).waitFor();
 const allow=page.getByRole('button',{name:'確認して外部AI送信を許可',exact:true});assert(await allow.isDisabled(),'default off');
 const section=page.getByRole('region',{name:'外部AIの送信許可'});for(const box of await section.getByRole('checkbox').all())await box.check();await allow.click();await page.getByText('外部AIの送信許可：許可中',{exact:true}).waitFor();await page.getByRole('button',{name:'外部AI送信を停止',exact:true}).click();await page.getByText('外部AIの送信許可：停止中',{exact:true}).waitFor();assert(writes===2,'explicit policy writes only');
 const preview=page.getByRole('button',{name:'架空送信プレビュー',exact:true});await preview.click();const dialog=page.getByRole('dialog',{name:'外部AIへ送る内容の確認'});await dialog.waitFor();assert(await dialog.getByRole('button',{name:'確認した内容を送信',exact:true}).isDisabled(),'review required');await page.keyboard.press('Escape');await page.getByText('取消',{exact:true}).waitFor();assert(writes===2,'cancel has no write');assert(await preview.evaluate(e=>e===document.activeElement),'focus restored');
 await preview.click();await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'確認した内容を送信',exact:true}).click();await page.getByText('確認済み',{exact:true}).waitFor();
 assert(await page.getByText('未確定・集計対象外：退勤未打刻のため未確定です',{exact:true}).count()===1,'missing clock-out unconfirmed');
 await page.getByRole('button',{name:'休憩実績を確認',exact:true}).click();const actual=page.getByLabel('実際の休憩合計（分）',{exact:true}),reason=page.getByLabel('確認根拠・訂正理由',{exact:true});assert(await actual.inputValue()==='','planned break not prefilled');await actual.fill('60');await reason.fill('本人と実績を確認');failSave=true;await page.getByRole('button',{name:'実績を確認して保存',exact:true}).click();await page.getByRole('alert').waitFor();assert(await actual.inputValue()==='60' && await reason.inputValue()==='本人と実績を確認','conflict keeps input');failSave=false;await page.getByRole('button',{name:'実績を確認して保存',exact:true}).click();await page.getByText('休憩 60分／実働 480分',{exact:true}).waitFor();
 await page.evaluate(()=>{window.testCsv='';URL.createObjectURL=blob=>{blob.text().then(text=>window.testCsv=text);return 'blob:fictional-csv';};document.addEventListener('click',event=>{if(event.target instanceof HTMLAnchorElement&&event.target.download)event.preventDefault();},true);});
 await page.getByRole('button',{name:'2026-10 CSV',exact:true}).click();await page.waitForFunction(()=>window.testCsv?.includes('実働分（確定のみ）'));
 const csv=await page.evaluate(()=>window.testCsv);const csvRows=csv.split('\r\n');assert(csvRows[1].includes('480')&&csvRows[2].includes('未確定・集計対象外'),'CSV confirmed total and unconfirmed reason');assert(csvRows[2].split(',')[8]==='""','CSV never invents numeric work time');
 await page.screenshot({path:'output/playwright/ai-attendance-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/playwright/ai-attendance-mobile.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile no page overflow');
 await page.goto(url+'?staff');await page.getByText('許可・停止は管理者のみ行えます。児発管の文章設定権限とは別に管理します。',{exact:true}).waitFor();assert(await page.getByRole('button',{name:'確認して外部AI送信を許可',exact:true}).count()===0,'non-admin no policy mutation');assert(await page.getByRole('button',{name:'休憩実績を確認',exact:true}).count()===0,'non-admin no break confirmation');assert(errors.length===0,'no browser exceptions');
 return {checks,errors,productionWrites:0};
}
try{command('open','about:blank','--headed');command('snapshot');console.log(command('run-code',`async (page)=>{const check=${check.toString()};return await check(page,${JSON.stringify(url)});}`));}finally{command('close');}
