// Real browser beforeunload dialogs and real activity editor; fictional backend only.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];if(!args.includes('--cli')||!cli)throw Error('--cli required');
const url='http://127.0.0.1:3014/tests/fixtures/activity-unload.html',session='activity-unload-'+Date.now();mkdirSync('output/playwright',{recursive:true});
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s='+session,...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page,url){
  let checks=0;const assert=(ok,label)=>{checks++;if(!ok)throw Error(label);},errors=[],external=[],tabs=[];
  const context=page.context();await context.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:3014'?route.continue():route.abort());
  const open=async(query='')=>{const p=await context.newPage();tabs.push(p);p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:3014'))external.push(r.url());});await p.goto(url+query);await p.getByRole('heading',{name:'活動・指導案',exact:true}).waitFor();return p;};
  const title=p=>p.getByRole('textbox',{name:'活動名（必須）',exact:true});
  const save=p=>p.getByRole('button',{name:'保存',exact:true});
  const closed=async p=>{for(let i=0;i<50&&!p.isClosed();i++)await page.waitForTimeout(50);assert(p.isClosed(),'page closes when no pending changes or close accepted');};
  const closeWithWarning=async(p,accept=false)=>{
    const dialogPromise=p.waitForEvent('dialog');await p.close({runBeforeUnload:true});const dialog=await dialogPromise;
    assert(dialog.type()==='beforeunload','native beforeunload dialog shown');
    if(accept){await dialog.accept();await closed(p);}else{await dialog.dismiss();await page.waitForTimeout(100);assert(!p.isClosed(),'cancel keeps editor open');}
  };
  try {
    let p=await open();await title(p).click();await p.close({runBeforeUnload:true});await closed(p);
    p=await open();await title(p).fill('架空の未保存指導案');await closeWithWarning(p);
    assert(await title(p).inputValue()==='架空の未保存指導案','cancel preserves exact typed title');
    assert(await p.evaluate(()=>Object.keys(sessionStorage).some(key=>key.startsWith('d-support-activity-draft-v1:'))),'pending tab draft retained after cancel');
    await closeWithWarning(p,true);
    p=await open();await title(p).fill('架空の保存する指導案');await save(p).click();await p.getByRole('status').filter({hasText:'事業所の活動・指導案として保存しました。'}).waitFor();
    assert(await p.evaluate(()=>window.__activityUnloadFixture.writes)===1,'one explicit save');assert(!await p.evaluate(()=>Object.keys(sessionStorage).some(key=>key.startsWith('d-support-activity-draft-v1:'))),'successful save clears only pending tab draft');
    await p.close({runBeforeUnload:true});await closed(p);
    p=await open();await title(p).fill('架空の保存失敗指導案');await p.evaluate(()=>window.__activityUnloadFixture.failSave=true);await save(p).click();await p.getByRole('alert').filter({hasText:'試験用：保存に失敗しました。'}).waitFor();await closeWithWarning(p);assert(await title(p).inputValue()==='架空の保存失敗指導案','failed save does not clear input or warning');
    await p.evaluate(()=>window.__activityUnloadFixture.failSave=false);await save(p).click();await p.getByRole('status').filter({hasText:'事業所の活動・指導案として保存しました。'}).waitFor();await p.close({runBeforeUnload:true});await closed(p);
    p=await open('?restored=1');await title(p).click();assert(await title(p).inputValue()==='架空の復元指導案','restored pending plan loaded');await closeWithWarning(p);await closeWithWarning(p,true);
    p=await open();await p.getByRole('button',{name:'工作のひな形',exact:true}).click();await closeWithWarning(p);assert((await title(p).inputValue()).includes('工作'),'unsaved template is protected');await closeWithWarning(p,true);
    p=await open();await title(p).fill('別画面へ移動した架空の指導案');await p.getByRole('button',{name:'交通費を計算',exact:true}).click();await p.getByRole('complementary',{name:'交通費計算の小窓',exact:true}).waitFor();await closeWithWarning(p);await p.getByRole('button',{name:'交通費計算を閉じる',exact:true}).click();assert(await title(p).inputValue()==='別画面へ移動した架空の指導案','companion preserves the pending input');
    await save(p).click();await p.getByRole('status').filter({hasText:'事業所の活動・指導案として保存しました。'}).waitFor();await p.getByRole('button',{name:'業務カレンダーを開く',exact:true}).click();await p.getByRole('heading',{name:'業務カレンダーへの移動後',exact:true}).waitFor();await p.close({runBeforeUnload:true});await closed(p);
    p=await open('?foreign=1');await title(p).click();await p.close({runBeforeUnload:true});await closed(p);
    p=await open();await title(p).fill('保存中の架空指導案');await p.evaluate(()=>window.__activityUnloadFixture.delay=1000);await save(p).click();await p.getByRole('button',{name:'保存中…',exact:true}).waitFor();await closeWithWarning(p);await p.getByRole('status').filter({hasText:'事業所の活動・指導案として保存しました。'}).waitFor();await p.close({runBeforeUnload:true});await closed(p);
    assert(!errors.length,'no uncaught app errors '+errors.join(','));assert(!external.length,'no external requests');
    return {passed:true,checks,nativeBrowserCloseDialogs:true,productionAccess:false};
  } finally {for(const p of tabs)if(!p.isClosed())await p.close();}
}
try{command('open',url);command('snapshot');const out=command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(url)})`),match=out.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!match||!JSON.parse(match[1]).passed)throw Error(out);console.log(match[1]);}finally{command('close');}
