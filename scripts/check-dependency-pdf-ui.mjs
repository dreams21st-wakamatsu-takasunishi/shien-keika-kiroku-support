// Local fictional PDF exports only. No authentication or production data access.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const args = process.argv.slice(2), cli = args[args.indexOf('--cli') + 1];
if (!args.includes('--cli') || !cli) throw Error('--cli is required');
const session = 'dependency-pdf-' + Date.now();
mkdirSync('output/playwright', { recursive: true });
function command(...args) {
  const r = spawnSync(process.execPath, [resolve(cli), '-s=' + session, ...args], { encoding: 'utf8', timeout: 180000, maxBuffer: 4194304 });
  if (r.status !== 0 || r.stdout.includes('### Error')) throw Error(r.stdout + r.stderr);
  return r.stdout;
}
async function check(page) {
  const external = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.context().route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:3015') return route.continue();
    external.push(url.origin); return route.abort();
  });
  // An empty local document avoids mounting any application component.
  await page.route('http://127.0.0.1:3015/pdf-smoke', route => route.fulfill({ contentType: 'text/html', body: '<html><head><meta charset="utf-8"></head><body></body></html>' }));
  await page.goto('http://127.0.0.1:3015/pdf-smoke');
  await page.evaluate(() => {
    const make = (id, title, height) => {
      const el = document.createElement('section'); el.id = id;
      el.style.cssText = `width:640px;height:${height}px;background:white;color:#111;font:24px sans-serif;padding:24px;box-sizing:border-box`;
      const h = document.createElement('h1'); h.textContent = title; el.append(h);
      const p = document.createElement('p'); p.textContent = '架空データのみ・安全更新後のPDF出力確認'; el.append(p);
      return el;
    };
    document.body.append(make('pdf-single', 'Dサポート PDF確認', 1300));
    const container = document.createElement('div'); container.id = 'pdf-paged';
    for (let i = 1; i <= 2; i++) { const el = make('pdf-page-' + i, '架空の指導案 ' + i, 600); el.dataset.pdfPage = ''; container.append(el); }
    document.body.append(container);
  });
  for (const [method, id, filename] of [
    ['generatePDFFromElement', 'pdf-single', 'dependency-single.pdf'],
    ['generatePagedPDFFromElement', 'pdf-paged', 'dependency-paged.pdf'],
  ]) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(async ({ method, id, filename }) => {
        const pdf = await import('/src/utils/pdfGenerator.ts'); await pdf[method](id, filename);
      }, { method, id, filename }),
    ]);
    if (await download.failure()) throw Error('PDF download failed');
    await download.saveAs('output/playwright/' + filename);
  }
  if (await page.locator('#pdf-single').evaluate(el => el.style.width) !== '640px') throw Error('Export changed the original width');
  if (errors.length || external.length) throw Error(JSON.stringify({ errors, external }));
  return { passed: true, pdfExports: 2, productionAccess: false };
}
try {
  command('open', 'about:blank'); command('snapshot');
  const out = command('run-code', `async(page)=>await (${check.toString()})(page)`);
  const match = out.match(/### Result\s+([\s\S]*?)\s+### Ran/);
  if (!match || !JSON.parse(match[1]).passed) throw Error(out);
  console.log(match[1]);
} finally { command('close'); }
