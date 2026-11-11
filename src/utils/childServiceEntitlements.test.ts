import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyBenefitEntitlements,monthlyServiceUsage,validBenefitEntitlements} from './childServiceEntitlements';
import type {ChildProfile,DailyChildPlan,DailyTransportRequirement} from '../types';

test('a monthly amount may be unknown or zero; enabled options are validated independently',()=>{
 const base=emptyBenefitEntitlements();
 assert.ok(validBenefitEntitlements(base));
 assert.ok(validBenefitEntitlements({...base,dayServiceDays:0,visitingEnabled:true,visitingDays:2,individualSupportEnabled:true,individualSupportTypes:['I','III']}));
 for(const patch of [{dayServiceDays:32},{visitingDays:2},{individualSupportEnabled:true},
  {individualSupportEnabled:true,individualSupportTypes:['I','I']},{individualSupportTypes:['II']},{dayServiceDays:2.5}])
  assert.equal(validBenefitEntitlements({...base,...patch}),false);
});
test('monthly usage deduplicates transport and daily rows, excludes absences and separates visiting days',()=>{
 const children:ChildProfile[]=[{id:'a',name:'架空併用',visitingSupportEnabled:true},{id:'v',name:'架空訪問',careType:'保育所等訪問支援'},{id:'x',name:'停止',serviceSuspended:true}];
 const plans=[{childId:'a',date:'2026-11-02',attendancePlan:'利用予定'},
  {childId:'a',date:'2026-11-03',attendancePlan:'欠席'},
  {childId:'a',date:'2026-11-04',attendancePlan:'追加利用'},
  {childId:'v',date:'2026-11-02',attendancePlan:'利用予定'}] as DailyChildPlan[];
 const requirements=[{childId:'a',date:'2026-11-02'},{childId:'a',date:'2026-11-03'},{childId:'x',date:'2026-11-02'}] as DailyTransportRequirement[];
 const usage=monthlyServiceUsage('2026-11',children,plans,requirements,[
  {childId:'a',date:'2026-11-02'},{childId:'a',date:'2026-11-02'},{childId:'v',date:'2026-11-02'},{childId:'a',date:'2026-12-01'}]);
 assert.deepEqual([...usage.day.get('a')!],['2026-11-02','2026-11-04']);
 assert.equal(usage.day.size,1);
 assert.equal(usage.visiting.get('a')?.size,1);
 assert.equal(usage.visiting.get('v')?.size,1);
});
