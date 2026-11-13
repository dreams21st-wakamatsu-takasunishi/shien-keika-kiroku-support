import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dayPeriod,monthPeriod,mergeOperationalPeriod} from './operationalPeriod';
test('operational dates include month ends and reject invalid inputs',()=>{
 assert.deepEqual(monthPeriod('2024-02'),{from:'2024-02-01',to:'2024-02-29'});
 assert.deepEqual(monthPeriod('2026-12'),{from:'2026-12-01',to:'2026-12-31'});
 assert.equal(dayPeriod('2026-02-29'),null);
 assert.equal(monthPeriod('2026-13'),null);
});
test('range refresh preserves other periods, local writes, and deletions made while loading',()=>{
 const period=monthPeriod('2026-10')!;
 const old={id:'a',date:'2026-10-04'},deleted={id:'b',date:'2026-10-01'},outside={id:'c',date:'2026-11-01'};
 const changed={...old,note:'latest'},newRow={id:'new',date:'2026-10-28'};
 assert.deepEqual(mergeOperationalPeriod([changed,outside],[old,deleted,newRow],period,[old,deleted,outside]),[changed,outside,newRow]);
 assert.deepEqual(mergeOperationalPeriod([old,outside],[],period,[old,outside]),[outside]);
});
