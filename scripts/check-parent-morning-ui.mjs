import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];
if(!args.includes('--cli'))throw Error('--cli required');
mkdirSync('output/playwright',{recursive:true});
const session=`parent-morning-${process.pid}-${Date.now()}`;
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),`-s=${session}`,...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page){
 const assert=(v,m)=>{if(!v)throw Error(m);},sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async(fn,m)=>{for(let i=0;i<100;i++){if(await fn())return;await sleep(100);}throw Error(m);};
 const context=page.context(),errors=[],checks=[];context.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>{if(d.type()==='beforeunload')void d.accept();});});page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{if(d.type()==='beforeunload')void d.accept();});
 const date=new Date().toLocaleDateString('sv-SE'),labels={plan:'本日の予定',attendance:'欠席・追加利用',transport:'送迎確認',children:'児童対応',staff:'職員連絡',safety:'安全確認'};
 let row={meeting_date:date,content:'元の朝礼本文を保持する。',revision:1,section_document:null,section_revisions:null,created_at:'2026-11-02T00:00:00Z',updated_at:'2026-11-02T00:00:00Z'},draft=null,sourceVersion=1,failSave=false,failCalls=0,saveCalls=0;
 await context.route('https://*.supabase.co/**',route=>route.abort());
 await context.route('https://*.supabase.co/rest/v1/rpc/**',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1),b=route.request().postDataJSON();let result=null;
  const error=(code,message)=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code,message})});
  if(name==='load_morning_meeting_sections')result=row.deleted_at?null:row;
  else if(name==='save_morning_meeting_section'){
   saveCalls++;if(failSave){failCalls++;return error('08006','fixture offline');}
   const d=row.section_document||{legacy:row.content,plan:'',attendance:'',transport:'',children:'',staff:'',safety:''},rev=row.section_revisions||{legacy:row.revision,plan:0,attendance:0,transport:0,children:0,staff:0,safety:0};
   if(rev[b.p_key]!==b.p_expected_revision&&d[b.p_key]!==b.p_text)result={conflict:true,record:row};
   else{const doc={...d,[b.p_key]:b.p_text},revs={...rev,[b.p_key]:rev[b.p_key]+1};row={...row,section_document:doc,section_revisions:revs,revision:row.revision+1,content:[doc.legacy,...Object.entries(labels).filter(([k])=>doc[k].trim()).map(([k,label])=>`【${label}】\n${doc[k]}`)].filter(Boolean).join('\n\n'),updated_at:new Date(Date.now()+saveCalls).toISOString()};result={conflict:false,record:row};}
  }else if(name==='load_parent_share_draft')result=draft;
  else if(name==='save_parent_share_draft'){
   if(b.p_source_version!==sourceVersion)return error('40001','PARENT_SHARE_SOURCE_CHANGED');
   if(b.p_expected_revision!==(draft?.revision||0))return error('40001','PARENT_SHARE_CONFLICT');
   draft={body:b.p_body,revision:(draft?.revision||0)+1,source_version:b.p_source_version,source_updated_at:b.p_source_updated_at};result=draft;
  }else if(name==='delete_parent_share_draft'){draft=null;result=null;}
  else return route.abort();
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 const url='http://127.0.0.1:3014/tests/fixtures/parent-morning.html';
 await page.setViewportSize({width:1366,height:900});await page.goto(url+'?user=A');
 const peer=await context.newPage();await peer.setViewportSize({width:1366,height:900});await peer.goto(url+'?user=B');
 await page.getByRole('textbox',{name:'朝礼記録の入力',exact:true}).waitFor();
 assert(await page.getByRole('textbox',{name:'朝礼記録の入力',exact:true}).inputValue()===row.content,'legacy text retained');
 const nav=(p,name)=>p.getByRole('navigation',{name:'朝礼の入力項目'}).getByRole('button',{name,exact:false});
 await nav(page,'本日の予定').click();await nav(peer,'職員連絡').click();
 const input=page.getByRole('textbox',{name:'本日の予定の入力',exact:true}),peerInput=peer.getByRole('textbox',{name:'職員連絡の入力',exact:true});
 await input.fill('午前の予定を共有する。');await peerInput.fill('午後は研修を行う。');
 await until(()=>row.section_document?.plan==='午前の予定を共有する。'&&row.section_document?.staff==='午後は研修を行う。','different fields did not save');
 await until(async()=>await page.getByLabel('朝礼日',{exact:true}).isEnabled()&&await peer.getByLabel('朝礼日',{exact:true}).isEnabled(),'pending did not settle');
 assert(row.section_document.legacy==='元の朝礼本文を保持する。','legacy lost during structured save');checks.push('legacy preserved, independent simultaneous saves');
 const box=await input.boundingBox();await peerInput.fill('他職員の未保存入力もプレビューだけに表示。');
 await until(async()=>((await page.getByRole('complementary',{name:'朝礼の仕上がりプレビュー'}).textContent())||'').includes('他職員の未保存入力もプレビューだけに表示。'),'live draft missing');
 const box2=await input.boundingBox();assert(Math.abs(box.y-box2.y)<2,'remote typing moved input');
 await until(async()=>((await page.getByLabel('共同編集と保存状態').textContent())||'').includes('架空職員B'),'presence missing');checks.push('live preview and presence without moving editor');
 await until(()=>row.section_document.staff==='他職員の未保存入力もプレビューだけに表示。','peer save missing');await sleep(500);
 await nav(peer,'本日の予定').click();await input.fill('Aの競合入力');await peer.getByRole('textbox',{name:'本日の予定の入力',exact:true}).fill('Bの競合入力');
 await until(async()=>await page.getByRole('heading',{name:'同じ項目が更新されました'}).count()>0||await peer.getByRole('heading',{name:'同じ項目が更新されました'}).count()>0,'same field conflict not shown');
 const conflictPage=await page.getByRole('heading',{name:'同じ項目が更新されました'}).count()?page:peer;
 assert((await conflictPage.getByRole('textbox',{name:'本日の予定の入力',exact:true}).inputValue()).includes('競合入力'),'local conflict text lost');
 await conflictPage.getByRole('button',{name:'最新内容を使用',exact:true}).click();checks.push('same-field conflict retained and explicitly resolved');await sleep(700);
 failSave=true;await input.fill('通信障害でも入力は残す。');await until(()=>failCalls>0,'failure not exercised');const calls=failCalls;await sleep(2700);assert(failCalls===calls,'failed saves are spinning');assert(await input.inputValue()==='通信障害でも入力は残す。','failure discarded local input');assert(await page.getByLabel('朝礼日',{exact:true}).isDisabled(),'dirty date switch not blocked');
 failSave=false;await page.getByRole('button',{name:'保存・再試行',exact:true}).click();await until(()=>row.section_document.plan==='通信障害でも入力は残す。','retry failed');checks.push('offline failure retained, no request loop, explicit retry');
 await until(async()=>await page.getByLabel('朝礼日',{exact:true}).isEnabled(),'retry still dirty');
 const preview=page.getByRole('complementary',{name:'朝礼の仕上がりプレビュー'});await preview.locator('[data-morning-preview="plan"]').waitFor();
 await page.screenshot({path:'output/playwright/morning-sections-desktop.png',fullPage:true});
 for(const width of [1024,390]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'morning overflow '+width);await page.getByRole('tab',{name:'プレビュー',exact:true}).click();assert(await preview.isVisible(),'mobile preview hidden');await page.getByRole('tab',{name:'入力',exact:true}).click();assert(await input.isVisible(),'mobile editor hidden');await page.screenshot({path:`output/playwright/morning-sections-${width}.png`,fullPage:true});}checks.push('PC/tablet/phone layouts');
 await input.fill('削除通知後も入力を保持する。');row={...row,deleted_at:new Date().toISOString()};await page.evaluate(date=>window.dispatchEvent(new CustomEvent('d-support:workspace-item-deleted',{detail:{resource:'morning_meeting_records',id:date}})),date);const before=saveCalls;await sleep(2200);assert(saveCalls===before,'deleted row saved');assert(await input.isDisabled()&&await input.inputValue()==='削除通知後も入力を保持する。','deletion did not protect local input');checks.push('deletion blocks pending writes');
 await peer.close();page=await context.newPage();await page.goto(url+'?part=parent');await page.evaluate(()=>{window.__copies=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.__copies.push(text)},configurable:true});});
 await page.getByRole('button',{name:'保護者への共有文を開く',exact:true}).click();
 const text=page.getByRole('textbox',{name:'保護者への共有文の下書き'}),copy=page.getByRole('button',{name:'確認してコピー',exact:true});await until(async()=>await text.isEnabled(),'parent load pending');
 assert(!(await text.inputValue()).includes('ひなた'),'other-child free text automatically included');assert(await copy.isDisabled(),'copy before acknowledgement');
 await text.fill('本日は算数のプリントに取り組みました。空欄が残ったため、引き続き確認します。');await page.getByRole('button',{name:'下書き保存',exact:true}).click();await page.getByText('共有文の下書きを保存しました。',{exact:true}).waitFor();
 const original=draft.body;await page.getByRole('button',{name:'共有文を閉じる',exact:true}).click();await page.getByRole('button',{name:'保護者への共有文を開く',exact:true}).click();await until(async()=>await text.isEnabled(),'reopen pending');assert(await text.inputValue()===original,'saved manual edits overwritten');
 await page.getByRole('checkbox',{name:/児童・日付・送信先を確認/}).check();await copy.click();await until(async()=>(await page.evaluate(()=>window.__copies.length))===1,'copy failed');assert(draft.body===original,'copy changed draft');assert((await page.getByRole('status').textContent()).includes('送信済みにはしていません'),'copy treated as sent');checks.push('private draft retained and reviewed copy is not sending');
 sourceVersion=2;await page.evaluate(()=>window.__parentShare.changeSource());assert(await copy.isDisabled(),'stale source copy not disabled');assert(await text.inputValue()===original,'source change replaced edits');
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'選択候補から再作成',exact:true}).click();await page.getByRole('checkbox',{name:/児童・日付・送信先を確認/}).check();await copy.click();await until(async()=>(await page.evaluate(()=>window.__copies.length))===2,'regenerated copy failed');checks.push('source changes require regeneration and review');
 await page.setViewportSize({width:1366,height:900});await page.screenshot({path:'output/playwright/parent-share-guide.png',fullPage:true});
 draft={...draft,revision:draft.revision+1};await copy.click();await page.getByRole('alert').filter({hasText:'別の端末で下書きが変更'}).waitFor();assert(await page.evaluate(()=>window.__copies.length)===2,'revision conflict copied stale text');checks.push('draft revision conflict blocks clipboard');
 for(const width of [1366,1024,390]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'parent overflow '+width);await page.screenshot({path:`output/playwright/parent-share-${width}.png`,fullPage:true});}
 assert(!errors.length,errors.join('\n'));return{passed:true,checks};
}
try{command('open','http://127.0.0.1:3014/tests/fixtures/parent-morning.html');command('snapshot');const out=command('run-code',`async(page)=>await (${check.toString()})(page)`),result=out.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!result||JSON.parse(result[1]).passed!==true)throw Error(out);console.log(result[1]);}finally{command('close');}
