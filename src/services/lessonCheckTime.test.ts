import test from 'node:test';
import assert from 'node:assert/strict';
import {formatLessonCheckTime} from '../learning/lessonCheckTime';
test('lesson check time includes Japanese date and seconds, independent of device timezone',()=>{
 assert.equal(formatLessonCheckTime('2026-10-06T07:31:22Z'),'2026/10/06 16:31:22');
 assert.equal(formatLessonCheckTime('2026-10-06T16:30:00Z'),'2026/10/07 01:30:00');
});
test('invalid check times do not render a false confirmation time',()=>{
 assert.equal(formatLessonCheckTime('not-a-date'),'確認できません');
 assert.equal(formatLessonCheckTime(''),'確認できません');
});
