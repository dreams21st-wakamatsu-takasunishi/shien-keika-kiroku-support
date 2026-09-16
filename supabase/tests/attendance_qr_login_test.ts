// Isolated PostgreSQL-compatible verification; never connects to Supabase.
// deno test --no-lock --node-modules-dir=none --allow-read --allow-env --allow-sys supabase/tests/attendance_qr_login_test.ts
import { PGlite } from 'npm:@electric-sql/pglite@0.3.14';
import assert from 'node:assert/strict';

Deno.test('QR login SQL enforces device, organization, account, expiry and replay boundaries', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema extensions;
      create function auth.role() returns text language sql as $$
        select current_setting('request.jwt.claim.role', true)
      $$;
      -- Use core PostgreSQL SHA-256; production provides this via pgcrypto.
      create function extensions.digest(text, text) returns bytea language sql as $$
        select sha256(convert_to($1, 'UTF8'))
      $$;
      create table public.organizations(id uuid primary key,
        personal_access_time_enabled boolean default false,
        personal_access_start time default '00:00', personal_access_end time default '23:59:59',
        personal_access_days smallint[] default '{1,2,3,4,5,6,7}');
      create table public.profiles(id uuid primary key, organization_id uuid,
        recorder_profile_id uuid, active boolean default true);
      create table public.recorder_profiles(id uuid primary key, organization_id uuid,
        auth_user_id uuid, active boolean default true, individual_login_enabled boolean default true);
      create table public.organization_devices(id uuid primary key, organization_id uuid,
        token_hash text, device_kind text, status text, owner_recorder_profile_id uuid, last_seen_at timestamptz);
      create table public.attendance_qr_challenges(id uuid primary key, organization_id uuid,
        token_hash text, issued_device_id uuid, expires_at timestamptz, created_at timestamptz default now());
    `);
    await db.exec(await Deno.readTextFile(new URL('../migrations/202609160001_attendance_qr_login.sql', import.meta.url)));
    const ids = Array.from({ length: 10 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
    const [org, otherOrg, user, otherUser, recorder, otherRecorder, kiosk, device, otherDevice, challenge] = ids;
    await db.exec(`
      insert into organizations(id) values ('${org}'), ('${otherOrg}');
      insert into profiles(id, organization_id) values ('${user}', '${org}'), ('${otherUser}', '${org}');
      insert into recorder_profiles(id, organization_id, auth_user_id)
        values ('${recorder}', '${org}', '${user}'), ('${otherRecorder}', '${org}', '${otherUser}');
      insert into organization_devices values
        ('${kiosk}', '${org}', encode(extensions.digest(repeat('c',64),'sha256'),'hex'), 'facility_shared', 'approved', null, null),
        ('${device}', '${org}', encode(extensions.digest(repeat('b',64),'sha256'),'hex'), 'personal', 'approved', '${recorder}', null),
        ('${otherDevice}', '${org}', encode(extensions.digest(repeat('d',64),'sha256'),'hex'), 'personal', 'approved', '${otherRecorder}', null);
      insert into attendance_qr_challenges(id, organization_id, token_hash, issued_device_id, expires_at)
        values ('${challenge}', '${org}', encode(extensions.digest(repeat('a',64),'sha256'),'hex'), '${kiosk}', now() + interval '2 minutes');
      set request.jwt.claim.role = 'service_role';
    `);
    const login = (qr = 'a'.repeat(64), deviceToken = 'b'.repeat(64)) =>
      db.query<{ result: { userId: string; deviceId: string } }>('select consume_attendance_qr_login($1, $2) as result', [qr, deviceToken]);
    const denied = async (message: string, before: string, after: string) => {
      await db.exec(before);
      await assert.rejects(login, new RegExp(message));
      await db.exec(after);
    };
    await assert.rejects(() => login('not-a-qr'), /QR_LOGIN_INVALID/);
    await assert.rejects(() => login('e'.repeat(64)), /QR_LOGIN_INVALID/);
    await assert.rejects(() => login('a'.repeat(64), 'e'.repeat(64)), /QR_LOGIN_DEVICE_REQUIRED/);
    await assert.rejects(() => login('a'.repeat(64), 'c'.repeat(64)), /QR_LOGIN_DEVICE_REQUIRED/);
    for (const status of ['pending', 'revoked']) {
      await denied('QR_LOGIN_DEVICE_REQUIRED', `update organization_devices set status='${status}' where id='${device}'`, `update organization_devices set status='approved' where id='${device}'`);
    }
    await denied('QR_LOGIN_DEVICE_REQUIRED', `update organization_devices set organization_id='${otherOrg}' where id='${device}'`, `update organization_devices set organization_id='${org}' where id='${device}'`);
    await denied('QR_LOGIN_INVALID', `update organization_devices set status='revoked' where id='${kiosk}'`, `update organization_devices set status='approved' where id='${kiosk}'`);
    await denied('QR_LOGIN_EXPIRED', `update attendance_qr_challenges set expires_at=now()-interval '1 second'`, `update attendance_qr_challenges set expires_at=now()+interval '2 minutes'`);
    await denied('QR_LOGIN_ACCOUNT_UNAVAILABLE', `update recorder_profiles set active=false where id='${recorder}'`, `update recorder_profiles set active=true where id='${recorder}'`);
    await denied('QR_LOGIN_ACCOUNT_UNAVAILABLE', `update recorder_profiles set individual_login_enabled=false where id='${recorder}'`, `update recorder_profiles set individual_login_enabled=true where id='${recorder}'`);
    await denied('QR_LOGIN_ACCOUNT_UNAVAILABLE', `update profiles set active=false where id='${user}'`, `update profiles set active=true where id='${user}'`);
    await denied('QR_LOGIN_ACCOUNT_UNAVAILABLE', `update profiles set recorder_profile_id='${recorder}' where id='${otherUser}'`, `update profiles set recorder_profile_id=null where id='${otherUser}'`);
    await denied('QR_LOGIN_ACCOUNT_UNAVAILABLE', `update profiles set recorder_profile_id='${otherRecorder}' where id='${user}'`, `update profiles set recorder_profile_id=null where id='${user}'`);
    await denied('QR_LOGIN_OUTSIDE_ACCESS_TIME', `update organizations set personal_access_time_enabled=true, personal_access_days='{}'`, `update organizations set personal_access_time_enabled=false`);
    await denied('QR_LOGIN_OUTSIDE_ACCESS_TIME', `update organizations set personal_access_time_enabled=true, personal_access_days='{1,2,3,4,5,6,7}', personal_access_start=((now() at time zone 'Asia/Tokyo')+interval '1 hour')::time, personal_access_end=((now() at time zone 'Asia/Tokyo')+interval '2 hours')::time`, `update organizations set personal_access_time_enabled=false`);
    await db.exec(`set request.jwt.claim.role='authenticated'`);
    await assert.rejects(login, /QR_LOGIN_DENIED/);
    await db.exec(`set role authenticated`);
    await assert.rejects(login, /permission denied for function/);
    await assert.rejects(() => db.query('select * from attendance_qr_login_uses'), /permission denied/);
    await db.exec(`reset role; set request.jwt.claim.role='service_role'`);
    const authorized = await login();
    assert.deepEqual(authorized.rows[0].result, { userId: user, deviceId: device });
    await assert.rejects(login, /QR_LOGIN_ALREADY_USED/);
    assert.deepEqual((await login('a'.repeat(64), 'd'.repeat(64))).rows[0].result, { userId: otherUser, deviceId: otherDevice });
    // A different QR permits a new login, but no more than five per five minutes.
    for (let i = 1; i <= 5; i++) {
      const qr = String(i).repeat(64);
      await db.query(`insert into attendance_qr_challenges(id,organization_id,token_hash,issued_device_id,expires_at)
        values (gen_random_uuid(), $1, encode(extensions.digest($2,'sha256'),'hex'), $3, now()+interval '2 minutes')`, [org, qr, kiosk]);
      if (i < 5) assert.equal((await login(qr)).rows[0].result.userId, user);
      else await assert.rejects(() => login(qr), /QR_LOGIN_RATE_LIMITED/);
    }
    // Email-linked accounts with no staff-ID binding are unambiguous too.
    await db.exec(`delete from attendance_qr_login_uses; update recorder_profiles set auth_user_id=null, individual_login_enabled=false where id='${recorder}'; update profiles set recorder_profile_id='${recorder}' where id='${user}'`);
    assert.equal((await login()).rows[0].result.userId, user);
    // Existing challenge cleanup also bounds the replay ledger's size.
    await db.exec('delete from attendance_qr_challenges');
    assert.equal((await db.query('select * from attendance_qr_login_uses')).rows.length, 0);
  } finally {
    await db.close();
  }
});
