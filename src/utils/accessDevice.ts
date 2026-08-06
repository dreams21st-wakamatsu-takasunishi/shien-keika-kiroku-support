const DEVICE_TOKEN_KEY = 'support-access-device-token-v1';

function createDeviceToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function getAccessDeviceToken() {
  const saved = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (saved && /^[a-f0-9]{64}$/i.test(saved)) return saved;
  const token = createDeviceToken();
  localStorage.setItem(DEVICE_TOKEN_KEY, token);
  return token;
}

export function getAccessDeviceLabel() {
  const userAgent = navigator.userAgent;
  const platform = /iPad/i.test(userAgent)
    ? 'iPad'
    : /iPhone/i.test(userAgent)
      ? 'iPhone'
      : /Android/i.test(userAgent)
        ? 'Android端末'
        : /Windows/i.test(userAgent)
          ? 'Windows PC'
          : /Macintosh|Mac OS/i.test(userAgent)
            ? 'Mac'
            : 'ブラウザー端末';
  const browser = /Edg\//i.test(userAgent)
    ? 'Edge'
    : /Chrome\//i.test(userAgent)
      ? 'Chrome'
      : /Safari\//i.test(userAgent)
        ? 'Safari'
        : 'ブラウザー';
  return `${platform}・${browser}`;
}

export function getAccessDevicePlatform() {
  return navigator.userAgent.slice(0, 500);
}
