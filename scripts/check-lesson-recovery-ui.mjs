import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const args = process.argv.slice(2), cli = args[args.indexOf('--cli') + 1];
if (!args.includes('--cli')) throw Error('--cli required');
mkdirSync('output/playwright', { recursive: true });
function command(...args) {
  const result = spawnSync(process.execPath, [resolve(cli), '-s=lesson-recovery-regression', ...args], { encoding: 'utf8', timeout: 120000, maxBuffer: 4194304 });
  if (result.status !== 0 || result.stdout.includes('### Error')) throw Error(result.stdout + result.stderr);
  return result.stdout;
}
async function check(page) {
  const assert = (value, label) => { if (!value) throw Error(label); };
  const operationId = '11111111-1111-4111-8111-111111111111', childId = 'child-ui-unlinked', name = '架空児童 未連携', project = 'abcdefghijklmnopqrst';
  let canTakeOver = false, canResume = false, revision = 0, failOnce = true, delay = 0;
  const calls = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.context().route('https://*.supabase.co/**', route => route.abort());
  await page.context().route('**/functions/v1/lesson-learning', route => route.fulfill({ json: { links: [], configured: true, canManageLinks: true, canIssueAccounts: true } }));
  await page.context().route('**/functions/v1/lesson-student-registration', async route => {
    const body = route.request().postDataJSON();
    if (body.action === 'configuration') return route.fulfill({ json: { sourceProject: project, fingerprint: 'a'.repeat(64), name, birthDate: '2018-01-01', allowNew: false, campuses: [{ id: 'main', name: '本校' }], operations: [{ id: operationId, campusId: 'main', phase: 'source-created', at: new Date().toISOString(), canResume, canTakeOver, handoffRevision: revision }] } });
    calls.push(body);
    assert(body.operationId === operationId && body.childId === childId && body.confirmed && !('passcode' in body), 'original operation and child bound');
    if (body.action === 'handoff') {
      assert(body.handoffRevision === revision && body.reason === 'permission-change', 'bound revision and enum reason');
      if (failOnce) { failOnce = false; return route.fulfill({ status: 503, json: { error: '試験用：引き継ぎ結果未確定' } }); }
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      canTakeOver = false; canResume = true; revision++;
      return route.fulfill({ json: { schemaVersion: 1, operationId, childId, requestId: body.requestId, revision } });
    }
    assert(body.action === 'register' && canResume, 'handoff is separate from registration');
    const link = { id: operationId, organization_id: operationId, child_id: childId, revision: 1, active: true, verified_at: new Date().toISOString(), source_project_ref: project, source_table: 'user_data', source_student_id: `student_support_${operationId.replaceAll('-', '')}`, source_campus_id: 'main', source_display_name: name };
    const checkedAt = new Date().toISOString();
    return route.fulfill({ json: { link, credentials: { schemaVersion: 1, operationId, action: 'issue', childId, linkId: operationId, identity: { sourceProjectRef: project, dataTable: 'user_data', studentId: link.source_student_id, campusId: 'main', displayName: name, birthDate: '2018-01-01' }, account: { status: 'ready', authCount: 1, loginNumber: '19' }, card: { verified: true, loginNumber: '19', passcode: '0123456789', loginUrl: 'https://dreams21st-wakamatsu-takasunishi.github.io/d-lesson-v4/?campus=main' }, checkedAt, expiresAt: new Date(Date.parse(checkedAt) + 600000).toISOString() } } });
  });
  const select = async () => { await page.getByRole('tab', { name: 'アカウント連携', exact: true }).click(); await page.getByRole('button', { name: /架空児童 未連携/ }).click(); };
  await page.goto('http://localhost:3014/tests/fixtures/lesson-learning.html'); await select();
  const panel = page.getByRole('region', { name: '未連携児童の新規登録' }); await panel.getByText('学習ID確保済み', { exact: true }).waitFor();
  assert(await panel.getByRole('button', { name: 'この登録を引き継ぐ', exact: true }).count() === 0, 'server-rejected or busy operation has no takeover control');
  canTakeOver = true; await panel.getByRole('button', { name: '登録状況を更新', exact: true }).click();
  const take = panel.getByRole('button', { name: 'この登録を引き継ぐ', exact: true }); await take.waitFor(); assert(await take.isDisabled(), 'name and acknowledgement required');
  const confirm = async () => { await panel.getByLabel('新規登録対象児童の氏名', { exact: true }).fill(name); await panel.getByRole('checkbox').check(); };
  await panel.getByLabel('登録の引き継ぎ理由', { exact: true }).selectOption('permission-change');
  await confirm(); await take.click(); await page.getByText('試験用：引き継ぎ結果未確定', { exact: true }).waitFor();
  assert(await page.getByRole('dialog').count() === 0 && await panel.getByRole('button', { name: '新規登録してカード表示', exact: true }).isDisabled(), 'handoff never generates another account or secret');
  await confirm(); await panel.getByRole('button', { name: '同じ引き継ぎを再確認', exact: true }).click();
  const resume = panel.getByRole('button', { name: '同じ登録の結果を再確認', exact: true }); await resume.waitFor();
  assert(calls.length === 2 && calls[0].requestId === calls[1].requestId && calls[0].handoffRevision === calls[1].handoffRevision, 'lost handoff response uses same request');
  assert(await resume.isDisabled(), 'separate confirmation required before actual registration resumes');
  await page.setViewportSize({ width: 1280, height: 900 }); await page.screenshot({ path: 'output/playwright/lesson-recovery-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile layout'); await page.screenshot({ path: 'output/playwright/lesson-recovery-mobile.png', fullPage: true });
  await confirm(); await resume.click(); const dialog = page.getByRole('dialog', { name: '確認済みログインカード' }); await dialog.waitFor();
  assert(calls[2].action === 'register' && calls[2].operationId === operationId, 'resume keeps original student identity');
  assert(await dialog.getByText('0123456789', { exact: true }).count() === 1, 'generated card');
  await dialog.getByRole('button', { name: 'カードを閉じて合言葉を消去' }).click();
  canTakeOver = true; canResume = false; delay = 1000;
  await panel.getByRole('button', { name: '登録状況を更新', exact: true }).click(); await take.waitFor();
  await panel.getByLabel('登録の引き継ぎ理由', { exact: true }).selectOption('permission-change');
  await confirm(); await take.click(); await page.getByRole('button', { name: /架空児童 あおい/ }).click(); await page.waitForTimeout(1500);
  assert(await page.getByText('引き継ぎを記録しました。氏名・確認欄を再確認して、同じ登録の結果を再確認してください。', { exact: true }).count() === 0, 'late handoff result cannot update another child');
  assert(await page.getByRole('dialog').count() === 0 && errors.length === 0, errors.join(','));
  return { passed: true, permissionAndBusyGating: true, confirmationAndReason: true, sameHandoffRequestRetry: true, originalOperationResume: true, childIsolation: true, desktopAndMobile: true };
}
try { command('open', 'about:blank'); const output = command('run-code', `async (page) => (${check.toString()})(page)`); const result = output.match(/### Result\s+([\s\S]*?)\s+### Ran/); if (!result || JSON.parse(result[1]).passed !== true) throw Error(output); console.log(result[1]); }
finally { command('close'); }
