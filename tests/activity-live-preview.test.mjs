import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActivityPlanSheet } from '../src/components/ActivityPlanSheet.tsx';
import { emptyActivity, activityTemplates } from '../src/utils/activityPlans.ts';
import { readFileSync } from 'node:fs';
const html = (plan, activeField) => renderToStaticMarkup(React.createElement(ActivityPlanSheet, {plan,activeField}));

test('empty fields can be highlighted without storing or printing invented note contents', () => {
  const plan=emptyActivity(),before=JSON.stringify(plan);
  assert.match(html(plan,'roles'),/data-activity-preview="roles" data-active="true"/);
  assert.match(html(plan,'nextTime'),/data-activity-preview="nextTime" data-active="true"/);
  assert.match(html(plan,'startTime'),/data-activity-preview="startTime" data-active="true"/);
  const print=html(plan);
  assert.doesNotMatch(print,/data-active|補足・安全確認|【次回に活かすこと】/);
  assert.equal(JSON.stringify(plan),before);
});

test('preview identities follow stable step ids through reordering and escape typed markup', () => {
  const plan=structuredClone(activityTemplates[0]);
  [plan.content.steps[0],plan.content.steps[1]]=[plan.content.steps[1],plan.content.steps[0]];
  plan.content.steps[0].title='<img src=x onerror=alert(1)>';
  const preview=html(plan,'step:step-1:title');
  assert.match(preview,/data-activity-preview="step:step-1:title" data-active="true"/);
  assert.ok(preview.indexOf('step:step-1:title')<preview.indexOf('step:step-0:title'));
  assert.match(preview,/&lt;img/);assert.doesNotMatch(preview,/<img/);
  assert.equal((preview.match(/data-active="true"/g)||[]).length,1);
});

test('UI focus and size are transient; the print sheet never receives active focus', () => {
  const source=readFileSync(new URL('../src/components/ActivityPlanWorkspace.tsx',import.meta.url),'utf8');
  assert.match(source,/<article className="activity-print-only"><ActivityPlanSheet plan=\{plan\} dirty=\{dirty\} \/>/);
  assert.ok(source.includes('scroller.scrollTo('));
  assert.ok(source.includes('ResizeObserver(grow)'));
  assert.ok(source.includes('observer.disconnect()'));
  assert.ok(source.includes('activity-auto-textarea min-h-28 resize-y'));
  assert.ok(source.includes('sessionStorage.setItem(storageKey, JSON.stringify(plan))'));
});
