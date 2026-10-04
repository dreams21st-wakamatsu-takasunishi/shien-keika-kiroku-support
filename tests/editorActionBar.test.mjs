import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EditorActionBar } from '../src/components/EditorActionBar.tsx';

const render = (busy = false, preview = false) => renderToStaticMarkup(React.createElement(EditorActionBar, {
  busy, preview, onPreview() {}, onSave() {},
  secondary: [{ label: '別の案として複製', onClick() {} }, { label: 'ひな形として再利用', onClick() {} }],
}));

test('editor actions keep preview/save visible and put secondary actions in native disclosure', () => {
  const html = render();
  assert.match(html, /aria-label="プレビュー・印刷"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /<details[^>]*>.*別の案として複製.*ひな形として再利用.*<\/details>/);
  assert.match(html, /sticky bottom-2/);
  assert.doesNotMatch(html, /sm:sticky|flex-wrap/);
  assert.match(html, />保存<\/button>/);
});

test('busy state disables every save, preview and secondary action', () => {
  const buttons = render(true).match(/<button\b[^>]*>/g);
  assert.equal(buttons.length, 4);
  assert.ok(buttons.every((button) => button.includes('disabled=""')));
  assert.match(render(true), /保存中…/);
});

test('preview state keeps a clear accessible close label on small screens', () => {
  assert.match(render(false, true), /aria-label="プレビューを収納"/);
  assert.match(render(false, true), /aria-expanded="true"/);
});
