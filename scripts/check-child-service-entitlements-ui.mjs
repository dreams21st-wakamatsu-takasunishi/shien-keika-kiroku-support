// Real UI, synthetic PostgREST responses. No production traffic.
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const cli=process.argv[2];if(!cli)throw Error('Playwright CLI path required');
const session='child-service-entitlements-'+Date.now(),url='http://127.0.0.1:3014/tests/fixtures/child-documents.html?mode=entitlement-consumers';
function command(...args){
 const r=spawnSync(process.execPath,[resolve(cli),'-s='+session,...args],{encoding:'utf8',timeout:90000,maxBuffer:4194304});
 if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);
 return r.stdout;
}
async function check(page,url){
 page.setDefaultTimeout(12000);const errors=[],writes=[],reads=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.confirm=()=>true;});
 let visits=[{childId:'a',date:'2026-11-01'}];
 await page.context().route('**/*',async route=>{
  const request=route.request(),target=new URL(request.url());
  if(target.pathname.endsWith('/rpc/get_child_service_entitlements')){
   const body=request.postDataJSON();reads.push(body);
   return route.fulfill({json:body.p_purpose==='record'
    ? {entitlements:body.p_child_ids[0]==='a'?[{childId:'a',individualSupportTypes:['I','III']}]:[],visits:[]}
    : {entitlements:[{childId:'a',dayServiceDays:1,visitingDays:1}],visits}});
  }
  if(target.pathname.endsWith('/rpc/set_child_visiting_plan')){
   const body=request.postDataJSON();writes.push(body);
   visits=visits.filter(row=>row.childId!==body.p_child_id||row.date!==body.p_date);
   if(body.p_scheduled)visits.push({childId:body.p_child_id,date:body.p_date});
   return route.fulfill({status:204});
  }
  return target.origin==='http://127.0.0.1:3014'?route.continue():route.abort();
 });
 await page.setViewportSize({width:390,height:844});await page.goto(url);
 const badge=page.getByText('受給者証：個別サポート加算 Ⅰ・Ⅲ',{exact:true});
 await badge.waitFor();
 await page.getByText('架空児童A：通所 2日／支給量 1日（1日超過）',{exact:true}).waitFor();
 await page.getByLabel('記録の児童',{exact:true}).selectOption('b');await badge.waitFor({state:'hidden'});
 await page.getByLabel('訪問予定の児童',{exact:true}).selectOption('a');
 await page.getByRole('button',{name:'訪問予定を登録',exact:true}).click();
 const visitOver=page.getByText('架空児童A：訪問支援 2日／支給量 1日（1日超過）',{exact:true});
 await visitOver.waitFor();await page.getByRole('button',{name:'訪問予定を取消',exact:true}).click();await visitOver.waitFor({state:'hidden'});
 await page.getByText('架空児童A：通所 2日／支給量 1日（1日超過）',{exact:true}).waitFor();
 if(errors.length||writes.length!==2||writes.some(r=>r.p_child_id!=='a'||r.p_date!=='2026-11-02')||!writes[0].p_scheduled||writes[1].p_scheduled
  ||!reads.some(r=>r.p_purpose==='record'&&r.p_child_ids.join(',')==='b')||!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
   throw Error('Unexpected UI state or request scope');
 return {passed:true,separateQuotas:true,absenceExcluded:true,recordBadgeScoped:true,visitAddAndCancel:true,productionAccess:false};
}
try{
 command('open','about:blank');command('snapshot');
 const output=command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(url)})`);
 const match=output.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!match||!JSON.parse(match[1]).passed)throw Error(output);console.log(match[1]);
}finally{command('close');}
