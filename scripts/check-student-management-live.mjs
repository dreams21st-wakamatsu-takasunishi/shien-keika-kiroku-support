import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {clients} from './lesson-operation-client.mjs';
if(!process.argv.includes('--run-fictional-test'))throw Error('Explicit fictional test flag required');
const {lesson:service}=clients(),{lesson:teacher}=clients(),{lesson:student}=clients();
const token=randomUUID().replaceAll('-','').slice(0,14),campus=`verify-manage-${token}`,id=`student_manage_${token}`,org=randomUUID();
const passcode=`78${Date.now()}67`,teacherEmail=`verify-manage-${token}@example.invalid`;
let teacherId='',childAuth='';
const ok=result=>{if(result.error)throw Error(result.error.message);return result.data;};
try{
 ok(await service.from('lesson_campuses').insert({id:campus,name:'架空の管理検証校',code:campus}));
 const created=ok(await service.auth.admin.createUser({email:teacherEmail,password:passcode,email_confirm:true}));teacherId=created.user.id;
 ok(await service.from('lesson_user_access').insert({auth_user_id:teacherId,user_data_id:'__teacher__',role:'teacher',scope_type:'campus',scope_value:campus}));
 ok(await service.from('user_data').insert({id,data:{userDataId:id,displayName:'架空の管理検証児童',campusId:campus,birthdate:'2016-01-01',group:'A',coins:9,keyboardSequence:3}}));
 ok(await teacher.auth.signInWithPassword({email:teacherEmail,password:passcode}));
 const issued=ok(await teacher.functions.invoke('admin-create-student',{body:{userDataId:id,displayName:'架空の管理検証児童',studentNumber:'1',passcode,campusId:campus,campusCode:campus,group:'A'}}));
 if(!issued.ok)throw Error('Account issue failed');childAuth=issued.authUserId;
 let row=ok(await service.from('user_data').select('data').eq('id',id).single()).data;
 assert.equal(row.coins,9);assert.equal(row.authUserId,childAuth);
 ok(await service.from('user_data').update({data:{...row,coins:12}}).eq('id',id));
 const patched=ok(await teacher.rpc('patch_lesson_student',{p_table:'user_data',p_student:id,p_patch:{group:'B'},p_expected:{group:'A'}}));
 assert.equal(patched.coins,12);assert.equal(patched.group,'B');
 const conflict=await teacher.rpc('patch_lesson_student',{p_table:'user_data',p_student:id,p_patch:{group:'C'},p_expected:{group:'A'}});
 assert.equal(conflict.error?.code,'PT409');
 const statuses=ok(await teacher.rpc('get_lesson_student_management_status',{p_table:'user_data'}));
 assert.deepEqual(statuses.map(r=>r.id),[id]);assert.equal(statuses[0].loginReady,true);assert.equal(statuses[0].supportLinked,false);
 ok(await service.from('lesson_support_scopes').insert({support_project_ref:'cyqrxhknpboidvetdfgn',organization_id:org,data_table:'user_data',campus_id:campus,enabled:true}));
 ok(await service.from('lesson_campus_content').insert({data_table:'user_data',campus_id:campus,support_project_ref:'cyqrxhknpboidvetdfgn',organization_id:org,revision:1,content:{textTasks:[],customThemes:[],customEffects:[]}}));
 const account=ok(await service.auth.admin.getUserById(childAuth));
 ok(await student.auth.signInWithPassword({email:account.user.email,password:passcode}));
 const catalog=ok(await student.from('lesson_campus_content').select('campus_id,content').eq('campus_id',campus));
 assert.equal(catalog.length,1); // Membership works without adding D Support child-sharing links.
 const denied=await student.rpc('patch_lesson_login_fields',{p_table:'user_data',p_student:id,p_patch:{campusId:'main'}});assert(denied.error);
 row=ok(await student.from('user_data').select('data').eq('id',id).single()).data;
 ok(await student.from('user_data').update({data:{...row,campusId:'main',coins:13}}).eq('id',id));
 row=ok(await service.from('user_data').select('data').eq('id',id).single()).data;
 assert.equal(row.campusId,campus);assert.equal(row.coins,13);
 ok(await teacher.rpc('patch_lesson_student',{p_table:'user_data',p_student:id,p_patch:{studentState:'paused'},p_expected:{studentState:null}}));
 const paused=await student.from('user_data').update({data:{...row,coins:14}}).eq('id',id);assert.equal(paused.error?.code,'42501');
 console.log(JSON.stringify({passed:true,fictional:true,accountProvision:true,scopedStatus:true,fieldOnlySave:true,conflict:true,ownCampusWithoutSharing:true,forgedCampusRejected:true,pauseGuard:true}));
}finally{
 const access=await service.from('lesson_user_access').select('auth_user_id').eq('user_data_id',id);
 const authIds=[...new Set([childAuth,...(access.data||[]).map(r=>r.auth_user_id),teacherId].filter(Boolean))];
 const failures=[];
 for(const uid of authIds){const r=await service.auth.admin.deleteUser(uid);if(r.error)failures.push('fixture Auth');}
 for(const [table,field,value] of [['lesson_user_access','user_data_id',id],['lesson_user_access','auth_user_id',teacherId],['lesson_student_campuses','student_id',id],['user_data','id',id],['lesson_campus_content','campus_id',campus],['lesson_support_scopes','campus_id',campus],['lesson_campuses','id',campus]]){
   if(!value)continue;const r=await service.from(table).delete().eq(field,value);if(r.error)failures.push(table);
 }
 if(failures.length)throw Error(`Fictional fixture cleanup requires attention: ${failures.join(',')}`);
}
