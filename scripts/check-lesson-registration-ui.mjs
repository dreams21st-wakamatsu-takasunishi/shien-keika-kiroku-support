import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const args = process.argv.slice(2), cli = args[args.indexOf('--cli') + 1];
if (!args.includes('--cli')) throw Error('--cli required');
mkdirSync('output/playwright', { recursive: true });
function command(...args) {
  const result = spawnSync(process.execPath, [resolve(cli), '-s=lesson-registration-regression', ...args], { encoding: 'utf8', timeout: 120000, maxBuffer: 4194304 });
  if (result.status !== 0 || result.stdout.includes('### Error')) throw Error(result.stdout + result.stderr);
  return result.stdout;
}
async function check(page) {
  const assert = (ok, label) => { if (!ok) throw Error(label); };
  let permission = false, failOnce = true, wrong = false, expiry = 600000, delay = 0;
  const calls = [], operations = [], links = [], errors = [];
  const childId = 'child-ui-unlinked', name = '架空児童 未連携', project = 'abcdefghijklmnopqrst';
  page.on('pageerror', error => errors.push(error.message));
  await page.context().route('https://*.supabase.co/**', route => route.abort());
  await page.context().route('**/functions/v1/lesson-learning', route => route.fulfill({ json: { links, configured: true, canManageLinks: true, canManageAccounts: false, canIssueAccounts: permission } }));
  await page.context().route('**/functions/v1/lesson-account-credentials', route => route.fulfill({ json: { operations: [] } }));
  await page.context().route('**/functions/v1/lesson-student-registration', async route => {
    const body = route.request().postDataJSON();
    if (body.action === 'configuration') return route.fulfill({ json: { sourceProject: project, fingerprint: 'a'.repeat(64), name, birthDate: '2016-01-01', allowNew: operations.length === 0, campuses: [{ id: 'main', name: '本校' }, { id: 'school', name: '試験校' }], operations } });
    calls.push(body); assert(body.confirmed && body.fingerprint === 'a'.repeat(64) && body.childId === childId && !('passcode' in body), 'bound server generation');
    let op = operations.find(row => row.id === body.operationId);
    if (!op) { op = { id: body.operationId, campusId: body.campusId, phase: 'requested', at: new Date().toISOString(), canResume: true }; operations.push(op); }
    if (failOnce) { failOnce = false; return route.fulfill({ status: 503, json: { error: '試験用：登録結果未確定' } }); }
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    const link = { id: op.id, organization_id: '11111111-1111-4111-8111-111111111111', child_id: childId, revision: 1, source_display_name: name, source_project_ref: project, source_table: 'user_data', source_student_id: `student_support_${op.id.replaceAll('-', '')}`, source_campus_id: op.campusId, active: true, verified_at: new Date().toISOString() };
    op.phase = 'completed'; links.splice(0, links.length, link);
    const checkedAt = new Date().toISOString();
    return route.fulfill({ json: { link: wrong ? { ...link, child_id: 'wrong-child' } : link, credentials: { schemaVersion: 1, operationId: op.id, action: 'issue', childId, linkId: op.id,
      identity: { sourceProjectRef: project, dataTable: 'user_data', studentId: link.source_student_id, campusId: op.campusId, displayName: name, birthDate: '2016-01-01' }, account: { status: 'ready', authCount: 1, loginNumber: '19' },
      card: { verified: true, loginNumber: '19', loginUrl: `https://dreams21st-wakamatsu-takasunishi.github.io/d-lesson-v4/?campus=${op.campusId}`, passcode: '0123456789' }, checkedAt, expiresAt: new Date(Date.parse(checkedAt) + expiry).toISOString() } } });
  });
  const select = async () => { await page.getByRole('tab', { name: 'アカウント連携', exact: true }).click(); await page.getByRole('button', { name: /架空児童 未連携/ }).click(); };
  await page.goto('http://localhost:3014/tests/fixtures/lesson-learning.html'); await select();
  assert(await page.getByRole('region', { name: '未連携児童の新規登録' }).count() === 0, 'both permissions required');
  permission = true; await page.reload(); await select();
  const panel = page.getByRole('region', { name: '未連携児童の新規登録' });
  await panel.getByText('2016-01-01', { exact: true }).waitFor();
  const button = panel.getByRole('button', { name: '新規登録してカード表示', exact: true });
  assert(await button.isDisabled(), 'explicit confirmation required');
  assert(await panel.getByRole('option').count() === 2, 'authorized campus list');
  await panel.getByLabel('新規登録先校舎', { exact: true }).selectOption('school');
  const confirm = async () => { await panel.getByLabel('新規登録対象児童の氏名', { exact: true }).fill(name); await panel.getByRole('checkbox').check(); };
  await confirm(); await button.click(); await page.getByText('試験用：登録結果未確定', { exact: true }).waitFor();
  assert(await button.isDisabled(), 'pending receipt blocks second creation');
  await confirm(); wrong = true; await panel.getByRole('button', { name: '同じ登録の結果を再確認', exact: true }).click();
  await page.getByText('新規登録の応答を照合できません。同じ操作を再確認してください。', { exact: true }).waitFor();
  assert(await page.getByRole('dialog').count() === 0, 'wrong child response cannot display secret');
  wrong = false; await confirm(); await panel.getByRole('button', { name: '同じ登録の結果を再確認', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '確認済みログインカード' }); await dialog.waitFor(); await dialog.getByRole('img').waitFor();
  assert(calls.length === 3 && calls.every(call => call.operationId === calls[0].operationId && call.campusId === 'school'), 'retry preserves operation and campus');
  assert(await dialog.getByText('0123456789', { exact: true }).count() === 1, 'card retains leading zero');
  assert(await page.evaluate(() => ![...Object.values(localStorage), ...Object.values(sessionStorage)].some(value => String(value).includes('0123456789'))), 'no browser secret storage');
  await page.setViewportSize({ width: 1280, height: 900 }); await page.screenshot({ path: 'output/playwright/lesson-registration-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no mobile overflow'); await page.screenshot({ path: 'output/playwright/lesson-registration-mobile.png', fullPage: true });
  await dialog.getByRole('button', { name: 'カードを閉じて合言葉を消去' }).click(); await dialog.waitFor({ state: 'detached' });
  await panel.getByRole('button', { name: '同じ登録の結果を再確認', exact: true }).waitFor();
  expiry = 1000; await confirm(); await panel.getByRole('button', { name: '同じ登録の結果を再確認', exact: true }).click(); await dialog.waitFor(); await dialog.waitFor({ state: 'detached', timeout: 10000 });
  expiry = 600000; delay = 1000; await confirm(); await panel.getByRole('button', { name: '同じ登録の結果を再確認', exact: true }).click();
  await page.getByRole('button', { name: /架空児童 あおい/ }).click(); await page.waitForTimeout(1500); assert(await dialog.count() === 0, 'late response after child switch discarded');
  await page.getByRole('button', { name: /架空児童 未連携/ }).click(); delay = 0;
  await panel.getByRole('button', { name: '同じ登録の結果を再確認', exact: true }).waitFor(); await confirm(); await panel.getByRole('button', { name: '同じ登録の結果を再確認', exact: true }).click(); await dialog.waitFor();
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); }); await dialog.waitFor({ state: 'detached' });
  assert(errors.length === 0, errors.join(','));
  return { passed: true, confirmation: true, campusBoundRetry: true, wrongChildRejected: true, cardExpiryHiddenAndChildIsolation: true, noSecretStorage: true, desktopAndMobile: true };
}
try { command('open', 'about:blank'); const output = command('run-code', `async (page) => (${check.toString()})(page)`); const result = output.match(/### Result\s+([\s\S]*?)\s+### Ran/); if (!result || JSON.parse(result[1]).passed !== true) throw Error(output); console.log(result[1]); }
finally { command('close'); }
