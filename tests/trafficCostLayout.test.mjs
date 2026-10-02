import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('traffic cost highlights follow the inputs and breakdown, immediately before output actions', () => {
  const source = readFileSync(new URL('../src/components/TrafficCostCalculator.tsx', import.meta.url), 'utf8');
  const inputs = source.indexOf('3. 追加費用と端数処理');
  const breakdown = source.indexOf('aria-label="計算内訳"');
  const total = source.indexOf('<ResultCard label="総費用（全車の往復合計）"');
  const perChild = source.indexOf('<ResultCard label="児童1人あたりの集金目安"');
  const actions = source.indexOf('<footer');
  assert.ok(inputs >= 0 && inputs < breakdown && breakdown < total && total < perChild && perChild < actions);
  assert.equal((source.match(/<ResultCard label=/g) || []).length, 2);
  assert.ok(source.includes('上の入力欄を埋めると計算します'));
  assert.ok(!source.includes('下の入力欄を埋めると計算します'));
  const manual = readFileSync(new URL('../public/manuals/traffic-cost/index.html', import.meta.url), 'utf8');
  assert.ok(manual.includes('入力欄・計算内訳の下に、総費用'));
});
