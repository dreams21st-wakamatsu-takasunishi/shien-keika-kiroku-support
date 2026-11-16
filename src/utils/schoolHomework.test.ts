import test from 'node:test';
import assert from 'node:assert/strict';
import { changeSchoolHomework, homeworkLabel, studyFocusLabel } from './schoolHomework';
import { createLearningPcFields, POSTURE_LEG_OPTIONS, STUDY_FOCUS_SCALE_OPTIONS, HOMEWORK_ATTITUDE_SCALE_OPTIONS } from '../data/weekdayTemplate';

test('homework replaces subjects for new entries, preserving past details and notes on editing',()=>{
  const old = {value:'国語（プリント）',note:'連絡あり',homeworkDetails:{subjects:['国語'],materials:{国語:['プリント']},notes:{}}};
  const yes=changeSchoolHomework(old,'ある');
  assert.equal(yes.value,'ある');
  assert.equal(yes.nestedDetails?.previousHomeworkValue,old.value);
  assert.equal(yes.homeworkDetails,old.homeworkDetails);
  const result=changeSchoolHomework(yes,'ある','残った');
  assert.equal(result.value,'ある／残った');
  const no=changeSchoolHomework(result,'ない');
  assert.equal(no.value,'ない');
  assert.equal(no.nestedDetails?.homeworkOutcome,'');
  assert.equal(no.note,'連絡あり');
  assert.equal(homeworkLabel(old),'宿題内容');
  assert.equal(homeworkLabel(no),'学校の宿題');
});

test('study order, foot posture option, and old and new rating labels stay distinct',()=>{
  const fields=createLearningPcFields('test','種別','種別');
  assert.deepEqual(fields.filter(field=>field.id.includes('_study_')).map(field=>field.id),[
    'test_study_homework','test_study_extras','test_study_attitude','test_study_posture',
  ]);
  assert.equal(POSTURE_LEG_OPTIONS[0],'足が揃っている');
  assert.equal(studyFocusLabel({value:STUDY_FOCUS_SCALE_OPTIONS[0]}),'学習中の集中');
  assert.equal(studyFocusLabel({value:HOMEWORK_ATTITUDE_SCALE_OPTIONS[0]}),'宿題への取り組み');
});
