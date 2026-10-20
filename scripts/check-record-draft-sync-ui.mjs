// Two independent browser contexts (isolated device storage), one fake backend.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];if(!args.includes('--cli')||!cli)throw Error('--cli required');
const url='http://127.0.0.1:3014/tests/fixtures/record-draft-sync.html',session='record-draft-sync-'+Date.now();mkdirSync('output/playwright',{recursive:true});
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s='+session,...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page,url){
  let checks=0;const assert=(ok,label)=>{checks++;if(!ok)throw Error(label);},errors=[],unexpected=[],writes=[];
  let row=null,tabletOffline=false,tabletDelay=0;const requests=[];
  const browser=page.context().browser(),tabletContext=await browser.newContext({viewport:{width:744,height:1133},hasTouch:true}),pcContext=await browser.newContext({viewport:{width:1366,height:900}});
  const setup=async(context,device)=>{
    await context.route('**/*',async route=>{
      const request=route.request(),path=new URL(request.url()).pathname;
      if(new URL(request.url()).origin==='http://127.0.0.1:3014')return route.continue();
      const draftKey=new URL(request.url()).searchParams.get('draft_key')?.replace(/^eq\./,'');
      requests.push({device,path,method:request.method(),draftKey});
      if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
      if(device==='tablet'&&tabletOffline)return route.abort('internetdisconnected');
      if(path.endsWith('/record_drafts')&&request.method()==='GET'){
        if(device==='tablet'&&tabletDelay)await new Promise(r=>setTimeout(r,tabletDelay));
        return route.fulfill({json:draftKey==='record-shared-sync-fixture'?structuredClone(row):null});
      }
      if(path.endsWith('/record_drafts')&&request.method()==='DELETE'&&draftKey!=='record-shared-sync-fixture')return route.fulfill({status:204});
      if(path.endsWith('/save_record_draft_guarded')){
        const body=request.postDataJSON();
        if((row&&body.p_expected_revision!==row.revision)||(!row&&body.p_expected_revision!==null))return route.fulfill({status:409,json:{message:'DRAFT_CONFLICT: newer shared revision',code:'P0001'}});
        row={payload:body.p_payload,revision:(row?.revision||0)+1,updated_at:new Date().toISOString(),device_id:body.p_device_id,recorder_profile_id:null};
        writes.push({device,revision:row.revision});return route.fulfill({json:[{new_revision:row.revision,saved_at:row.updated_at}]});
      }
      unexpected.push(path);return route.fulfill({status:503,json:{message:'Synthetic fixture blocks unexpected operations'}});
    });
  };
  await setup(tabletContext,'tablet');await setup(pcContext,'pc');
  const tablet=await tabletContext.newPage(),pc=await pcContext.newPage();
  for(const p of [tablet,pc]){p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));p.on('requestfailed',r=>requests.push({failed:new URL(r.url()).pathname,error:r.failure()}));p.on('console',m=>{if(m.type()==='error'&&!/ERR_INTERNET_DISCONNECTED|409 \(Conflict\)/.test(m.text()))errors.push(m.text());});}
  const wait=async(condition,label)=>{for(let n=0;n<160;n++){if(condition())return;await page.waitForTimeout(100);}throw Error(label);};
  const select=async(p,n)=>{await p.locator(`[data-child-tab-id="child-${n}"]`).getByRole('button').first().click();await p.getByText(`架空児童${n}の記録`,{exact:true}).waitFor();};
  const note=async(p,n,value)=>{await p.bringToFront();await select(p,n);await p.waitForTimeout(200);const section=p.locator('#group-question-attendance'),toggle=section.getByRole('button',{name:/本日の出欠/}),input=section.locator('textarea');if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();const details=section.locator('details');if(await details.count()&&await details.getAttribute('open')===null)await details.locator('summary').click();await input.waitFor({state:'visible'});if(value!==undefined)await input.fill(value);return input;};
  const shared=n=>row?.payload.childDrafts[`child-${n}`].attendanceNote;
  try {
    await tablet.goto(url+'?device=tablet');await wait(()=>row?.payload.selectedChildIds.length===6,'tablet preparation not saved');
    await pc.goto(url+'?device=pc');await pc.getByText('この画面で6名を入力中',{exact:false}).waitFor();
    await note(pc,1,'PCで入力した来所時の状況');await wait(()=>shared(1)==='PCで入力した来所時の状況','PC note not saved');
    await tablet.bringToFront();await tablet.evaluate(()=>window.dispatchEvent(new Event('focus')));
    const a=await note(tablet,1);
    for(let i=0;i<120&&(await a.inputValue())!=='PCで入力した来所時の状況';i++)await tablet.waitForTimeout(100);
    assert(await a.inputValue()==='PCで入力した来所時の状況','given tablet -> PC -> tablet scenario synchronizes same six children');
    assert(await tablet.locator('[data-child-tab-id]').count()===6,'no duplicate child or screen');
    const idleWrites=writes.length;await tablet.waitForTimeout(5400);assert(writes.length===idleWrites,'reading cloud updates does not cause a save loop');
    await tablet.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.includes('record-shared-sync-fixture')){const value=JSON.parse(localStorage.getItem(key));value.updatedAt='2099-12-31T23:59:59Z';localStorage.setItem(key,JSON.stringify(value));}});
    await note(pc,1,'PCで追記した最新の来所時状況');await wait(()=>shared(1)==='PCで追記した最新の来所時状況','PC second save');
    await tablet.reload();const reloaded=await note(tablet,1);
    for(let i=0;i<120&&(await reloaded.inputValue())!=='PCで追記した最新の来所時状況';i++)await tablet.waitForTimeout(100);
    assert(await reloaded.inputValue()==='PCで追記した最新の来所時状況','reload ignores misleading future local clock');
    tabletOffline=true;await tabletContext.setOffline(true);
    await note(tablet,2,'通信断中にタブレットで入力');await tablet.waitForTimeout(1000);
    await note(pc,1,'PCの別項目への追記');await wait(()=>shared(1)==='PCの別項目への追記','PC online save');
    tabletOffline=false;await tabletContext.setOffline(false);await tablet.bringToFront();await tablet.evaluate(()=>window.dispatchEvent(new Event('online')));
    await wait(()=>shared(2)==='通信断中にタブレットで入力','offline input did not merge and save');
    assert(shared(1)==='PCの別項目への追記','independent remote and local edits both preserved');
    tabletOffline=true;await tabletContext.setOffline(true);await note(tablet,1,'同じ項目のタブレット入力');await tablet.waitForTimeout(1000);
    await note(pc,1,'同じ項目のPC入力');await wait(()=>shared(1)==='同じ項目のPC入力','PC conflicting save');
    tabletOffline=false;await tabletContext.setOffline(false);await tablet.bringToFront();await tablet.evaluate(()=>window.dispatchEvent(new Event('online')));
    await tablet.getByText('同じ下書きが別端末で更新されています',{exact:true}).waitFor();
    assert(await (await note(tablet,1)).isVisible(),'local editor remains mounted');
    assert(await (await note(tablet,1)).inputValue()==='同じ項目のタブレット入力'&&shared(1)==='同じ項目のPC入力','conflict keeps both versions without overwriting');
    const conflictWrites=writes.length;await tablet.waitForTimeout(1500);assert(writes.length===conflictWrites,'conflict stops automatic writes');
    await tablet.reload();await tablet.getByText('同じ下書きが別端末で更新されています',{exact:true}).waitFor();
    assert(await (await note(tablet,1)).inputValue()==='同じ項目のタブレット入力','unsent local input and baseline survive reload');
    await tablet.getByRole('button',{name:'別端末の最新内容を読み込む',exact:true}).click();
    assert(await tablet.getByText('同じ下書きが別端末で更新されています',{exact:true}).isVisible(),'cancel keeps conflict and input');
    await tablet.evaluate(()=>window.__draftSyncFixture.confirm=true);
    await tablet.getByRole('button',{name:'別端末の最新内容を読み込む',exact:true}).click();
    await tablet.getByText('同じ下書きが別端末で更新されています',{exact:true}).waitFor({state:'hidden'});
    assert(await (await note(tablet,1)).inputValue()==='同じ項目のPC入力','explicit cloud choice reads latest content');
    tabletDelay=1000;row.payload.childDrafts['child-3'].attendanceNote='読込中に届いた別項目';row.revision++;row.updated_at=new Date().toISOString();
    await tablet.getByRole('button',{name:'別端末の最新入力を確認',exact:true}).click();
    await (await note(tablet,1)).fill('読込と同時に続けたタブレット入力');
    await wait(()=>shared(1)==='読込と同時に続けたタブレット入力','typing during refresh not saved');tabletDelay=0;
    assert(shared(3)==='読込中に届いた別項目','late fetch does not discard concurrent local or remote edits');
    tabletOffline=true;await tabletContext.setOffline(true);await note(tablet,4,'他端末変更なし・通信断中の入力');await tablet.waitForTimeout(1200);
    tabletOffline=false;await tabletContext.setOffline(false);await tablet.evaluate(()=>window.dispatchEvent(new Event('online')));
    await wait(()=>shared(4)==='他端末変更なし・通信断中の入力','reconnect did not retry unchanged cloud baseline');
    assert(shared(4)==='他端末変更なし・通信断中の入力','reconnect retries unsent input even without another cloud update');
    // Force a plain PostgREST conflict object without waiting for the poll.
    row.payload.childDrafts['child-5'].attendanceNote='保存直前のPC入力';row.revision++;row.updated_at=new Date().toISOString();
    await note(tablet,6,'競合保存から統合するタブレット入力');
    await wait(()=>shared(6)==='競合保存から統合するタブレット入力','CAS conflict did not read, merge, and retry');
    assert(shared(5)==='保存直前のPC入力','automatic CAS recovery preserves independent cloud input');
    row.payload.childDrafts['child-6'].attendanceNote='再競合のPC入力';row.payload.childDrafts['child-5'].attendanceNote='優先選択でも残す別児童のPC入力';row.revision++;row.updated_at=new Date().toISOString();
    await note(tablet,6,'確認して優先するタブレット入力');
    await tablet.getByRole('button',{name:'別端末の最新入力を確認',exact:true}).click();
    await tablet.getByText('同じ下書きが別端末で更新されています',{exact:true}).waitFor();
    await tablet.evaluate(()=>window.__draftSyncFixture.confirm=true);
    await tablet.getByRole('button',{name:'この端末の内容を残す',exact:true}).click();
    await wait(()=>shared(6)==='確認して優先するタブレット入力','explicit local choice did not save');
    assert(shared(5)==='優先選択でも残す別児童のPC入力','explicit local conflict resolution preserves independent cloud fields');
    await tablet.screenshot({path:'output/playwright/record-draft-sync-tablet.png',fullPage:true});
    await pc.screenshot({path:'output/playwright/record-draft-sync-pc.png',fullPage:true});
    const lastRevision=row.revision;row=null;const deletedWrites=writes.length;
    await tablet.getByRole('button',{name:'別端末の最新入力を確認',exact:true}).click();
    await tablet.getByText(/共有下書きが見つかりません/).waitFor();await tablet.waitForTimeout(1000);
    assert(row===null&&writes.length===deletedWrites&&lastRevision>1,'saved/deleted cloud draft cannot be recreated by a stale device');
    assert(!errors.length,'no uncaught browser errors '+errors.join(','));assert(!unexpected.length,'only scoped draft read/write requests');
    return {passed:true,checks,twoIndependentDeviceContexts:true,productionAccess:false};
  } catch(error) {await pc.screenshot({path:'output/playwright/record-draft-sync-failed.png',fullPage:true});throw Error(error.message+' | '+JSON.stringify({errors,unexpected,requests,revision:row?.revision,body:(await tablet.locator('body').innerText()).slice(0,1800),pcBody:(await pc.locator('body').innerText()).slice(0,1800)}));}
  finally {await tabletContext.close();await pcContext.close();}
}
try{command('open',url);command('snapshot');const out=command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(url)})`),match=out.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!match||!JSON.parse(match[1]).passed)throw Error(out);console.log(match[1]);}finally{command('close');}
