import { test } from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import { STAFF_QR_IMAGE_OPTIONS } from './staffQrImage';
import { attendanceQrPayload, parseAttendanceQrToken } from './attendanceQr';

test('staff QR has four-module quiet zone, opaque black/white and larger source resolution', () => {
  assert.equal(STAFF_QR_IMAGE_OPTIONS.margin, 4);
  assert.equal(STAFF_QR_IMAGE_OPTIONS.width, 720);
  assert.deepEqual(STAFF_QR_IMAGE_OPTIONS.color, { dark: '#000000ff', light: '#ffffffff' });
  assert.equal(STAFF_QR_IMAGE_OPTIONS.errorCorrectionLevel, 'M');
});

test('readability rendering preserves the original payload and symbol data', () => {
  const token = '0123456789abcdef'.repeat(4);
  const payload = attendanceQrPayload(token);
  assert.equal(parseAttendanceQrToken(payload), token);
  const before = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const after = QRCode.create(payload, STAFF_QR_IMAGE_OPTIONS);
  assert.equal(after.version, before.version);
  assert.deepEqual(after.modules.data, before.modules.data);
});

test('rendered QR is a PNG and exposes no external URL or alternate token', async () => {
  const url = await QRCode.toDataURL(attendanceQrPayload('0123456789abcdef'.repeat(4)), STAFF_QR_IMAGE_OPTIONS);
  assert.ok(url.startsWith('data:image/png;base64,'));
  const png = Buffer.from(url.split(',')[1], 'base64');
  assert.equal(png.readUInt32BE(16), 720);
  assert.equal(png.readUInt32BE(20), 720);
});
