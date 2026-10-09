// Playwright CLI regression with synthetic intercepted data only, no production access.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const args = process.argv.slice(2), cli = args[args.indexOf('--cli') + 1];
if (!args.includes('--cli') || !cli) throw Error('Playwright CLI required');
const url = 'http://127.0.0.1:3014/tests/fixtures/meeting-workspace.html';
const session = 'meeting-workspace-' + Date.now();
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
  await page.addInitScript(() => { window.confirm = () => true; window.__copied = []; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async value => window.__copied.push(value) }, configurable: true }); });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(url);
  const open = page.getByRole('button', { name: /兄弟児の支援会議（確認用）/ });
  await open.click();
  const nav = page.getByRole('navigation', { name: '会議の手順' });
  assert(await nav.getByRole('button').count() === 2, 'only two workflow tabs remain');
  assert(await nav.getByRole('button', {name:'準備・Tiroへ渡す',exact:true}).getAttribute('aria-pressed') === 'true', 'merged prep opens by default');
  for (const name of ['文字起こし', '結果確認', '支援経過', '準備', 'Tiroへ渡す']) assert(!await nav.getByRole('button', {name,exact:true}).count(), 'retired separate step ' + name);
  const copy = page.getByRole('button', { name: '文章をコピー', exact: true });
  const download = page.getByRole('button', { name: '事前シートを保存', exact: true });
  const consent = page.getByRole('checkbox', {name:/録音とTiroへの情報提供/});
  assert(await copy.isDisabled() && await download.isDisabled(), 'consent required before export');
  assert(await page.getByText('出席予定者・1名',{exact:true}).evaluate(node=>!node.parentElement.open), 'secondary participants start collapsed');
  const data = () => page.evaluate(() => window.__meetingPreviewTest);
  const remote = (await data()).rows.length > 0;
  if (remote) await page.evaluate(()=>window.__meetingPreviewTest.saveDelay=800);
  await page.getByLabel('目的',{exact:true}).fill('最初の編集');
  await page.getByText('保存中',{exact:true}).waitFor();
  await page.getByLabel('目的',{exact:true}).fill('保存通信中に追加入力した目的');
  await consent.check();
  assert(await copy.isDisabled(), 'cannot export unsaved changes');
  await page.waitForFunction(()=>!window.__meetingPreviewTest.dirty);
  assert(await page.getByLabel('目的',{exact:true}).inputValue() === '保存通信中に追加入力した目的', 'new edit remains after earlier save');
  if (remote) {
    const model = await data();
    assert(model.rows[0].content.purpose === '保存通信中に追加入力した目的', 'new edit saved in next revision');
    assert(model.rows[0].content.outcome.agreements === '以前に保存された合意（保持確認用）' && model.rows[0].content.childWishes['demo-child-a'] === '以前の本人の意向（保持確認用）', 'hidden historical outcome and wishes preserved');
    await page.evaluate(()=>window.__meetingPreviewTest.saveDelay=0);
  }
  await copy.click();
  const copied = await page.evaluate(()=>window.__copied);
  assert(copied.length === 1 && copied[0].includes('保存通信中に追加入力した目的') && copied[0].includes('架空児童 ひなた'), 'copy includes latest saved preparation and both children');
  if (remote) assert((await data()).exports[0] === 'context_copy', 'export audit recorded');
  await page.getByRole('radio',{name:'事前情報シート',exact:true}).check();
  await copy.click();
  assert((await page.evaluate(()=>window.__copied)).at(-1).includes('学校と家庭での様子を確認する'), 'full sheet includes agenda questions');
  const downloaded = page.waitForEvent('download');
  await download.click();
  const file = await downloaded;
  await file.saveAs('output/playwright/meeting-fixture-sheet.txt');
  assert(file.suggestedFilename() === '2026-10-09_Tiro事前情報シート.txt', 'download keeps date and text-file type');
  if (remote) {
    await page.evaluate(()=>window.__meetingPreviewTest.failExport=true);
    const count = (await page.evaluate(()=>window.__copied)).length;
    await copy.click(); await page.getByRole('alert').waitFor();
    assert((await page.evaluate(()=>window.__copied)).length === count, 'failed audit prevents clipboard exposure');
    await page.evaluate(()=>window.__meetingPreviewTest.failExport=false);
    await page.getByRole('alert').getByRole('button',{name:'再読み込み'}).click();
  }
  for (const [name,width,height] of [['laptop',1366,768],['tablet',768,1024],['phone',390,844]]) {
    await page.setViewportSize({width,height});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), 'no page overflow at '+name);
    const prepBox = await page.getByRole('heading',{name:'会議の基本情報',exact:true}).boundingBox();
    const handoffBox = await page.getByRole('complementary',{name:'Tiroへ渡す情報'}).boundingBox();
    assert(width === 1366 ? handoffBox.x > prepBox.x && Math.abs(handoffBox.y-prepBox.y) < 120 : handoffBox.y > prepBox.y, 'responsive handoff position at '+name);
    if (width === 1366) {
      await page.evaluate(()=>window.scrollTo(0,700));
      const action = await download.boundingBox();
      assert(action.y >= 0 && action.y+action.height <= height, 'copy/download fit short laptop viewport while scrolling');
      await page.evaluate(()=>window.scrollTo(0,0));
    }
    await page.screenshot({path:'output/playwright/meeting-workspace-'+name+'.png',fullPage:true});
  }
  await page.setViewportSize({width:1366,height:768});
  await nav.getByRole('button',{name:'会議中',exact:true}).click();
  await page.getByLabel('発言の要点・メモ',{exact:true}).fill('会議中の確認メモ（架空）');
  await page.getByRole('button',{name:'会議終了にする',exact:true}).click();
  await page.waitForFunction(()=>!window.__meetingPreviewTest.dirty);
  assert(await page.getByText(/2026-10-09／会議終了/).isVisible(), 'meeting completion no longer sends user to transcript workflow');
  await page.getByRole('button',{name:'会議一覧へ',exact:true}).click();
  await open.click();
  await nav.getByRole('button',{name:'会議中',exact:true}).click();
  assert(await page.getByLabel('発言の要点・メモ',{exact:true}).inputValue() === '会議中の確認メモ（架空）', 'meeting notes survive reopen');
  if (remote) {
    await page.getByLabel('発言の要点・メモ',{exact:true}).fill('競合する編集（架空）');
    await page.evaluate(()=>window.__meetingPreviewTest.conflict());
    await page.getByRole('alert').filter({hasText:'別の変更が保存されています'}).waitFor();
    assert(await page.getByLabel('発言の要点・メモ',{exact:true}).inputValue() === '競合する編集（架空）', 'conflict keeps unsaved edit visible');
    const model = await data();
    assert(model.rows[0].content.agenda[0].memo === '会議中の確認メモ（架空）', 'conflict does not overwrite earlier server content');
    await page.getByRole('alert').getByRole('button',{name:'再読み込み'}).click();
  }
  await page.getByRole('button',{name:'会議一覧へ',exact:true}).click();
  await page.getByRole('button',{name:'会議案件を作成',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'児童・会議名・日付を入力'}).waitFor();
  assert(await page.getByRole('heading',{name:'新しい会議を準備'}).isVisible(), 'new case validates selection');
  await page.getByLabel('関連するカレンダー予定（任意）').selectOption('demo-calendar');
  assert(await page.getByLabel('日付',{exact:true}).inputValue() === '2026-10-15' && await page.getByLabel('架空児童 あおい',{exact:true}).isChecked(), 'calendar seed fills date and target child');
  await page.getByLabel('架空児童 ひなた',{exact:true}).check();
  await page.getByRole('button',{name:'会議案件を作成',exact:true}).click();
  await nav.waitFor();
  assert(await page.getByText('対象児童・2名',{exact:true}).isVisible(), 'new multi-child case opens merged workspace');
  const model = await data();
  assert(!model.calls.some(call=>['meeting_transcripts','meeting_progress_records'].includes(call.table)), 'retired tables never fetched or written');
  assert(errors.length === 0, 'no uncaught browser errors');
  assert(external.length === 0, 'no external network requests');
  return {passed:true,checks,mockedBackend:remote,readsPrivateData:false,productionChanged:false};
}
try {
  command('open',url); command('snapshot');
  const out = command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(url)})`);
  const match = out.match(/### Result\s+([\s\S]*?)\s+### Ran/);
  if (!match || !JSON.parse(match[1]).passed) throw Error(out.slice(0, 400) + '\n...\n' + out.slice(-2400));
  console.log(match[1]);
} finally { command('close'); }
