// Real RecordForm, ten fictional children and intercepted backend. No real records.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const args = process.argv.slice(2), cli = args[args.indexOf('--cli') + 1];
if (!args.includes('--cli') || !cli) throw Error('--cli required');
const url = 'http://127.0.0.1:3014/tests/fixtures/record-tablet.html', session = 'record-tablet-check-' + Date.now();
mkdirSync('output/playwright', { recursive: true });
function command(...args) { const r = spawnSync(process.execPath, [resolve(cli), '-s=' + session, ...args], { encoding: 'utf8', timeout: 180000, maxBuffer: 4194304 }); if (r.status !== 0 || r.stdout.includes('### Error')) throw Error(r.stdout + r.stderr); return r.stdout; }
async function check(page, url) {
  let checks = 0; const assert = (ok, label) => { checks++; if (!ok) throw Error(label); }, errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:3014')) external.push(r.url()); });
  await page.context().route('https://**', route => route.abort());
  const group = page.getByRole('region', { name: '同じ入力画面で児童をまとめて記録', exact: true });
  const lesson = page.getByRole('region', { name: 'Dレッスンの自動反映', exact: true });
  const child = n => page.locator(`[data-child-tab-id="tablet-${n}"]`).getByRole('button').first();
  for (const [name, width, height] of [['tablet-portrait',744,1133],['tablet-landscape',1133,744],['phone',390,844]]) {
    await page.setViewportSize({ width, height }); await page.goto(url);
    await page.getByText('架空児童01の記録', { exact: true }).waitFor();
    await page.waitForFunction(() => window.__recordTabletFixture.latestDraft !== null);
    assert(await page.locator('[data-child-tab-id]').count() === 10, 'ten children remain on the same screen ' + name);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no page horizontal overflow ' + name);
    assert((await group.boundingBox()).height <= (width >= 700 ? 70 : 100), 'compact child group ' + name);
    assert((await lesson.boundingBox()).height <= (width >= 700 ? 70 : 115), 'compact automatic lesson block ' + name);
    assert(!await page.locator('#record-wizard .h-2.rounded-full.bg-slate-100').count(), 'progress bar removed ' + name);
    const trash = page.getByRole('button', { name: '入力中の記録を削除', exact: true }), box = await trash.boundingBox();
    assert(box.width >= 44 && box.height >= 44 && !(await trash.textContent()).trim(), 'icon-only delete retains 44px touch area ' + name);
    assert(Boolean(await trash.getAttribute('title')), 'delete has discoverable tooltip ' + name);
    await page.screenshot({ path: 'output/playwright/record-tablet-' + name + '.png', fullPage: true });
    await page.evaluate(() => scrollTo({ top: 220, behavior: 'instant' }));
    const before = await page.evaluate(() => ({ y: scrollY, topScrolls: window.__recordTabletFixture.formTopScrolls }));
    assert(before.y > 100, 'switch test starts below page top ' + name);
    for (const n of [2, 3, 1]) {
      await child(n).click();
      await page.getByText(`架空児童${String(n).padStart(2, '0')}の記録`, { exact: true }).waitFor();
      await page.waitForTimeout(350);
      const after = await page.evaluate(() => ({ y: scrollY, topScrolls: window.__recordTabletFixture.formTopScrolls }));
      assert(after.topScrolls === before.topScrolls && Math.abs(after.y - before.y) < 8, 'child switch retains viewport without smooth jump ' + n + ' ' + name);
    }
  }
  await page.setViewportSize({width:744,height:1133});await page.goto(url);
  await page.getByText('架空児童01の記録',{exact:true}).waitFor();
  await page.getByRole('button',{name:/^本日の出欠を教えてください/}).click();
  const note = page.locator('#group-question-attendance textarea');
  await note.fill('切り替えても保持する架空メモ');
  await child(1).click();assert(await note.isVisible(), 'active child tap does not reset open question');
  await child(2).click();await page.getByText('架空児童02の記録',{exact:true}).waitFor();
  await child(1).click();await page.getByRole('button',{name:/^本日の出欠を教えてください/}).click();
  assert(await note.inputValue()==='切り替えても保持する架空メモ', 'child answers preserved after switching');
  await lesson.locator('summary').click();
  assert(await lesson.getByText(/手入力・観察は保持/).isVisible(), 'lesson explanation is available on demand');
  assert(await lesson.getByRole('button',{name:'架空児童01の実績を再取得',exact:true}).isVisible(), 'per-child retry stays available');
  await page.evaluate(() => { window.confirm = message => { window.__recordTabletFixture.lastConfirm = message; return false; }; });
  await page.getByRole('button',{name:'入力中の記録を削除',exact:true}).click();
  const confirmation = await page.evaluate(() => window.__recordTabletFixture.lastConfirm);
  assert(confirmation.includes('保存済みの支援記録は削除されません'), 'icon delete still requires confirmation');
  assert(await page.locator('[data-child-tab-id]').count()===10, 'cancel delete retains all children');
  const topScrolls = await page.evaluate(()=>window.__recordTabletFixture.formTopScrolls);
  await page.locator('#question-index > summary').click();
  await page.locator('#question-index').getByRole('button',{name:/疲労感/}).click();
  assert(await page.evaluate(before=>window.__recordTabletFixture.formTopScrolls>before,topScrolls), 'intentional missing-question navigation still scrolls');
  assert(!errors.length, 'no uncaught browser errors '+errors.join(','));assert(!external.length,'no external network requests');
  return {passed:true,checks,syntheticOnly:true,productionAccess:false};
}
try {command('open',url);command('snapshot');const out=command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(url)})`),match=out.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!match||!JSON.parse(match[1]).passed)throw Error(out);console.log(match[1]);}finally{command('close');}
