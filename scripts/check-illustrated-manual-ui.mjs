// Local manual only. No provider URLs, private metadata, or production writes.
import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];
if(!cli)throw Error('--cli required');
const session='illustrated-manual-'+Date.now(),url='http://127.0.0.1:3014/manuals/d-support/index.html';
mkdirSync('output/playwright',{recursive:true});
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s='+session,...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page,url){
 const assert=(ok,label)=>{if(!ok)throw Error(label);};
 await page.context().route('https://*.supabase.co/**',route=>route.abort());
 await page.goto(url);await page.locator('.cover h1').waitFor();
 await page.evaluate(async()=>{for(const img of document.querySelectorAll('figure img'))img.loading='eager';await Promise.all([...document.querySelectorAll('figure img')].map(img=>img.decode()));await document.fonts.ready;});
 const count=await page.locator('.manual-page').count();assert(count===49,'49 sections present');
 assert(await page.locator('figure img').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0)),'all manual illustrations load');
 await page.getByRole('searchbox').fill('この児童を再取得');assert(await page.locator('.manual-page:visible').count()===1,'search finds new retry instructions');
 await page.getByRole('button',{name:'すべて表示',exact:true}).click();assert(await page.locator('.manual-page:visible').count()===count,'reset reveals all sections');
 await page.getByRole('link',{name:/本人用QRが出ないとき/}).click();await page.locator('#personal-qr-register').getByRole('button').click();
 await page.locator('#zoom[open]').waitFor();await page.getByRole('button',{name:'画像の拡大を閉じる'}).click();
 for(const id of ['personal-qr-register','lesson-auto','lesson-details','activity','legal-training']){
  await page.locator('#'+id).screenshot({path:'output/playwright/manual-update-'+id+'.png'});
 }
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile no overflow');
 await page.locator('#lesson-auto').scrollIntoViewIfNeeded();await page.screenshot({path:'output/playwright/manual-update-mobile.png',fullPage:false});
 await page.setViewportSize({width:1280,height:900});await page.emulateMedia({media:'print'});
 const heights=await page.locator('.cover,.contents,.manual-page').evaluateAll(items=>items.map(item=>({id:item.id||item.className,height:item.getBoundingClientRect().height})));
 const oversized=heights.filter(item=>item.height>1031);assert(oversized.length===0,'A4 printable height: '+JSON.stringify(oversized));
 await page.pdf({path:'public/manuals/d-support/Dサポート_図解操作マニュアル.pdf',format:'A4',printBackground:true,preferCSSPageSize:true});
 await page.emulateMedia({media:'screen'});
 return {passed:true,sections:count,loadedImages:count,pdfGenerated:true,mobileLayoutChecked:true,maximumSectionHeight:Math.max(...heights.map(row=>row.height))};
}
try{command('open',url);command('snapshot');const out=command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(url)})`),match=out.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!match||!JSON.parse(match[1]).passed)throw Error(out);console.log(match[1]);}finally{command('close');}
