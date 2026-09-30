import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {clients,supportRef,lessonRef,orgId,campusId,sql} from './lesson-operation-client.mjs';
if(!process.argv.includes('--inspect')&&!process.argv.includes('--apply-matches'))throw Error('Use --inspect or --apply-matches');
const apply=process.argv.includes('--apply-matches'),{support,lesson}=clients();
const normalizeName=value=>String(value||'').normalize('NFKC').replace(/\s/g,'');
const birthday=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value:'';};
const check=(result,label)=>{if(result.error)throw Error(label);return result.data;};
const children=check(await support.from('children').select('id,name,birth_date,service_suspended').eq('organization_id',orgId).is('deleted_at',null),'Child roster read failed').filter(row=>!row.service_suspended);
const all=check(await lesson.from('user_data').select('id,displayName:data->>displayName,name:data->>name,studentName:data->>studentName,birthdate:data->>birthdate,birth:data->>birth,campusId:data->>campusId,campus:data->>campus,publicRegistration:data->>publicRegistration,isGuest:data->>isGuest,isMaster:data->>isMaster,registrationSource:data->>registrationSource,accountType:data->>accountType'),'Minimal learning identity read failed');
const learners=all.filter(row=>/^student_[A-Za-z0-9_-]{1,140}$/.test(row.id)&&!['true'].includes(row.publicRegistration)&&row.isGuest!=='true'&&row.isMaster!=='true'&&row.registrationSource!=='public'&&!['public','guest'].includes(row.accountType)&&(row.campusId||row.campus||'main')===campusId);
const access=check(await lesson.from('lesson_user_access').select('user_data_id,auth_user_id').eq('role','student'),'Learning access read failed');
const matches=[],held=[];
for(const child of children){
  const birth=birthday(child.birth_date),name=normalizeName(child.name);
  const candidates=learners.filter(row=>normalizeName(row.displayName||row.name||row.studentName)===name&&birthday(row.birthdate||row.birth)===birth);
  const duplicateChildren=children.filter(row=>normalizeName(row.name)===name&&birthday(row.birth_date)===birth);
  if(!birth||!name||candidates.length!==1||duplicateChildren.length!==1||access.filter(row=>row.user_data_id===candidates[0]?.id).length!==1){held.push({childId:child.id,name:child.name,reason:!birth?'生年月日なし':candidates.length!==1?'氏名・生年月日の一意一致なし':'重複名簿または児童Authの確認が必要'});continue;}
  matches.push({child,learner:candidates[0]});
}
mkdirSync('output',{recursive:true});
writeFileSync('output/lesson-real-child-link-review.json',JSON.stringify({date:'2026-09-30',organizationId:orgId,campusId,rule:'Unique NFKC name without whitespace and exact birth date; one student Auth binding',matches:matches.map(({child,learner})=>({childId:child.id,name:child.name,birthDate:child.birth_date,studentId:learner.id,displayName:learner.displayName||learner.name||learner.studentName})),held},null,2));
console.log(JSON.stringify({activeRoster:children.length,classroomLearners:learners.length,uniqueMatches:matches.length,held:held.length,mode:apply?'apply':'inspect'}));
if(!apply)process.exit(0);
const exists=sql("select exists(select 1 from supabase_migrations.schema_migrations where version='202609300003') as ready").rows[0].ready;
if(!exists){const migration=readFileSync('supabase/migrations/202609300003_lesson_authorized_migration.sql','utf8');sql(`begin;${migration}insert into supabase_migrations.schema_migrations(version,name,statements) values('202609300003','lesson_authorized_migration',array['Applied via link-existing-lesson-children.mjs']);commit;`);}
let linked=0;
for(const {child,learner} of matches){
  // Re-read the minimal source identity immediately before granting access.
  const current=check(await lesson.from('user_data').select('id,displayName:data->>displayName,name:data->>name,studentName:data->>studentName,birthdate:data->>birthdate,birth:data->>birth,campusId:data->>campusId,campus:data->>campus,publicRegistration:data->>publicRegistration,isGuest:data->>isGuest,isMaster:data->>isMaster').eq('id',learner.id).single(),'Learning identity recheck failed');
  if(normalizeName(current.displayName||current.name||current.studentName)!==normalizeName(child.name)||birthday(current.birthdate||current.birth)!==child.birth_date||(current.campusId||current.campus||'main')!==campusId||[current.publicRegistration,current.isGuest,current.isMaster].includes('true'))throw Error('Identity changed; migration stopped without guessing');
  const existing=check(await support.from('lesson_child_links').select('*').eq('organization_id',orgId).eq('child_id',child.id).eq('active',true).maybeSingle(),'Existing link read failed');
  if(existing&&(existing.source_student_id!==learner.id||existing.source_project_ref!==lessonRef))throw Error('An existing child link differs; migration stopped');
  check(await lesson.from('lesson_support_scopes').upsert({support_project_ref:supportRef,organization_id:orgId,data_table:'user_data',campus_id:campusId,enabled:true}),'Scope grant failed');
  check(await lesson.from('lesson_support_students').upsert({support_project_ref:supportRef,organization_id:orgId,data_table:'user_data',campus_id:campusId,student_id:learner.id,enabled:true},{onConflict:'support_project_ref,organization_id,data_table,student_id'}),'Student grant failed');
  const result=await support.rpc('migrate_authorized_lesson_link',{p_org:orgId,p_child:child.id,p_expected_name:child.name,p_expected_birth:child.birth_date,p_source_project:lessonRef,p_source_table:'user_data',p_source_student:learner.id,p_source_campus:campusId,p_source_name:current.displayName||current.name||current.studentName});
  const link=check(result,'Verified child migration failed');
  check(await lesson.rpc('bind_support_word_student',{p_project:supportRef,p_org:orgId,p_table:'user_data',p_student:learner.id,p_link:link.id,p_child:child.id,p_bind:true}),'Word link binding failed');
  linked++;
}
console.log(JSON.stringify({linked,held:held.length,realLearningDataModified:false,realAuthModified:false}));
