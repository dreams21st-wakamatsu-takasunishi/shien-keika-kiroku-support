import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];
const url=new URL(args.includes('--url')?args[args.indexOf('--url')+1]:'http://localhost:3014/tests/fixtures/lesson-record-import.html');
if(!args.includes('--cli')||!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/tests/fixtures/lesson-record-import.html')throw Error('Local fixture URL and --cli entry point are required');
mkdirSync('output/playwright',{recursive:true});
function command(...args){const result=spawnSync(process.execPath,[resolve(cli),'-s=lesson-import-regression',...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(result.status!==0||result.stdout.includes('### Error'))throw Error(result.stdout+result.stderr);return result.stdout;}
async function check(page,url){
 const assert=(ok,label)=>{if(!ok)throw Error(label);};
 const wait=async condition=>{for(let i=0;i<50;i++){if(condition())return;await new Promise(r=>setTimeout(r,100));}throw Error('Fixture draft did not update');};
 const org='22222222-2222-4222-8222-222222222222';
 const link={id:'11111111-1111-4111-8111-111111111111',organization_id:org,source_project_ref:'abcdefghijklmnopqrst',source_table:'user_data',source_student_id:'student_ui_a',source_campus_id:'main',source_display_name:'架空児童',active:true,revision:1,verified_at:'2026-10-01T00:00:00Z'};
 let revoked=false,changed=false,historyDelay=0,historyFails=false,empty=false,lastDraft=null;
 const calls=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.context().route('https://*.supabase.co/**',route=>route.abort());
 await page.context().route('**/rest/v1/**',async route=>{
  const u=route.request().url();
  if(u.includes('rpc/save_record_draft_guarded')){lastDraft=route.request().postDataJSON().p_payload;await route.fulfill({json:[{new_revision:1,saved_at:new Date().toISOString()}]});}
  else if(u.includes('record_drafts'))await route.fulfill({json:null});
  else throw Error('Unexpected REST fixture request');
 });
 await page.context().route('**/functions/v1/lesson-learning',async route=>{
  const body=route.request().postDataJSON();calls.push(body);
  if(body.action==='list')return route.fulfill({json:{configured:true,canManageLinks:false,links:revoked?[]:['a','b'].map(c=>({...link,child_id:`child-import-${c}`}))}});
  if(body.action!=='history')throw Error(`Unexpected fixture action ${body.action}`);
  if(historyDelay)await new Promise(r=>setTimeout(r,historyDelay));
  if(revoked||historyFails)return route.fulfill({status:403,json:{error:'試験用：実績の閲覧権限がありません。'}});
  await route.fulfill({json:{schemaVersion:1,identity:{sourceProjectRef:link.source_project_ref,dataTable:'user_data',studentId:link.source_student_id,campusId:'main',displayName:'架空児童',birthDate:''},date:body.date,historyComplete:false,historyNotice:'保存されている履歴のみです。未実施とは判断できません。',fetchedAt:'2026-10-01T01:00:00Z',events:empty?[]:[
   {id:'mouse-ui',at:`${body.date}T00:00:00Z`,category:'mouse',title:'M-1',detail:changed?'更新された実績':'クリア',amount:'ステージをクリア'},
   {id:'text-ui',at:`${body.date}T00:10:00Z`,category:'text',title:'文章入力',detail:'練習',amount:'120文字'},
  ]}});
 });
 await page.goto(url);
 const get=page.getByRole('button',{name:'実績を取得',exact:true});await get.waitFor();
 await page.screenshot({path:'output/playwright/import-form-before.png',fullPage:true});
 await get.click();
 const pick=page.getByRole('checkbox',{name:/取り込み対象 .*M-1/});await pick.waitFor();
 const confirm=page.getByRole('checkbox',{name:'選択した実績の児童・日付・内容を確認',exact:true});
 assert(await confirm.isDisabled(),'confirmation before selection disabled');
 await pick.check();assert(await page.getByRole('button',{name:/選択した実績を追加/}).isDisabled(),'unconfirmed import disabled');
 await confirm.check();await page.getByRole('button',{name:/選択した実績を追加/}).click();
 await page.getByText('確認した実績を入力中の記録へ追加しました。記録は未保存です。',{exact:true}).waitFor();
 const answer=()=>lastDraft?.childDrafts['child-import-a']?.sectionAnswers.pc.answers.pc_content;
 await wait(()=>answer()?.nestedDetails?.dLessonHistoryEvidence);
 assert(JSON.parse(answer().nestedDetails.dLessonHistoryEvidence).events.length===1,'one selected event persisted in draft');
 assert(answer().value.includes('元の入力')&&answer().value.includes('M-1')&&!answer().value.includes('120文字'),'manual and selected evidence only');
 assert(answer().note==='職員の手入力備考','manual note preserved');
 assert(lastDraft.childDrafts['child-import-a'].sectionAnswers.pc.answers.pc_posture.value==='職員が観察した内容','observation untouched');
 assert(!answer().value.includes('実績：')&&!answer().value.includes('09:00'),'import defaults to concise output');
 const originalEvidence=answer().nestedDetails.dLessonHistoryEvidence;
 await page.getByRole('button',{name:'実績をすべて記載',exact:true}).click();
 await wait(()=>answer().value.includes('実績：09:00'));
 await page.getByRole('button',{name:'要点にまとめる',exact:true}).click();
 await wait(()=>!answer().value.includes('実績：')&&answer().value.includes('マウス練習1回'));
 assert(answer().nestedDetails.dLessonHistoryEvidence===originalEvidence,'output switches preserve all source evidence');
 const rawDetails=page.locator('details').filter({has:page.getByText('取り込んだ実績の詳細（1件）',{exact:true})});
 assert(await rawDetails.getAttribute('open')===null,'raw imported details start collapsed');
 await rawDetails.locator('summary').click();
 assert((await rawDetails.textContent()).includes('09:00'),'raw time is available in details');
 await rawDetails.locator('summary').click();
 await page.setViewportSize({width:1280,height:900});
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:'output/playwright/import-form-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>window.scrollTo(0,0));
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'mobile horizontal overflow');
 await page.screenshot({path:'output/playwright/import-form-mobile.png',fullPage:true});
 await pick.check();await confirm.check();await page.getByRole('button',{name:/選択した実績を追加/}).click();
 await page.getByText('選択した実績は取り込み済みです。',{exact:true}).waitFor();
 assert(JSON.parse(answer().nestedDetails.dLessonHistoryEvidence).events.length===1,'duplicate prevention');
 await page.getByRole('button',{name:'取り込み実績を除く',exact:true}).click();
 await wait(()=>answer()?.nestedDetails&&!answer().nestedDetails.dLessonHistoryEvidence);
 assert(answer().value.includes('元の入力')&&!answer().value.includes('M-1'),'removal keeps manual entry');
 await page.goto(url+'?component=true');await get.click();await pick.waitFor();
 await pick.check();await confirm.check();revoked=true;
 await page.getByRole('button',{name:/選択した実績を追加/}).click();
 await page.getByText('連携状態が変更されました。実績を再取得してください。',{exact:true}).waitFor();
 assert(await page.getByRole('status',{name:'試験用の記録内容'}).textContent()==='元の入力','revocation does not modify draft');
 revoked=false;await get.click();await pick.waitFor();await pick.check();await confirm.check();changed=true;
 await page.getByRole('button',{name:/選択した実績を追加/}).click();
 await page.getByText('選択した実績が変更されました。再取得して確認してください。',{exact:true}).waitFor();
 changed=false;historyDelay=500;
 await get.click();await page.getByRole('button',{name:'試験用：児童切替'}).click();
 assert(await page.getByRole('checkbox',{name:/取り込み対象/}).count()===0,'child switch clears prior evidence');
 await new Promise(r=>setTimeout(r,650));
 assert(await page.getByRole('checkbox',{name:/取り込み対象/}).count()===0,'late history ignored');
 historyDelay=0;await get.click();await pick.waitFor();
 await page.getByRole('button',{name:'試験用：日付切替'}).click();
 assert(await page.getByRole('checkbox',{name:/取り込み対象/}).count()===0,'date switch clears confirmation');
 empty=true;await get.click();await page.getByText('この日付で取得できた履歴はありません。',{exact:true}).waitFor();
 assert(await page.getByText(/未実施とは判断できません/).count()===1,'empty is unknown');
 empty=false;historyFails=true;await get.click();await page.getByText('試験用：実績の閲覧権限がありません。',{exact:true}).waitFor();
 historyFails=false;await get.click();await pick.waitFor();
 await page.goto(url+'?component=true&readonly=true');
 assert(await get.isDisabled(),'read-only cannot fetch or apply');
 await page.goto(url+'?invalid=true');
 await page.getByText('取り込み実績の児童・日付・事業所が記録と一致していません。',{exact:true}).waitFor();
 await page.getByRole('button',{name:'入力を終えて確認',exact:true}).click();
 await page.getByText('Dレッスン実績の確認が必要です',{exact:true}).waitFor();
 assert(errors.length===0,errors.join(','));
 return {passed:true,cases:['full record form integration','confirmed selection','autosaved draft projection','manual content preservation','no inferred observations','concise/detail output switches','collapsed source evidence','duplicate prevention','remove evidence','revoked link','changed source event','child/date switch','empty history','fetch retry','read-only','pre-save date mismatch error','desktop/mobile'],historyCalls:calls.filter(c=>c.action==='history').length};
}
try{command('open','about:blank');const output=command('run-code',`async (page)=>{return await (${check.toString()})(page,${JSON.stringify(url.href)});}`);const result=output.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!result||JSON.parse(result[1]).passed!==true)throw Error(`UI regression did not complete: ${output}`);console.log(result[1]);}finally{command('close');}
