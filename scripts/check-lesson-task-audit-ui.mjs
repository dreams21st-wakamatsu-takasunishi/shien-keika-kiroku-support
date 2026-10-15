import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];
const url=new URL(args.includes('--url')?args[args.indexOf('--url')+1]:'http://localhost:3014/tests/fixtures/lesson-learning.html');
if(!args.includes('--cli')||!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/tests/fixtures/lesson-learning.html')throw Error('Local fixture URL and --cli are required');
mkdirSync('output/playwright',{recursive:true});
function command(...args){const result=spawnSync(process.execPath,[resolve(cli),'-s=lesson-task-audit-regression',...args],{encoding:'utf8',timeout:120000,maxBuffer:4194304});if(result.status!==0||result.stdout.includes('### Error'))throw Error(result.stdout+result.stderr);return result.stdout;}
async function check(page,url){
 const assert=(ok,label)=>{if(!ok)throw Error(label);};
 const id=i=>`11111111-1111-4111-8111-${String(i).padStart(12,'0')}`,org=id(900),actor=id(901),otherActor=id(902),time='2026-10-15T01:00:00.123456+00:00';
 const filters={kind:'all',state:'all',actorId:null};
 const entries=Array.from({length:23},(_,i)=>({operationId:id(i),title:`架空の履歴課題${i}：ことば入力とマウス操作の練習`,createdAt:time,kind:i%3===0?'create':i%3===1?'edit':'stop',parentId:i%3===0?null:id(0),actorId:i%2?otherActor:actor,actorName:i%2?'架空職員 退職済み':'架空職員 管理者',actorActive:i%2===0,total:2,saved:i%2?1:2}));
 const actors=[{id:actor,name:'架空職員 管理者',active:true},{id:otherActor,name:'架空職員 退職済み',active:false}],calls=[],errors=[];
 let allowed=true,wrongDetail=false,failList=false,wrongFilter=false,delay=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.context().route('https://*.supabase.co/**',route=>route.abort());
 await page.context().route('**/functions/v1/lesson-learning',route=>route.fulfill({json:{links:[],canManageLinks:true,configured:true,canViewTaskAudit:allowed}}));
 await page.context().route('**/functions/v1/lesson-task-audit',async route=>{
  const body=route.request().postDataJSON();calls.push(body);
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  if(failList&&body.action==='list'){await route.fulfill({status:503,json:{error:'試験用：履歴の取得失敗'}});return;}
  if(body.action==='list'){
   const selected=entries.filter(row=>(body.filters.kind==='all'||body.filters.kind===row.kind)&&(!body.filters.actorId||body.filters.actorId===row.actorId)
    &&(body.filters.state==='all'||body.filters.state==='pending'&&row.saved<row.total||body.filters.state==='completed'&&row.saved===row.total));
   const start=body.cursor?selected.findIndex(row=>row.operationId===body.cursor.operationId)+1:0,display=selected.slice(start,start+20),last=display.at(-1);
   await route.fulfill({json:{schemaVersion:1,organizationId:org,filters:wrongFilter?{...body.filters,kind:'stop'}:body.filters,entries:display,actors,nextCursor:start+20<selected.length?{createdAt:last.createdAt,operationId:last.operationId}:null}});
  }else if(body.action==='detail'){
   const entry=entries.find(row=>row.operationId===body.operationId),template={category:'mouse',stageId:'1',title:entry.title,instructions:'架空の練習内容',startsOn:'2026-10-15',endsOn:'2026-10-16'};
   const items=[0,1].map(i=>({childId:`child-ui-${i?'b':'a'}`,linkId:id(100+i),revision:1,campusId:'main',group:'教室の学習グループ',available:true,taskId:id(200+i),status:i<entry.saved?'saved':'pending',errorCode:i<entry.saved?'':'connection',savedAt:i<entry.saved?time:null,
    ...(entry.kind==='create'?{}:{before:{...template,id:id(200+i),revision:2,active:true,updatedAt:time}})}));
   await route.fulfill({json:{schemaVersion:1,organizationId:wrongDetail?id(999):org,entry,batch:{operationId:entry.operationId,createdAt:time,template,items,kind:entry.kind,parentId:entry.parentId}}});
  }else throw Error('Unexpected audit action');
 });
 await page.goto(url);await page.getByRole('tab',{name:'課題の指定',exact:true}).click();await page.getByRole('button',{name:'事業所の一括課題履歴',exact:true}).click();
 const panel=page.getByRole('region',{name:'事業所の一括課題履歴',exact:true});
 await panel.getByText('1ページ目・20件',{exact:true}).waitFor();
 await page.setViewportSize({width:1280,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'desktop overflow');await page.screenshot({path:'output/playwright/task-audit-desktop.png',fullPage:true});
 await panel.getByRole('button',{name:'次の20件',exact:true}).click();await panel.getByText('2ページ目・3件',{exact:true}).waitFor();assert(await panel.getByRole('button',{name:'次の20件',exact:true}).isDisabled(),'last page disabled');
 await panel.getByRole('button',{name:'前の20件',exact:true}).click();await panel.getByText('1ページ目・20件',{exact:true}).waitFor();
 await panel.getByRole('combobox',{name:'履歴の処理状況',exact:true}).selectOption('pending');await panel.getByText('1ページ目・11件',{exact:true}).waitFor();
 await panel.getByRole('combobox',{name:'履歴の担当職員',exact:true}).selectOption(otherActor);await panel.getByText('1ページ目・11件',{exact:true}).waitFor();
 await panel.getByRole('combobox',{name:'履歴の操作',exact:true}).selectOption('edit');await panel.getByText('1ページ目・4件',{exact:true}).waitFor();
 const expected=entries[1];wrongDetail=true;
 await panel.getByRole('button',{name:`課題履歴を確認：${expected.title}`,exact:true}).click();await panel.getByRole('alert').waitFor();assert(await panel.getByRole('region',{name:'一括課題履歴の詳細',exact:true}).count()===0,'wrong organization detail blocked');
 wrongDetail=false;await panel.getByRole('button',{name:'履歴を再取得',exact:true}).click();await panel.getByText('1ページ目・4件',{exact:true}).waitFor();
 await panel.getByRole('button',{name:`課題履歴を確認：${expected.title}`,exact:true}).click();
 const detail=panel.getByRole('region',{name:'一括課題履歴の詳細',exact:true});await detail.waitFor();await detail.getByText('架空児童 あおい',{exact:true}).waitFor();await detail.getByText('架空児童 ひなた',{exact:true}).waitFor();await detail.getByText('通信結果が未確定です。同じ課題で再確認してください。',{exact:true}).waitFor();
 assert(await detail.getByRole('checkbox').count()===0,'no mutation confirmation');assert(await detail.getByRole('button').count()===1,'only return navigation in read-only detail');
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'detail mobile overflow');await page.screenshot({path:'output/playwright/task-audit-detail-mobile.png',fullPage:true});
 await detail.getByRole('button',{name:'履歴一覧へ',exact:true}).click();await panel.getByText('1ページ目・4件',{exact:true}).waitFor();
 failList=true;await panel.getByRole('button',{name:'履歴を再取得',exact:true}).click();await panel.getByText('試験用：履歴の取得失敗',{exact:true}).waitFor();assert(await panel.getByRole('button',{name:/課題履歴を確認/}).count()===0,'failed refresh clears previous results');
 failList=false;wrongFilter=true;await panel.getByRole('button',{name:'履歴を再取得',exact:true}).click();await panel.getByRole('alert').waitFor();assert(await panel.getByRole('button',{name:/課題履歴を確認/}).count()===0,'wrong filter response blocked');
 wrongFilter=false;await panel.getByRole('button',{name:'履歴を再取得',exact:true}).click();await panel.getByText('1ページ目・4件',{exact:true}).waitFor();
 await page.screenshot({path:'output/playwright/task-audit-list-mobile.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'list mobile overflow');
 delay=800;await panel.getByRole('button',{name:'履歴を再取得',exact:true}).click();allowed=false;await page.getByRole('button',{name:'試験用：職員切替',exact:true}).click();await page.getByText('管理者権限の確認が必要です。',{exact:true}).waitFor();await page.waitForTimeout(1000);
 assert(await page.getByRole('button',{name:'事業所の一括課題履歴',exact:true}).count()===0,'nonadmin entry hidden');assert(await page.getByText(expected.title,{exact:true}).count()===0,'late old-admin response removed');
 assert(calls.every(call=>['list','detail'].includes(call.action)),'read-only UI sends no mutation');assert(errors.length===0,errors.join('\n'));
 return {passed:true,readsPrivateData:false,scenarios:['filters','tie-preserving-cursor','pagination','read-only-detail','wrong-org','failed-refresh-clears','wrong-filter','scope-switch','1280px','390px']};
}
try{command('open',url.toString(),'--browser','chrome');const result=command('run-code',`async page => (${check.toString()})(page, ${JSON.stringify(url.toString())})`);process.stdout.write(result);}finally{command('close');}
