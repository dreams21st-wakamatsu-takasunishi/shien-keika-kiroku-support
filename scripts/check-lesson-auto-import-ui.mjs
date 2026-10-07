import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];
const url=new URL(args.includes('--url')?args[args.indexOf('--url')+1]:'http://127.0.0.1:3014/tests/fixtures/lesson-record-import.html');
if(!args.includes('--cli')||!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/tests/fixtures/lesson-record-import.html')throw Error('Local fixture and --cli required');
mkdirSync('output/playwright',{recursive:true});
const session='lesson-auto-regression-'+Date.now();
function command(...args){const result=spawnSync(process.execPath,[resolve(cli),'-s='+session,...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(result.status!==0||result.stdout.includes('### Error'))throw Error(result.stdout+result.stderr);return result.stdout;}
async function check(page,url){
 const assert=(ok,label)=>{if(!ok)throw Error(label);};
 const wait=async condition=>{for(let i=0;i<100;i++){if(condition())return;await new Promise(r=>setTimeout(r,100));}throw Error('Automatic draft did not update');};
 const org='22222222-2222-4222-8222-222222222222';
 const links=['a','b'].map(child=>({id:`link-ui-${child}`,organization_id:org,child_id:`child-import-${child}`,source_project_ref:'abcdefghijklmnopqrst',source_table:'user_data',source_student_id:`student_ui_${child}`,source_campus_id:'main',source_display_name:'架空児童',active:true,revision:1,verified_at:'2026-10-01T00:00:00Z'}));
 let latestDraft=null,fail=false,empty=false,revoked=false,extra=false,changed=false,delay=0,afterRead=false,topics=false;
 const errors=[],calls=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.context().route('https://*.supabase.co/**',route=>route.abort());
 await page.context().route('**/rest/v1/**',async route=>{
  if(route.request().url().includes('rpc/save_record_draft_guarded')){latestDraft=route.request().postDataJSON().p_payload;return route.fulfill({json:[{new_revision:1,saved_at:new Date().toISOString()}]});}
  if(route.request().url().includes('record_drafts'))return route.fulfill({json:null});
  throw Error('Unexpected REST fixture operation');
 });
 await page.context().route('**/functions/v1/lesson-learning',async route=>{
  const body=route.request().postDataJSON();calls.push(body);
  if(body.action==='list')return route.fulfill({json:{configured:true,canManageLinks:false,links:revoked&&afterRead?[]:links}});
  if(body.action!=='history')throw Error('Unexpected learning operation');
  if(delay)await new Promise(r=>setTimeout(r,delay));
  if(fail)return route.fulfill({status:403,json:{error:'試験用：実績の閲覧権限がありません。'}});
  afterRead=true;
  const link=links.find(row=>row.child_id===body.childId),child=body.childId.endsWith('a')?'A':'B';
  return route.fulfill({json:{schemaVersion:1,date:body.date,identity:{sourceProjectRef:link.source_project_ref,dataTable:'user_data',studentId:link.source_student_id,campusId:'main',displayName:'架空児童',birthDate:''},historyComplete:false,historyNotice:'保存履歴のみ',fetchedAt:new Date().toISOString(),events:empty?[]:[
   ...(topics?[
    {id:`keys-upper-${child}`,at:`${body.date}T07:28:00Z`,category:'keyboard',title:'キーボード なかゆび(うえ)',detail:'クリア',amount:'うった数 25回 / ミス 1回 / せいかく 96%'},
    {id:`keys-home-${child}`,at:`${body.date}T07:27:00Z`,category:'keyboard',title:'キーボード くすりゆび(ホーム)',detail:'クリア',amount:'うった数 15回 / ミス 2回 / せいかく 88%'},
    {id:`keys-blind-${child}`,at:`${body.date}T07:26:00Z`,category:'keyboard',title:'キーボード は行(ブラインド)',detail:'クリア',amount:'うった数 40回 / ミス 0回 / せいかく 100%'},
    {id:`text-complete-${child}`,at:`${body.date}T07:43:00Z`,category:'text',title:'ぶんしょう ももたろう',detail:'おわり / しんきろく',amount:'うった数 34文字 / ミス 0か所 / スコア 34'},
    {id:`text-partial-${child}`,at:`${body.date}T07:39:00Z`,category:'text',title:'ぶんしょう ももたろう',detail:'とちゅうでやめた',amount:'うった数 17文字 / 9分02秒'},
   ]:[]),
   ...(!topics?[{id:`mouse-${child}`,at:`${body.date}T00:00:00Z`,category:'mouse',title:`${child}のマウス練習`,detail:'クリア',amount:changed?'変更した実績':'1ステージ'},
   {id:`text-${child}`,at:`${body.date}T00:30:00Z`,category:'text',title:`${child}の文章入力`,detail:'練習',amount:'120文字'},
   ...(extra?[{id:`new-${child}`,at:`${body.date}T01:00:00Z`,category:'typing',title:`${child}の追加練習`,detail:'キー入力',amount:'30問'}]:[])]:[]),
  ]}});
 });
 await page.goto(url);await page.evaluate(()=>localStorage.clear());
 await page.goto(url+'?new=true');
 const panel=page.getByRole('region',{name:'Dレッスンの自動反映'});
 const draftPc=child=>Object.values(latestDraft?.childDrafts?.[child]?.sectionAnswers||{}).find(section=>section.answers.module_pc_content)?.answers.module_pc_content;
 const evidence=child=>JSON.parse(draftPc(child)?.nestedDetails?.dLessonHistoryEvidence||'{"events":[]}').events;
 await wait(()=>evidence('child-import-a').length===2&&evidence('child-import-b').length===2);
 assert(await page.getByRole('checkbox',{name:'Dレッスンの実績を自動反映',exact:true}).isChecked(),'new draft defaults on');
 assert(draftPc('child-import-a').value.includes('元の入力'),'manual value preserved');
 assert(draftPc('child-import-a').note==='職員の手入力備考','manual note preserved');
 assert(latestDraft.childDrafts['child-import-a'].sectionAnswers['record-module-pc-existing'].answers.module_pc_posture.value==='職員が観察した内容','observation preserved');
 assert(evidence('child-import-a').every(event=>event.studentId==='student_ui_a'&&event.importMode==='automatic'),'A evidence isolated');
 assert(evidence('child-import-b').every(event=>event.studentId==='student_ui_b'),'B evidence isolated');
 assert(latestDraft.childDrafts['child-import-b'].recordModules.filter(module=>module.type==='pc').length===1,'new PC module created once');
 await panel.locator('summary').click();
 await panel.screenshot({path:'output/playwright/manual-lesson-auto.png'});
 await page.setViewportSize({width:1280,height:900});await panel.scrollIntoViewIfNeeded();
 await page.screenshot({path:'output/playwright/lesson-auto-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no mobile overflow');
 await page.screenshot({path:'output/playwright/lesson-auto-mobile.png',fullPage:true});
 const refresh=page.getByRole('button',{name:'最新の実績を再取得',exact:true});
 const beforeSingle=calls.filter(call=>call.action==='history').length;
 await panel.getByRole('button',{name:'架空児童 あおいの実績を再取得',exact:true}).click();
 await wait(()=>calls.filter(call=>call.action==='history').length===beforeSingle+1);
 await page.getByText('取得状況：2名の実績あり',{exact:true}).waitFor();
 assert(calls.filter(call=>call.action==='history').slice(beforeSingle).every(call=>call.childId==='child-import-a'),'single-child retry does not refetch another child');
 assert(evidence('child-import-a').length===2&&evidence('child-import-b').length===2,'targeted retry preserves all evidence');
 assert(await panel.getByText(/確認時刻（端末時計）：/).count()===2,'check time displayed for each child');
 let count=calls.filter(call=>call.action==='history').length;
 await refresh.click();await wait(()=>calls.filter(call=>call.action==='history').length>=count+2);
 await page.getByText('取得状況：2名の実績あり',{exact:true}).waitFor();
 assert(evidence('child-import-a').length===2,'repeat does not duplicate');
 extra=true;await refresh.click();await wait(()=>evidence('child-import-a').length===3&&evidence('child-import-b').length===3);
 changed=true;await refresh.click();await page.getByText(/取り込み済みの実績がDレッスン側で変更されています/).first().waitFor();
 assert(!draftPc('child-import-a').value.includes('変更した実績'),'changed source does not overwrite');
 changed=false;fail=true;await refresh.click();await page.getByText('試験用：実績の閲覧権限がありません。',{exact:false}).first().waitFor();
 assert(evidence('child-import-a').length===3,'failure keeps prior facts');
 fail=false;empty=true;await refresh.click();await page.getByText(/取得できた履歴はありません。未実施とは判断できません/).first().waitFor();
 assert(evidence('child-import-a').length===3,'empty does not erase history');
 empty=false;revoked=true;afterRead=false;await refresh.click();await page.getByText(/学習連携が変更されました/).first().waitFor();
 assert(evidence('child-import-a').length===3,'revoked link retains draft');
 revoked=false;afterRead=false;
 await page.goto(url);await page.evaluate(()=>localStorage.clear());latestDraft=null;
 await page.goto(url);await page.getByRole('checkbox',{name:'Dレッスンの実績を自動反映',exact:true}).waitFor();
 assert(!await page.getByRole('checkbox',{name:'Dレッスンの実績を自動反映',exact:true}).isChecked(),'saved records default off');
 await page.getByRole('checkbox',{name:'Dレッスンの実績を自動反映',exact:true}).check();
 await wait(()=>JSON.parse(latestDraft?.childDrafts?.['child-import-a']?.sectionAnswers?.pc?.answers?.pc_content?.nestedDetails?.dLessonHistoryEvidence||'{"events":[]}').events.length===3);
 assert(latestDraft.childDrafts['child-import-a'].sectionAnswers.pc.answers.pc_content.value.includes('元の入力'),'legacy template opt-in preserves hand entry');
 await page.goto(url+'?new=true&readonly=true');
 count=calls.filter(call=>call.action==='history').length;await new Promise(r=>setTimeout(r,600));
 assert(calls.filter(call=>call.action==='history').length===count,'read-only performs no automatic reads');
 // Start an automatic read, then turn it off while the server response is pending.
 await page.evaluate(()=>localStorage.clear());delay=600;latestDraft=null;
 await page.goto(url+'?new=true');
 await wait(()=>calls.filter(call=>call.action==='history').length>count);
 await page.getByRole('checkbox',{name:'Dレッスンの実績を自動反映',exact:true}).uncheck();
 await new Promise(r=>setTimeout(r,1000));
 assert(evidence('child-import-a').length===0,'late response after disabling is ignored');
 delay=0;topics=true;latestDraft=null;
 await page.evaluate(()=>localStorage.clear());await page.goto(url);
 await page.getByRole('checkbox',{name:'Dレッスンの実績を自動反映',exact:true}).check();
 const legacyAnswer=()=>latestDraft?.childDrafts?.['child-import-a']?.sectionAnswers?.pc?.answers?.pc_content;
 await wait(()=>JSON.parse(legacyAnswer()?.nestedDetails?.dLessonHistoryEvidence||'{"events":[]}').events.length===5);
 const expected='ももたろう〔完了・34文字／途中終了・17文字〕';
 assert(legacyAnswer().value.includes(expected),'text task completion and stopped result remain separate');
 assert(legacyAnswer().value.includes('なかゆび(うえ)〔完了・正確率96%〕'),'typing task accuracy retained');
 assert(legacyAnswer().value.includes('は行(ブラインド)〔完了・正確率100%〕'),'blind task is part of typing details');
 await page.getByRole('button',{name:/^Dレッスン/}).click();
 const practice=page.getByRole('region',{name:'Dレッスンの取り組み内容'});
 await practice.getByText(/ももたろう〔完了・34文字／途中終了・17文字〕/).waitFor();
 await page.getByRole('button',{name:'＋ 実績がない取り組みを手入力',exact:true}).click();
 const manual=page.getByRole('article',{name:'Dレッスン手入力 1'});
 await manual.getByLabel('課題名',{exact:true}).fill('自動実績がない練習');
 await manual.getByLabel('完了状況',{exact:true}).selectOption('partial');
 await manual.getByLabel('正確率（%）',{exact:true}).fill('72');
 await wait(()=>legacyAnswer().value.includes('自動実績がない練習〔途中終了・正確率72%〕'));
 await page.setViewportSize({width:1280,height:900});await practice.scrollIntoViewIfNeeded();
 await practice.screenshot({path:'output/playwright/manual-lesson-details.png'});
 await page.screenshot({path:'output/playwright/lesson-topics-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await practice.scrollIntoViewIfNeeded();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'task editor has no mobile overflow');
 await page.screenshot({path:'output/playwright/lesson-topics-mobile.png',fullPage:true});
 assert(errors.length===0,errors.join('\n'));
 return {passed:true,cases:['automatic multiple children','source isolation','PC module creation','manual preservation','guarded draft autosave','no inferred observations','duplicate prevention','single-child retry without other reads','check time per child','new practice retry','changed source','permission failure','empty history','revoked link','saved record opt-in','legacy template integration','read-only','late-response cancellation','mobile layout','task names and accuracy','completed and stopped text separation','manual supplement with source preserved','task editor desktop/mobile']};
}
try{command('open',url.href);command('snapshot');const output=command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(url.href)})`);const result=output.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!result||JSON.parse(result[1]).passed!==true)throw Error(`Regression incomplete: ${output}`);console.log(result[1]);}finally{command('close');}
