import { api } from './api';

export type PushState =
  | 'unsupported' // เบราว์เซอร์ไม่รองรับ (หรือ iOS ที่ยังไม่ได้ติดตั้งเป็นแอป)
  | 'unconfigured' // เซิร์ฟเวอร์ยังไม่ตั้งค่า VAPID
  | 'blocked' // ผู้ใช้บล็อกการแจ้งเตือนของเว็บนี้
  | 'off'
  | 'on'; // อุปกรณ์นี้สมัครอยู่

export const pushSupported = (): boolean =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

const toKey = (b64u: string): Uint8Array => {
  const t = b64u.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64u.length + 3) % 4);
  return Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
};

async function registration() {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ?? (await navigator.serviceWorker.register('/sw.js'));
}

export async function currentPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const cfg = await api.pushConfig().catch(() => null);
  if (!cfg?.configured) return 'unconfigured';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** ขออนุญาต + สมัครรับแจ้งเตือนในอุปกรณ์นี้ (ต้องเรียกจากการกดปุ่มของผู้ใช้) */
export async function enablePush(): Promise<PushState> {
  const cfg = await api.pushConfig();
  if (!cfg.configured || !cfg.publicKey) return 'unconfigured';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'blocked' : 'off';
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toKey(cfg.publicKey) as BufferSource,
    }));
  const j = sub.toJSON();
  await api.pushSubscribe({
    endpoint: sub.endpoint,
    keys: { p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '' },
  });
  return 'on';
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.pushUnsubscribe(sub.endpoint).catch(() => undefined);
  await sub.unsubscribe();
}
