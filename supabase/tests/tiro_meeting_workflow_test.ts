// Exercise the real migration in an isolated PostgreSQL database with fictional users.
import { PGlite } from 'npm:@electric-sql/pglite@0.3.14';
import assert from 'node:assert/strict';

Deno.test('meeting workflow enforces access, versioning, review and device rules', async () => {
  const db = new PGlite();
  const org = '00000000-0000-4000-8000-000000000001';
  const otherOrg = '00000000-0000-4000-8000-000000000002';
  const creator = '00000000-0000-4000-8000-000000000011';
  const editor = '00000000-0000-4000-8000-000000000012';
  const outsider = '00000000-0000-4000-8000-000000000013';
  const reviewer = '00000000-0000-4000-8000-000000000014';
  const foreignUser = '00000000-0000-4000-8000-000000000015';
  const meeting = '00000000-0000-4000-8000-000000000021';
  const otherMeeting = '00000000-0000-4000-8000-000000000022';
  try {
    await db.exec(`
      create role authenticated;
      create schema auth;
      grant usage on schema auth to authenticated;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table public.organizations (id uuid primary key);
      create table public.profiles (
        id uuid primary key, organization_id uuid not null references public.organizations(id),
        role text not null, active boolean not null default true, recorder_profile_id uuid);
      create table public.children (
        organization_id uuid not null references public.organizations(id), id text not null,
        deleted_at timestamptz,
        primary key (organization_id, id));
      create table public.calendar_events (
        organization_id uuid not null references public.organizations(id), id uuid not null,
        primary key (organization_id, id));
      create table public.audit_logs (
        organization_id uuid not null, actor_id uuid, table_name text, row_id text,
        action text, new_data jsonb);
      create function public.current_organization_id() returns uuid language sql stable security definer
        as $$ select organization_id from public.profiles where id = auth.uid() and active $$;
      create function public.current_user_role() returns text language sql stable security definer
        as $$ select role from public.profiles where id = auth.uid() and active $$;
      create function public.current_user_has_permission(text) returns boolean language sql stable security definer
        as $$ select public.current_user_role() = 'admin' and $1 = 'review_records' $$;
      create function public.current_recorder_profile_id() returns uuid language sql stable security definer
        as $$ select recorder_profile_id from public.profiles where id = auth.uid() $$;
      create function public.current_request_device_kind() returns text language sql stable security definer
        as $$ select current_setting('app.device_kind', true) $$;
      create function public.prevent_personal_device_record_mutation() returns trigger
        language plpgsql security definer as $$ begin
          if public.current_user_role() <> 'admin'
            and public.current_recorder_profile_id() is not null
            and public.current_request_device_kind() <> 'facility_shared' then
            raise exception 'PERSONAL_TRANSPORT_ONLY';
          end if;
          return new;
        end $$;
      create function public.write_audit_log() returns trigger language plpgsql security definer
        as $$ begin return new; end $$;
      insert into public.organizations values ('${org}'), ('${otherOrg}');
      insert into public.profiles (id, organization_id, role, recorder_profile_id) values
        ('${creator}', '${org}', 'staff', '${creator}'),
        ('${editor}', '${org}', 'staff', '${editor}'),
        ('${outsider}', '${org}', 'staff', '${outsider}'),
        ('${reviewer}', '${org}', 'admin', null),
        ('${foreignUser}', '${otherOrg}', 'admin', null);
      insert into public.children (organization_id,id) values ('${org}', 'child-1'), ('${org}', 'child-3'), ('${otherOrg}', 'child-2');
    `);
    const migration = await Deno.readTextFile(new URL('../migrations/202609290001_tiro_meeting_workflow.sql', import.meta.url));
    await db.exec(migration);
    const actAs = (user: string, device = 'facility_shared') => db.exec(`
      set role authenticated;
      set request.jwt.claim.sub = '${user}';
      set app.device_kind = '${device}';
    `);
    const owner = () => actAs(creator);

    await owner();
    await db.query(`insert into public.meeting_cases
      (organization_id,id,child_id,title,meeting_type,meeting_date)
      values ($1,$2,'child-1','担当者会議','担当者会議','2026-09-29')`, [org, meeting]);
    await db.exec('reset role');
    const multiChildMigration = await Deno.readTextFile(new URL('../migrations/202609290002_multi_child_meetings.sql', import.meta.url));
    await db.exec(multiChildMigration);
    await owner();
    await db.exec('begin');
    const returned = await db.query<{ child_ids: string[] }>(`insert into public.meeting_cases
      (organization_id,id,child_id,child_ids,title,meeting_type,meeting_date)
      values ($1,$2,'child-1',array['child-1','child-3'],'兄弟会議','担当者会議','2026-09-30') returning child_ids`, [org, otherMeeting]);
    assert.deepEqual(returned.rows[0].child_ids, ['child-1', 'child-3']);
    await db.exec('rollback');
    await db.query(`update public.meeting_cases set child_ids=array['child-1','child-3'],revision=2 where id=$1`, [meeting]);
    assert.deepEqual((await db.query<{ child_ids: string[] }>('select child_ids from public.meeting_cases where id=$1', [meeting])).rows[0].child_ids, ['child-1', 'child-3']);
    await assert.rejects(() => db.query(`update public.meeting_cases set child_ids=array['child-1','child-2'],revision=3 where id=$1`, [meeting]));
    let result = await db.query<{ created_by: string; revision: number }>(
      'select created_by,revision from public.meeting_cases where id=$1', [meeting]);
    assert.deepEqual(result.rows[0], { created_by: creator, revision: 2 });
    await db.query('update public.meeting_cases set editor_user_ids=$1,revision=3 where id=$2', [[editor], meeting]);

    await actAs(outsider);
    assert.equal((await db.query('select id from public.meeting_cases')).rows.length, 0);
    await assert.rejects(() => db.query(`insert into public.meeting_transcripts
      (organization_id,meeting_id,version,source_kind,raw_text)
      values ($1,$2,1,'スクリプト','secret')`, [org, meeting]));

    await actAs(foreignUser);
    assert.equal((await db.query('select id from public.meeting_cases')).rows.length, 0);

    await actAs(editor);
    assert.equal((await db.query('select id from public.meeting_cases')).rows.length, 1);
    await db.query(`insert into public.meeting_transcripts
      (organization_id,meeting_id,version,source_kind,raw_text)
      values ($1,$2,1,'スクリプト','original')`, [org, meeting]);
    await assert.rejects(() => db.query(`insert into public.meeting_transcripts
      (organization_id,meeting_id,version,source_kind,raw_text)
      values ($1,$2,1,'スクリプト','replacement')`, [org, meeting]));
    await db.query(`insert into public.meeting_transcripts
      (organization_id,meeting_id,version,source_kind,raw_text,corrected_text)
      values ($1,$2,2,'スクリプト','original','corrected')`, [org, meeting]);
    assert.equal((await db.query('select id from public.meeting_transcripts')).rows.length, 2);
    await db.query(`insert into public.meeting_export_events
      (organization_id,meeting_id,output_kind) values ($1,$2,'sheet_copy')`, [org, meeting]);

    await owner();
    await assert.rejects(() => db.query(`insert into public.meeting_progress_records
      (organization_id,meeting_id,child_id,record_date,body,approval_status)
      values ($1,$2,'child-1','2026-09-29','draft','未確認')`, [org, meeting]));
    await db.query(`update public.meeting_cases set status='結果確認済み',revision=4 where id=$1`, [meeting]);
    await db.query(`insert into public.meeting_progress_records
      (organization_id,meeting_id,child_id,record_date,body,approval_status)
      values ($1,$2,'child-1','2026-09-29','submitted','未確認')`, [org, meeting]);
    await db.query(`insert into public.meeting_progress_records
      (organization_id,meeting_id,child_id,record_date,body,approval_status)
      values ($1,$2,'child-3','2026-09-29','sibling submitted','未確認')`, [org, meeting]);
    assert.equal((await db.query('select id from public.meeting_progress_records where meeting_id=$1', [meeting])).rows.length, 2);
    await assert.rejects(() => db.query(`update public.meeting_cases set child_ids=array['child-1'],revision=5 where id=$1`, [meeting]));
    await assert.rejects(() => db.query(`update public.meeting_progress_records
      set body='changed',revision=2 where meeting_id=$1 and child_id='child-1'`, [meeting]));

    await actAs(reviewer);
    assert.equal((await db.query('select id from public.meeting_cases')).rows.length, 1);
    await assert.rejects(() => db.query(`update public.meeting_progress_records
      set body='reviewer changed',approval_status='確認済み',revision=2 where meeting_id=$1 and child_id='child-1'`, [meeting]));
    await db.query(`update public.meeting_progress_records
      set approval_status='確認済み',revision=2 where meeting_id=$1 and child_id='child-1'`, [meeting]);
    await assert.rejects(() => db.query(`update public.meeting_progress_records
      set approval_status='要修正',revision=3 where meeting_id=$1 and child_id='child-1'`, [meeting]));

    await owner();
    await assert.rejects(() => db.query(`update public.meeting_cases
      set title='after approval',revision=5 where id=$1`, [meeting]));
    await assert.rejects(() => db.query(`insert into public.meeting_transcripts
      (organization_id,meeting_id,version,source_kind,raw_text)
      values ($1,$2,3,'要約のみ','after approval')`, [org, meeting]));
    await actAs(creator, 'personal');
    assert.equal((await db.query('select id from public.meeting_cases')).rows.length, 0);
    await assert.rejects(() => db.query(`insert into public.meeting_cases
      (organization_id,id,child_id,title,meeting_type,meeting_date)
      values ($1,$2,'child-1','mobile','担当者会議','2026-09-30')`, [org, otherMeeting]));
  } finally {
    await db.close();
  }
});
