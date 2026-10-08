// Actual ZXing decoder over a synthetic canvas MediaStream. No camera/RPC access.
import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];
if(!args.includes('--cli')||!cli)throw Error('Playwright CLI required');
const url='http://127.0.0.1:3014/tests/fixtures/qr-camera-preview.html';
mkdirSync('output/playwright',{recursive:true});
const session=`qr-preview-${Date.now()}`;
function command(...args){const result=spawnSync(process.execPath,[resolve(cli),`-s=${session}`,...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(result.status!==0||result.stdout.includes('### Error'))throw Error(result.stdout+result.stderr);return result.stdout;}
async function check(page,url){
  let checks=0;const assert=(ok,label)=>{checks++;if(!ok)throw Error(label);};
  const errors=[],external=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:3014')&&!request.url().startsWith('data:'))external.push(request.url());});
  await page.context().route('https://**',route=>route.abort());
  const button=page.getByRole('button',{name:'映像の左右反転',exact:true}),video=page.getByLabel('QR読み取り用のカメラ映像',{exact:true});
  const stats=()=>page.evaluate(()=>({...window.__qrPreviewTest.state,release:undefined}));
  const ready=()=>page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
  const mirror=()=>video.evaluate(node=>getComputedStyle(node).transform.startsWith('matrix(-1'));
  const open=async(action='出勤')=>{await page.getByRole('button',{name:action+'の読み取りを確認',exact:true}).click();await ready();await page.waitForTimeout(200);};
  const fresh=async(query)=>{await page.goto(url+query);await page.evaluate(()=>{try{localStorage.removeItem('d-support:qr-preview-mirror:v1');}catch{}});};
  await page.setViewportSize({width:768,height:1024});await fresh('?camera=front');await open();
  assert(await mirror()&&await button.getAttribute('aria-pressed')==='true','front camera preview is a mirror by default');
  const requests=(await stats()).cameraRequests;
  await button.click();assert(!await mirror(),'manual toggle returns front camera to normal');
  await button.click();assert(await mirror()&&(await stats()).cameraRequests===requests,'display toggle does not restart camera or scan');
  await button.click();await page.getByRole('button',{name:'カメラを閉じる',exact:true}).click();
  assert((await stats()).stoppedTracks>0,'closing scanner stops media tracks');
  await open();assert(!await mirror(),'saved normal override survives scanner reopening on a front camera');
  await page.screenshot({path:'output/playwright/qr-camera-preview-tablet.png'});
  await fresh('?camera=back');await open();assert(!await mirror(),'rear camera defaults to normal');
  await button.click();assert(await mirror(),'rear camera can be mirrored manually');
  await fresh('?camera=unknown');await open();assert(!await mirror(),'unknown webcam defaults to normal without pretending to detect its direction');
  await button.click();assert(await mirror(),'unknown webcam supports manual mirror');
  await page.getByRole('button',{name:'カメラを閉じる',exact:true}).click();await open();assert(await mirror(),'mirror override is retained for unknown webcam');
  await fresh('?camera=front');await page.setViewportSize({width:390,height:844});await open();
  assert(await button.isVisible()&&await page.getByRole('button',{name:'カメラを閉じる',exact:true}).isVisible(),'mirror and close controls visible at phone width');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no page-level horizontal overflow');
  await page.screenshot({path:'output/playwright/qr-camera-preview-mobile.png'});
  for(const action of ['出勤','退勤','ログイン']){
    await fresh('?camera=front');await open(action);
    await page.evaluate(()=>window.__qrPreviewTest.showCode('valid'));
    await page.getByRole('dialog').waitFor({state:'hidden'});
    const result=await stats();assert(result.scans===1&&result.tokenMatches&&result.lastAction===action,action+' decodes original QR once while preview is mirrored');
  }
  await fresh('?camera=back');await open();await page.evaluate(()=>window.__qrPreviewTest.showCode('valid'));
  await page.getByRole('dialog').waitFor({state:'hidden'});assert((await stats()).tokenMatches,'normal preview decodes the same original QR token');
  await fresh('?camera=front');await open();await page.evaluate(()=>window.__qrPreviewTest.showCode('invalid'));
  await page.getByRole('alert').waitFor();assert((await stats()).scans===0,'invalid QR never invokes attendance/login handler');
  await fresh('?camera=front');await open();await page.evaluate(()=>{window.__qrPreviewTest.state.mode='error';window.__qrPreviewTest.showCode('valid');});
  await page.getByText('確認用の読み取りエラー',{exact:false}).waitFor();
  await button.click();await page.waitForTimeout(700);
  assert((await stats()).scans===1,'changing mirror after a rejected request does not resubmit the QR');
  await page.evaluate(()=>{window.__qrPreviewTest.showCode('none');window.__qrPreviewTest.state.mode='success';});
  await page.getByRole('button',{name:'もう一度読み取る',exact:true}).click();await ready();
  assert(!await mirror(),'explicit retry retains manual preview orientation');
  await page.evaluate(()=>window.__qrPreviewTest.showCode('valid'));await page.getByRole('dialog').waitFor({state:'hidden'});
  assert((await stats()).scans===2,'only explicit retry permits another attendance attempt');
  await fresh('?camera=front');await open();await page.evaluate(()=>{window.__qrPreviewTest.state.mode='pending';window.__qrPreviewTest.showCode('valid');});
  await page.getByRole('status').waitFor();assert(await button.isDisabled()&&await page.getByRole('button',{name:'カメラを閉じる',exact:true}).isDisabled(),'mirror and close disabled during attendance processing');
  await page.waitForTimeout(700);assert((await stats()).scans===1,'pending request is not duplicated');
  await page.evaluate(()=>window.__qrPreviewTest.state.release());await page.getByRole('dialog').waitFor({state:'hidden'});
  await fresh('?camera=unknown&storage=blocked');await open();await button.click();assert(await mirror(),'blocked local storage cannot prevent manual mirroring');
  await fresh('?camera=error');await page.getByRole('button',{name:'出勤の読み取りを確認',exact:true}).click();await page.getByRole('alert').waitFor();
  const failedRequests=(await stats()).cameraRequests;await button.click();assert((await stats()).cameraRequests===failedRequests,'permission failure does not trigger a camera request when flipping preview');
  await page.getByRole('button',{name:'カメラを閉じる',exact:true}).click();
  assert(errors.length===0,'no uncaught browser errors');assert(external.length===0,'no external API or production requests');
  return {passed:true,checks,syntheticVideoOnly:true,realDecoder:true,realCameraUsed:false,externalRequests:external.length};
}
try{command('open',url);command('snapshot');const out=command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(url)})`),match=out.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!match||!JSON.parse(match[1]).passed)throw Error(out);console.log(match[1]);}finally{command('close');}
