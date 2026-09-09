import test from 'node:test';
import assert from 'node:assert/strict';
import { placeAnchoredPanel } from '../src/utils/anchoredPanel.ts';

const desktop = { left: 0, top: 0, width: 1265, height: 800 };
const icon = (left, top) => ({ left, top, width: 56, height: 56 });

function assertFits(anchor, viewport, contentHeight) {
  const panel = placeAnchoredPanel(anchor, viewport, contentHeight);
  const height = Math.min(contentHeight, panel.maxHeight);
  assert.ok(panel.left >= viewport.left + 10);
  assert.ok(panel.top >= viewport.top + 10);
  assert.ok(panel.left + panel.width <= viewport.left + viewport.width - 10);
  assert.ok(panel.top + height <= viewport.top + viewport.height - 10);
  assert.ok(panel.top + height <= anchor.top || panel.top >= anchor.top + anchor.height
    || panel.left + panel.width <= anchor.left || panel.left >= anchor.left + anchor.width,
    'the editor must not cover its draggable trigger');
  assert.equal(panel.transformOrigin, `${anchor.left + 28 - panel.left}px ${anchor.top + 28 - panel.top}px`);
  return panel;
}

test('opens below a top-left trigger and above a bottom-right trigger', () => {
  const top = assertFits(icon(40, 40), desktop, 540);
  assert.equal(top.left, 40);
  assert.equal(top.top, 108);
  const bottom = assertFits(icon(1199, 734), desktop, 540);
  assert.equal(bottom.left + bottom.width, 1255);
  assert.equal(bottom.top + 540, 722);
});

test('uses the side of a central trigger when there is not enough vertical room', () => {
  const panel = assertFits(icon(600, 370), desktop, 540);
  assert.equal(panel.left, 668);
});

test('narrow screens shorten the editor so its content can scroll', () => {
  const viewport = { left: 0, top: 0, width: 360, height: 640 };
  const panel = assertFits(icon(145, 290), viewport, 640);
  assert.equal(panel.width, 340);
  assert.ok(panel.maxHeight < 300);
});

test('landscape can use a narrower side panel', () => {
  const viewport = { left: 0, top: 0, width: 740, height: 360 };
  const panel = assertFits(icon(330, 150), viewport, 620);
  assert.ok(panel.width >= 280 && panel.width < 384);
});

test('respects the visual viewport offset, safe areas and a short keyboard viewport', () => {
  assertFits(icon(140, 320), { left: 0, top: 140, width: 375, height: 280 }, 620);
  assertFits(icon(730, 180), { left: 59, top: 0, width: 726, height: 300 }, 620);
});

test('stays reachable at all screen edges and across responsive sizes', () => {
  for (const [width, height] of [[320, 568], [375, 812], [768, 1024], [1024, 768], [1920, 1080], [360, 280]]) {
    const viewport = { left: 0, top: 0, width, height };
    for (const x of [10, (width - 56) / 2, width - 66]) {
      for (const y of [10, (height - 56) / 2, height - 66]) {
        for (const contentHeight of [420, 540, 680]) assertFits(icon(x, y), viewport, contentHeight);
      }
    }
  }
});
