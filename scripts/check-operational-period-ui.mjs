import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const cli=process.argv[process.argv.indexOf('--cli')+1],session='operational-period-'+process.pid;
if(!process.argv.includes('--cli'))throw Error('--cli required');
const url='http://127.0.0.1:3014/tests/fixtures/operational-period.html';
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s='+session,...args],{encoding:'utf8',timeout:90000,maxBuffer:4194304});if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page,url){
 const calls=[],errors=[],assert=(ok,msg)=>{if(!ok)throw Error(msg);};
 let fail=true;
 page.on('pageerror',error=>errors.push(error.message));
 await page.context().route('**/*',async route=>{
  const target=new URL(route.request().url());
  if(target.origin===new URL(url).origin)return route.continue();
  if(target.hostname!=='fixture.invalid')return route.abort();
  const table=target.pathname.split('/').at(-1);
  if(table!=='attendance_records'&&table!=='transport_runs')return route.fulfill({json:[]});
  const column=table==='attendance_records'?'work_date':'service_date';
  const range=target.searchParams.getAll(column);
  calls.push({table,range,org:target.searchParams.get('organization_id')});
  if(range.includes('gte.2026-08-05')&&fail)return route.fulfill({status:400,json:{message:'fixture fail'}});
  const date=range[0]?.slice(4);
  return route.fulfill({json:table==='transport_runs'?[{id:'run-'+date,service_date:date,name:'架空便',direction:'迎え',start_time:'14:30',end_time:'15:30',stops:[]}]:[]});
 });
 await page.goto(url);
 await page.getByText('1便',{exact:true}).waitFor({timeout:10000});
 assert(calls.length===2&&calls.every(row=>row.org==='eq.fixture-office'&&row.range.join(',')==='gte.2026-11-13,lte.2026-11-13'),'initial queries not limited to today');
 await page.getByLabel('業務の対象日',{exact:true}).fill('2026-08-05');
 await page.getByRole('alert').waitFor({timeout:10000});
 assert(await page.getByText('0便',{exact:true}).count()===0,'failed data shown as empty');
 fail=false;
 await page.getByRole('button',{name:'再読み込み',exact:true}).click();
 await page.getByText('1便',{exact:true}).waitFor({timeout:10000});
 assert(calls.slice(-2).every(row=>row.range.join(',')==='gte.2026-08-05,lte.2026-08-05'),'history queries not date-scoped');
 assert(!errors.length,errors.join('\n'));return {passed:true,calls:calls.length};
}
try{command('open',url);command('snapshot');const out=command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(url)})`);const result=out.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!result||!JSON.parse(result[1]).passed)throw Error(out);console.log(result[1]);}finally{command('close');}
