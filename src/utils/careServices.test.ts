import test from 'node:test';
import assert from 'node:assert/strict';
import {CARE_TYPES,childCareTypes,childServiceLabel,parseOrganizationServices} from './careServices';
import {getRegularDaysForDate} from './weekdays';
import type {ChildProfile} from '../types';

test('visiting-only and combined services share one child identity and correct labels',()=>{
 assert.deepEqual(childCareTypes({}),['放課後等デイサービス']);
 assert.deepEqual(childCareTypes({careType:'放課後等デイサービス',visitingSupportEnabled:true}),['放課後等デイサービス','保育所等訪問支援']);
 assert.deepEqual(childCareTypes({careType:'児童発達支援',visitingSupportEnabled:true}),['児童発達支援','保育所等訪問支援']);
 assert.deepEqual(childCareTypes({careType:'保育所等訪問支援',visitingSupportEnabled:true}),['保育所等訪問支援']);
 assert.equal(childServiceLabel({careType:'保育所等訪問支援'},true),'訪問支援');
 assert.equal(childServiceLabel({careType:'放課後等デイサービス',visitingSupportEnabled:true},true),'放デイ・訪問支援');
});
test('organization service selection rejects empty, duplicate or unexpected values',()=>{
 assert.deepEqual(parseOrganizationServices([...CARE_TYPES].reverse()),CARE_TYPES);
 assert.deepEqual(parseOrganizationServices([],true),[]);
 for(const input of [[],null,'放課後等デイサービス',['保育所等訪問支援','保育所等訪問支援'],['未知の種別'],[null]])assert.throws(()=>parseOrganizationServices(input));
});
test('visiting-only profiles never produce automatic day-service weekdays; stored values are preserved',()=>{
 const child:ChildProfile={id:'fixture',name:'架空児童',careType:'保育所等訪問支援',regularDays:['月','火'],regularDaySchedules:[{id:'future',effectiveFrom:'2026-01-01',regularDays:['水']}]};
 const before=structuredClone(child);
 assert.deepEqual(getRegularDaysForDate(child,'2026-10-06'),[]);
 assert.deepEqual(child,before);
 assert.deepEqual(getRegularDaysForDate({...child,careType:'放課後等デイサービス',visitingSupportEnabled:true},'2026-10-06'),['水']);
});
