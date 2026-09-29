import test from 'node:test';
import assert from 'node:assert/strict';
import { findFieldStepId } from './recordStepNavigation';

test('pre-save warning targets the actual unified module question, not a reconstructed ID', () => {
  const steps = [
    { id: 'module-first-field-module_study_homework', kind: 'field', sectionId: 'record-module-first', fieldId: 'module_study_homework' },
    { id: 'module-second-field-module_study_homework', kind: 'field', sectionId: 'record-module-second', fieldId: 'module_study_homework' },
  ];
  assert.equal(findFieldStepId(steps, 'record-module-second', 'module_study_homework'),
    'module-second-field-module_study_homework');
});

test('standard template field resolves without mixing another section or hidden item', () => {
  const steps = [
    { id: 'field-period1-period1_study_homework', kind: 'field', sectionId: 'period1', fieldId: 'period1_study_homework' },
    { id: 'field-period2-period2_study_homework', kind: 'field', sectionId: 'period2', fieldId: 'period2_study_homework' },
  ];
  assert.equal(findFieldStepId(steps, 'period1', 'period1_study_homework'), steps[0].id);
  assert.equal(findFieldStepId(steps, 'missing', 'period1_study_homework'), undefined);
});
