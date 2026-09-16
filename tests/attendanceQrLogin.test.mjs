import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceQrPayload, parseAttendanceQrToken } from '../src/utils/attendanceQr.ts';
import { createQrLoginHandler } from '../supabase/functions/attendance-qr-login/handler.ts';

const token = 'a'.repeat(64);
const device = 'b'.repeat(64);
const user = { id: 'staff-1', email: 'synthetic@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z', user_metadata: {} };
function fixture(patch = {}) {
  const calls = [];
  const fake = (name, value) => async (...args) => { calls.push([name, ...args]); return value; };
  const service = {
    rpc: fake('authorize', patch.authorization || { data: { userId: user.id, deviceId: 'device-1' }, error: null }),
    auth: { admin: {
      getUserById: fake('user', { data: { user: { ...user, ...patch.user } }, error: null }),
      mfa: { listFactors: fake('mfa', patch.factors || { data: { factors: [] }, error: null }) },
      generateLink: fake('link', patch.link || { data: { user, properties: { hashed_token: 'server-only-secret' } }, error: null }),
    } },
  };
  const login = { auth: { verifyOtp: fake('verify', patch.verify || {
    data: { user, session: { user, access_token: 'session-access', refresh_token: 'session-refresh' } }, error: null,
  }) } };
  return { calls, handle: createQrLoginHandler(service, login) };
}
function request(body = { qrToken: token, deviceToken: device }) {
  return new Request('https://test.invalid/qr-login', { method: 'POST', body: JSON.stringify(body) });
}

test('attendance QR payload is unchanged and rejects other payloads', () => {
  assert.equal(parseAttendanceQrToken(attendanceQrPayload(token)), token);
  assert.equal(parseAttendanceQrToken(` ${attendanceQrPayload(token)} `), token);
  for (const value of ['', token, 'https://example.invalid/' + token, attendanceQrPayload('z'.repeat(64)), attendanceQrPayload('a'.repeat(65))]) {
    assert.equal(parseAttendanceQrToken(value), '');
  }
});
test('QR login derives identity from server authorization and only returns session tokens', async () => {
  const { calls, handle } = fixture();
  const response = await handle(request({ qrToken: token, deviceToken: device, userId: 'attacker', organizationId: 'other', email: 'other@example.invalid' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { session: { access_token: 'session-access', refresh_token: 'session-refresh' } });
  assert.deepEqual(calls[0], ['authorize', 'consume_attendance_qr_login', { p_qr_token: token, p_device_token: device }]);
  assert.deepEqual(calls[1], ['user', user.id]);
  assert.deepEqual(calls[3], ['link', { type: 'magiclink', email: user.email }]);
  assert.deepEqual(calls[4], ['verify', { token_hash: 'server-only-secret', type: 'email' }]);
});
test('invalid input and non-POST calls cannot reach authorization or token issuance', async () => {
  for (const body of [null, [], {}, { qrToken: 1, deviceToken: device }, { qrToken: token, deviceToken: 'short' }]) {
    const f = fixture();
    assert.equal((await f.handle(request(body))).status, 400);
    assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  assert.equal((await f.handle(new Request('https://test.invalid', { method: 'GET' }))).status, 405);
  assert.equal((await f.handle(new Request('https://test.invalid', { method: 'OPTIONS' }))).status, 200);
  assert.equal(f.calls.length, 0);
});
for (const code of ['QR_LOGIN_DEVICE_REQUIRED', 'QR_LOGIN_EXPIRED', 'QR_LOGIN_ACCOUNT_UNAVAILABLE', 'QR_LOGIN_INVALID', 'QR_LOGIN_ALREADY_USED', 'QR_LOGIN_OUTSIDE_ACCESS_TIME', 'QR_LOGIN_RATE_LIMITED']) {
  test(`denied authorization never issues session: ${code}`, async () => {
    const f = fixture({ authorization: { data: null, error: { message: code } } });
    const response = await f.handle(request());
    assert.equal(response.status, code === 'QR_LOGIN_RATE_LIMITED' ? 429 : 403);
    assert.equal(f.calls.length, 1);
    assert.equal((await response.json()).session, undefined);
  });
}
test('disabled auth users and initial password setup cannot use QR as a bypass', async () => {
  for (const patch of [{ banned_until: '2999-01-01T00:00:00Z' }, { deleted_at: '2026-01-01T00:00:00Z' }, { user_metadata: { needs_password_setup: true } }, { email_confirmed_at: null }, { is_sso_user: true }, { is_anonymous: true }]) {
    const f = fixture({ user: patch });
    assert.equal((await f.handle(request())).status, 403);
    assert.ok(!f.calls.some(([name]) => name === 'link'));
  }
});
test('MFA is not bypassed, and inability to check MFA fails closed', async () => {
  for (const factors of [{ data: { factors: [{ status: 'verified' }] }, error: null }, { data: null, error: { message: 'offline' } }]) {
    const f = fixture({ factors });
    assert.notEqual((await f.handle(request())).status, 200);
    assert.ok(!f.calls.some(([name]) => name === 'link'));
  }
});
test('identity mismatch in generated link or verified session fails closed', async () => {
  for (const patch of [
    { link: { data: { user: { id: 'other' }, properties: { hashed_token: 'secret' } }, error: null } },
    { verify: { data: { user, session: { user: { id: 'other' }, access_token: 'secret', refresh_token: 'secret' } }, error: null } },
  ]) {
    const f = fixture(patch);
    const response = await f.handle(request());
    assert.equal(response.status, 503);
    assert.equal((await response.json()).session, undefined);
  }
});
test('internal error details and tokens are not exposed', async () => {
  const f = fixture({ authorization: { data: null, error: { message: `internal ${token}` } } });
  assert.ok(!(await (await f.handle(request())).text()).includes(token));
});
