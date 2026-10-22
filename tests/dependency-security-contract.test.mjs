import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditDependencies, classifyAudit } from '../scripts/audit-dependencies.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('PDF sanitizer stays above the patched DOMPurify security floor', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.overrides.dompurify, '^3.4.16');
  const lock = JSON.parse(read('package-lock.json'));
  const sanitizer = lock.packages['node_modules/dompurify'];
  const [major, minor, patch] = sanitizer.version.split('.').map(Number);
  assert.ok(major > 3 || major === 3 && (minor > 4 || minor === 4 && patch >= 16));
  assert.ok(sanitizer.integrity.startsWith('sha512-'));
  assert.equal(pkg.overrides['source-map-js'], '^1.2.2');
  assert.equal(pkg.devDependencies.vite, '^6.4.5');
  const [viteMajor, viteMinor, vitePatch] = lock.packages['node_modules/vite'].version.split('.').map(Number);
  assert.ok(viteMajor > 6 || viteMajor === 6 && (viteMinor > 4 || viteMinor === 4 && vitePatch >= 5));
  const maps = Object.entries(lock.packages).filter(([path]) => path.endsWith('/source-map-js'));
  assert.ok(maps.length > 0);
  for (const [, value] of maps) {
    const [major, minor, patch] = value.version.split('.').map(Number);
    assert.ok(major > 1 || major === 1 && (minor > 2 || minor === 2 && patch >= 2));
  }
});

test('Dependency updates are reviewed and checked without privileged PR execution', () => {
  const updates = read('.github/dependabot.yml');
  assert.ok(updates.includes('package-ecosystem: npm'));
  assert.ok(updates.includes('package-ecosystem: github-actions'));
  assert.equal((updates.match(/interval: weekly/g) || []).length, 2);
  const checks = read('.github/workflows/dependency-security.yml');
  assert.ok(checks.includes('pull_request:'));
  assert.ok(checks.includes('npm run check'));
  assert.ok(checks.includes('node scripts/audit-dependencies.mjs'));
  assert.ok(checks.includes('contents: read'));
  assert.doesNotMatch(checks, /pull_request_target|secrets\.|--auto|contents: write/);
  assert.ok(read('.github/workflows/deploy-pages.yml').includes('node scripts/audit-dependencies.mjs'));
});

test('Audit network recovery is bounded and never hides vulnerabilities or unknown results', async () => {
  const clean = { status: 0, stdout: JSON.stringify({ metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } } }) };
  const network = { status: 1, stdout: JSON.stringify({ error: { code: 'E503' } }) };
  let calls = 0;
  await auditDependencies(() => ++calls < 3 ? network : clean, async () => {}, () => {});
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(auditDependencies(() => { calls++; return network; }, async () => {}, () => {}), /Release remains blocked/);
  assert.equal(calls, 3);
  calls = 0;
  const unsafe = JSON.parse(clean.stdout); unsafe.metadata.vulnerabilities.high = 1; unsafe.metadata.vulnerabilities.total = 1;
  await assert.rejects(auditDependencies(() => { calls++; return { status: 1, stdout: JSON.stringify(unsafe) }; }, async () => {}, () => {}), /High\/Critical/);
  assert.equal(calls, 1);
  for (const invalid of [{ status: 0, stdout: '{}' }, { status: 0, stdout: 'not json' }, { ...clean, status: null, error: Error('timeout') }]) assert.equal(classifyAudit(invalid).state, 'unavailable');
});
