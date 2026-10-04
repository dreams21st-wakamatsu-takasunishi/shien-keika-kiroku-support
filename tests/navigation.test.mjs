import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activeNavigationId, applyMenuPreferences, groupNavigationItems, matchesMenuSearch, navigationItems, MENU_CATEGORIES } from '../src/utils/navigation.ts';

test('home and drawer use the same unique menu IDs and names', () => {
  assert.equal(new Set(navigationItems.map((item) => item.id)).size, navigationItems.length);
  for (const item of navigationItems.filter((item) => item.category)) {
    assert.ok(MENU_CATEGORIES.includes(item.category));
    assert.equal(Boolean(item.tab) !== Boolean(item.workspace), true);
  }
  assert.equal(navigationItems.find((item) => item.id === 'communication').label, '共有・連絡');
});

test('all registered menu IDs survive profile loading and database preference validation', () => {
  const service = readFileSync(new URL('../src/services/dataService.ts', import.meta.url), 'utf8');
  const sql = readFileSync(new URL('../supabase/migrations/202610040002_facility_work.sql', import.meta.url), 'utf8');
  const allowed = service.match(/const allowedMenuItems[^=]*=\s*new Set<RecorderMenuItemId>\(\[([\s\S]*?)\]/)?.[1];
  const databaseAllowed = sql.match(/v_allowed constant text\[\] := array\[([\s\S]*?)\]/)?.[1];
  assert.ok(allowed);
  assert.ok(databaseAllowed);
  for (const item of navigationItems) {
    assert.ok(allowed.includes(`'${item.id}'`), `profile loading must preserve ${item.id}`);
    assert.ok(databaseAllowed.includes(`'${item.id}'`), `database must accept ${item.id}`);
  }
  assert.equal(navigationItems.find((item) => item.id === 'trafficCost')?.tab, 'trafficCost');
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

test('purpose groups retain every authorized item once and keep order within a group', () => {
  const available = navigationItems.filter((item) => !item.managerOnly);
  const customized = applyMenuPreferences(available, { order: ['records', 'children', 'facilityWork'], hidden: ['attendance'] });
  const groups = groupNavigationItems(customized);
  const grouped = groups.flatMap((group) => group.items);
  assert.equal(grouped.length, customized.length);
  assert.deepEqual(new Set(grouped.map((item) => item.id)), new Set(customized.map((item) => item.id)));
  assert.deepEqual(groups.find((group) => group.label === '記録・児童').items.slice(0, 2).map((item) => item.id), ['records', 'children']);
  assert.deepEqual(groups.find((group) => group.label === '活動・運営').items.map((item) => item.id), ['facilityWork', 'trafficCost', 'activityPlans']);
  assert.ok(!grouped.some((item) => item.id === 'attendance' || item.managerOnly));
});

test('empty/search-only/individual-terminal grouping creates no empty or extra groups', () => {
  assert.deepEqual(groupNavigationItems([]), []);
  const homeOnly = navigationItems.filter((item) => item.id === 'home');
  assert.deepEqual(groupNavigationItems(homeOnly).flatMap((group) => group.items), homeOnly);
  const matches = navigationItems.filter((item) => matchesMenuSearch(`${item.label} ${item.keywords}`, '交通費'));
  assert.equal(groupNavigationItems(matches).length, 1);
  assert.equal(groupNavigationItems(matches)[0].label, '活動・運営');
});
