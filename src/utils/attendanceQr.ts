const QR_PREFIX = 'shien-attendance:v1:';

export function attendanceQrPayload(token: string) {
  return `${QR_PREFIX}${token}`;
}

export function parseAttendanceQrToken(value: string) {
  const normalized = value.trim();
  if (!normalized.startsWith(QR_PREFIX)) return '';
  const token = normalized.slice(QR_PREFIX.length);
  return /^[a-f0-9]{64}$/i.test(token) ? token : '';
}
