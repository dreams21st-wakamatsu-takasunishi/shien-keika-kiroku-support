import { savePushSubscription } from '../services/dataService';

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const normalized = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export function deviceNotificationsSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

export async function enableDeviceNotifications(organizationId: string) {
  if (!deviceNotificationsSupported()) {
    throw new Error('この端末またはブラウザは通知に対応していません。');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('通知が許可されませんでした。ブラウザのサイト設定から通知を許可してください。');
  }

  const registration = await navigator.serviceWorker.ready;
  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();
  if (!publicKey || !('PushManager' in window)) {
    return { pushEnabled: false };
  }

  const current = await registration.pushManager.getSubscription();
  const subscription = current || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  await savePushSubscription(organizationId, subscription);
  return { pushEnabled: true };
}

export async function showAnnouncementNotification(title: string, content: string, id?: string) {
  if (!deviceNotificationsSupported() || Notification.permission !== 'granted') return;
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(title || '支援経過記録サポート', {
    body: content || '新しいお知らせがあります。',
    icon: './app-icon.svg',
    badge: './app-icon.svg',
    tag: id ? `announcement-${id}` : 'support-announcement',
    data: { url: './' },
  });
}
