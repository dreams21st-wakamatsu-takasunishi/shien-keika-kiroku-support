import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {loadEnv} from 'vite';
import {clients,supportRef,lessonRef,orgId,sql,lessonRoot,cli} from './lesson-operation-client.mjs';
if(!process.argv.includes('--inspect')&&!process.argv.includes('--apply'))throw Error('Explicit --inspect or --apply required');
const apply=process.argv.includes('--apply'),file=resolve('output/lesson-workbook-credentials.json');
const workbook=JSON.parse(readFileSync(file,'utf8')),{support,lesson}=clients(),env=loadEnv('production',lessonRoot,'VITE_');
const name=value=>String(value||'').normalize('NFKC').replace(/[ァ-ヶ]/g,char=>String.fromCharCode(char.charCodeAt(0)-0x60)).replace(/\s/g,'');
const number=value=>/^\d{1,3}$/.test(String(value??'').trim())?String(Number(value)):'';
const checked=(result,label)=>{if(result.error)throw Error(label);return result.data;};
const classroom=row=>/^student_[A-Za-z0-9_-]{1,140}$/.test(row.id)&&['main','wakamatsu-takasunishi'].includes(row.campusId||row.campus||'main')&&![row.publicRegistration,row.isGuest,row.isMaster].includes('true');
const sourceSelect='id,displayName:data->>displayName,name:data->>name,loginNumber:data->>loginNumber,campusId:data->>campusId,campus:data->>campus,publicRegistration:data->>publicRegistration,isGuest:data->>isGuest,isMaster:data->>isMaster,authUserId:data->>authUserId';
const children=checked(await support.from('children').select('id,name,kana,birth_date,service_suspended').eq('organization_id',orgId).is('deleted_at',null),'Roster unavailable').filter(child=>!child.service_suspended);
const learners=checked(await lesson.from('user_data').select(sourceSelect),'Learning identities unavailable').filter(classroom);
const access=checked(await lesson.from('lesson_user_access').select('auth_user_id,user_data_id,role'),'Access unavailable');
const users=[];for(let page=1;page<=20;page++){const result=checked(await lesson.auth.admin.listUsers({page,perPage:1000}),'Auth inspection failed');users.push(...result.users);if(result.users.length<1000)break;if(page===20)throw Error('Auth inspection exceeded bound');}
const keys=JSON.parse(cli(['projects','api-keys','--project-ref',lessonRef,'--reveal','-o','json']));
const anonKey=(Array.isArray(keys)?keys:keys.rows).find(item=>item.name==='anon')?.api_key;if(!anonKey)throw Error('Anon key unavailable');
const domain=String(env.VITE_STUDENT_LOGIN_EMAIL_DOMAIN||'').replace(/^@/,''),prefix=env.VITE_STUDENT_LOGIN_EMAIL_PREFIX||'dlesson-student-',pad=Number(env.VITE_STUDENT_LOGIN_NUMBER_PAD||3);
if(!domain||!Number.isInteger(pad)||pad<1||pad>6)throw Error('Classroom email configuration unavailable');
const matches=[],held=[];
for(const row of workbook.rows){
 const child=children.filter(c=>[c.name,c.kana].filter(Boolean).some(value=>name(value)===name(row.childName)));
 if(child.length!==1||!child[0].birth_date){held.push({sheetRow:row.sheetRow,reason:'在籍名簿・生年月日の一意照合ができません'});continue;}
 const candidate=learners.filter(s=>number(s.loginNumber)===number(row.studentNumber)&&[row.childName,child[0].name,child[0].kana].filter(Boolean).some(value=>name(value)===name(s.displayName||s.name)));
 if(candidate.length!==1||!number(row.studentNumber)){held.push({sheetRow:row.sheetRow,childId:child[0].id,reason:'氏名・児童番号で学習アカウントが一意に一致しません'});continue;}
 const learner=candidate[0],campus=learner.campusId||learner.campus||'main';
 if(!/^\d{6,12}$/.test(row.passcode)){held.push({sheetRow:row.sheetRow,childId:child[0].id,reason:'現行の合言葉が教室ログインの6〜12桁条件に適合しません'});continue;}
 const email=`${prefix}${campus}-${number(row.studentNumber).padStart(pad,'0')}@${domain}`;
 const existing=users.filter(user=>user.email?.toLowerCase()===email.toLowerCase());
 if(existing.length>1){held.push({sheetRow:row.sheetRow,childId:child[0].id,reason:'Authアカウントが一意に確認できません'});continue;}
 const auth=existing[0],bindings=access.filter(item=>item.user_data_id===learner.id&&item.role==='student');
 // Existing normal-email and classroom logins may legitimately share one learner.
 if((!auth&&bindings.length)||auth&&(access.some(item=>item.auth_user_id===auth.id&&(item.role!=='student'||item.user_data_id!==learner.id))||auth.user_metadata?.user_data_id!==learner.id||auth.user_metadata?.campus_id!==campus||number(auth.user_metadata?.login_number)!==number(row.studentNumber))){held.push({sheetRow:row.sheetRow,childId:child[0].id,reason:'既存のAuthまたは権限情報に不一致があります'});continue;}
 matches.push({row,child:child[0],learner,campus,email,auth,authBound:bindings.some(item=>item.auth_user_id===auth?.id)});
}
// Refuse duplicate workbook rows rather than letting a first match win.
const unique=matches.filter(item=>matches.filter(other=>other.child.id===item.child.id||other.learner.id===item.learner.id).length===1);
for(const item of matches.filter(item=>!unique.includes(item)))held.push({sheetRow:item.row.sheetRow,childId:item.child.id,reason:'対応表で児童または学習アカウントが重複しています'});
const previous=process.argv.includes('--retry-held')?JSON.parse(readFileSync('output/lesson-workbook-operation-report.json','utf8')):null;
const report={authorizationDate:'2026-09-30',organizationId:orgId,allowedCampuses:['main','wakamatsu-takasunishi'],sourceWorkbook:{sheet:workbook.sheet,columns:'A:C (current passcode only)'},matched:unique.map(item=>({sheetRow:item.row.sheetRow,childId:item.child.id,studentId:item.learner.id,campusId:item.campus,authExists:!!item.auth})),held,completed:previous?.completed||[]};
writeFileSync('output/lesson-workbook-operation-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({mode:apply?'apply':'inspect',roster:children.length,workbookRows:workbook.rows.length,verifiedCandidates:unique.length,existingAuth:unique.filter(item=>item.auth).length,newAuthNeeded:unique.filter(item=>!item.auth).length,held:held.length,heldReasons:held.reduce((r,item)=>(r[item.reason]=(r[item.reason]||0)+1,r),{})}));
if(!apply)process.exit(0);
try{
 const migration=readFileSync('supabase/migrations/202609300003_lesson_authorized_migration.sql','utf8');
 if(!sql("select exists(select 1 from supabase_migrations.schema_migrations where version='202609300003') as ready").rows[0].ready){sql(`begin;${migration}rollback;`);sql(`begin;${migration}insert into supabase_migrations.schema_migrations(version,name,statements) values('202609300003','lesson_authorized_migration',array['User-authorized workbook integration']);commit;`);}
 sql(readFileSync(resolve(lessonRoot,'supabase/sql/support_student_auth_provision.sql'),'utf8'),lessonRoot);
 for(const item of unique){
  if(report.completed.some(row=>row.childId===item.child.id&&row.studentId===item.learner.id))continue;
  const {row,child,learner,campus,email}=item;
  let auth=item.auth,newAuth=false,permissionCreated=false,newLink=false,link;
  try{
   const current=checked(await lesson.from('user_data').select(sourceSelect).eq('id',learner.id).single(),'Source identity recheck failed');
   const roster=checked(await support.from('children').select('id,name,kana,birth_date,service_suspended,deleted_at').eq('organization_id',orgId).eq('id',child.id).single(),'Roster recheck failed');
   if(!classroom(current)||(current.campusId||current.campus||'main')!==campus||current.loginNumber!==learner.loginNumber||name(current.displayName||current.name)!==name(learner.displayName||learner.name)||roster.deleted_at||roster.service_suspended||roster.name!==child.name||roster.kana!==child.kana||roster.birth_date!==child.birth_date)throw Error('Identity changed');
   const before=checked(await lesson.from('user_data').select('data').eq('id',learner.id).single(),'Learning snapshot unavailable').data;
   const previousLink=checked(await support.from('lesson_child_links').select('*').eq('organization_id',orgId).eq('child_id',child.id).eq('active',true).maybeSingle(),'Existing link unavailable');
   if(previousLink&&(previousLink.source_student_id!==learner.id||previousLink.source_project_ref!==lessonRef||previousLink.source_campus_id!==campus))throw Error('Existing link differs');
   if(!auth){auth=checked(await lesson.auth.admin.createUser({email,password:row.passcode,email_confirm:true,user_metadata:{user_data_id:learner.id,display_name:learner.displayName||learner.name,campus_id:campus,login_number:learner.loginNumber}}),'Auth creation failed').user;if(!auth)throw Error('Auth creation failed');newAuth=true;}
   const pupil=createClient(`https://${lessonRef}.supabase.co`,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
   let login=await pupil.auth.signInWithPassword({email,password:row.passcode}),workbookPasscodeVerified=true;
   if(login.error?.code==='invalid_credentials'&&process.argv.includes('--keep-auth-passwords')&&item.auth&&item.authBound){
    // User chose to preserve Auth passwords. This tests authorization, not the spreadsheet password.
    const generated=checked(await lesson.auth.admin.generateLink({type:'magiclink',email}),'Temporary verification session unavailable');
    login=await pupil.auth.verifyOtp({token_hash:generated.properties.hashed_token,type:'magiclink'});workbookPasscodeVerified=false;
   }
   if(login.error||login.data.user?.id!==auth.id)throw Error(login.error?.status===429?'Classroom login rate limited':login.error?.code==='invalid_credentials'?'Current workbook passcode differs from Auth':'Classroom login verification failed');
   if(!item.authBound)checked(await lesson.rpc('provision_support_student_access',{p_student:learner.id,p_actor:auth.id,p_campus:campus,p_number:learner.loginNumber}),'Protected learner Auth binding failed');
   const own=await pupil.from('user_data').select('id').eq('id',learner.id).single();if(own.error||own.data?.id!==learner.id)throw Error('Own-data RLS read failed');
   const otherId=learners.find(other=>other.id!==learner.id)?.id;if(otherId){const other=await pupil.from('user_data').select('id').eq('id',otherId);if(other.error||other.data.length)throw Error('Other-learner RLS isolation failed');}
   const after=checked(await lesson.from('user_data').select('data').eq('id',learner.id).single(),'Learning preservation check failed').data;
   const preserved=data=>Object.fromEntries(Object.entries(data).filter(([key])=>!['authUserId','userDataId'].includes(key)));
   const hash=data=>createHash('sha256').update(JSON.stringify(Object.entries(preserved(data)).sort(([a],[b])=>a.localeCompare(b)))).digest('hex');
   if(hash(before)!==hash(after))throw Error('Learning data changed during verification; held');
   checked(await lesson.from('lesson_support_scopes').upsert({support_project_ref:supportRef,organization_id:orgId,data_table:'user_data',campus_id:campus,enabled:true}),'Campus grant failed');
   const permit=checked(await lesson.from('lesson_support_students').select('*').eq('support_project_ref',supportRef).eq('organization_id',orgId).eq('data_table','user_data').eq('student_id',learner.id).maybeSingle(),'Permit recheck failed');
   if(permit?.enabled&&permit.support_link_id&&permit.support_link_id!==previousLink?.id)throw Error('Existing permit differs');
   checked(await lesson.from('lesson_support_students').upsert({support_project_ref:supportRef,organization_id:orgId,data_table:'user_data',campus_id:campus,student_id:learner.id,enabled:true},{onConflict:'support_project_ref,organization_id,data_table,student_id'}),'Student sharing grant failed');permissionCreated=!permit?.enabled;
   link=checked(await support.rpc('migrate_authorized_lesson_link',{p_org:orgId,p_child:child.id,p_expected_name:child.name,p_expected_birth:child.birth_date,p_source_project:lessonRef,p_source_table:'user_data',p_source_student:learner.id,p_source_campus:campus,p_source_name:learner.displayName||learner.name,p_match_rule:'User-specified workbook: unique kana/name and classroom number; student Auth verified'}),'Audited child link failed');newLink=!previousLink;
   checked(await lesson.rpc('bind_support_word_student',{p_project:supportRef,p_org:orgId,p_table:'user_data',p_student:learner.id,p_link:link.id,p_child:child.id,p_bind:true}),'Word binding failed');
   const status=await pupil.functions.invoke('student-word-review',{body:{action:'status',studentId:learner.id}});if(status.error||status.data?.linked!==true)throw Error('Student Word connection verification failed');
   await pupil.auth.signOut();
   report.completed.push({sheetRow:row.sheetRow,childId:child.id,studentId:learner.id,campusId:campus,authCreated:newAuth,linkId:link.id,learningPreservationHash:hash(after),ownRead:true,otherReadDenied:true,wordLinked:true,workbookPasscodeVerified,verificationSession:workbookPasscodeVerified?'existing-password':'admin-generated-no-email'});
  }catch(error){
   if(permissionCreated)checked(await lesson.from('lesson_support_students').update({enabled:false,support_link_id:null,support_child_id:null}).eq('support_project_ref',supportRef).eq('organization_id',orgId).eq('data_table','user_data').eq('student_id',learner.id),'Failed-grant cleanup failed');
   if(newLink&&link){checked(await support.from('lesson_child_links').update({active:false,revision:link.revision+1}).eq('id',link.id).eq('revision',link.revision),'Failed-link cleanup failed');checked(await support.from('lesson_link_audit').insert({organization_id:orgId,link_id:link.id,actor_id:null,actor_source:'authorized_migration',action:'disabled',snapshot:{reason:'Integration verification failed; access revoked'}}),'Failed-link audit failed');}
   // Once an Auth binding exists, retain it for recovery; never delete someone else's account.
   if(newAuth&&auth){const bound=checked(await lesson.from('lesson_user_access').select('auth_user_id').eq('auth_user_id',auth.id),'Auth cleanup inspection failed');if(!bound.length)checked(await lesson.auth.admin.deleteUser(auth.id),'Unbound temporary Auth cleanup failed');}
   const diagnostics=new Set(['Identity changed','Existing link differs','Classroom login rate limited','Current workbook passcode differs from Auth','Classroom login verification failed','Own-data RLS read failed','Other-learner RLS isolation failed','Learning data changed during verification; held','Student Word connection verification failed','Protected learner Auth binding failed','Campus grant failed','Student sharing grant failed','Audited child link failed','Word binding failed']);
   report.held.push({sheetRow:row.sheetRow,childId:child.id,reason:'Auth・本人データ保護・連携の実確認に失敗したため保留（秘密情報は非表示）',diagnostic:diagnostics.has(error.message)?error.message:'Controlled operation failed'});
  }
  writeFileSync('output/lesson-workbook-operation-report.json',JSON.stringify(report,null,2));
 }
 console.log(JSON.stringify({completed:report.completed.length,authCreated:report.completed.filter(row=>row.authCreated).length,held:report.held.length,diagnostics:report.held.reduce((r,item)=>(r[item.diagnostic||item.reason]=(r[item.diagnostic||item.reason]||0)+1,r),{}),originalPasscodesChanged:false,existingLearningDataPreserved:true}));
}finally{unlinkSync(file);}
