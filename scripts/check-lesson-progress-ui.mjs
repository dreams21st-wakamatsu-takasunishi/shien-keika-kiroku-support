import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const cli = args[args.indexOf('--cli') + 1];
const url = new URL(args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:3014/tests/fixtures/lesson-learning.html');
if (!args.includes('--cli') || !['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/tests/fixtures/lesson-learning.html') throw Error('Local fixture URL and --cli are required');
mkdirSync('output/playwright', { recursive: true });
const session = 'lesson-progress-regression';
function command(...args) {
  const result = spawnSync(process.execPath, [resolve(cli), `-s=${session}`, ...args], { encoding: 'utf8', timeout: 120000, maxBuffer: 4194304 });
  if (result.status !== 0 || result.stdout.includes('### Error')) throw Error(result.stdout + result.stderr);
  return result.stdout;
}
async function check(page, url) {
  const assert = (ok, label) => { if (!ok) throw Error(label); };
  let delay = 0, fails = false, listFails = false, corrupt = false;
  const errors = [], calls = [];
  const links = ['a', 'b'].map((key, index) => ({ id: `11111111-1111-4111-8111-11111111111${index}`, child_id: `child-ui-${key}`, revision: 1,
    source_display_name: `架空アカウント ${key}`, source_project_ref: 'abcdefghijklmnopqrst', source_table: 'user_data', source_student_id: `student_ui_${key}`,
    source_campus_id: 'main', verified_at: '2026-10-01T00:00:00Z', active: true }));
  page.on('pageerror', error => errors.push(error.message));
  await page.context().route('https://*.supabase.co/**', route => route.abort());
  await page.context().route('**/functions/v1/lesson-learning', async route => {
    const body = route.request().postDataJSON(); calls.push(body);
    let response, status = 200;
    if (body.action === 'list') {
      response = { canManageLinks: true, configured: true, links };
      if (listFails) { status = 503; response = { error: '試験用：一覧取得失敗' }; }
    } else if (body.action === 'progress') {
      const link = links.find(link => link.child_id === body.childId);
      assert(link, 'only linked children are fetched');
      response = { schemaVersion: 1, childId: link.child_id, linkId: link.id, fetchedAt: '2026-10-08T01:00:00Z',
        identity: { sourceProjectRef: link.source_project_ref, dataTable: 'user_data', studentId: link.source_student_id, campusId: 'main', displayName: link.source_display_name, birthDate: '' },
        courses: ['mouse', 'keyboard', 'vision', 'word'].map((id, index) => {
          const stage = { id: 's1', title: ['M-1', 'あ〜さのことば', 'じゅんばんタッチ', 'Word 1-1'][index], status: id === 'mouse' ? 'current' : 'unknown', bestSeconds: id === 'mouse' ? 12.5 : null };
          return { id, title: ['マウス', 'キーボード・ことば入力', 'ビジョン', 'Word学習'][index], total: 1, completed: id === 'mouse' ? 0 : null, next: id === 'mouse' ? stage : null, stages: [stage] };
        }), weakKeys: [{ key: 'A', count: 7 }],
        account: { authIdSaved: true, loginNumber: '19', passcodeIssuedAt: null, loginVerified: false },
        recentEvents: [{ id: 'e1', at: '2026-10-07T15:00:00Z', category: 'text', title: `架空実績 ${link.child_id}`, detail: '最近の結果', amount: '3回' }] };
      if (corrupt) response.childId = 'other';
      if (fails) { status = 503; response = { error: '試験用：進捗取得失敗' }; }
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    } else throw Error(`Unexpected action ${body.action}`);
    await route.fulfill({ status, json: response });
  });
  await page.goto(url);
  await page.getByRole('tab', { name: '児童別進捗', exact: true }).waitFor();
  const initialSnapshot = await page.locator('body').ariaSnapshot();
  assert(initialSnapshot.includes('児童別進捗') && initialSnapshot.includes('児童を選択'), 'initial accessible UI');
  await page.getByRole('tab', { name: '児童別進捗', exact: true }).click();
  await page.getByRole('button', { name: /架空児童 あおい/ }).click();
  await page.getByText('架空実績 child-ui-a', { exact: true }).waitFor();
  await page.getByText('次の練習: M-1', { exact: true }).waitFor();
  await page.getByText('Auth連携IDの保存', { exact: true }).waitFor();
  await page.getByText('マウス', { exact: true }).click();
  await page.getByRole('cell', { name: '12.5秒', exact: true }).waitFor();
  assert(await page.getByRole('progressbar', { name: 'マウスの到達数' }).getAttribute('value') === '0', 'new student not cleared');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: 'output/playwright/lesson-progress-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobile overflow');
  await page.screenshot({ path: 'output/playwright/lesson-progress-mobile.png', fullPage: true });
  delay = 500;
  await page.getByRole('button', { name: /架空児童 ひなた/ }).click();
  await page.getByRole('button', { name: /架空児童 あおい/ }).click();
  await page.getByText('架空実績 child-ui-a', { exact: true }).waitFor();
  assert(await page.getByText('架空実績 child-ui-b', { exact: true }).count() === 0, 'stale child results');
  delay = 0; fails = true;
  await page.getByRole('button', { name: '進捗を再取得', exact: true }).click();
  await page.getByText('試験用：進捗取得失敗', { exact: true }).waitFor();
  assert(await page.getByText('架空実績 child-ui-a', { exact: true }).count() === 0, 'failure clears previous result');
  fails = false; corrupt = true;
  await page.getByRole('button', { name: '進捗を再取得', exact: true }).click();
  await page.getByText('児童別進捗の取得結果を確認できません。更新して確認してください。', { exact: true }).waitFor();
  corrupt = false;
  await page.getByRole('button', { name: '進捗を再取得', exact: true }).click();
  await page.getByText('架空実績 child-ui-a', { exact: true }).waitFor();
  await page.getByRole('button', { name: /架空児童 未連携/ }).click();
  await page.getByText('この児童の学習アカウントは未連携です。', { exact: true }).waitFor();
  assert(!calls.some(call => call.action === 'progress' && call.childId === 'child-ui-unlinked'), 'unlinked not fetched');
  delay = 500;
  await page.getByRole('button', { name: /架空児童 あおい/ }).click();
  listFails = true;
  await page.getByRole('button', { name: '試験用：職員切替' }).click();
  await page.getByText('連携情報の取得に失敗しました。', { exact: true }).waitFor();
  assert(await page.getByText('架空実績 child-ui-a', { exact: true }).count() === 0, 'scope change invalidates in-flight snapshot');
  assert(errors.length === 0, `page errors: ${errors.join(',')}`);
  return { passed: true, cases: ['read progress', 'best time vs recent result', 'unknown fields', 'new student M-1', 'desktop/mobile layout', 'child switch', 'retry failure', 'wrong child response', 'unlinked', 'scope change'], mutations: calls.filter(call => !['list', 'progress'].includes(call.action)).length };
}
try {
  command('open', 'about:blank');
  const output = command('run-code', `async (page) => { return await (${check.toString()})(page,${JSON.stringify(url.href)}); }`);
  const result = output.match(/### Result\s+([\s\S]*?)\s+### Ran/);
  if (!result || JSON.parse(result[1]).passed !== true) throw Error(output);
  console.log(result[1]);
} finally { command('close'); }
