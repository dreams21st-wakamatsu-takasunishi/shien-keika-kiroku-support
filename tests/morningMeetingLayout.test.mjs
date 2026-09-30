import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/components/MorningMeetingPanel.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('MorningMeetingPanel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const elements = [];
function visit(node) {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) elements.push(node);
  ts.forEachChild(node, visit);
}
visit(ast);
const opening = (node) => ts.isJsxElement(node) ? node.openingElement : node;
const attribute = (node, name) => {
  const attr = opening(node).attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.text === name);
  return attr?.initializer && ts.isStringLiteral(attr.initializer) ? attr.initializer.text : undefined;
};
const order = (node) => Number(attribute(node, 'className')?.match(/\border-(\d+)\b/)?.[1]);
const flexParent = (node) => {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isJsxElement(parent) && attribute(parent, 'className')?.includes('flex flex-col')) return parent;
  }
};
const editor = elements.find((node) => attribute(node, 'aria-label') === '朝礼記録の入力');
const preview = elements.find((node) => attribute(node, 'aria-label') === '他端末の入力内容');
const collaboration = elements.find((node) => attribute(node, 'id') === 'morning-collaboration-status');

test('live preview stays after the editor in both DOM and flex ordering', () => {
  assert.ok(editor && preview, 'the editor and remote preview must be identifiable');
  assert.ok(preview.pos > editor.pos, 'remote content must not precede the editor in the DOM');
  assert.equal(flexParent(preview), flexParent(editor));
  assert.ok(order(preview) > order(editor.parent), 'remote previews must not push the editor down');
});

test('expanding collaborator details also happens below the input', () => {
  assert.ok(collaboration);
  assert.equal(flexParent(collaboration), flexParent(editor));
  assert.ok(order(collaboration) > order(editor.parent));
});

test('remote content remains available with bounded internal scrolling', () => {
  assert.equal(attribute(preview, 'aria-live'), 'polite');
  assert.match(attribute(preview, 'className'), /\bmax-h-80\b/);
  assert.match(attribute(preview, 'className'), /\boverflow-y-auto\b/);
  assert.equal(attribute(editor, 'aria-describedby'), 'morning-collaboration-status');
});
