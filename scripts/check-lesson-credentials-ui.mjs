import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const args = process.argv.slice(2), cli = args[args.indexOf('--cli') + 1];
const url = 'http://localhost:3014/tests/fixtures/lesson-learning.html';
if (!args.includes('--cli')) throw Error('--cli required');
mkdirSync('output/playwright', { recursive: true });
function command(...args) {
  const result = spawnSync(process.execPath, [resolve(cli), '-s=lesson-credential-regression', ...args], { encoding: 'utf8', timeout: 120000, maxBuffer: 4194304 });
  if (result.status !== 0 || result.stdout.includes('### Error')) throw Error(result.stdout + result.stderr);
  return result.stdout;
}
async function check(page, url) {
  const assert = (ok, label) => { if (!ok) throw Error(label); };
  let permission = false, failOnce = true, delay = 0, expiry = 600000;
  const calls = [], errors = [], operations = [];
  const links = ['a', 'b'].map((key, index) => ({ id: `11111111-1111-4111-8111-11111111111${index}`, organization_id: '11111111-1111-4111-8111-111111111111', child_id: `child-ui-${key}`, revision: 1,
    source_display_name: `架空アカウント ${key}`, source_project_ref: 'abcdefghijklmnopqrst', source_table: 'user_data', source_student_id: `student_ui_${key}`, source_campus_id: 'main', active: true, verified_at: '2026-10-08T00:00:00Z' }));
  page.on('pageerror', error => errors.push(error.message));
  await page.context().route('https://*.supabase.co/**', route => route.abort());
  await page.context().route('**/functions/v1/lesson-learning', route => route.fulfill({ json: { links, configured: true, canManageLinks: true, canManageAccounts: !permission, canIssueAccounts: permission } }));
  await page.context().route('**/functions/v1/lesson-account-credentials', async route => {
    const body = route.request().postDataJSON(); const link = links.find(link => link.child_id === body.childId); assert(link, 'bound child only');
    if (body.action === 'operations') return route.fulfill({ json: { operations: operations.filter(item => item.child === body.childId).map(({ child, ...item }) => item) } });
    calls.push(body); assert(body.confirmed && body.revision === 1 && !('passcode' in body), 'server generates credentials');
    let operation = operations.find(item => item.id === body.operationId);
    if (!operation) { operation = { id: body.operationId, action: body.action, status: 'requested', at: new Date().toISOString(), finishedAt: null, canResume: true, child: body.childId }; operations.unshift(operation); }
    if (failOnce) { failOnce = false; return route.fulfill({ status: 503, json: { error: '試験用：発行結果が未確定です' } }); }
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    operation.status = 'completed'; operation.finishedAt = new Date().toISOString();
    const checkedAt = new Date().toISOString();
    return route.fulfill({ json: { schemaVersion: 1, operationId: body.operationId, action: body.action, childId: body.childId, linkId: link.id,
      identity: { sourceProjectRef: link.source_project_ref, dataTable: 'user_data', studentId: link.source_student_id, campusId: 'main', displayName: link.source_display_name, birthDate: '' },
      account: { status: 'ready', authCount: 1, loginNumber: '19' }, card: { verified: true, loginNumber: '19', loginUrl: 'https://dreams21st-wakamatsu-takasunishi.github.io/d-lesson-v4/?campus=main', passcode: '0123456789' },
      checkedAt, expiresAt: new Date(Date.parse(checkedAt) + expiry).toISOString() } });
  });
  const select = async () => { await page.getByRole('tab', { name: 'アカウント連携', exact: true }).click(); await page.getByRole('button', { name: /架空児童 あおい/ }).click(); };
  await page.goto(url); await page.locator('body').ariaSnapshot(); await select();
  assert(await page.getByRole('region', { name: '学習アカウント発行・再発行' }).count() === 0, 'check permission never grants mutation');
  assert(await page.getByRole('button', { name: 'アカウント設定を確認', exact: true }).count() === 1, 'read-only account permission remains usable');
  permission = true; await page.reload(); await select();
  const panel = page.getByRole('region', { name: '学習アカウント発行・再発行' }); await panel.waitFor();
  const button = panel.getByRole('button', { name: '教室アカウント発行してカード表示', exact: true });
  assert(await button.isDisabled(), 'explicit name and acknowledgement required');
  const confirm = async () => { await panel.getByLabel('発行対象児童の氏名', { exact: true }).fill('架空児童 あおい'); await panel.getByRole('checkbox').check(); };
  await confirm(); await button.click(); await page.getByText('試験用：発行結果が未確定です', { exact: true }).waitFor();
  assert(await page.getByRole('dialog').count() === 0 && await button.isDisabled(), 'unknown response has no secret and prevents another issuance');
  await confirm(); await panel.getByRole('button', { name: '同じ操作の結果を再確認', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '確認済みログインカード' }); await dialog.waitFor();
  assert(calls.length === 2 && calls[0].operationId === calls[1].operationId && calls[0].action === calls[1].action, 'retry preserves operation identity');
  await dialog.getByRole('img').waitFor();
  assert(await dialog.getByText('0123456789', { exact: true }).count() === 1, 'leading zero survives card');
  assert(await page.evaluate(() => ![...Object.values(localStorage), ...Object.values(sessionStorage)].some(value => String(value).includes('0123456789'))), 'generated secret not stored');
  await page.setViewportSize({ width: 1280, height: 900 }); await page.screenshot({ path: 'output/playwright/lesson-credentials-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile overflow'); await page.screenshot({ path: 'output/playwright/lesson-credentials-mobile.png', fullPage: true });
  await dialog.getByRole('button', { name: 'カードを閉じて合言葉を消去' }).click();
  await panel.getByRole('radio', { name: '合言葉再発行', exact: true }).check();
  await confirm(); expiry = 1000;
  await panel.getByRole('button', { name: '合言葉再発行してカード表示', exact: true }).click(); await dialog.waitFor(); await dialog.waitFor({ state: 'detached', timeout: 10000 });
  expiry = 600000; delay = 1000; await confirm();
  await panel.getByRole('button', { name: '合言葉再発行してカード表示', exact: true }).click();
  await page.getByRole('button', { name: /架空児童 ひなた/ }).click(); await page.waitForTimeout(1500);
  assert(await dialog.count() === 0, 'late mutation cannot display another child secret');
  await page.getByRole('button', { name: /架空児童 あおい/ }).click(); await panel.waitFor();
  delay = 0; await confirm(); await panel.getByRole('button', { name: '同じ操作の結果を再確認', exact: true }).first().click(); await dialog.waitFor();
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); }); await dialog.waitFor({ state: 'detached' });
  assert(errors.length === 0, `page errors: ${errors.join(',')}`);
  return { passed: true, dedicatedPermission: true, explicitConfirmation: true, idempotentRetry: true, expiryAndChildIsolation: true, secretStorageAbsent: true, mobileAndDesktop: true };
}
try {
  command('open', 'about:blank');
  const output = command('run-code', `async (page) => (${check.toString()})(page, ${JSON.stringify(url)})`);
  const result = output.match(/### Result\s+([\s\S]*?)\s+### Ran/);
  if (!result || JSON.parse(result[1]).passed !== true) throw Error(output);
  console.log(result[1]);
}
finally { command('close'); }
