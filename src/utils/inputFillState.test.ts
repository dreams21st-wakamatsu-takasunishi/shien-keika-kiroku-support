import test from 'node:test';
import assert from 'node:assert/strict';
import {inputFillState} from './inputFillState';

test('empty and whitespace-only fields are unfilled', () => {
  for (const value of ['', ' ', '\n\t', '　']) assert.equal(inputFillState(value), 'empty');
});
test('zero, default dates, selected values and restored content are filled, not necessarily saved or valid', () => {
  for (const value of ['0', '2026-10-06', '14:30', '工作', ' 入力済み ', 'not a valid URL']) assert.equal(inputFillState(value), 'filled');
});
