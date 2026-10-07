import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];
const url='http://127.0.0.1:3014/tests/fixtures/word-preview.html';
if(!cli)throw Error('--cli required');
mkdirSync('output/playwright',{recursive:true});
const session='word-preview-lazy-'+Date.now();
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s='+session,...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page,url){
 const assert=(ok,label)=>{if(!ok)throw Error(label);},errors=[],requests=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
 await page.context().route('https://*.supabase.co/**',route=>route.abort());
 await page.goto(url);await page.getByRole('heading',{name:'プレビュー読み込みの試験'}).waitFor();
 const isRenderer=url=>url.includes('/deps/pdfjs-dist.js')||/\/pdfjs-dist\/build\/pdf\.mjs(?:\?|$)/.test(url);
 assert(!requests.some(isRenderer),'PDF renderer not loaded on initial page');
 const approval=page.getByRole('button',{name:'確認して承認（試験用）'});
 assert(await approval.isDisabled(),'approval disabled before preview');
 await page.getByRole('button',{name:'試験：画像',exact:true}).click();
 await page.getByAltText('提出されたWord作品').waitFor();
 for(let i=0;i<100&&await approval.isDisabled();i++)await page.waitForTimeout(100);
 assert(await approval.isEnabled(),'image preview signals ready');
 assert(!requests.some(isRenderer),'image preview does not load PDF renderer');
 await page.getByRole('button',{name:'試験：PDF',exact:true}).click();
 await page.getByRole('status').filter({hasText:'作品を読み込み中'}).waitFor();
 assert(await approval.isDisabled(),'approval waits for PDF rendering');
 const canvas=page.getByLabel('提出作品 1ページ',{exact:true});await canvas.waitFor({state:'visible',timeout:45000});
 assert(await approval.isEnabled(),'PDF ready signals approval');
 assert(requests.some(isRenderer),'renderer loads only after PDF requested');
 assert(await canvas.evaluate(el=>el.width>0&&el.height>0),'real PDF page rendered');
 await page.getByRole('button',{name:'次のページ',exact:true}).click();await page.getByLabel('提出作品 2ページ',{exact:true}).waitFor({state:'visible'});
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile preview no overflow');
 await page.screenshot({path:'output/playwright/word-preview-lazy-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'試験：閉じる',exact:true}).click();assert(await page.locator('canvas').count()===0,'closing clears canvas');
 await page.getByRole('button',{name:'試験：失敗',exact:true}).click();await page.getByRole('alert').filter({hasText:'作品を表示できませんでした'}).waitFor();
 assert(await approval.isDisabled(),'failed preview cannot approve');
 assert(errors.length===0,errors.join('\n'));
 return {passed:true,cases:10,syntheticDataOnly:true,pdfRendererDeferred:true};
}
try{command('open',url);command('snapshot');const out=command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(url)})`),match=out.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!match||!JSON.parse(match[1]).passed)throw Error(out);console.log(match[1]);}finally{command('close');}
