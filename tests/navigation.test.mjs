import test from 'node:test';
import assert from 'node:assert/strict';
import { activeNavigationId, applyMenuPreferences, matchesMenuSearch, navigationItems, MENU_CATEGORIES } from '../src/utils/navigation.ts';

test('home and drawer use the same unique menu IDs and names', () => {
  assert.equal(new Set(navigationItems.map((item) => item.id)).size, navigationItems.length);
  for (const item of navigationItems.filter((item) => item.category)) {
    assert.ok(MENU_CATEGORIES.includes(item.category));
    assert.equal(Boolean(item.tab) !== Boolean(item.workspace), true);
  }
  assert.equal(navigationItems.find((item) => item.id === 'communication').label, '共有・連絡');
});

test('saved order and hidden items apply to both home and drawer, without duplicates', () => {
  const items = navigationItems.filter((item) => !item.managerOnly);
  const preferences = { order: ['children', 'children', 'records', 'templates'], hidden: ['home', 'attendance'] };
  const drawer = applyMenuPreferences(items, preferences);
  const home = applyMenuPreferences(items.filter((item) => item.category), preferences);
  assert.deepEqual(drawer.filter((item) => item.category).map((item) => item.id), home.map((item) => item.id));
  assert.deepEqual(home.slice(0, 2).map((item) => item.id), ['children', 'records']);
  assert.ok(drawer.some((item) => item.id === 'home'));
  assert.ok(!home.some((item) => item.id === 'attendance'));
  assert.ok(!drawer.some((item) => item.id === 'templates'));
  assert.ok(applyMenuPreferences(items, preferences, true).some((item) => item.id === 'attendance'));
});

test('saved configuration cannot reintroduce unavailable privileged or field-mode items', () => {
  const items = navigationItems.filter((item) => item.id === 'home');
  assert.deepEqual(applyMenuPreferences(items, { order: ['templates', 'team', 'form'], hidden: [] }).map((item) => item.id), ['home']);
});

test('search accepts full-width Latin letters and multiple search words', () => {
  assert.ok(matchesMenuSearch('記録一覧 PDF コピー', 'ｐｄｆ　記録'));
  assert.ok(matchesMenuSearch('送迎の基本退所時刻', '退所 時刻'));
  assert.ok(matchesMenuSearch('学校台帳', '  '));
  assert.equal(matchesMenuSearch('学校台帳', '勤務'), false);
});

test('workspace location highlights the actual menu, not always Home', () => {
  for (const item of navigationItems.filter((item) => item.workspace)) {
    assert.equal(activeNavigationId('home', item.workspace), item.id);
  }
  assert.equal(activeNavigationId('home', 'menu'), 'home');
  assert.equal(activeNavigationId('home', 'dispatch'), 'monthlySchedule');
  assert.equal(activeNavigationId('records', 'calendar'), 'records');
});
