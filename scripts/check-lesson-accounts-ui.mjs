import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const args = process.argv.slice(2), cli = args[args.indexOf('--cli') + 1];
const url = new URL(args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:3014/tests/fixtures/lesson-learning.html');
if (!args.includes('--cli') || !['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/tests/fixtures/lesson-learning.html') throw Error('Local fixture and --cli required');
mkdirSync('output/playwright', { recursive: true });
function command(...args) {
  const result = spawnSync(process.execPath, [resolve(cli), '-s=lesson-account-regression', ...args], { encoding: 'utf8', timeout: 120000, maxBuffer: 4194304 });
  if (result.status !== 0 || result.stdout.includes('### Error')) throw Error(result.stdout + result.stderr);
  return result.stdout;
}
async function check(page, url) {
  const assert = (ok, label) => { if (!ok) throw Error(label); };
  let canManageAccounts = true, delay = 0, status = 'ready', wrong = false, expiresIn = 600000;
  const errors = [], calls = [];
  const links = ['a', 'b'].map((key, index) => ({ id: `11111111-1111-4111-8111-11111111111${index}`, child_id: `child-ui-${key}`, revision: 1,
    source_display_name: `架空アカウント ${key}`, source_project_ref: 'abcdefghijklmnopqrst', source_table: 'user_data', source_student_id: `student_ui_${key}`,
    source_campus_id: 'main', active: true, verified_at: '2026-10-08T00:00:00Z' }));
  page.on('pageerror', error => errors.push(error.message));
  await page.context().route('https://*.supabase.co/**', route => route.abort());
  await page.context().route('**/functions/v1/lesson-learning', route => route.fulfill({ json: { links, configured: true, canManageLinks: true, canManageAccounts } }));
  await page.context().route('**/functions/v1/lesson-accounts', async route => {
    const body = route.request().postDataJSON(); calls.push(body);
    if (body.action === 'audit') return route.fulfill({ json: { audits: [{ id: links[0].id, action: 'inspect', outcome: 'checked', at: new Date().toISOString() }] } });
    const link = links.find(link => link.child_id === body.childId); assert(link, 'only linked fixture children');
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if (wrong && body.action === 'verify-card') return route.fulfill({ status: 400, json: { error: '試験用：合言葉不一致' } });
    const checkedAt = new Date().toISOString(), verify = body.action === 'verify-card';
    return route.fulfill({ json: { schemaVersion: 1, childId: link.child_id, linkId: link.id,
      identity: { sourceProjectRef: link.source_project_ref, dataTable: 'user_data', studentId: link.source_student_id, campusId: 'main', displayName: link.source_display_name, birthDate: '' },
      account: { status, authCount: 1, loginNumber: '19' }, checkedAt, expiresAt: verify ? new Date(Date.parse(checkedAt) + expiresIn).toISOString() : null,
      card: verify ? { verified: true, loginNumber: '19', loginUrl: 'https://dreams21st-wakamatsu-takasunishi.github.io/d-lesson-v4/?campus=main' } : null } });
  });
  await page.goto(url);
  const snapshot = await page.locator('body').ariaSnapshot(); assert(snapshot.includes('アカウント連携'), 'initial account tab');
  await page.getByRole('tab', { name: 'アカウント連携', exact: true }).click();
  await page.getByRole('button', { name: /架空児童 あおい/ }).click();
  const inspect = page.getByRole('button', { name: 'アカウント設定を確認', exact: true });
  await inspect.click();
  await page.getByText('教室ログインの設定を確認済み', { exact: true }).waitFor();
  const form = page.getByRole('form', { name: 'ログインカードの確認' });
  const fill = async () => { await form.getByLabel('現在の合言葉', { exact: true }).fill('123456'); await form.getByRole('checkbox').check(); };
  await fill(); wrong = true;
  await form.getByRole('button', { name: '合言葉を確認してカード表示', exact: true }).click();
  await page.getByText('試験用：合言葉不一致', { exact: true }).waitFor();
  assert(await page.getByRole('dialog').count() === 0, 'wrong passphrase cannot open card');
  wrong = false; await inspect.click(); await form.waitFor(); await fill();
  await form.getByRole('button', { name: '合言葉を確認してカード表示', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '確認済みログインカード' });
  await dialog.waitFor(); await dialog.getByRole('img', { name: 'Dレッスンを開くQRコード' }).waitFor();
  assert(await dialog.getByText('123456', { exact: true }).count() === 1, 'verified passphrase displayed');
  assert(await form.getByLabel('現在の合言葉', { exact: true }).inputValue() === '', 'input cleared after verification');
  assert(await page.evaluate(() => ![...Object.values(localStorage), ...Object.values(sessionStorage)].some(value => String(value).includes('123456'))), 'secret not stored');
  await page.setViewportSize({ width: 1280, height: 900 }); await page.screenshot({ path: 'output/playwright/lesson-account-card-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile card overflow');
  assert(await dialog.getByRole('img').evaluate(image => image.naturalWidth === 144 && image.naturalHeight === 144), 'QR pixels rendered');
  await page.screenshot({ path: 'output/playwright/lesson-account-card-mobile.png', fullPage: true });
  await page.emulateMedia({ media: 'print' });
  assert(await page.locator('#root').evaluate(root => getComputedStyle(root).display === 'none'), 'print hides support screen');
  assert(await dialog.getByRole('button', { name: '印刷', exact: true }).isVisible() === false, 'print hides card tools');
  assert(await dialog.getByText('123456', { exact: true }).isVisible(), 'print retains only selected card secret');
  await page.pdf({ path: 'output/playwright/lesson-account-card-print.pdf', format: 'A4', printBackground: true });
  await page.screenshot({ path: 'output/playwright/lesson-account-card-print.png', fullPage: true });
  await page.emulateMedia({ media: 'screen' });
  await dialog.getByRole('button', { name: 'カードを閉じて合言葉を消去' }).click();
  assert(await page.getByText('123456', { exact: true }).count() === 0, 'close clears card secret');
  await fill(); await form.getByRole('button', { name: '合言葉を確認してカード表示', exact: true }).click(); await dialog.waitFor();
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await dialog.waitFor({ state: 'detached' });
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); });
  assert(await page.getByText('123456', { exact: true }).count() === 0, 'hidden page clears secret');
  expiresIn = 300; await fill(); await form.getByRole('button', { name: '合言葉を確認してカード表示', exact: true }).click();
  await dialog.waitFor(); await dialog.waitFor({ state: 'detached' }); expiresIn = 600000;
  status = 'review'; await inspect.click(); await page.getByText('Authと児童の対応を要確認', { exact: true }).waitFor();
  assert(await page.getByRole('form', { name: 'ログインカードの確認' }).count() === 0, 'ambiguous Auth cannot show card form');
  status = 'ready'; delay = 500; await inspect.click();
  await page.getByRole('button', { name: /架空児童 ひなた/ }).click();
  await page.getByRole('button', { name: 'アカウント設定を確認', exact: true }).waitFor();
  assert(await page.getByRole('form', { name: 'ログインカードの確認' }).count() === 0, 'late previous-child result not displayed');
  delay = 0; canManageAccounts = false; await page.getByRole('button', { name: '試験用：職員切替' }).click();
  await page.getByRole('button', { name: 'アカウント設定を確認', exact: true }).waitFor({ state: 'detached' });
  assert(await page.getByRole('dialog').count() === 0, 'permission switch invalidates card');
  assert(errors.length === 0, `page errors: ${errors.join(',')}`);
  return { passed: true, cases: ['dedicated permission', 'Auth diagnosis', 'wrong passphrase', 'verified in-app card', 'QR rendering', 'desktop/mobile', 'print PDF', 'no storage', 'close/hidden/expiry deletion', 'ambiguous Auth', 'child/scope switch'], actualAuthMutations: 0 };
}
try {
  command('open', 'about:blank');
  const output = command('run-code', `async (page) => { return await (${check.toString()})(page,${JSON.stringify(url.href)}); }`);
  const result = output.match(/### Result\s+([\s\S]*?)\s+### Ran/);
  if (!result || JSON.parse(result[1]).passed !== true) throw Error(output);
  console.log(result[1]);
} finally { command('close'); }
