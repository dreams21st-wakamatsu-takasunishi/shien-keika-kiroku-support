// Isolated PostgreSQL; no connection to production and no real staff data.
import { PGlite } from 'npm:@electric-sql/pglite@0.3.14';
import assert from 'node:assert/strict';

Deno.test('personal QR: authenticated issuance, shared scanning, atomic attendance, replay and migration safety', async () => {
  const db = new PGlite();
  const [org, otherOrg, user, otherUser, recorder, otherRecorder, kiosk, device, otherDevice, otherKiosk] =
    Array.from({ length: 10 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema extensions;
      create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role', true) $$;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function extensions.digest(text, text) returns bytea language sql as $$ select sha256(convert_to($1, 'UTF8')) $$;
      create function extensions.gen_random_bytes(integer) returns bytea language sql as $$ select sha256(convert_to(gen_random_uuid()::text, 'UTF8')) $$;
      create table organizations(id uuid primary key, personal_access_time_enabled boolean default false,
        personal_access_start time default '00:00', personal_access_end time default '23:59:59', personal_access_days smallint[] default '{1,2,3,4,5,6,7}');
      create table profiles(id uuid primary key, organization_id uuid, recorder_profile_id uuid, active boolean default true);
      create table recorder_profiles(id uuid primary key, organization_id uuid, auth_user_id uuid,
        active boolean default true, individual_login_enabled boolean default true, display_name text default 'テスト職員', unique(organization_id,id));
      create table organization_devices(id uuid primary key, organization_id uuid, token_hash text,
        device_kind text, status text, owner_recorder_profile_id uuid, last_seen_at timestamptz);
      create table attendance_qr_challenges(id uuid primary key, organization_id uuid, token_hash text,
        issued_device_id uuid, expires_at timestamptz, created_at timestamptz default now());
      create table attendance_records(organization_id uuid not null, id uuid default gen_random_uuid(), recorder_profile_id uuid not null,
        work_date date not null, status text default '勤務予定', clock_in_at timestamptz, clock_out_at timestamptz,
        device_id text, last_action_by_recorder_id uuid, created_by uuid,
        break_periods jsonb default '[]', updated_at timestamptz default now(), scheduled_start_time time,
        primary key(organization_id,id), unique(organization_id,recorder_profile_id,work_date));
      create function current_organization_id() returns uuid language sql as $$ select organization_id from profiles where id=auth.uid() $$;
      create function current_recorder_profile_id() returns uuid language sql as $$
        select r.id from recorder_profiles r join profiles p on p.id=auth.uid()
        where r.organization_id=p.organization_id and (r.id=p.recorder_profile_id or r.auth_user_id=p.id) limit 1 $$;
      insert into organizations(id) values ('${org}'), ('${otherOrg}');
      insert into profiles(id,organization_id) values ('${user}','${org}'),('${otherUser}','${org}');
      insert into recorder_profiles(id,organization_id,auth_user_id) values ('${recorder}','${org}','${user}'),('${otherRecorder}','${org}','${otherUser}');
      insert into organization_devices values
        ('${kiosk}','${org}',encode(extensions.digest(repeat('c',64),'sha256'),'hex'),'facility_shared','approved',null,null),
        ('${otherKiosk}','${org}',encode(extensions.digest(repeat('e',64),'sha256'),'hex'),'facility_shared','approved',null,null),
        ('${device}','${org}',encode(extensions.digest(repeat('b',64),'sha256'),'hex'),'personal','approved','${recorder}',null),
        ('${otherDevice}','${org}',encode(extensions.digest(repeat('d',64),'sha256'),'hex'),'personal','approved','${otherRecorder}',null);
      set request.jwt.claim.sub='${user}'; set request.jwt.claim.role='authenticated';
    `);
    await db.exec(await Deno.readTextFile(new URL('../migrations/202609160001_attendance_qr_login.sql', import.meta.url)));
    await db.exec(await Deno.readTextFile(new URL('../migrations/202609160002_personal_staff_qr.sql', import.meta.url)));
    // Use the real app's resolver, including explicit-link precedence. The old
    // simplified fixture missed email and staff-ID logins sharing one recorder.
    const linksMigration = await Deno.readTextFile(new URL('../migrations/202608210004_login_recorder_links.sql', import.meta.url));
    const resolver = linksMigration.match(/create or replace function public\.current_recorder_profile_id\(\)[\s\S]*?\$\$;/);
    assert.ok(resolver);
    await db.exec(resolver[0]);
    const phone = 'b'.repeat(64), scanner = 'c'.repeat(64);
    const issue = async (deviceToken = phone) => (await db.query<{ result: { token: string; expiresAt: string; serverNow: string } }>(
      'select issue_personal_staff_qr($1) as result', [deviceToken])).rows[0].result;
    const consume = (token: string, action = 'ログイン', scannerToken = scanner, expected = user) => db.query<{ result: Record<string, string> }>(
      'select consume_personal_staff_qr($1,$2,$3,$4) as result', [token, scannerToken, action, expected]);
    const inspect = (token: string, scannerToken = scanner) => db.query('select inspect_personal_staff_qr($1,$2)', [token, scannerToken]);
    const status = async (token: string) => (await db.query<{ result: { usedAt: string | null; action: string | null } }>(
      'select get_personal_staff_qr_status($1) as result', [token])).rows[0].result;
    // Reproduce the reported error before applying the repair: email/profile
    // points to the recorder, whose staff-ID account is a different auth user.
    await db.exec(`update profiles set recorder_profile_id='${recorder}' where id='${otherUser}'; set request.jwt.claim.sub='${otherUser}'`);
    assert.equal((await db.query<{ id: string }>('select current_recorder_profile_id() as id')).rows[0].id, recorder);
    await assert.rejects(() => issue(), /STAFF_QR_ACCOUNT_UNAVAILABLE/);
    await db.exec(await Deno.readTextFile(new URL('../migrations/202609170001_staff_qr_explicit_identity_links.sql', import.meta.url)));
    const emailQr = await issue();
    await db.exec("set request.jwt.claim.role='service_role'");
    const emailIdentity = await db.query<{ result: { userId: string; recorderProfileId: string } }>('select inspect_personal_staff_qr($1,$2) as result', [emailQr.token, scanner]);
    assert.equal(emailIdentity.rows[0].result.userId, otherUser, 'identity must remain the actual email-login issuer');
    assert.equal(emailIdentity.rows[0].result.recorderProfileId, recorder);
    await assert.rejects(() => consume(emailQr.token, 'ログイン', scanner, user), /STAFF_QR_ACCOUNT_UNAVAILABLE/);
    assert.equal((await consume(emailQr.token, 'ログイン', scanner, otherUser)).rows[0].result.userId, otherUser);
    // A staff-ID login also remains valid when the recorder has an email link.
    await db.exec(`set request.jwt.claim.sub='${user}'; set request.jwt.claim.role='authenticated'`);
    const staffQr = await issue();
    await db.exec("set request.jwt.claim.role='service_role'");
    assert.equal((await consume(staffQr.token)).rows[0].result.userId, user);
    // Stops on the actual staff-ID account remain enforced, with or without an
    // explicit link. Unrelated login users still cannot select this recorder.
    await db.exec(`update profiles set recorder_profile_id=null where id='${otherUser}'; update profiles set recorder_profile_id='${recorder}' where id='${user}'; update recorder_profiles set individual_login_enabled=false where id='${recorder}'`);
    await assert.rejects(() => issue(), /STAFF_QR_ACCOUNT_UNAVAILABLE/);
    await db.exec(`update recorder_profiles set individual_login_enabled=true where id='${recorder}'; update profiles set recorder_profile_id=null where id='${user}'; delete from staff_qr_events; set request.jwt.claim.role='authenticated'`);
    await assert.rejects(() => issue(scanner), /STAFF_QR_PERSONAL_REQUIRED/);
    await assert.rejects(() => issue('d'.repeat(64)), /STAFF_QR_PERSONAL_REQUIRED/);
    const first = await issue();
    assert.match(first.token, /^[0-9a-f]{64}$/);
    assert.equal(Date.parse(first.expiresAt) - Date.parse(first.serverNow), 120000);
    assert.deepEqual(await status(first.token), { usedAt: null, action: null });
    await assert.rejects(() => consume(first.token), /STAFF_QR_DENIED/);
    await db.exec('set role authenticated');
    await assert.rejects(() => consume(first.token), /permission denied/);
    await assert.rejects(() => db.query('select * from staff_qr_tokens'), /permission denied/);
    await assert.rejects(() => db.query('select * from staff_qr_events'), /permission denied/);
    await assert.rejects(() => db.query('select validate_staff_qr_identity($1,$2,$3)', [user,recorder,device]), /permission denied/);
    await db.exec("reset role; set request.jwt.claim.role='service_role'");
    await assert.rejects(() => inspect('bad'), /STAFF_QR_INVALID/);
    await assert.rejects(() => inspect('f'.repeat(64)), /STAFF_QR_INVALID/);
    await assert.rejects(() => inspect(first.token, phone), /STAFF_QR_SHARED_REQUIRED/);
    const denied = async (expected: string, before: string, after: string) => {
      await db.exec(before); await assert.rejects(() => inspect(first.token), new RegExp(expected)); await db.exec(after);
    };
    for (const state of ['pending','revoked']) {
      await denied('STAFF_QR_SHARED_REQUIRED', `update organization_devices set status='${state}' where id='${kiosk}'`, `update organization_devices set status='approved' where id='${kiosk}'`);
      await denied('STAFF_QR_PERSONAL_REQUIRED', `update organization_devices set status='${state}' where id='${device}'`, `update organization_devices set status='approved' where id='${device}'`);
    }
    await denied('STAFF_QR_SHARED_REQUIRED', `update organization_devices set organization_id='${otherOrg}' where id='${kiosk}'`, `update organization_devices set organization_id='${org}' where id='${kiosk}'`);
    await denied('STAFF_QR_PERSONAL_REQUIRED', `update organization_devices set owner_recorder_profile_id='${otherRecorder}' where id='${device}'`, `update organization_devices set owner_recorder_profile_id='${recorder}' where id='${device}'`);
    await denied('STAFF_QR_ACCOUNT_UNAVAILABLE', `update profiles set active=false where id='${user}'`, `update profiles set active=true where id='${user}'`);
    await denied('STAFF_QR_ACCOUNT_UNAVAILABLE', `update recorder_profiles set individual_login_enabled=false where id='${recorder}'`, `update recorder_profiles set individual_login_enabled=true where id='${recorder}'`);
    await denied('STAFF_QR_ACCOUNT_UNAVAILABLE', `update profiles set recorder_profile_id='${otherRecorder}' where id='${user}'`, `update profiles set recorder_profile_id=null where id='${user}'`);
    await denied('STAFF_QR_OUTSIDE_ACCESS_TIME', 'update organizations set personal_access_time_enabled=true, personal_access_days=\'{}\'', 'update organizations set personal_access_time_enabled=false');
    await denied('STAFF_QR_EXPIRED', 'update staff_qr_tokens set expires_at=now()-interval \'1 second\'', 'update staff_qr_tokens set expires_at=now()+interval \'2 minutes\'');
    await assert.rejects(() => consume(first.token, 'ログイン', scanner, otherUser), /STAFF_QR_ACCOUNT_UNAVAILABLE/);
    assert.equal((await consume(first.token)).rows[0].result.userId, user);
    assert.equal((await db.query('select * from attendance_records')).rows.length, 0, 'login must not punch');
    await assert.rejects(() => consume(first.token, '出勤', 'e'.repeat(64)), /STAFF_QR_ALREADY_USED/);
    assert.equal((await status(first.token)).action, 'ログイン');
    await db.exec(`set request.jwt.claim.sub='${otherUser}'`);
    assert.equal(await status(first.token), null, 'other staff cannot see receipt');
    await db.exec(`set request.jwt.claim.sub='${user}'`);
    const second = await issue();
    const third = await issue();
    await assert.rejects(() => consume(second.token), /STAFF_QR_EXPIRED/);
    await assert.rejects(() => consume(third.token, '退勤'), /ATTENDANCE_NOT_CLOCKED_IN/);
    assert.equal((await status(third.token)).usedAt, null, 'failed punches do not consume QR');
    await db.exec(`insert into attendance_records(organization_id,recorder_profile_id,work_date,scheduled_start_time)
      values ('${org}','${recorder}',(now() at time zone 'Asia/Tokyo')::date,'09:00')`);
    const punched = (await consume(third.token, '出勤')).rows[0].result;
    assert.equal(punched.action, '出勤'); assert.ok(punched.clockInAt);
    let row = (await db.query<{ recorder_profile_id: string; device_id: string; scheduled_start_time: string }>('select * from attendance_records')).rows[0];
    assert.equal(row.recorder_profile_id, recorder); assert.equal(row.device_id, kiosk); assert.equal(row.scheduled_start_time, '09:00:00');
    const fourth = await issue();
    await assert.rejects(() => consume(fourth.token, '出勤'), /ATTENDANCE_ALREADY_CLOCKED_IN/);
    await db.exec(`update attendance_records set status='休憩中',break_periods='[{"startedAt":"2026-09-17T01:00:00Z"}]'`);
    assert.ok((await consume(fourth.token, '退勤')).rows[0].result.clockOutAt);
    const ended = (await db.query<{ break_periods: { endedAt: string }[] }>('select * from attendance_records')).rows[0];
    assert.ok(ended.break_periods[0].endedAt);
    const fifth = await issue();
    await assert.rejects(() => consume(fifth.token, '退勤'), /ATTENDANCE_ALREADY_CLOCKED_OUT/);
    await db.query('select revoke_personal_staff_qr($1)', [fifth.token]);
    await assert.rejects(() => consume(fifth.token), /STAFF_QR_EXPIRED/);
    // Legacy entrance routes are explicitly retired (even on an old frontend).
    await assert.rejects(() => db.query('select consume_attendance_qr_login($1,$2)', ['a'.repeat(64),phone]), /STAFF_QR_LEGACY_DISABLED/);
    await assert.rejects(() => db.query('select issue_attendance_qr_challenge($1)', [scanner]), /STAFF_QR_LEGACY_DISABLED/);
    await assert.rejects(() => db.query('select punch_attendance_with_qr($1,$2,$3)', [first.token,'出勤',phone]), /STAFF_QR_LEGACY_DISABLED/);
    // Explicit email links are valid without staff-ID auth_user_id.
    await db.exec(`update recorder_profiles set auth_user_id=null,individual_login_enabled=false where id='${recorder}'; update profiles set recorder_profile_id='${recorder}' where id='${user}'; delete from staff_qr_events`);
    for (let i=0;i<6;i++) {
      const next = await issue();
      if (i<5) assert.equal((await consume(next.token)).rows[0].result.userId, user);
      else await assert.rejects(() => consume(next.token), /STAFF_QR_RATE_LIMITED/);
    }
    await db.exec('delete from staff_qr_tokens');
    assert.equal((await db.query('select * from staff_qr_events')).rows.length, 5, 'audit is retained after secret cleanup');
  } finally { await db.close(); }
});
