import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getRecordProgram, matchingObservationStep, observationPrompt, observationScaleLabel, recordProgramClass } from '../src/utils/recordObservation.ts';
import { ObservationScaleChoices } from '../src/components/ObservationScaleChoices.tsx';
import { RecordChildChoice } from '../src/components/RecordChildChoice.tsx';
import { EXPRESSION_SCALE_OPTIONS, FATIGUE_RATING_OPTIONS, STANDARD_WEEKDAY_TEMPLATE } from '../src/data/weekdayTemplate.ts';

test('record program respects an explicit registered program before grade/age', () => {
  assert.equal(getRecordProgram({ transportProgram: 'キャリアズ', grade: '小学3年生' }, '2026-10-05'), 'キャリアズ');
  assert.equal(getRecordProgram({ transportProgram: '小学部', birthDate: '2010-05-01' }, '2026-10-05'), '小学部');
  assert.equal(getRecordProgram({ grade: '小学2年生' }, '2026-10-05'), '小学部');
  assert.equal(getRecordProgram({ birthDate: '2018-05-01', grade: '中学1年生' }, '2026-10-05'), '小学部');
  assert.equal(getRecordProgram({ grade: '中学1年生' }, '2026-10-05'), 'キャリアズ');
});

test('program colors remain distinct in both selected and unselected states', () => {
  for (const selected of [false, true]) {
    assert.match(recordProgramClass('小学部', selected), /sky/);
    assert.match(recordProgramClass('キャリアズ', selected), /violet/);
  }
  const html = renderToStaticMarkup(React.createElement(RecordChildChoice, { name: '架空児童', program: '小学部', selected: false, lockOwner: '架空職員', detail: '', onClick() {} }));
  assert.match(html, /disabled=""/);
  assert.match(html, /小学部/);
  assert.match(html, /選択できません/);
  assert.match(html, /aria-pressed="false"/);
});

test('every scale choice displays meaning and retains exact original accessible values', () => {
  for (const options of [EXPRESSION_SCALE_OPTIONS, FATIGUE_RATING_OPTIONS]) {
    const html = renderToStaticMarkup(React.createElement(ObservationScaleChoices, { options, value: options[2], label: '観察', onChange() {} }));
    assert.equal((html.match(/<button\b/g) || []).length, options.length);
    assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
    for (const option of options) {
      assert.ok(html.includes(`aria-label="${option}"`));
      assert.ok(observationScaleLabel(option).label.length > 1);
    }
  }
  assert.equal(observationScaleLabel('3：独自の基準を保持').label, '独自の基準を保持');
  assert.equal(observationScaleLabel('笑顔').label, '笑顔');
});

test('custom multi-choice expression retains multiple selected states', () => {
  const html = renderToStaticMarkup(React.createElement(ObservationScaleChoices, { options: ['笑顔', '緊張'], value: '笑顔', multiple: true, selectedValues: ['笑顔', '緊張'], label: '表情', onChange() {} }));
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 2);
});

test('program prompts vary examples without modifying source choices or unknown custom questions', () => {
  const field = STANDARD_WEEKDAY_TEMPLATE.sections[0].fields.find((field) => field.id === 'preparation');
  const before = JSON.stringify(field);
  assert.notEqual(observationPrompt('field', field, '小学部').hint, observationPrompt('field', field, 'キャリアズ').hint);
  assert.equal(JSON.stringify(field), before);
  assert.equal(observationPrompt('field', { id: 'custom', label: '独自質問', type: 'radio' }, '小学部'), undefined);
});

test('same-observation navigation maps arrival without affecting target answers', () => {
  const current = { id: 'expression', kind: 'expression' };
  const target = [{ id: 'expression', kind: 'expression', answer: 'already entered' }];
  const before = JSON.stringify(target);
  assert.equal(matchingObservationStep(current, [current], target), target[0]);
  assert.equal(JSON.stringify(target), before);
  assert.equal(matchingObservationStep(current, [current], []), undefined);
});

test('same-observation navigation maps independent module IDs and repeated occurrence exactly', () => {
  const source = ['s1', 's2'].map((moduleId) => ({ id: moduleId + '-posture', kind: 'field', fieldId: 'module_study_posture', moduleType: 'study', moduleId }));
  const target = ['t1', 't2'].map((moduleId) => ({ id: moduleId + '-posture', kind: 'field', fieldId: 'module_study_posture', moduleType: 'study', moduleId }));
  assert.equal(matchingObservationStep(source[1], source, target)?.id, 't2-posture');
  assert.equal(matchingObservationStep(source[1], source, target.slice(0, 1)), undefined);
  assert.equal(matchingObservationStep(source[0], source, [{ ...target[0], moduleType: 'pc' }]), undefined);
});
