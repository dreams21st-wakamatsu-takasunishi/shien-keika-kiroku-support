import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
  assert.ok(checks.includes('npm audit --audit-level=high'));
  assert.ok(checks.includes('contents: read'));
  assert.doesNotMatch(checks, /pull_request_target|secrets\.|--auto|contents: write/);
  assert.ok(read('.github/workflows/deploy-pages.yml').includes('npm audit --audit-level=high'));
});
