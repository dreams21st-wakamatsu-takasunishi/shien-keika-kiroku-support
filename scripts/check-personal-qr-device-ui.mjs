// Local browser fixture, synthetic metadata, all Supabase calls intercepted.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const args = process.argv.slice(2), cli = args[args.indexOf('--cli') + 1];
const url = new URL(args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://127.0.0.1:3015/tests/fixtures/personal-qr-device.html');
if (!args.includes('--cli') || !['localhost','127.0.0.1'].includes(url.hostname) || url.pathname !== '/tests/fixtures/personal-qr-device.html') throw Error('Local fixture and --cli required');
mkdirSync('output/playwright', { recursive:true });
const session = 'personal-qr-device-' + Date.now();
function command(...args) {
  const r = spawnSync(process.execPath, [resolve(cli), '-s=' + session, ...args], {encoding:'utf8',timeout:180000,maxBuffer:4194304});
  if (r.status !== 0 || r.stdout.includes('### Error')) throw Error(r.stdout + r.stderr);
  return r.stdout;
}
async function check(page, url) {
  const assert = (ok,label) => { if (!ok) throw Error(label); };
  const errors = [], coverage = []; let state = 'unregistered', label = '', issueCount = 0, requests = 0, failRequest = '', failStatus = false, delayStatus = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.context().route('https://*.supabase.co/**', route => route.abort());
  await page.context().route('**/rest/v1/rpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1), body = route.request().postDataJSON();
    if (name === 'get_personal_staff_qr_device') {
      if (delayStatus) await new Promise(resolve => setTimeout(resolve,delayStatus));
      if (failStatus) return route.fulfill({status:400,json:{message:'STAFF_QR_ACCOUNT_UNAVAILABLE'}});
      return route.fulfill({json:{state,displayName:'架空職員',...(['pending','approved','revoked'].includes(state)?{label:label||'架空スマートフォン'}:{})}});
    }
    if (name === 'request_personal_staff_qr_device') {
      requests++;
      assert(Object.keys(body).sort().join() === ['p_device_token','p_label','p_platform'].sort().join(), 'no identity/approval overrides sent');
      assert(/^[a-f0-9]{64}$/.test(body.p_device_token), 'valid synthetic device token');
      if (failRequest) return route.fulfill({status:400,json:{message:failRequest}});
      state = 'pending'; label = body.p_label;
      return route.fulfill({json:{state,displayName:'架空職員',label}});
    }
    if (name === 'issue_personal_staff_qr') {
      assert(state === 'approved', 'QR never issued before approval'); issueCount++;
      return route.fulfill({json:{token:'f'.repeat(64),displayName:'架空職員',expiresAt:new Date(Date.now()+120000).toISOString(),serverNow:new Date().toISOString(),refreshAfterSeconds:90}});
    }
    if (name === 'get_personal_staff_qr_status') return route.fulfill({json:{}});
    if (name === 'revoke_personal_staff_qr') return route.fulfill({json:null});
    throw Error('Unexpected RPC '+name);
  });
  const open = async () => { await page.getByRole('button',{name:'本人用QRを表示',exact:true}).click(); await page.getByRole('dialog',{name:'本人用QRコード'}).waitFor(); };
  const close = () => page.getByRole('button',{name:'本人用QRを閉じる',exact:true}).click();
  await page.goto(url); await page.setViewportSize({width:390,height:844});
  await open(); await page.getByRole('heading',{name:'この個人端末は未登録です'}).waitFor();
  const submit = page.getByRole('button',{name:'この端末を自分の個人端末として登録申請',exact:true});
  assert(await submit.isDisabled(), 'owner confirmation required');
  assert((await page.getByLabel('個人端末の名称',{exact:true}).inputValue()).length > 0,'default device name');
  await page.getByLabel('個人端末の名称',{exact:true}).fill('架空職員のスマートフォン');
  await page.getByRole('checkbox').check();
  failRequest = 'DEVICE_LABEL_DUPLICATE'; await submit.click(); await page.getByRole('alert').filter({hasText:'同名の端末が登録済み'}).waitFor();
  assert(await page.getByLabel('個人端末の名称',{exact:true}).inputValue() === '架空職員のスマートフォン','error retains label');
  assert(await page.getByRole('checkbox').isChecked(),'error retains confirmation');
  failRequest = ''; await submit.click(); await page.getByRole('heading',{name:'個人端末の承認待ちです'}).waitFor();
  assert(issueCount === 0 && requests === 2,'pending registration without QR issuance');
  assert(await page.getByRole('status').filter({hasText:'管理者に'}).innerText().then(text=>text.includes('架空職員のスマートフォン') && text.includes('端末・アクセス')),'approval instructions identify this device');
  assert(await page.locator('img').count() === 0,'no QR while pending');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile no horizontal overflow');
  await page.screenshot({path:'output/playwright/personal-qr-device-pending-mobile.png',fullPage:true});
  await close(); await open(); await page.getByRole('heading',{name:'個人端末の承認待ちです'}).waitFor();
  assert(await page.getByRole('button',{name:'この端末を自分の個人端末として登録申請',exact:true}).count()===0,'pending state preserved on reopening');
  state = 'approved'; await page.getByRole('button',{name:'承認状況を再確認',exact:true}).click();
  await page.getByAltText('ログイン・出退勤用の本人用QR').waitFor();
  assert(issueCount === 1,'QR issued once after approval even in StrictMode');
  await page.screenshot({path:'output/playwright/personal-qr-device-approved-mobile.png',fullPage:true});
  coverage.push('email manager enrollment', 'explicit owner confirmation', 'default editable label', 'duplicate-name error retains input', 'pending prevents QR issuance', 'approval instructions', 'pending reopening', 'approved recheck issues QR', 'mobile layout');
  // Rechecking a revoked device must remove the formerly visible QR.
  state = 'revoked'; await page.getByRole('button',{name:'新しいQRを表示',exact:true}).click();
  await page.getByRole('status').filter({hasText:'利用停止中'}).waitFor();
  assert(await page.locator('img').count()===0 && issueCount===1,'revocation removes old QR');
  await close();
  for (const [next,text] of [['facility_shared','施設共用端末（QRを読み取る側）'],['other_owner','他の職員の個人端末'],['revoked','利用停止中']]) {
    state=next; await open(); await page.getByRole('status').filter({hasText:text}).waitFor();
    assert(await page.getByRole('checkbox').count()===0 && await page.locator('img').count()===0,'blocked device cannot submit/issue '+next);
    await close();
  }
  failStatus = true; await open(); await page.getByRole('alert').filter({hasText:'職員名簿とログインアカウント'}).waitFor();
  assert(await page.getByRole('checkbox').count()===0,'identity failure does not offer enrollment'); await close(); failStatus=false;
  state='unregistered'; delayStatus=250; await open(); await close(); await page.waitForTimeout(400);
  assert(await page.getByRole('dialog').count()===0 && issueCount===1,'late response cannot reopen closed screen'); delayStatus=0;
  await page.setViewportSize({width:768,height:1024}); await open(); await page.getByRole('heading',{name:'この個人端末は未登録です'}).waitFor();
  await page.screenshot({path:'output/playwright/personal-qr-device-registration-tablet.png',fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'tablet no horizontal overflow');
  coverage.push('revocation clears existing QR', 'shared and other-owner registration blocked', 'revoked registration blocked', 'identity error blocks submission', 'late response after close ignored', 'tablet layout');
  assert(errors.length===0,errors.join('\n'));
  return {passed:true,cases:coverage.length,coverage,syntheticDataOnly:true};
}
try {
  command('open',url.href); command('snapshot');
  const output = command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(url.href)})`);
  const result = output.match(/### Result\s+([\s\S]*?)\s+### Ran/);
  if (!result || !JSON.parse(result[1]).passed) throw Error('Regression incomplete: '+output);
  console.log(result[1]);
} finally { command('close'); }
