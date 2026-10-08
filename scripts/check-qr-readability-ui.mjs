// Local display fixture only: no login, QR issuance or physical camera.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const args = process.argv.slice(2), cli = args[args.indexOf('--cli') + 1];
if (!args.includes('--cli') || !cli) throw Error('Playwright CLI required');
const url = 'http://127.0.0.1:3014/tests/fixtures/qr-readability.html';
const session = 'qr-readability-' + Date.now();
mkdirSync('output/playwright', { recursive: true });
function command(...args) {
  const result = spawnSync(process.execPath, [resolve(cli), '-s=' + session, ...args], { encoding: 'utf8', timeout: 180000, maxBuffer: 4194304 });
  if (result.status !== 0 || result.stdout.includes('### Error')) throw Error(result.stdout + result.stderr);
  return result.stdout;
}
async function check(page, url) {
  let checks = 0; const assert = (ok, label) => { checks++; if (!ok) throw Error(label); };
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:3014') && !r.url().startsWith('data:')) external.push(r.url()); });
  await page.context().route('https://**', route => route.abort());
  await page.goto(url);
  const open = page.getByRole('button', { name: '読み取り用表示（QRを大きく）', exact: true });
  const close = page.getByRole('button', { name: '通常表示へ戻る', exact: true });
  const overlay = page.getByRole('dialog', { name: '本人用QRの読み取り用表示', exact: true });
  const image = page.getByAltText('大きく表示した本人用QR', { exact: true });
  await page.getByAltText('ログイン・出退勤用の本人用QR', {exact:true}).evaluate(async node => await node.decode());
  for (const [black,white] of [[0,255],[30,100]]) {
    assert(await page.evaluate(([black,white]) => window.__qrReadabilityTest.decode(black,white), [black,white]), 'real decoder preserves token in synthetic contrast ' + black + '/' + white);
  }
  // Diagnostic, not a promised tolerance: bright/washed-out images may still fail.
  const syntheticHighBlackLevelReadable = await page.evaluate(() => window.__qrReadabilityTest.decode(140,235));
  for (const [name, width, height] of [['phone',390,844],['small',320,568],['landscape',844,390],['tablet',768,1024]]) {
    await page.setViewportSize({ width, height });
    const normal = await page.getByAltText('ログイン・出退勤用の本人用QR', { exact: true }).boundingBox();
    const src = await page.getByAltText('ログイン・出退勤用の本人用QR', { exact: true }).getAttribute('src');
    await open.click();
    const rect = await image.boundingBox();
    assert(Math.min(rect.width,rect.height) > normal.width, 'reading view QR is larger at ' + name);
    assert(rect.x >= 0 && rect.y >= 0 && rect.x+rect.width <= width+1 && rect.y+rect.height <= height+1, 'entire QR within screen at ' + name);
    assert(await close.isVisible() && await overlay.getByText('あと120秒有効・自動更新 ／ 1回限り').isVisible(), 'close and expiry visible at ' + name);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow at ' + name);
    assert(await image.getAttribute('src') === src, 'enlarging uses same image without reissuing QR at ' + name);
    assert(await image.evaluate(node => getComputedStyle(node).filter === 'none'), 'no brightness or color filter alters QR at ' + name);
    await page.screenshot({ path: 'output/playwright/qr-readability-' + name + '.png' });
    await close.click();
  }
  await open.click();
  assert(await close.evaluate(node => node === document.activeElement), 'focus moves to overlay close');
  await page.keyboard.press('Tab'); assert(await close.evaluate(node => node === document.activeElement), 'focus remains inside overlay');
  await page.keyboard.press('Escape'); assert(!await overlay.count() && await open.evaluate(node => node === document.activeElement), 'Escape restores focus to launch control');
  await page.locator('summary').click();
  assert(await page.getByText('この画面は端末の明るさ設定を変更しません。').isVisible(), 'manual brightness guidance does not pretend to change device setting');
  await open.click();
  await page.evaluate(() => window.__qrReadabilityTest.set({ seconds: 0 }));
  assert(await image.count() === 0, 'expired QR not displayed in expanded mode');
  await overlay.getByRole('button', { name: '新しいQRを表示', exact: true }).click();
  await image.waitFor(); assert(await page.evaluate(() => window.__qrReadabilityTest.renewals) === 1, 'renewal requires explicit action');
  await page.evaluate(() => window.__qrReadabilityTest.set({ loading: true, imageUrl: '' }));
  await overlay.getByText('新しいQRを準備しています…').waitFor();
  assert(await image.count() === 0 && await close.isVisible(), 'old image hidden while loading and close remains available');
  await page.evaluate(() => window.__qrReadabilityTest.set({ loading: false, receipt: 'ログインを受け付けました。', imageUrl: '' }));
  await overlay.getByText('ログインを受け付けました。').waitFor(); assert(await image.count() === 0, 'used QR disappears and receipt visible');
  await page.evaluate(() => window.__qrReadabilityTest.set({ receipt: '', error: '利用停止中です。' }));
  await overlay.getByRole('alert').waitFor(); assert(await image.count() === 0, 'revocation error never displays old QR');
  await close.click();
  assert(await open.count() === 0, 'no enlargement offered when no valid QR');
  assert(errors.length === 0, 'no uncaught errors'); assert(external.length === 0, 'no external requests');
  return { passed: true, checks, syntheticHighBlackLevelReadable, readsPrivateData: false, realCameraUsed: false };
}
try {
  command('open', url); command('snapshot');
  const out = command('run-code', `async(page)=>await (${check.toString()})(page,${JSON.stringify(url)})`);
  const match = out.match(/### Result\s+([\s\S]*?)\s+### Ran/);
  if (!match || !JSON.parse(match[1]).passed) throw Error(out);
  console.log(match[1]);
} finally { command('close'); }
