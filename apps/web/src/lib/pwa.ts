import { useEffect, useState } from 'react';

/** ลงทะเบียน service worker (เฉพาะ production build) และให้แคชไฟล์ที่หน้านี้โหลดอยู่ไว้ใช้ตอนออฟไลน์ */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        const urls = performance
          .getEntriesByType('resource')
          .map((r) => new URL(r.name).pathname)
          .filter((p) => p.startsWith('/assets/') || p.startsWith('/icons/'));
        reg.active?.postMessage({ type: 'precache', urls });
      })
      .catch(() => undefined); // ไม่มี SW ก็ใช้งานปกติ ไม่ออฟไลน์
  });
}

/** ล้างข้อมูลส่วนตัวที่แคชไว้สำหรับออฟไลน์ (เรียกเมื่อออกจากระบบ/session หมดอายุ) */
export async function clearApiCache(): Promise<void> {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('dobby-api')).map((k) => caches.delete(k)));
  } catch {
    /* ไม่มี Cache API */
  }
}

export function useOnline(): boolean {
  const [on, setOn] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return on;
}
