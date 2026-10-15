// Both local guides; synthetic screenshots only. No production access.
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];
if(!args.includes('--cli')||!cli)throw Error('--cli required');
const session='illustrated-manual-'+Date.now(),base='http://127.0.0.1:3014/manuals/d-support/';
const guides=[{file:'index.html',source:'sections.json',pdf:'Dサポート_図解操作マニュアル.pdf',search:'この児童を再取得',target:'lesson-auto'},{file:'troubleshooting.html',source:'troubleshooting.json',pdf:'Dサポート_トラブル対応ガイド.pdf',search:'403',target:'forbidden'}].map(g=>({...g,count:JSON.parse(readFileSync('docs/manuals/'+g.source,'utf8')).length}));
mkdirSync('output/playwright',{recursive:true});
function command(...args){const r=spawnSync(process.execPath,[resolve(cli),'-s='+session,...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(r.status!==0||r.stdout.includes('### Error'))throw Error(r.stdout+r.stderr);return r.stdout;}
async function check(page,base,guides){
 const assert=(ok,label)=>{if(!ok)throw Error(label);},errors=[],external=[],result=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:3014')&&!request.url().startsWith('data:'))external.push(request.url());});
 await page.context().route('https://**',route=>route.abort());
 for(const guide of guides){
  await page.setViewportSize({width:1280,height:900});await page.goto(base+guide.file);await page.locator('.cover h1').waitFor();
  await page.evaluate(async()=>{for(const img of document.querySelectorAll('figure img'))img.loading='eager';await Promise.all([...document.querySelectorAll('figure img')].map(img=>img.decode()));await document.fonts.ready;});
  assert(await page.locator('.manual-page').count()===guide.count,'section count '+guide.file);
  assert(await page.locator('figure img').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0)),'all illustrations load');
  await page.getByRole('searchbox').fill(guide.search);assert(await page.locator('.manual-page:visible').count()>0,'search finds matching text');
  await page.getByRole('searchbox').fill('見つからない語句XYZ');assert(await page.locator('.manual-page:visible').count()===0,'zero results');
  const target=page.locator('.contents a[href="#'+guide.target+'"]');await target.click();
  assert(await page.locator('#'+guide.target).isVisible(),'TOC reveals a section hidden by search');
  assert(await page.getByRole('searchbox').inputValue()==='','TOC resets the filter');
  await page.locator('#'+guide.target+' .image-zoom').click();await page.locator('#zoom[open]').waitFor();await page.keyboard.press('Escape');assert(!await page.locator('#zoom').isVisible(),'image escape closes');
  await page.getByRole('searchbox').fill(guide.search);await page.getByRole('button',{name:'すべて表示',exact:true}).click();assert(await page.locator('.manual-page:visible').count()===guide.count,'reset restores all');
  for(const [width,height] of [[1366,768],[390,844]]){
   await page.setViewportSize({width,height});await page.locator('#'+guide.target).scrollIntoViewIfNeeded();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no overflow '+guide.file+' '+width);
   await page.screenshot({path:'output/playwright/guide-'+guide.file.replace('.html','')+'-'+width+'.png'});
  }
  await page.setViewportSize({width:1280,height:900});await page.emulateMedia({media:'print'});
  const heights=await page.locator('.cover,.contents,.manual-page').evaluateAll(items=>items.map(item=>({id:item.id||item.className,height:item.getBoundingClientRect().height})));
  const oversized=heights.filter(item=>item.height>1031);assert(!oversized.length,'A4 height '+JSON.stringify(oversized));
  await page.pdf({path:'public/manuals/d-support/'+guide.pdf,format:'A4',printBackground:true,preferCSSPageSize:true,tagged:true,outline:true});
  await page.emulateMedia({media:'screen'});result.push({guide:guide.file,sections:guide.count,loadedImages:guide.count,pdfGenerated:true,maxHeight:Math.max(...heights.map(item=>item.height))});
 }
 assert(!errors.length,'browser exceptions: '+errors.join(','));assert(!external.length,'no external content requests');
 return {passed:true,result,productionAccess:false};
}
try{command('open',base+'index.html');command('snapshot');const output=command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(base)},${JSON.stringify(guides)})`);const match=output.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!match||!JSON.parse(match[1]).passed)throw Error(output);console.log(match[1]);}finally{command('close');}
