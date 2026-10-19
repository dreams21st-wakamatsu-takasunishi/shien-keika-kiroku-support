-- Fixture-only tests within the deployment rollback transaction. No persistent test accounts.
insert into public.lesson_campuses(id,name,code) values('management-test','架空検証校','management-test');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values('019f0000-1111-4111-8111-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','management-teacher@example.invalid','', '{}','{}',now(),now()),
 ('019f0000-1111-4111-8111-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','management-child@example.invalid','', '{}','{}',now(),now());
insert into public.user_data(id,data) values('student_management_fixture','{"userDataId":"student_management_fixture","displayName":"架空児童","campusId":"management-test","group":"A","coins":9,"keyboardSequence":7}');
insert into public.lesson_user_access(auth_user_id,user_data_id,role,scope_type,scope_value)
 values('019f0000-1111-4111-8111-000000000001','__teacher__','teacher','campus_group','management-test:A'),
 ('019f0000-1111-4111-8111-000000000002','student_management_fixture','student','all','');
select set_config('request.jwt.claim.sub','019f0000-1111-4111-8111-000000000001',true);
select public.patch_lesson_student('user_data','student_management_fixture','{"displayName":"架空更新"}','{"displayName":"架空児童"}');
do $$begin
 if (select data->>'coins' from public.user_data where id='student_management_fixture')<>'9' then raise exception 'PROGRESS_OVERWRITTEN'; end if;
 begin
  perform public.patch_lesson_student('user_data','student_management_fixture','{"displayName":"古い変更"}','{"displayName":"架空児童"}');
  raise exception 'STALE_WRITE_ALLOWED';
 exception when sqlstate 'PT409' then null; end;
 begin
  perform public.patch_lesson_student('user_data','student_management_fixture','{"group":"B"}','{"group":"A"}');
  raise exception 'SCOPE_ESCAPE_ALLOWED';
 exception when insufficient_privilege then null; end;
 begin
  perform public.patch_lesson_student('user_data','student_management_fixture','{"coins":999}','{"coins":9}');
  raise exception 'LEARNING_PATCH_ALLOWED';
 exception when raise_exception then if sqlerrm<>'FIELD_NOT_ALLOWED' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','019f0000-1111-4111-8111-000000000002',true);
do $$begin
 begin
  perform public.patch_lesson_student('user_data','student_management_fixture','{"displayName":"不正"}','{"displayName":"架空更新"}');
  raise exception 'STUDENT_MANAGEMENT_ALLOWED';
 exception when insufficient_privilege then null; end;
end $$;
update public.user_data set data=data||'{"displayName":"古いタブ","coins":10,"campusId":"main"}' where id='student_management_fixture';
do $$begin
 if not exists(select 1 from public.user_data where id='student_management_fixture' and data->>'displayName'='架空更新' and data->>'campusId'='management-test' and data->>'coins'='10') then raise exception 'IDENTITY_GUARD_FAILED'; end if;
end $$;
select set_config('request.jwt.claim.sub','019f0000-1111-4111-8111-000000000001',true);
select public.patch_lesson_student('user_data','student_management_fixture','{"studentState":"paused"}','{"studentState":null}');
select set_config('request.jwt.claim.sub','019f0000-1111-4111-8111-000000000002',true);
do $$begin
 begin
  update public.user_data set data=data||'{"coins":11}' where id='student_management_fixture';
  raise exception 'PAUSED_WRITE_ALLOWED';
 exception when insufficient_privilege then null; end;
 if public.can_read_own_lesson_campus_content('user_data','wakamatsu-takasunishi') then raise exception 'OTHER_CAMPUS_VISIBLE'; end if;
end $$;
select set_config('request.jwt.claim.sub','',true);
